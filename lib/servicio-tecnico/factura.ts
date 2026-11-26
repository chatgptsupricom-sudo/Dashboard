import { documentoCoincide } from "@/lib/servicio-tecnico/documento";
import {
  calcularGarantia,
  type ResultadoGarantia,
} from "@/lib/garantia";
import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { hayTablaProductos } from "@/lib/rma/items";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";

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
  /** Estado de garantía al momento de la consulta (issue #29). */
  garantia: ResultadoGarantia;
  /**
   * Ya existe un caso de RMA para este item en esta factura (issue #47).
   * Deliberadamente NO se expone nada más del caso (estado, diagnóstico,
   * teléfono): esta consulta es pública, así que lo único seguro de mostrar
   * es que existe y su número, que el propio cliente ya tiene.
   */
  ya_reportado: boolean;
  rma_case_number: string | null;
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
  /**
   * Id del partner en Odoo. Lo necesita la creación del ticket para guardar
   * `odoo_partner_id` y que el técnico pueda navegar al cliente real.
   * NO se expone en la respuesta pública de `/api/servicio-tecnico/factura`.
   */
  partner_id: number | null;
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
 * @param cid sucursal elegida en el selector del portal (7/9/10). Acota la
 *   búsqueda a esa compañía — sin esto, el mismo número corto (ej. "6384")
 *   puede coincidir con facturas de varias sucursales a la vez y el cliente
 *   ve la pantalla de "varias coincidencias" sin necesidad.
 */
export async function buscarFacturaConSeriales(
  numeroCrudo: string,
  rif?: string,
  cid?: number,
  opciones: { smartbit?: boolean } = {},
): Promise<ResultadoBusqueda> {
  const encontrada = await resolverFactura(numeroCrudo, rif, cid);

  // Facturas de antes del corte a Odoo (2026-04-01): Odoo no las tiene, o
  // tiene solo la migrada ("Importación Masiva - FAC 5034267", una línea de
  // Saldo Inicial) si quedó abierta. Los productos y seriales están en el
  // histórico de Smartbit del panel. Solo lo pide el portal: Buscar factura
  // de RMA ya muestra Smartbit aparte.
  if (opciones.smartbit) {
    const importada =
      encontrada.estado === "ok" ? numeroImportado(encontrada.cruda.ref) : null;
    if (encontrada.estado === "no_encontrada" || importada) {
      const sede = cid ?? (encontrada.estado === "ok" ? encontrada.factura.compania_id : null);
      // Con la migrada, resolverFactura ya comprobó el RIF contra su cliente
      // de Odoo: no hace falta que Smartbit tenga el mismo.
      const deSmartbit = sede
        ? await facturaDeSmartbit(importada ?? numeroCrudo, rif, sede, Boolean(importada))
        : null;
      if (deSmartbit) return deSmartbit;
    }
  }

  if (encontrada.estado !== "ok") return encontrada;
  const factura = encontrada.cruda;

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
    armarItems(lineasConProducto, factura.invoice_date || null, factura.name || ""),
    leerCliente(m2oId(factura.partner_id)),
  ]);

  const despachos = [
    ...new Set(items.map((i) => i.despacho).filter(Boolean)),
  ];

  return {
    estado: "ok",
    factura: resumen(factura),
    cliente,
    partner_id: m2oId(factura.partner_id),
    despachos,
    items,
  };
}

/**
 * La factura publicada de la sucursal con ese número y de ese cliente (el
 * documento tiene que coincidir con el del partner). Es la comprobación de
 * "es el dueño de la factura" del portal: la usan el reporte de servicio
 * técnico y la solicitud de nota de crédito (lib/notas-credito/cliente.ts).
 */
export async function resolverFactura(
  numeroCrudo: string,
  rif?: string,
  cid?: number,
): Promise<
  | { estado: "ok"; id: number; factura: FacturaResumen; partner_id: number | null; cruda: any }
  | { estado: "no_encontrada" }
  | { estado: "ambiguo"; coincidencias: FacturaResumen[] }
