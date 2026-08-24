import { callOdooRPC } from "@/lib/odoo";

/**
 * Búsqueda de una factura de cliente en Odoo y de los seriales que se le
 * despacharon, para el portal público de servicio técnico (issue #19).
 *
 * Vive en lib/ y no dentro de la ruta porque el POST que crea el ticket
 * (issue #22) tiene que volver a resolver estos mismos datos del lado del
 * servidor en vez de confiar en lo que mande el navegador.
 *
 * La cadena en Odoo es:
 *
 *   account.move            (se busca por name)
 *    └─ account.move.line   (display_type = 'product')
 *         └─ sale_line_ids
 *              └─ stock.move       (sale_line_id in [...], state = 'done')
 *                   └─ stock.move.line → lot_id   ← el serial
 *
 * Por qué así y no de otra forma:
 *
 * - `invoice_origin` NO sirve como llave para llegar al despacho. Hay órdenes
 *   de venta de compañías distintas que comparten el mismo nombre: buscando
 *   stock.picking con origin = 'S-04366' salen 3 despachos de 2 clientes
 *   distintos. Usarlo le mostraría a un cliente los seriales de otro.
 *
 * - Se enlaza por `sale_line_id` (línea) y no por producto porque una orden
 *   se puede facturar en partes. Si la orden despachó 3 laptops y esta factura
 *   cubre 1, enlazar por producto mostraría los 3 seriales.
 *
 * - `account.move.line` hay que filtrarlo por `display_type = 'product'`: sin
 *   eso vienen también las contrapartidas de costo, duplicadas en positivo y
 *   en negativo (18 líneas en crudo para una factura de 6 productos).
 */

export interface ItemFactura {
  /** Identificador estable para el <option> del formulario. */
  id: string;
  /** Línea de la factura (account.move.line) a la que pertenece el item. */
  linea_id: number;
  producto_id: number;
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
  /** Vacío cuando no hay serial registrado o el producto no lleva. */
  serial: string;
  /** El producto se rastrea por serial en Odoo (`tracking = 'serial'`). */
  lleva_serial: boolean;
  cantidad: number;
  /** Nombre del despacho, vacío si la línea no llegó a despacharse. */
  despacho: string;
}

export interface FacturaResumen {
  numero: string;
  fecha: string | null;
  compania: string;
  compania_id: number | null;
}

export interface FacturaConItems {
  estado: "ok";
  factura: FacturaResumen;
  cliente: {
    nombre: string;
    /** Enmascarados: esto lo consume un endpoint público. */
    telefono: string;
    email: string;
  };
  despachos: string[];
  items: ItemFactura[];
}

export type ResultadoBusqueda =
  | FacturaConItems
  | { estado: "no_encontrada" }
  | { estado: "ambiguo"; coincidencias: FacturaResumen[] };

/** Odoo devuelve los many2one como [id, nombre] o como false. */
type M2O = [number, string] | false | undefined;

const m2oId = (v: M2O): number | null => (Array.isArray(v) ? v[0] : null);
const m2oNombre = (v: M2O): string => (Array.isArray(v) ? v[1] : "");

export class OdooNoDisponibleError extends Error {
  constructor() {
    super("Odoo no respondió");
    this.name = "OdooNoDisponibleError";
  }
}

/**
 * Los números de factura son alfanuméricos con / y - (INV/2026/06384,
 * FCLIE/2026/03481, 5037537). Todo lo demás se descarta: el valor va a un
 * `ilike` de Odoo, y un `%` o un `_` sin filtrar son comodines de SQL que
 * convertirían este endpoint público en un listado de facturas.
 */
export function normalizarNumero(entrada: string): string {
  return entrada
    .trim()
    .replace(/[^A-Za-z0-9/-]/g, "")
    .slice(0, 32);
}

/**
 * Quita todo lo que no sea alfanumérico y pasa a mayúsculas.
 *
 * Hace falta porque en Odoo el mismo contribuyente está cargado de formas
 * distintas: conviven `J29510139-2` y `J295101392`, y la posición de los
 * guiones no sigue ningún patrón (hay RIF venezolanos, cédulas y documentos
 * panameños tipo `155591597-2-2015`). De ~9.700 partners con documento, 2.316
 * lo tienen con guion y 7.384 sin nada. Por eso el filtro por documento no
 * puede hacerse con un `ilike` contra el campo tal como está guardado.
 */
export function normalizarDocumento(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function enmascararTelefono(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 7) return "";
  return `${digitos.slice(0, 4)}***${digitos.slice(-4)}`;
}

export function enmascararEmail(valor: unknown): string {
  if (typeof valor !== "string" || !valor.includes("@")) return "";
  const [usuario, dominio] = valor.split("@");
  const visible = usuario.slice(0, 3);
  return `${visible}${usuario.length > 3 ? "***" : ""}@${dominio}`;
}

