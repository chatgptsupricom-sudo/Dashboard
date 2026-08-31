import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";

/**
 * Documentos de Odoo para la seccion Mercancia.
 *
 * Los dos flujos trabajan por documentos distintos: la mercancia que ENTRA
 * se sigue por la factura de la orden de compra (account.move, in_invoice —
 * Seguridad no maneja el picking de ingreso en el dia a dia, la factura es el
 * documento que tiene en la mano). La que SALE se sigue por la orden de
 * despacho (stock.picking, entrega/outgoing): es el documento que realmente
 * dice si el camion esta listo para salir — una factura de venta puede estar
 * `posted` sin que el almacen haya alistado nada, mientras que el picking
 * pasa a "Listo" (`assigned`) recien cuando el inventario esta apartado y
 * listo para cargar. Antes esto tambien se seguia por factura de venta; se
 * volvio a picking porque la factura no reflejaba si el despacho estaba
 * realmente listo.
 *
 * La lista de renglones sale de Odoo, no de lo que alguien escriba a mano: si
 * el papel lo llena el mismo que carga, verificar contra el no prueba nada.
 */

export type LineaPicking = {
  odoo_product_id: number | null;
  producto: string;
  codigo: string | null;
  cantidad_cargada: number;
};

export type PickingOdoo = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  /** Proveedor en un ingreso, cliente en un egreso. */
  contraparte: string;
  estado: string;
  origen: string | null;
  lineas: LineaPicking[];
};

export type PickingResumen = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  contraparte: string;
  estado: string;
  origen: string | null;
  fecha: string | null;
};

/**
 * Listas de facturas y almacenistas por egreso (issue #43).
 *
 * Un camion puede salir con varias facturas y con mas de un almacenista
 * cargandolo. Se guardan como JSON en una columna de texto, mismo patron que
 * `seguridad_despachos.facturas_json` en RMA — no una tabla aparte, porque no
 * hace falta consultarlas por separado, solo mostrarlas junto al registro.
 */
export function serializarLista(items: unknown, max: number, maxItems: number): string | null {
  if (!Array.isArray(items)) return null;
  const limpios = items
    .map((v) => String(v ?? "").trim().slice(0, max))
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
  return limpios.length > 0 ? JSON.stringify(limpios) : null;
}

export function parsearLista(json: unknown): string[] {
  if (!json || typeof json !== "string") return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/**
 * El nombre del producto en Odoo viene como "[CODIGO] Descripcion".
 * Se separan para que el codigo se pueda leer de un vistazo en el porton,
 * que es donde alguien compara caja contra pantalla.
 */
function partirProducto(nombre: string): { codigo: string | null; producto: string } {
  const m = String(nombre || "").match(/^\s*\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { codigo: null, producto: String(nombre || "").trim() };
  return { codigo: m[1].trim(), producto: m[2].trim() || m[1].trim() };
}

/**
 * Busca una factura (compra o venta) por su numero, ej. "FACTU/2026/08/0064".
 *
 * Acepta tambien la referencia (`ref`), que es lo que muchas veces trae el
 * papel en la mano: el numero interno de Odoo no siempre esta impreso.
 *
 * Solo lineas de producto: una factura trae ademas secciones, notas y lineas
 * de impuesto, y contar eso en el porton no significa nada.
 *
 * `cids` acota la busqueda a la sucursal de quien la hace (9=Valencia,
 * 10=Caracas, 7=Panama) — sin esto, cualquiera podia buscar y verificar una
 * factura de otra sucursal con solo saber (o adivinar) su numero. `null` es
 * "sin filtro" (superadmin).
 */
async function buscarFactura(
  numero: string,
  cids: number | null,
  moveType: "in_invoice" | "out_invoice",
): Promise<PickingOdoo | null> {
  const limpio = String(numero || "").trim();
  if (!limpio || limpio.length > 100) return null;

  const domain: any[] = [["move_type", "=", moveType]];
  if (cids !== null) domain.push(["company_id", "=", cids]);
  domain.push("|", ["name", "=", limpio], ["ref", "=", limpio]);

  const facturas = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [domain],
    { fields: ["name", "partner_id", "state", "invoice_origin", "ref"], limit: 1 },
  );

  const f = facturas?.[0];
  if (!f) return null;

  const lineas_raw = await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [
      [
        ["move_id", "=", f.id],
        ["display_type", "=", "product"],
      ],
    ],
    { fields: ["product_id", "quantity", "name"], limit: 500 },
  );

  const lineas: LineaPicking[] = (lineas_raw || []).map((l: any) => {
    // Si la linea no tiene producto de catalogo, se usa su descripcion: es lo
    // unico que identifica lo que salio/llego, y perderla dejaria un renglon
    // mudo.
    const etiqueta = l.product_id?.[1] || l.name || "";
    const { codigo, producto } = partirProducto(etiqueta);
    return {
      odoo_product_id: l.product_id?.[0] ?? null,
      producto,
      codigo,
      cantidad_cargada: Number(l.quantity || 0),
    };
  });

  return {
    odoo_picking_id: f.id,
    odoo_picking_name: f.name,
    // Proveedor en una factura de compra, cliente en una de venta.
    contraparte: f.partner_id?.[1] || "",
    estado: f.state || "",
    origen: f.invoice_origin || f.ref || null,
    lineas,
  };
}