> {
  const numero = normalizarNumero(numeroCrudo);
  if (!numero) return { estado: "no_encontrada" };

  const dominio: unknown[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "posted"],
    ["name", "ilike", numero],
  ];
  if (cid) dominio.push(["company_id", "=", cid]);

  const facturasCrudas = await rpc<any[]>("account.move", "search_read", [dominio], {
    fields: ["id", "name", "ref", "invoice_date", "partner_id", "company_id"],
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
  return { estado: "ok", id: factura.id, factura: resumen(factura), partner_id: m2oId(factura.partner_id), cruda: factura };
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
      // Exacto, sin la letra (clientes guardados solo con números) o con un
      // sufijo que el cliente no escribe: ver documentoCoincide.
      .filter((p) => documentoCoincide(buscado, normalizarDocumento(p.vat)))
      .map((p) => p.id),
  );

  return facturas.filter((f) => coincide.has(m2oId(f.partner_id)!));
}

/**
 * El número de Smartbit de una factura migrada a Odoo: la carga inicial les
 * puso de referencia "Importación Masiva - FAC <número>" (Valencia 410,
 * Caracas 224, Panamá 1.097) y un nombre nuevo (FCLIE/2026/00211).
 */
function numeroImportado(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const m = ref.match(/Importaci[oó]n Masiva\s*-\s*FAC\s+([A-Za-z0-9/-]+)/i);
  return m ? m[1] : null;
}

/**
 * La factura del histórico de Smartbit (`ventas_smartbit_facturas` +
 * `ventas_smartbit`, ver lib/rma/buscarCompras.ts) con la misma forma que la
 * de Odoo, para que el formulario y la creación del ticket no distingan. El
 * RIF se compara contra el de Smartbit con el mismo criterio que en Odoo y,
 * si no coincide, contra el de Odoo: Smartbit tiene clientes con un RIF que no
 * es el suyo (CORPORACION DIGIPRO C.A está con "3294098268" en sus 145
 * facturas de Valencia y en Odoo es J504978680), así que vale también un
 * contacto de Odoo con ese RIF y el mismo nombre que la factura de Smartbit
 * (`clienteSegunOdoo`). `duenoVerificado` = el RIF ya se comprobó contra la
 * factura migrada de Odoo. Los productos se buscan en Odoo por código para
 * tener id, marca, categoría y si llevan serial; los que no están quedan con
 * producto_id 0. null = no está en Smartbit (o no tiene productos): sigue el
 * resultado de Odoo.
 */
