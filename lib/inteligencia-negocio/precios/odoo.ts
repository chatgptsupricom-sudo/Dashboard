import { callOdooRPC } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { CORTE_ODOO } from "@/lib/smartbit";

/**
 * Ventas de Supricom para la Inteligencia de Precios, con la forma que
 * espera el tablero (lo que antes leía con SQL por el conector de claude.ai):
 *
 *   p: [[id, código, nombre, marca, categoría]]
 *   f: [[id, fecha, cantidad, venta, costo, sede, cantidad con costo valorizado]]
 *
 * Una fila de `f` por producto, día (hora de Caracas) y sede (C = Caracas,
 * V = Valencia). Pedidos de venta confirmados de 9 y 10 desde el corte de
 * Odoo, sin intercompañía. Venta = subtotal sin IVA en dólares (los pedidos
 * en otra moneda se pasan con su tasa). Costo = el valorizado de lo que salió
 * del almacén (capas de valoración de los movimientos del pedido) y, si la
 * línea todavía no tiene salida, el costo del pedido (`purchase_price`).
 */

const SEDES = [9, 10];
const CHUNK = 400;

export interface OdooPrecios {
  p: [number, string, string, string, string][];
  f: [number, string, number, number, number, string, number][];
}

let cache: { vence: number; valor: Promise<OdooPrecios> } | null = null;

export function ventasParaPrecios(refrescar = false): Promise<OdooPrecios> {
  if (!refrescar && cache && cache.vence > Date.now()) return cache.valor;
  const valor = leer();
  const entrada = { vence: Date.now() + 30 * 60 * 1000, valor };
  cache = entrada;
  valor.catch(() => {
    if (cache === entrada) cache = null;
  });
  return valor;
}

const m2o = (v: any): number | null => (Array.isArray(v) ? v[0] : typeof v === "number" ? v : null);
const m2oNombre = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");