async function rpc<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const resultado = await callOdooRPC<T>(model, method, args as any[], kwargs);
  if (resultado === null || resultado === undefined) {
    throw new OdooNoDisponibleError();
  }
  return resultado;
}

const resumen = (factura: any): FacturaResumen => ({
  numero: factura.name || "",
  fecha: factura.invoice_date || null,
  compania: m2oNombre(factura.company_id),
  compania_id: m2oId(factura.company_id),
});

/**
 * Busca la factura y arma la lista de items reportables.
 *
 * @param numeroCrudo lo que escribió el cliente.
 * @param rif documento del cliente, opcional. Sirve para desambiguar cuando
 *   varias compañías tienen facturas con números parecidos. El issue #25
 *   evaluará volverlo obligatorio para frenar la enumeración de facturas;
 *   está aceptado desde ya para no tener que rehacer el endpoint.
 */
export async function buscarFacturaConSeriales(
  numeroCrudo: string,
  rif?: string,
): Promise<ResultadoBusqueda> {
  const numero = normalizarNumero(numeroCrudo);
  if (!numero) return { estado: "no_encontrada" };

  const dominio: unknown[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "posted"],
    ["name", "ilike", numero],
  ];

  const facturasCrudas = await rpc<any[]>("account.move", "search_read", [dominio], {
    fields: ["id", "name", "invoice_date", "partner_id", "company_id"],
    limit: 10,
    order: "invoice_date desc",
  });

  if (!facturasCrudas.length) return { estado: "no_encontrada" };

  // El documento se filtra acá y no en el dominio de Odoo: los `vat` están
  // guardados con formatos inconsistentes, así que hay que comparar
  // normalizado. Como la búsqueda por número ya viene acotada a 10, sale
  // barato.
  const facturas = await filtrarPorDocumento(facturasCrudas, rif);
  if (!facturas.length) return { estado: "no_encontrada" };

  // Si el cliente escribió el número completo, esa gana aunque el ilike haya
  // traído otras que lo contienen (escribir "6384" trae "INV/2026/06384").
  const exacta = facturas.filter(
    (f) => (f.name || "").toLowerCase() === numero.toLowerCase(),
  );
  const candidatas = exacta.length ? exacta : facturas;

  if (candidatas.length > 1) {
    // Sin nombre de cliente ni montos: a estas alturas todavía no sabemos
    // quién está preguntando.
    return { estado: "ambiguo", coincidencias: candidatas.map(resumen) };
  }

  const factura = candidatas[0];

  const lineas = await rpc<any[]>(
    "account.move.line",
    "search_read",
    [
      [
        ["move_id", "=", factura.id],
        ["display_type", "=", "product"],
      ],
    ],
    { fields: ["id", "product_id", "quantity", "sale_line_ids"], limit: 200 },
  );

  // Las líneas de texto libre no tienen producto y no hay nada que reportar.
  const lineasConProducto = lineas.filter((l) => m2oId(l.product_id) !== null);

  const [items, cliente] = await Promise.all([
    armarItems(lineasConProducto),
    leerCliente(m2oId(factura.partner_id)),
  ]);

  const despachos = [
    ...new Set(items.map((i) => i.despacho).filter(Boolean)),
  ];

  return { estado: "ok", factura: resumen(factura), cliente, despachos, items };
}

async function filtrarPorDocumento(
  facturas: any[],
  rif?: string,
): Promise<any[]> {
  const buscado = normalizarDocumento(rif);
  if (!buscado) return facturas;

  const partnerIds = [
    ...new Set(facturas.map((f) => m2oId(f.partner_id)).filter(Boolean)),
  ] as number[];
  if (!partnerIds.length) return [];

  const partners = await rpc<any[]>(
    "res.partner",
    "search_read",
    [[["id", "in", partnerIds]]],
    { fields: ["id", "vat"], limit: partnerIds.length },
  );

  const coincide = new Set(
    partners
      .filter((p) => {
        const guardado = normalizarDocumento(p.vat);
        if (!guardado) return false;
        if (guardado === buscado) return true;
        // Algunos documentos traen sufijos que el cliente no escribe (los
        // panameños tipo `...DV38`). Se acepta el prefijo, pero solo si lo
        // que escribió es lo bastante largo para seguir siendo una
        // verificación real y no un comodín.
        return buscado.length >= 8 && guardado.startsWith(buscado);
      })
      .map((p) => p.id),
  );

  return facturas.filter((f) => coincide.has(m2oId(f.partner_id)!));
}

async function leerCliente(partnerId: number | null) {
  if (!partnerId) return { nombre: "", telefono: "", email: "" };

  const partners = await rpc<any[]>(
    "res.partner",
    "search_read",
    [[["id", "=", partnerId]]],
    { fields: ["name", "phone", "mobile", "email"], limit: 1 },
  );

  const partner = partners[0];
  if (!partner) return { nombre: "", telefono: "", email: "" };

  return {
    nombre: partner.name || "",
    telefono: enmascararTelefono(partner.phone || partner.mobile),
    email: enmascararEmail(partner.email),
  };
}

