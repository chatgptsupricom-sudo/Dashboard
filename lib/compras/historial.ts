import {
  almacenSede,
  catalogo,
  diaCaracas,
  dominioVentas,
  idsPorCodigo,
  inicioDiaUtc,
  leerSmartbit,
  leerTodo,
  signoDocumento,
  sumarDias,
} from "@/lib/compras/datosOdoo";
import { callOdooRPC } from "@/lib/odoo";
import { SQL_SIN_INTERCOMPANIA, desdeOdoo, rangoSmartbit } from "@/lib/smartbit";

/**
 * Historia día por día de una sede para lo que no se puede leer "al día de
 * hoy": ventas por día y stock del almacén principal al cierre de cualquier
 * día pasado (el Stoplight de Compras y los quiebres históricos).
 *
 * El stock de un día se reconstruye desde el de hoy deshaciendo los
 * movimientos hechos después: stock(d) = stock(hoy) − Σ (entradas − salidas)
 * de los días posteriores a d. Solo cuentan los movimientos que entran o
 * salen del almacén (Entrada → Existencias es interno y no cambia el total).
 */

type PorDia = Map<string, number>;

const sumar = (m: Map<number, PorDia>, id: number, dia: string, q: number) => {
  let d = m.get(id);
  if (!d) m.set(id, (d = new Map()));
  d.set(dia, (d.get(dia) ?? 0) + q);
};

export interface VentasDiarias {
  /** Unidades netas vendidas por producto y día. */
  porProducto: Map<number, PorDia>;
  /** Lo de Smartbit cuyo código no está en el catálogo activo de Odoo. */
  sinProducto: Map<string, { nombre: string; dias: PorDia }>;
}

/**
 * Unidades netas vendidas por día en [desde, hasta], con las mismas reglas
 * que `unidadesVendidas` (sin COGS, notas de crédito restan, sin
 * intercompañía ni servicios, Smartbit antes del corte).
 */
export async function ventasPorDia(companyId: number, desde: string, hasta: string): Promise<VentasDiarias> {
  const porProducto = new Map<number, PorDia>();
  const sinProducto = new Map<string, { nombre: string; dias: PorDia }>();

  const ini = desdeOdoo(desde);
  const rango = rangoSmartbit(desde, hasta);
  const [grupos, smartbit, codigos] = await Promise.all([
    ini <= hasta
      ? (async () => {
          const r = await callOdooRPC<any[]>("account.move.line", "read_group", [
            [...(await dominioVentas(companyId)), ["invoice_date", ">=", ini], ["invoice_date", "<=", hasta]],
            ["quantity:sum"],
            ["product_id", "invoice_date:day", "move_type"],
          ], { lazy: false });
          if (!Array.isArray(r)) throw new Error("Odoo no respondió las ventas por día");
          return r;
        })()
      : Promise.resolve([] as any[]),
    rango
      ? leerSmartbit(
          `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS dia, UPPER(TRIM(codigo_articulo)) AS codigo,
                  MAX(articulo) AS articulo, SUM(unidades) AS unidades
             FROM ventas_smartbit
            WHERE company_id = ? AND fecha BETWEEN ? AND ? AND codigo_articulo IS NOT NULL
              AND ${SQL_SIN_INTERCOMPANIA}
            GROUP BY dia, UPPER(TRIM(codigo_articulo))`,
          [companyId, rango[0], rango[1]],
        )
      : Promise.resolve([] as any[]),
    idsPorCodigo(),
  ]);

  for (const g of grupos) {
    const id = g.product_id?.[0];
    const dia = String(g.__range?.["invoice_date:day"]?.from || "").slice(0, 10);
    if (!id || !dia) continue;
    sumar(porProducto, id, dia, signoDocumento(g.move_type) * (Number(g.quantity) || 0));
  }
  for (const f of smartbit) {
    const codigo = String(f.codigo || "");
    const unidades = Number(f.unidades) || 0;
    const dia = String(f.dia || "");
    if (!codigo || !dia || !unidades) continue;
    const id = codigos.get(codigo);
    if (id) sumar(porProducto, id, dia, unidades);
    else {
      let x = sinProducto.get(codigo);
      if (!x) sinProducto.set(codigo, (x = { nombre: String(f.articulo || codigo), dias: new Map() }));
      x.dias.set(dia, (x.dias.get(dia) ?? 0) + unidades);
    }
  }
  return { porProducto, sinProducto };
}

/** Suma de un producto en [desde, hasta] (días "YYYY-MM-DD"). */
export function sumaEntre(dias: PorDia | undefined, desde: string, hasta: string): number {
  if (!dias) return 0;
  let t = 0;
  for (const [d, q] of dias) if (d >= desde && d <= hasta) t += q;
  return t;
}