/** Fecha de Odoo (UTC) → día en Caracas (UTC−4). */
function diaCaracas(utc: string): string {
  const d = new Date(utc.replace(" ", "T") + "Z");
  return new Date(d.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

async function todas<T>(model: string, domain: any[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 2000) {
    const r = await callOdooRPC<T[]>(model, "search_read", [domain], {
      fields,
      limit: 2000,
      offset,
      order: "id asc",
      context: { allowed_company_ids: SEDES },
    });
    if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}`);
    out.push(...r);
    if (r.length < 2000) break;
  }
  return out;
}

async function leer(): Promise<OdooPrecios> {
  const ic = await partnersIntercompania();
  const desde = `${CORTE_ODOO} 04:00:00`; // medianoche de Caracas en UTC
  const pedidos = await todas<any>(
    "sale.order",
    [
      ["state", "=", "sale"],
      ["company_id", "in", SEDES],
      ["date_order", ">=", desde],
      ["partner_id.commercial_partner_id", "not in", [...ic.keys()]],
    ],
    ["id", "date_order", "company_id", "currency_id", "currency_rate"],
  );
  const pedido = new Map<number, { dia: string; sede: string; tasa: number }>();
  for (const o of pedidos) {
    const usd = /USD/i.test(m2oNombre(o.currency_id));
    const tasa = !usd && Number(o.currency_rate) > 0 ? Number(o.currency_rate) : 1;
    pedido.set(o.id, { dia: diaCaracas(o.date_order), sede: m2o(o.company_id) === 10 ? "C" : "V", tasa });
  }
  const ids = [...pedido.keys()];
  const lineas: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    lineas.push(
      ...(await todas<any>(
        "sale.order.line",
        [
          ["order_id", "in", ids.slice(i, i + CHUNK)],
          ["display_type", "=", false],
          ["product_uom_qty", ">", 0],
        ],
        ["id", "order_id", "product_id", "product_uom_qty", "price_subtotal", "purchase_price"],
      )),
    );
  }

  // Costo valorizado por línea: capas de valoración de sus movimientos de salida.
  const valorizado = new Map<number, { valor: number; cant: number }>();
  try {
    const lineaIds = lineas.map((l) => l.id);
    const movPorLinea = new Map<number, number>();
    const movimientos: number[] = [];
    for (let i = 0; i < lineaIds.length; i += CHUNK) {
      const movs = await todas<any>(
        "stock.move",
        [
          ["sale_line_id", "in", lineaIds.slice(i, i + CHUNK)],
          ["state", "=", "done"],
        ],
        ["id", "sale_line_id"],
      );
      for (const m of movs) {
        const l = m2o(m.sale_line_id);
        if (l) {
          movPorLinea.set(m.id, l);
          movimientos.push(m.id);
        }
      }
    }
    for (let i = 0; i < movimientos.length; i += CHUNK) {
      const capas = await todas<any>(
        "stock.valuation.layer",
        [["stock_move_id", "in", movimientos.slice(i, i + CHUNK)]],
        ["stock_move_id", "value", "quantity"],
      );
      for (const c of capas) {
        const l = movPorLinea.get(m2o(c.stock_move_id) || 0);
        if (!l) continue;
        const v = valorizado.get(l) || { valor: 0, cant: 0 };
        v.valor -= Number(c.value) || 0;
        v.cant -= Number(c.quantity) || 0;
        valorizado.set(l, v);
      }
    }
  } catch (e: any) {
    console.warn("[precios/odoo] sin costo valorizado, se usa el del pedido:", e?.message);
  }

  const productos = new Set<number>();
  const hechos = new Map<string, [number, string, number, number, number, string, number]>();
  for (const l of lineas) {
    const o = pedido.get(m2o(l.order_id) || 0);
    const pid = m2o(l.product_id);
    if (!o || !pid) continue;
    const q = Number(l.product_uom_qty) || 0;
    const v = (Number(l.price_subtotal) || 0) / o.tasa;
    const sv = valorizado.get(l.id);
    const conCapa = !!sv && sv.cant > 0;
    const c = conCapa ? q * (sv!.valor / sv!.cant) : (q * (Number(l.purchase_price) || 0)) / o.tasa;
    productos.add(pid);
    const k = `${pid}|${o.dia}|${o.sede}`;
    const h = hechos.get(k) || [pid, o.dia, 0, 0, 0, o.sede, 0];
    h[2] += q;
    h[3] += v;
    h[4] += c;
    h[6] += conCapa ? q : 0;
    hechos.set(k, h);
  }

  const leidos: any[] = [];
  const pids = [...productos];
  for (let i = 0; i < pids.length; i += CHUNK) {
    const r = await callOdooRPC<any[]>("product.product", "read", [pids.slice(i, i + CHUNK)], {
      fields: ["default_code", "name", "spiff_brand_id", "categ_id"],
      context: { active_test: false },
    });
    leidos.push(...(r || []));
  }
  // Categoría = su nombre propio (no la ruta "All / …"): el tablero la usa como pista (CAT_HINT).
  const categIds = [...new Set(leidos.map((x) => m2o(x.categ_id)).filter(Boolean))] as number[];
  const categ = new Map<number, string>();
  if (categIds.length) {
    const r = await callOdooRPC<any[]>("product.category", "read", [categIds], { fields: ["name"] });
    for (const c of r || []) categ.set(c.id, c.name || "");
  }
  const p: OdooPrecios["p"] = leidos.map((x) => [
    x.id,
    x.default_code || "",
    x.name || "",
    m2oNombre(x.spiff_brand_id),
    categ.get(m2o(x.categ_id) || 0) || "",
  ]);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const f = [...hechos.values()].map((h) => [h[0], h[1], r2(h[2]), r2(h[3]), r2(h[4]), h[5], r2(h[6])] as OdooPrecios["f"][number]);
  return { p, f };
}