/** Factura de la orden de compra — el documento con el que llega la mercancia (ingreso). */
export async function buscarFacturaCompra(
  numero: string,
  cids: number | null,
): Promise<PickingOdoo | null> {
  return buscarFactura(numero, cids, "in_invoice");
}

/**
 * Orden de despacho (stock.picking, tipo "entrega"/outgoing) — el documento
 * con el que sale la mercancia (egreso).
 *
 * El `name` de un picking (ej. "CENT1/OUT/06321") NO es unico entre
 * compañias: el mismo prefijo de almacen se reutiliza en mas de una, asi que
 * `cids` no es solo un filtro de conveniencia aca — sin el, dos pickings
 * distintos con el mismo nombre son ambiguos y `search_read` puede devolver
 * el que no es. Un superadmin (`cids: null`) queda expuesto a esa ambiguedad;
 * en la practica quien busca aca siempre es Almacen o Seguridad, con su
 * sucursal ya resuelta.
 */
export async function buscarPickingEgreso(
  numero: string,
  cids: number | null,
): Promise<PickingOdoo | null> {
  const limpio = String(numero || "").trim();
  if (!limpio || limpio.length > 100) return null;

  const domain: any[] = [
    ["name", "=", limpio],
    ["picking_type_id.code", "=", "outgoing"],
  ];
  if (cids !== null) domain.push(["company_id", "=", cids]);

  const pickings = await callOdooRPC<any[]>(
    "stock.picking",
    "search_read",
    [domain],
    { fields: ["name", "partner_id", "state", "origin"], limit: 1 },
  );

  const p = pickings?.[0];
  if (!p) return null;

  const lineas_raw = await callOdooRPC<any[]>(
    "stock.move.line",
    "search_read",
    [[["picking_id", "=", p.id]]],
    { fields: ["product_id", "quantity"], limit: 500 },
  );

  const lineas: LineaPicking[] = (lineas_raw || []).map((l: any) => {
    const etiqueta = l.product_id?.[1] || "";
    const { codigo, producto } = partirProducto(etiqueta);
    return {
      odoo_product_id: l.product_id?.[0] ?? null,
      producto,
      codigo,
      cantidad_cargada: Number(l.quantity || 0),
    };
  });

  return {
    odoo_picking_id: p.id,
    odoo_picking_name: p.name,
    contraparte: p.partner_id?.[1] || "",
    estado: p.state || "",
    // Referencia a la orden de venta de origen (ej. "S-04680"), para que el
    // almacenista pueda ubicar el pedido aunque solo tenga a mano el numero
    // de orden de despacho o viceversa.
    origen: p.origin || null,
    lineas,
  };
}