async function armarItems(lineas: any[]): Promise<ItemFactura[]> {
  const productoIds = [
    ...new Set(lineas.map((l) => m2oId(l.product_id)!).filter(Boolean)),
  ];

  const saleLineIds = [
    ...new Set(lineas.flatMap((l) => (l.sale_line_ids as number[]) || [])),
  ];

  const [productos, movimientos] = await Promise.all([
    leerProductos(productoIds),
    leerMovimientos(saleLineIds),
  ]);

  const items: ItemFactura[] = [];

  for (const linea of lineas) {
    const productoId = m2oId(linea.product_id)!;
    const producto = productos.get(productoId);
    const facturado = Number(linea.quantity) || 0;

    const base = {
      linea_id: linea.id as number,
      producto_id: productoId,
      codigo: producto?.codigo ?? "",
      nombre: producto?.nombre ?? m2oNombre(linea.product_id),
      marca: producto?.marca ?? "",
      categoria: producto?.categoria ?? "",
      lleva_serial: producto?.llevaSerial ?? false,
    };

    const propios = ((linea.sale_line_ids as number[]) || []).flatMap(
      (id) => movimientos.get(id) ?? [],
    );

    // Sin despacho asociado: facturas hechas a mano, servicios, o pedidos que
    // todavía no salieron. El cliente igual tiene que poder reportarlos.
    if (!propios.length) {
      items.push({
        ...base,
        id: `${linea.id}:`,
        serial: "",
        cantidad: facturado,
        despacho: "",
      });
      continue;
    }

    // Un item por serial: si le facturaron 3 laptops, tiene que poder decir
    // cuál de las 3 se dañó.
    const sinSerial = new Map<string, number>();

    for (const mov of propios) {
      if (mov.serial) {
        items.push({
          ...base,
          id: `${linea.id}:${mov.serial}`,
          serial: mov.serial,
          cantidad: 1,
          despacho: mov.despacho,
        });
      } else {
        sinSerial.set(mov.despacho, (sinSerial.get(mov.despacho) ?? 0) + mov.cantidad);
      }
    }

    for (const [despacho, cantidad] of sinSerial) {
      items.push({
        ...base,
        id: `${linea.id}:`,
        serial: "",
        cantidad,
        despacho,
      });
    }
  }

  return items;
}

async function leerProductos(ids: number[]) {
  const mapa = new Map<
    number,
    {
      codigo: string;
      nombre: string;
      marca: string;
      categoria: string;
      llevaSerial: boolean;
    }
  >();
  if (!ids.length) return mapa;

  const productos = await rpc<any[]>(
    "product.product",
    "search_read",
    [[["id", "in", ids]]],
    {
      fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "tracking"],
      limit: ids.length,
    },
  );

  for (const p of productos) {
    mapa.set(p.id, {
      codigo: p.default_code || "",
      nombre: p.name || "",
      marca: m2oNombre(p.x_studio_marca),
      categoria: m2oNombre(p.categ_id),
      llevaSerial: p.tracking === "serial",
    });
  }
  return mapa;
}

/** Movimientos despachados, agrupados por línea de la orden de venta. */
async function leerMovimientos(saleLineIds: number[]) {
  const mapa = new Map<
    number,
    { serial: string; cantidad: number; despacho: string }[]
  >();
  if (!saleLineIds.length) return mapa;

  // state = 'done' descarta los despachos cancelados, que existen y aparecen
  // mezclados con los reales.
  const movimientos = await rpc<any[]>(
    "stock.move",
    "search_read",
    [
      [
        ["sale_line_id", "in", saleLineIds],
        ["state", "=", "done"],
      ],
    ],
    { fields: ["id", "sale_line_id", "picking_id"], limit: 500 },
  );

  if (!movimientos.length) return mapa;

  const porMovimiento = new Map<number, any>(
    movimientos.map((m) => [m.id, m]),
  );

  const detalles = await rpc<any[]>(
    "stock.move.line",
    "search_read",
    [
      [
        ["move_id", "in", movimientos.map((m) => m.id)],
        ["state", "=", "done"],
      ],
    ],
    { fields: ["move_id", "lot_id", "lot_name", "quantity"], limit: 1000 },
  );

  for (const detalle of detalles) {
    const movimiento = porMovimiento.get(m2oId(detalle.move_id)!);
    if (!movimiento) continue;

    const saleLineId = m2oId(movimiento.sale_line_id);
    if (!saleLineId) continue;

    // El serial puede estar como registro de lote o como texto suelto.
    const serial = m2oNombre(detalle.lot_id) || detalle.lot_name || "";

    const lista = mapa.get(saleLineId) ?? [];
    lista.push({
      serial,
      cantidad: Number(detalle.quantity) || 0,
      despacho: m2oNombre(movimiento.picking_id),
    });
    mapa.set(saleLineId, lista);
  }

  return mapa;
}
