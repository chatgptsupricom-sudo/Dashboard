import { query } from "@/lib/db";
import {
  almacenSede,
  catalogo,
  diaCaracas,
  disponible,
  dominioVentas,
  hoyCaracas,
  idsPorCodigo,
  leerTodo,
  signoDocumento,
  sumarDias,
  ultimaVenta,
  unidadesVendidas,
} from "@/lib/compras/datosOdoo";
import { COMPANY_NAMES } from "@/lib/cxc/alcance";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";
import { HISTORIA_DESDE, SQL_SIN_INTERCOMPANIA, rangoSmartbit } from "@/lib/smartbit";

/**
 * Por llegar (rol Inteligencia de Negocio): qué productos vienen en camino,
 * cuántos, y si ese producto ya se vendió antes en la sede, con el detalle
 * de esas ventas.
 *
 * Dos fuentes:
 * - Odoo: lo pendiente de recibir de las órdenes de compra en el almacén
 *   principal de cada sede (el mismo "tránsito" de Compras, `transito()` de
 *   lib/compras/datosOdoo.ts), con orden, proveedor y fecha prevista.
 * - Packing List del panel (solo Valencia): lo que Compras cargó y todavía no
 *   se cerró, con su fecha estimada. Si el producto ya está en una orden de
 *   Odoo se le suma la fecha; si no, entra como renglón propio con la
 *   cantidad del packing list. En Valencia la orden se suele cargar en Odoo
 *   cuando llega, así que casi todo lo que viene está aquí.
 *
 * Ventas: las de `dominioVentas` (sin IVA, NC restan, sin servicios ni
 * intercompañía) en Odoo desde el corte y en Smartbit antes.
 */

export const SEDES_POR_LLEGAR: Record<string, number[]> = { todas: [9, 10, 7], valencia: [9], caracas: [10], panama: [7] };
const VALENCIA = 9;

const r2 = (n: number) => Math.round(n * 100) / 100;
const idDe = (v: any): number | null => (Array.isArray(v) ? v[0] : v) || null;
const nombreDe = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");

export interface OrigenLlegada {
  tipo: "odoo" | "packing";
  /** Orden de compra (Odoo) o referencia del packing list. */
  documento: string;
  proveedor: string;
  cantidad: number;
  /** Fecha prevista (Odoo) o estimada (packing list); null = sin fecha. */
  fecha: string | null;
  /** Solo packing list: por_llegar / descargando (llegó, se está contando). */
  etapa?: string;
}