async function facturaDeSmartbit(
  numeroCrudo: string,
  rif: string | undefined,
  sede: number,
  duenoVerificado = false,
): Promise<FacturaConItems | { estado: "ambiguo"; coincidencias: FacturaResumen[] } | null> {
  // Import dinámico: buscarCompras importa OdooNoDisponibleError de aquí.
  const { facturasSmartbit } = await import("@/lib/rma/buscarCompras");
  const buscado = normalizarDocumento(rif);
  const candidatas = (await facturasSmartbit(normalizarNumero(numeroCrudo), sede)).filter(
    (f) => !f.devolucion && f.productos.length > 0,
  );
  let facturas =
    !buscado || duenoVerificado
      ? candidatas
      : candidatas.filter((f) => documentoCoincide(buscado, normalizarDocumento(f.rif)));
  let partnerSegunOdoo: number | null = null;
  if (!facturas.length && buscado && candidatas.length) {
    const porNombre = await clienteSegunOdoo(buscado, sede);
    facturas = candidatas.filter((f) => porNombre.has(claveNombreCliente(f.cliente)));
    if (facturas.length === 1) {
      partnerSegunOdoo = porNombre.get(claveNombreCliente(facturas[0].cliente)) ?? null;
    }
  }
  if (!facturas.length) return null;

  const resumenSb = (f: (typeof facturas)[number]): FacturaResumen => ({
    numero: f.numero,
    fecha: f.fecha || null,
    compania: NOMBRES_SUCURSAL[f.sede] ?? "",
    compania_id: f.sede,
  });
  if (facturas.length > 1) {
    return { estado: "ambiguo", coincidencias: facturas.map(resumenSb) };
  }
  const f = facturas[0];

  const codigos = [
    ...new Set(
      f.productos
        .map((p) => p.codigo.trim().toUpperCase())
        .filter(Boolean)
        .flatMap((c) => [c, c.replace(/\//g, "-")]),
    ),
  ];
  const [productos, partnerId] = await Promise.all([
    productosPorCodigo(codigos),
    partnerSegunOdoo ?? partnerDeSmartbit(f.numero, f.rif, sede),
  ]);
  const cliente = await leerCliente(partnerId);

  const items: ItemFactura[] = [];
  for (const [i, p] of f.productos.entries()) {
    const codigo = p.codigo.trim().toUpperCase();
    const odoo = productos.get(codigo) ?? productos.get(codigo.replace(/\//g, "-"));
    const nombre = odoo?.nombre || p.articulo;
    const garantia = odoo?.marca
      ? await garantiaDelItem(odoo.marca, nombre, f.fecha || null)
      : p.garantia;
    const seriales = [...new Set(p.seriales.map((s) => s.trim()).filter(Boolean))];
    const base = {
      linea_id: 0,
      garantia,
      producto_id: odoo?.id ?? 0,
      codigo: odoo?.codigo || p.codigo,
      nombre,
      marca: odoo?.marca ?? "",
      categoria: odoo?.categoria ?? "",
      lleva_serial: seriales.length > 0 || (odoo?.llevaSerial ?? false),
      despacho: "",
      ya_reportado: false,
      rma_case_number: null,
    };
    for (const serial of seriales) {
      items.push({ ...base, id: `sb${i}:${serial}`, serial, cantidad: 1 });
    }
    const sinSerial = Math.max(0, p.unidades - seriales.length);
    if (sinSerial > 0) {
      items.push({ ...base, id: `sb${i}:`, serial: "", cantidad: sinSerial });
    }
  }
  if (!items.length) return null;

  marcarYaReportados(items, await casosExistentes(f.numero));
  return {
    estado: "ok",
    factura: resumenSb(f),
    cliente: cliente.nombre ? cliente : { ...cliente, nombre: f.cliente },
    partner_id: partnerId,
    despachos: [],
    items,
  };
}

/** Productos de Odoo por código exacto (también archivados). */
async function productosPorCodigo(codigos: string[]) {
  const mapa = new Map<
    string,
    { id: number; codigo: string; nombre: string; marca: string; categoria: string; llevaSerial: boolean }
  >();
  if (!codigos.length) return mapa;
  const productos = await rpc<any[]>(
    "product.product",
    "search_read",
    [[["default_code", "in", codigos]]],
    {
      fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "tracking", "active"],
      limit: codigos.length * 3,
      context: { active_test: false },
    },
  );
  // Si hay un activo y uno archivado con el mismo código, gana el activo.
  for (const p of [...productos].sort((a, b) => Number(a.active) - Number(b.active))) {
    const codigo = String(p.default_code || "").trim().toUpperCase();
    if (!codigo) continue;
    mapa.set(codigo, {
      id: p.id,
      codigo: p.default_code || "",
      nombre: p.name || "",
      marca: m2oNombre(p.x_studio_marca),
      categoria: m2oNombre(p.categ_id),
      llevaSerial: p.tracking === "serial",
    });
  }
  return mapa;
}

/**
 * El cliente en Odoo de una factura de Smartbit: el de su factura migrada si
 * quedó abierta al corte y si no el contacto empresa de la sede con ese RIF.
 * Sirve para que el técnico llegue al cliente; sin él el caso se crea igual.
 */
async function partnerDeSmartbit(numero: string, rif: string, sede: number): Promise<number | null> {
  const migrada = await rpc<any[]>(
    "account.move",
    "search_read",
    [
      [
        ["move_type", "=", "out_invoice"],
        ["company_id", "=", sede],
        ["ref", "=ilike", `Importación Masiva - FAC ${numero}`],
      ],
    ],
    { fields: ["partner_id"], limit: 1 },
  );
  const deMigrada = m2oId(migrada[0]?.partner_id);
  if (deMigrada) return deMigrada;

  const coinciden = await partnersConDocumento(normalizarDocumento(rif), sede);
  const elegido = coinciden.find((p) => p.is_company) ?? coinciden[0];
  return elegido ? (m2oId(elegido.commercial_partner_id) ?? elegido.id) : null;
}

/** Contactos de Odoo de la sede (o sin compañía) con ese documento. */
async function partnersConDocumento(documento: string, sede: number): Promise<any[]> {
  const digitos = documento.replace(/^[A-Z]+/, "");
  if (digitos.length < 6) return [];
  const partners = await rpc<any[]>(
    "res.partner",
    "search_read",
    [
      [
        ["vat", "ilike", digitos.slice(0, 8)],
        ["company_id", "in", [sede, false]],
      ],
    ],
    { fields: ["id", "name", "vat", "is_company", "commercial_partner_id"], limit: 20 },
  );
  return partners.filter((p) => documentoCoincide(documento, normalizarDocumento(p.vat)));
}

/**
 * Nombre de cliente para comparar Smartbit con Odoo: sin acentos, mayúsculas,
 * sin signos ni espacios y sin la forma societaria del final ("CORPORACIÓN
 * DIGIPRO, C.A" = "CORPORACION DIGIPRO C.A " = "Corporacion Digipro").
 */
function claveNombreCliente(nombre: unknown): string {
  if (typeof nombre !== "string") return "";
  const palabras = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  while (palabras.length > 1 && FORMAS_SOCIETARIAS.has(palabras[palabras.length - 1])) {
    palabras.pop();
  }
  return palabras.join("");
}

const FORMAS_SOCIETARIAS = new Set(["CA", "SA", "SRL", "RL", "CPA", "SAS", "LLC", "INC", "FP"]);

/**
 * Los clientes de Odoo con el RIF que escribió el cliente, por nombre (los dos
 * nombres de cada contacto: el suyo y el de su empresa) → partner comercial.
 * Un nombre de menos de 4 letras no cuenta: sería demasiado fácil que
 * coincidiera con otro.
 */
async function clienteSegunOdoo(documento: string, sede: number): Promise<Map<string, number>> {
  const porNombre = new Map<string, number>();
  const partners = await partnersConDocumento(documento, sede);
  for (const p of [...partners].sort((a, b) => Number(b.is_company) - Number(a.is_company))) {
    const id = m2oId(p.commercial_partner_id) ?? p.id;
    for (const nombre of [m2oNombre(p.commercial_partner_id), p.name]) {
      const clave = claveNombreCliente(nombre);
      if (clave.length >= 4 && !porNombre.has(clave)) porNombre.set(clave, id);
    }
  }
  return porNombre;
}

/**
 * Garantía de un item, sin poder tumbar la consulta.
 *
 * El motor lee la tabla `rma_garantias` de MySQL. Si esa tabla no existe
 * todavía en el entorno, o la base no responde, esto NO puede reventar la
 * consulta de factura: el cliente tiene que poder reportar su falla igual.
 * Ante cualquier problema se devuelve `indeterminada`, que es justamente el
 * estado que significa "no lo sabemos" y que la UI ya sabe presentar sin
 * prometer nada.
 */
async function garantiaDelItem(
  marca: string,
  nombre: string,
  fechaFactura: string | null,
): Promise<ResultadoGarantia> {
  try {
    return await calcularGarantia({
      marcaOdoo: marca,
      productoNombre: nombre,
      fechaFactura,
    });
  } catch (e: any) {
    console.error("[factura] garantía no calculable:", e?.message);
    return {
      estado: "indeterminada",
      meses_cubiertos: null,
      fecha_vencimiento: null,
      dias_restantes: null,
      marca_resuelta: null,
      motivo: "error_calculo",
    };
  }
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

async function armarItems(
  lineas: any[],
  fechaFactura: string | null,
  facturaNombre: string,
): Promise<ItemFactura[]> {
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

    const garantia = await garantiaDelItem(
      producto?.marca ?? "",
      producto?.nombre ?? m2oNombre(linea.product_id),
      fechaFactura,
    );

    const base = {
      linea_id: linea.id as number,
      garantia,
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
        ya_reportado: false,
        rma_case_number: null,
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
          ya_reportado: false,
          rma_case_number: null,
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
        ya_reportado: false,
        rma_case_number: null,
      });
    }
  }

  marcarYaReportados(items, await casosExistentes(facturaNombre));
  return items;
}

/**
 * Casos de RMA que ya existen para esta factura, sin importar si se crearon
 * desde el portal o el módulo interno (issue #47): si un técnico ya abrió el
 * caso a mano, el cliente tampoco debería crear un duplicado desde el portal.
 *
 * Falla abierta a "sin casos": una consulta de factura no puede reventar
 * porque la tabla de RMA esté momentáneamente inaccesible.
 */
async function casosExistentes(
  facturaNombre: string,
): Promise<{ serial: string; productoId: number | null; caso: string }[]> {
  if (!facturaNombre) return [];
  try {
    // Con envíos de varios productos (issue #331) el caso solo guarda el
    // primero: los demás están en rma_case_items. Se miran las dos tablas; un
    // producto repetido entre ambas no molesta.
    const { rows } = (await hayTablaProductos())
      ? await query(
          `SELECT serial, odoo_product_id, case_number FROM rma_cases WHERE invoice_number = ?
           UNION ALL
           SELECT i.serial, i.odoo_product_id, c.case_number
             FROM rma_case_items i JOIN rma_cases c ON c.id = i.case_id
            WHERE c.invoice_number = ?`,
          [facturaNombre, facturaNombre],
        )
      : await query(
          `SELECT serial, odoo_product_id, case_number FROM rma_cases WHERE invoice_number = ?`,
          [facturaNombre],
        );
    // Sin trim(): el serial de Odoo a veces trae espacios finales de verdad
    // (ver la corrección de item_id en app/api/servicio-tecnico/ticket/route.ts)
    // y se guarda tal cual en `rma_cases.serial`. item.serial tampoco se
    // recorta en ningún otro punto del flujo, así que el cruce tiene que ser
    // byte a byte para no fallar justo en las facturas con ese problema.
    return (rows as any[]).map((r) => ({
      serial: r.serial || "",
      productoId: r.odoo_product_id ?? null,
      caso: r.case_number,
    }));
  } catch (e: any) {
    console.error("[factura] casosExistentes:", e.message);
    return [];
  }
}

/**
 * Cruza los items con los casos ya existentes y marca `ya_reportado` in
 * place. Con serial, el cruce es exacto (mismo criterio con el que se separó
 * "un item por serial" más arriba). Sin serial —el producto no lo lleva, o el
 * despacho no lo registró— solo se puede cruzar por producto, así que un
 * segundo item sin serial del mismo producto en la misma factura también
 * queda marcado aunque sea una unidad distinta: es la mejor aproximación
 * posible sin un identificador por unidad.
 */
function marcarYaReportados(
  items: ItemFactura[],
  casos: { serial: string; productoId: number | null; caso: string }[],
): void {
  if (!casos.length) return;

  const porSerial = new Map<string, string>();
  const porProducto = new Map<number, string>();
  for (const c of casos) {
    if (c.serial) porSerial.set(c.serial, c.caso);
    else if (c.productoId) porProducto.set(c.productoId, c.caso);
  }

  for (const item of items) {
    const caso = item.serial
      ? porSerial.get(item.serial)
      : porProducto.get(item.producto_id);
    if (caso) {
      item.ya_reportado = true;
      item.rma_case_number = caso;
    }
  }
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

/**
 * Lo que el cliente tiene en la mano, agrupado por línea de la orden de venta:
 * lo que salió hacia él menos lo que devolvió.
 *
 * Odoo le pone el mismo `sale_line_id` a la devolución (Cliente → Existencia)
 * y, con entrega en 2 pasos, al movimiento interno de preparación. Tomar todos
 * los movimientos de la línea repetía los seriales devueltos (nov-2026: S-04190,
 * 10 SBNB600 despachados y 2 devueltos en CENT1/IN/00254 se veían como 12, con
 * …0504 y …0541 dos veces). Mismo criterio que `lib/notas-credito/odoo.ts`:
 * cuenta la salida hacia una ubicación de cliente y resta la que vuelve de ahí.
 */
async function leerMovimientos(saleLineIds: number[]) {
  const mapa = new Map<
    number,
    { serial: string; cantidad: number; despacho: string }[]
  >();
  if (!saleLineIds.length) return mapa;

  // state = 'done' descarta los despachos cancelados, que existen y aparecen
  // mezclados con los reales.
  const conVenta = (extra: any[]) => [
    ["sale_line_id", "in", saleLineIds],
    ["state", "=", "done"],
    extra,
  ];
  const campos = ["id", "sale_line_id", "picking_id", "origin_returned_move_id"];
  const [salidas, devoluciones] = await Promise.all([
    rpc<any[]>("stock.move", "search_read", [conVenta(["location_dest_id.usage", "=", "customer"])], {
      fields: campos,
      limit: 500,
    }),
    rpc<any[]>("stock.move", "search_read", [conVenta(["location_id.usage", "=", "customer"])], {
      fields: campos,
      limit: 500,
    }),
  ]);

  if (!salidas.length) return mapa;

  const porMovimiento = new Map<number, { mov: any; signo: 1 | -1 }>();
  for (const m of salidas) porMovimiento.set(m.id, { mov: m, signo: 1 });
  for (const m of devoluciones) porMovimiento.set(m.id, { mov: m, signo: -1 });

  const detalles = await rpc<any[]>(
    "stock.move.line",
    "search_read",
    [
      [
        ["move_id", "in", [...porMovimiento.keys()]],
        ["state", "=", "done"],
      ],
    ],
    { fields: ["move_id", "lot_id", "lot_name", "quantity"], limit: 2000 },
  );

  // Por línea de venta: serial → { neto, despacho de la última salida } y,
  // sin serial, despacho → cantidad neta.
  const conSerial = new Map<number, Map<string, { neto: number; despacho: string }>>();
  const sinSerial = new Map<number, Map<string, number>>();
  const despachoDe = (id: number | null) =>
    id != null ? m2oNombre(porMovimiento.get(id)?.mov.picking_id) : "";

  // Las salidas primero, para que una devolución encuentre de dónde restar.
  const ordenados = [...detalles].sort(
    (a, b) =>
      (porMovimiento.get(m2oId(b.move_id)!)?.signo ?? 0) -
      (porMovimiento.get(m2oId(a.move_id)!)?.signo ?? 0),
  );

  for (const detalle of ordenados) {
    const entrada = porMovimiento.get(m2oId(detalle.move_id)!);
    if (!entrada) continue;
    const { mov, signo } = entrada;

    const saleLineId = m2oId(mov.sale_line_id);
    if (!saleLineId) continue;

    // El serial puede estar como registro de lote o como texto suelto.
    const serial = m2oNombre(detalle.lot_id) || detalle.lot_name || "";
    const cantidad = Number(detalle.quantity) || 0;

    if (serial) {
      const seriales = conSerial.get(saleLineId) ?? new Map();
      const actual = seriales.get(serial) ?? { neto: 0, despacho: "" };
      actual.neto += signo;
      if (signo > 0) actual.despacho = m2oNombre(mov.picking_id);
      seriales.set(serial, actual);
      conSerial.set(saleLineId, seriales);
      continue;
    }

    const porDespacho = sinSerial.get(saleLineId) ?? new Map<string, number>();
    // Una devolución sin serial se resta del despacho que devuelve.
    const despacho =
      signo > 0
        ? m2oNombre(mov.picking_id)
        : despachoDe(m2oId(mov.origin_returned_move_id)) ||
          [...porDespacho.keys()][0] ||
          "";
    porDespacho.set(despacho, (porDespacho.get(despacho) ?? 0) + signo * cantidad);
    sinSerial.set(saleLineId, porDespacho);
  }

  const lista = (id: number) => mapa.get(id) ?? (mapa.set(id, []), mapa.get(id)!);
  for (const [saleLineId, seriales] of conSerial) {
    for (const [serial, { neto, despacho }] of seriales) {
      if (neto > 0) lista(saleLineId).push({ serial, cantidad: 1, despacho });
    }
  }
  for (const [saleLineId, porDespacho] of sinSerial) {
    for (const [despacho, cantidad] of porDespacho) {
      if (cantidad > 0) lista(saleLineId).push({ serial: "", cantidad, despacho });
    }
  }

  return mapa;
}