/** Último día con venta positiva hasta `hasta`, o null. */
export function ultimoDiaConVenta(dias: PorDia | undefined, hasta: string): string | null {
  if (!dias) return null;
  let ultimo: string | null = null;
  for (const [d, q] of dias) if (q > 0 && d <= hasta && (!ultimo || d > ultimo)) ultimo = d;
  return ultimo;
}

export interface HistorialStock {
  /** Primer día cuyo cierre se puede reconstruir (el día anterior a `desde`). */
  desde: string;
  hoy: string;
  /** Stock físico del producto al cierre de `dia` (>= desde − 1). */
  stockAlCierre(id: number, dia: string): number;
  /** Productos con algún movimiento en el período. */
  conMovimiento: Set<number>;
}

/**
 * Stock físico diario del almacén principal desde `desde` hasta hoy. Solo
 * almacenables (los consumibles no llevan stock en Odoo).
 */
export async function historialStock(companyId: number, desde: string, hoy: string): Promise<HistorialStock> {
  const [almacen, cat] = await Promise.all([almacenSede(companyId), catalogo()]);
  const W = almacen.ubicaciones;
  const desdeUtc = inicioDiaUtc(desde);
  const campos = ["product_id", "quantity", "date"];
  const [entradas, salidas] = await Promise.all([
    leerTodo("stock.move", [
      ["state", "=", "done"], ["date", ">=", desdeUtc],
      ["location_dest_id", "in", W], ["location_id", "not in", W],
    ], campos),
    leerTodo("stock.move", [
      ["state", "=", "done"], ["date", ">=", desdeUtc],
      ["location_id", "in", W], ["location_dest_id", "not in", W],
    ], campos),
  ]);

  // Por producto: días con movimiento (ascendente) y la suma de lo que
  // entró − salió de ese día en adelante.
  const deltas = new Map<number, PorDia>();
  for (const m of entradas) {
    const id = m.product_id?.[0];
    if (id && cat.get(id)?.tipo === "product") sumar(deltas, id, diaCaracas(m.date), Number(m.quantity) || 0);
  }
  for (const m of salidas) {
    const id = m.product_id?.[0];
    if (id && cat.get(id)?.tipo === "product") sumar(deltas, id, diaCaracas(m.date), -(Number(m.quantity) || 0));
  }
  const indice = new Map<number, { dias: string[]; posteriores: number[] }>();
  for (const [id, porDia] of deltas) {
    const dias = [...porDia.keys()].sort();
    const posteriores = new Array(dias.length + 1).fill(0);
    for (let i = dias.length - 1; i >= 0; i--) posteriores[i] = posteriores[i + 1] + (porDia.get(dias[i]) ?? 0);
    indice.set(id, { dias, posteriores });
  }

  return {
    desde: sumarDias(desde, -1),
    hoy,
    conMovimiento: new Set(deltas.keys()),
    stockAlCierre(id: number, dia: string): number {
      const actual = almacen.stock.get(id)?.fisico ?? 0;
      const x = indice.get(id);
      if (!x || dia >= hoy) return actual;
      // Primer día con movimiento posterior a `dia`.
      let lo = 0;
      let hi = x.dias.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (x.dias[mid] > dia) hi = mid;
        else lo = mid + 1;
      }
      return Math.max(0, actual - x.posteriores[lo]);
    },
  };
}

/**
 * Recepciones netas de compra por producto y día desde `desde`: lo que entró
 * al almacén desde proveedor o tránsito menos lo devuelto al proveedor (en
 * Valencia la orden P-00103 se recibió y se devolvió el mismo día).
 */
export async function recepcionesPorDia(companyId: number, desde: string): Promise<Map<number, PorDia>> {
  const { ubicaciones: W } = await almacenSede(companyId);
  const desdeUtc = inicioDiaUtc(desde);
  const campos = ["product_id", "quantity", "date"];
  const [entradas, devoluciones] = await Promise.all([
    leerTodo("stock.move", [
      ["state", "=", "done"], ["date", ">=", desdeUtc],
      ["location_dest_id", "in", W], ["location_id.usage", "in", ["supplier", "transit"]],
    ], campos),
    leerTodo("stock.move", [
      ["state", "=", "done"], ["date", ">=", desdeUtc],
      ["location_id", "in", W], ["location_dest_id.usage", "=", "supplier"],
    ], campos),
  ]);
  const mapa = new Map<number, PorDia>();
  for (const m of entradas) if (m.product_id) sumar(mapa, m.product_id[0], diaCaracas(m.date), Number(m.quantity) || 0);
  for (const m of devoluciones) if (m.product_id) sumar(mapa, m.product_id[0], diaCaracas(m.date), -(Number(m.quantity) || 0));
  return mapa;
}