/**
 * Ordenes de despacho (egresos) que Odoo ya tiene "Listas" (`assigned`) —
 * inventario apartado y listo para cargar el camion — y que Almacen aun no
 * proceso.
 *
 * `assigned` y no `posted`/`done`: una factura de venta confirmada no dice
 * nada sobre si el almacen ya alisto el pedido, y un picking `done` ya salio
 * (nada que hacer). `assigned` es la señal real de "listo para despachar".
 *
 * El cruce con lo ya procesado se hace en MySQL (`seguridad_mercancia`)
 * porque Odoo no sabe nada de nuestros registros. `cids` acota por sucursal
 * (null = superadmin, sin filtro), mismo criterio que el resto del modulo.
 */
export async function listarPickingsEgresoPendientes(
  cids: number | null,
): Promise<PickingResumen[]> {
  const domain: any[] = [
    ["picking_type_id.code", "=", "outgoing"],
    ["state", "=", "assigned"],
  ];
  if (cids !== null) domain.push(["company_id", "=", cids]);

  // Odoo y MySQL fallan de formas distintas y con causas distintas — se
  // etiqueta cada uno para que el error que llega al caller diga cual de
  // los dos fue, en vez de un generico "no se pudo consultar Odoo" que
  // culpa a Odoo aunque el problema sea la base local (ej. la migracion de
  // `cids` en seguridad_mercancia sin correr todavia).
  let pickings: any[] | null;
  try {
    pickings = await callOdooRPC<any[]>(
      "stock.picking",
      "search_read",
      [domain],
      {
        fields: ["name", "partner_id", "state", "origin", "scheduled_date"],
        order: "scheduled_date desc",
        limit: 200,
      },
    );
  } catch (e: any) {
    throw new Error(`[odoo] ${e?.message || e}`);
  }
  if (!pickings || pickings.length === 0) return [];

  let usados: { rows: any[] };
  try {
    usados = await query(
      `SELECT odoo_picking_id FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND odoo_picking_id IS NOT NULL
          ${cids !== null ? "AND cids = ?" : ""}`,
      cids !== null ? [cids] : [],
    );
  } catch (e: any) {
    throw new Error(`[mysql] ${e?.message || e}`);
  }
  const idsUsados = new Set(
    (usados.rows as any[]).map((r) => Number(r.odoo_picking_id)),
  );

  return pickings
    .filter((p: any) => !idsUsados.has(p.id))
    .map((p: any) => ({
      odoo_picking_id: p.id,
      odoo_picking_name: p.name,
      contraparte: p.partner_id?.[1] || "",
      estado: p.state || "",
      origen: p.origin || null,
      fecha: p.scheduled_date || null,
    }));
}

/**
 * Compara lo cargado contra lo verificado.
 *
 * Un renglon sin contar (`cantidad_verificada` null) NO cuenta como faltante:
 * "todavia no lo revise" y "conte cero" son cosas distintas, y confundirlas
 * marcaria descuadre en cada acta a medio llenar.
 *
 * `no_salio` (issue #44) es una senal aparte del conteo numerico: un renglon
 * puede salir en cantidad parcial (3 de 4) sin ser "no salio", y al reves, se
 * puede marcar "no salio" sin llegar a contar la cantidad. El checkbox manda
 * sobre la cantidad cuando estan en conflicto — es la razon por la que Seguridad
 * lo marco explicitamente.
 */
export function evaluarDescuadre(
  items: Array<{
    cantidad_cargada: number;
    cantidad_verificada: number | null;
    no_salio?: boolean;
  }>,
): { estado: "pendiente" | "conforme" | "descuadre"; diferencias: number } {
  const marcados = items.filter((i) => i.no_salio).length;

  const contados = items.filter((i) => i.cantidad_verificada !== null);
  const conDiferenciaCantidad = contados.filter(
    (i) => !i.no_salio && Number(i.cantidad_verificada) !== Number(i.cantidad_cargada),
  ).length;

  const diferencias = marcados + conDiferenciaCantidad;
  if (diferencias > 0) return { estado: "descuadre", diferencias };

  if (contados.length === 0) return { estado: "pendiente", diferencias: 0 };

  // Conforme solo si ademas no quedo ningun renglon sin contar: si falta por
  // revisar la mitad del camion, eso no es "todo correcto".
  if (contados.length < items.length) return { estado: "pendiente", diferencias: 0 };

  return { estado: "conforme", diferencias: 0 };
}