export interface FilaPorLlegar {
  sede: number;
  productId: number | null;
  codigo: string;
  producto: string;
  marca: string;
  categoria: string;
  /** Unidades por llegar (Odoo + lo del packing list que no está en una orden). */
  cantidad: number;
  /** La fecha más próxima de los documentos. */
  fecha: string | null;
  origenes: OrigenLlegada[];
  /** Disponible hoy en el almacén principal de la sede. */
  stock: number;
  /** ¿Se vendió alguna vez en la sede? */
  vendido: boolean;
  ultimaVenta: string | null;
  unidades12m: number;
  /** Otras sedes donde sí se vendió. */
  otrasSedes: string[];
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

/** Pendiente de recibir de órdenes de compra en el almacén principal de la sede. */
async function pendientesOdoo(companyId: number): Promise<Map<number, OrigenLlegada[]>> {
  const { ubicaciones } = await almacenSede(companyId);
  const moves = await leerTodo(
    "stock.move",
    [
      ["purchase_line_id", "!=", false],
      ["state", "not in", ["draft", "done", "cancel"]],
      ["location_dest_id", "in", ubicaciones],
      ["location_id", "not in", ubicaciones],
    ],
    ["product_id", "product_qty", "date", "origin", "partner_id", "purchase_line_id"],
  );
  // El proveedor del movimiento a veces viene vacío: se toma el de la orden.
  const lineas = [...new Set(moves.filter((m) => !m.partner_id).map((m) => idDe(m.purchase_line_id)).filter(Boolean))] as number[];
  const proveedorDeLinea = new Map<number, string>();
  for (let i = 0; i < lineas.length; i += 1000) {
    const r = await leerTodo("purchase.order.line", [["id", "in", lineas.slice(i, i + 1000)]], ["partner_id"]);
    for (const l of r) proveedorDeLinea.set(l.id, nombreDe(l.partner_id));
  }
  const mapa = new Map<number, OrigenLlegada[]>();
  for (const m of moves) {
    const id = idDe(m.product_id);
    const cantidad = Number(m.product_qty) || 0;
    if (!id || cantidad <= 0) continue;
    const lista = mapa.get(id) ?? [];
    const documento = String(m.origin || "");
    const proveedor = nombreDe(m.partner_id) || proveedorDeLinea.get(idDe(m.purchase_line_id) as number) || "";
    const fecha = m.date ? diaCaracas(m.date) : null;
    // Varios movimientos de la misma orden y fecha se suman.
    const ya = lista.find((o) => o.documento === documento && o.fecha === fecha);
    if (ya) ya.cantidad += cantidad;
    else lista.push({ tipo: "odoo", documento, proveedor, cantidad, fecha });
    mapa.set(id, lista);
  }
  return mapa;
}

interface RenglonPacking {
  productId: number | null;
  codigo: string;
  producto: string;
  origen: OrigenLlegada;
}

/** Packing list de Valencia todavía no cerrados (por llegar o contándose). [] si la MySQL no responde. */
async function pendientesPacking(): Promise<{ renglones: RenglonPacking[]; error: string | null }> {
  try {
    await asegurarColumnasOdoo();
    const r = await query(
      `SELECT r.referencia, r.proveedor, r.etapa,
              DATE_FORMAT(r.fecha_estimada, '%Y-%m-%d') AS estimada,
              i.codigo, i.producto, i.odoo_product_id, i.cantidad_esperada
         FROM recepcion_packing r
         JOIN recepcion_packing_items i ON i.recepcion_id = r.id
        WHERE r.cids = ? AND r.descartado_at IS NULL AND r.etapa <> 'cerrado'`,
      [VALENCIA],
    );
    const porCodigo = await idsPorCodigo();
    const renglones: RenglonPacking[] = [];
    for (const f of r.rows as any[]) {
      const cantidad = Number(f.cantidad_esperada) || 0;
      if (cantidad <= 0) continue;
      const codigo = String(f.codigo || "").trim();
      renglones.push({
        productId: Number(f.odoo_product_id) || porCodigo.get(codigo.toUpperCase()) || null,
        codigo,
        producto: String(f.producto || ""),
        origen: {
          tipo: "packing",
          documento: String(f.referencia || ""),
          proveedor: String(f.proveedor || ""),
          cantidad,
          fecha: f.estimada || null,
          etapa: String(f.etapa || ""),
        },
      });
    }
    return { renglones, error: null };
  } catch (e: any) {
    console.error("[bi-por-llegar] packing list:", e?.message);
    return { renglones: [], error: "No se pudieron leer los packing list de Valencia" };
  }
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

const minFecha = (os: OrigenLlegada[]) =>
  os.map((o) => o.fecha).filter((f): f is string => !!f).sort()[0] ?? null;

export async function porLlegar(companyIds: number[]): Promise<{ filas: FilaPorLlegar[]; avisos: string[] }> {
  const hoy = hoyCaracas();
  const desde12m = sumarDias(hoy, -365);
  const todas = Object.keys(COMPANY_NAMES).map(Number);
  const [cat, packing, porSede, ventasTodas] = await Promise.all([
    catalogo(),
    companyIds.includes(VALENCIA) ? pendientesPacking() : Promise.resolve({ renglones: [], error: null }),
    Promise.all(
      companyIds.map(async (cid) => {
        const [odoo, almacen, vendidas12m] = await Promise.all([
          pendientesOdoo(cid),
          almacenSede(cid),
          unidadesVendidas(cid, desde12m, hoy),
        ]);
        return { cid, odoo, almacen, vendidas12m };
      }),
    ),
    // Última venta en las tres sedes: también dice si se vendió en otra.
    Promise.all(todas.map(async (cid) => [cid, await ultimaVenta(cid)] as const)),
  ]);
  const ultima = new Map(ventasTodas);

  const filas: FilaPorLlegar[] = [];
  for (const { cid, odoo, almacen, vendidas12m } of porSede) {
    // Renglones por producto: lo de Odoo, más lo del packing list (solo Valencia).
    const grupos = new Map<string, { productId: number | null; codigo: string; producto: string; origenes: OrigenLlegada[] }>();
    for (const [id, origenes] of odoo) grupos.set(`p${id}`, { productId: id, codigo: "", producto: "", origenes: [...origenes] });
    if (cid === VALENCIA) {
      for (const r of packing.renglones) {
        const llave = r.productId ? `p${r.productId}` : `c${(r.codigo || r.producto).toUpperCase()}`;
        const g = grupos.get(llave) ?? { productId: r.productId, codigo: r.codigo, producto: r.producto, origenes: [] };
        g.origenes.push(r.origen);
        grupos.set(llave, g);
      }
    }

    for (const g of grupos.values()) {
      const p = g.productId ? cat.get(g.productId) : undefined;
      const ultimaSede = g.productId ? ultima.get(cid)?.get(g.productId) ?? null : null;
      const otrasSedes = g.productId
        ? todas.filter((s) => s !== cid && ultima.get(s)?.has(g.productId!)).map((s) => COMPANY_NAMES[s])
        : [];
      // Un producto que está en una orden de Odoo y en un packing list suele
      // ser el mismo envío: se toma el mayor, no la suma.
      const deOdoo = g.origenes.filter((o) => o.tipo === "odoo").reduce((s, o) => s + o.cantidad, 0);
      const dePacking = g.origenes.filter((o) => o.tipo === "packing").reduce((s, o) => s + o.cantidad, 0);
      filas.push({
        sede: cid,
        productId: g.productId,
        codigo: p?.codigo ?? g.codigo,
        producto: p?.nombre ?? g.producto,
        marca: p?.marca ?? "SIN MARCA",
        categoria: p?.categoria ?? "Sin categoría",
        cantidad: r2(Math.max(deOdoo, dePacking)),
        fecha: minFecha(g.origenes),
        origenes: g.origenes.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999")),
        stock: g.productId ? r2(disponible(almacen.stock.get(g.productId))) : 0,
        vendido: !!ultimaSede,
        ultimaVenta: ultimaSede,
        unidades12m: g.productId ? r2(vendidas12m.get(g.productId) ?? 0) : 0,
        otrasSedes,
      });
    }
  }
  filas.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || b.cantidad - a.cantidad);
  return { filas, avisos: packing.error ? [packing.error] : [] };
}

// ---------------------------------------------------------------------------
// Detalle de ventas de un producto
// ---------------------------------------------------------------------------

export interface VentaProducto {
  fuente: "Odoo" | "Smartbit";
  fecha: string;
  factura: string;
  cliente: string;
  cantidad: number;
  /** USD sin IVA; las notas de crédito en negativo. */
  total: number;
}

/** Ventas del producto en la sede: Odoo desde el corte y Smartbit antes, la más reciente primero. */
export async function ventasDelProducto(companyId: number, productId: number): Promise<VentaProducto[]> {
  const hoy = hoyCaracas();
  const [lineas, cat] = await Promise.all([
    (async () =>
      leerTodo(
        "account.move.line",
        [...(await dominioVentas(companyId)), ["product_id", "=", productId]],
        ["invoice_date", "move_name", "move_type", "partner_id", "quantity", "balance"],
      ))(),
    catalogo(),
  ]);
  const ventas: VentaProducto[] = lineas.map((l) => ({
    fuente: "Odoo",
    fecha: String(l.invoice_date || "").slice(0, 10),
    factura: String(l.move_name || ""),
    cliente: nombreDe(l.partner_id),
    cantidad: signoDocumento(l.move_type) * (Number(l.quantity) || 0),
    total: r2(-(Number(l.balance) || 0)),
  }));

  // Smartbit por código (antes del corte; abril-2026 lo trae Odoo).
  const codigo = cat.get(productId)?.codigo;
  const rango = rangoSmartbit(HISTORIA_DESDE, hoy);
  if (codigo && !codigo.startsWith("PROD-") && rango) {
    const filtro = `company_id = ? AND fecha BETWEEN ? AND ? AND UPPER(TRIM(codigo_articulo)) = ? AND ${SQL_SIN_INTERCOMPANIA}`;
    const params = [companyId, rango[0], rango[1], codigo.trim().toUpperCase()];
    let filas: any[] = [];
    try {
      // `numero` solo existe donde se cargó el histórico con número de factura (Valencia).
      filas = (await query(
        `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, numero, cliente, unidades, venta FROM ventas_smartbit WHERE ${filtro}`,
        params,
      )).rows as any[];
    } catch {
      try {
        filas = (await query(
          `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, '' AS numero, cliente, unidades, venta FROM ventas_smartbit WHERE ${filtro}`,
          params,
        )).rows as any[];
      } catch (e: any) {
        console.error("[bi-por-llegar] ventas_smartbit:", e?.message);
      }
    }
    for (const f of filas) {
      ventas.push({
        fuente: "Smartbit",
        fecha: String(f.fecha || ""),
        factura: String(f.numero || ""),
        cliente: String(f.cliente || ""),
        cantidad: Number(f.unidades) || 0,
        total: r2(Number(f.venta) || 0),
      });
    }
  }
  return ventas.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.factura.localeCompare(b.factura));
}
