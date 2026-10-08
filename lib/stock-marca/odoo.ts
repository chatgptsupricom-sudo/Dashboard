import { callOdooRPC } from "@/lib/odoo";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { cachear, costos, diaCaracas, hoyCaracas, inicioDiaUtc, leerTodo, sumarDias } from "@/lib/compras/datosOdoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { claveMarca, SIN_MARCA } from "@/lib/metas-marca/marcas";

/**
 * Lecturas de Odoo de Stock por marca (solo lectura). Mismas reglas que la
 * capa compartida de Compras (`lib/compras/datosOdoo.ts`), para que el stock
 * y las unidades vendidas cuadren con Sugeridos, Cobertura y el
 * sell-through del Stoplight de Compras:
 *
 * - Stock = almacén principal de la sede entero (Existencias + Entrada y sus
 *   sububicaciones). No cuenta Exhibición, Mal estado, Demo, Consumo interno.
 *   Hoy sale de los quants; al cierre de un día pasado, del stock histórico
 *   de Odoo (`qty_available` con `to_date`), que es el mismo cálculo del
 *   informe de inventario a una fecha de Odoo. La auditoría lo compara con la
 *   reconstrucción por movimientos.
 * - Vendido = líneas de producto de facturas, recibos y notas de crédito de
 *   cliente publicadas, por fecha de factura (las notas de crédito restan).
 *   Solo productos almacenables: un servicio o un consumible no lleva stock
 *   en Odoo y su "% vendido" sería siempre 100%.
 * - Intercompañía (`lib/intercompania`) se lee aparte para poder excluirla.
 */

const forzadas = new Map<string, number>();
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

async function agrupar(model: string, domain: any[], fields: string[], groupby: string[], context?: Record<string, any>): Promise<any[]> {
  const r = await callOdooRPC<any[]>(model, "read_group", [domain, fields, groupby], { lazy: false, ...(context ? { context } : {}) });
  if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}.read_group`);
  return r;
}

// ---------------------------------------------------------------------------
// Almacén
// ---------------------------------------------------------------------------

export interface AlmacenPrincipal {
  id: number;
  nombre: string;
  vista: number;
  /** Ubicaciones internas del almacén (Existencias, Entrada y sus hijas). */
  ubicaciones: number[];
  /** Ubicaciones de Entrada: su reservado es el traslado a Existencias, no un pedido. */
  entrada: Set<number>;
}

export function almacenPrincipal(companyId: number): Promise<AlmacenPrincipal> {
  return cachear(`sm|almacen|${companyId}`, async () => {
    const id = MAIN_WAREHOUSE_BY_COMPANY[companyId];
    if (!id) throw new Error(`Sede ${companyId} sin almacén principal`);
    const wh = await callOdooRPC<any[]>("stock.warehouse", "search_read", [[["id", "=", id]]], {
      fields: ["name", "view_location_id", "wh_input_stock_loc_id"], limit: 1,
    });
    if (!Array.isArray(wh) || !wh[0]?.view_location_id) throw new Error("Odoo no respondió el almacén principal");
    const vista = wh[0].view_location_id[0];
    const entrada = wh[0].wh_input_stock_loc_id ? wh[0].wh_input_stock_loc_id[0] : null;
    const [internas, deEntrada] = await Promise.all([
      callOdooRPC<number[]>("stock.location", "search", [[["id", "child_of", vista], ["usage", "=", "internal"]]]),
      entrada ? callOdooRPC<number[]>("stock.location", "search", [[["id", "child_of", entrada]]]) : Promise.resolve([] as number[]),
    ]);
    if (!Array.isArray(internas) || !Array.isArray(deEntrada)) throw new Error("Odoo no respondió las ubicaciones del almacén");
    return { id, nombre: String(wh[0].name || ""), vista, ubicaciones: internas, entrada: new Set(deEntrada) };
  }, 60 * 60 * 1000);
}

export interface QuantsHoy {
  fisico: Map<number, number>;
  reservado: Map<number, number>;
  /** Productos con cantidad negativa en Odoo (en el panel cuentan 0; la reconstrucción parte de este valor real). */
  negativos: Map<number, number>;
  leido: string;
}

/**
 * Stock de hoy desde los quants, con las reglas de `almacenSede` de Compras
 * (negativos = 0, sin el reservado de Entrada) pero con caché propia de 2 min
 * que "Actualizar desde Odoo" y la auditoría pueden saltar.
 */
export function quantsHoy(companyId: number, refrescar = false): Promise<QuantsHoy> {
  const base = `sm|quants|${companyId}`;
  if (refrescar) borrar(base);
  return cachear(llaveViva(base), async () => {
    const alm = await almacenPrincipal(companyId);
    const grupos = await agrupar("stock.quant", [["location_id", "in", alm.ubicaciones], ["company_id", "=", companyId]],
      ["quantity:sum", "reserved_quantity:sum"], ["product_id", "location_id"]);
    const crudo = new Map<number, { q: number; r: number }>();
    for (const g of grupos) {
      const id = g.product_id?.[0];
      if (!id) continue;
      const x = crudo.get(id) ?? { q: 0, r: 0 };
      x.q += Number(g.quantity) || 0;
      if (!alm.entrada.has(g.location_id?.[0])) x.r += Number(g.reserved_quantity) || 0;
      crudo.set(id, x);
    }
    const fisico = new Map<number, number>();
    const reservado = new Map<number, number>();
    const negativos = new Map<number, number>();
    for (const [id, x] of crudo) {
      const q = r4(x.q);
      if (q < 0) negativos.set(id, q);
      if (q > 0) {
        fisico.set(id, q);
        const r = Math.min(q, Math.max(0, r4(x.r)));
        if (r > 0) reservado.set(id, r);
      }
    }
    return { fisico, reservado, negativos, leido: new Date().toISOString() };
  }, 2 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export interface InfoProducto {
  id: number;
  codigo: string;
  nombre: string;
  /** Nombre de la marca tal cual está en Odoo ("" = sin marca). */
  marcaOdoo: string;
  /** Marca normalizada (la de Metas por marca). */
  clave: string;
  /** `product` almacenable, `consu` consumible, `service` servicio. */
  tipo: string;
  activo: boolean;
  categoria: string;
}

/** Ficha de productos por id, archivados incluidos. Caché de 10 min por id. */
const fichas = new Map<number, { vence: number; p: InfoProducto }>();

export async function infoProductos(ids: number[], refrescar = false): Promise<Map<number, InfoProducto>> {
  const ahora = Date.now();
  if (refrescar) fichas.clear();
  const mapa = new Map<number, InfoProducto>();
  const faltan: number[] = [];
  for (const id of new Set(ids)) {
    const x = fichas.get(id);
    if (x && x.vence > ahora) mapa.set(id, x.p);
    else faltan.push(id);
  }
  const lotes: number[][] = [];
  for (let i = 0; i < faltan.length; i += 1000) lotes.push(faltan.slice(i, i + 1000));
  const respuestas = await Promise.all(lotes.map((lote) =>
    callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", lote]]], {
      fields: ["id", "default_code", "name", "spiff_brand_id", "type", "active", "categ_id"],
      limit: 0, context: { active_test: false },
    }),
  ));
  for (const r of respuestas) {
    if (!Array.isArray(r)) throw new Error("Odoo no respondió product.product");
    for (const p of r) {
      const marcaOdoo = p.spiff_brand_id ? String(p.spiff_brand_id[1] || "").trim() : "";
      const ficha: InfoProducto = {
        id: p.id,
        codigo: String(p.default_code || "").trim(),
        // Hay nombres que empiezan con espacio (HAVIT, JEMIP, KAPA).
        nombre: String(p.name || "").trim(),
        marcaOdoo,
        clave: p.spiff_brand_id ? claveMarca(marcaOdoo) : SIN_MARCA,
        tipo: p.type,
        activo: p.active !== false,
        categoria: (p.categ_id && String(p.categ_id[1]).trim()) || "Sin categoría",
      };
      mapa.set(p.id, ficha);
      fichas.set(p.id, { vence: ahora + 10 * 60 * 1000, p: ficha });
    }
  }
  return mapa;
}

/** Ids de todos los productos almacenables (activos y archivados). */
export function idsAlmacenables(refrescar = false): Promise<number[]> {
  if (refrescar) borrar("sm|almacenables");
  return cachear(llaveViva("sm|almacenables"), async () => {
    const r = await callOdooRPC<number[]>("product.product", "search", [[["type", "=", "product"]]], { context: { active_test: false } });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió los productos almacenables");
    return r;
  }, 30 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export interface StockCorte {
  /** "quants" = hoy; "historico" = qty_available de Odoo a la fecha. */
  fuente: "quants" | "historico";
  corte: string;
  /** Unidades físicas por producto (negativos de Odoo tomados como 0). */
  fisico: Map<number, number>;
  /** Reservado para pedidos (solo hoy). */
  reservado: Map<number, number> | null;
  /** Productos con cantidad negativa en Odoo al corte (se tomaron como 0). */
  negativos: Map<number, number>;
}

/** Último instante (UTC, formato Odoo) de un día de Caracas. */
export const finDiaUtc = (dia: string) => `${sumarDias(dia, 1)} 03:59:59`;

async function stockHistorico(companyId: number, corte: string): Promise<StockCorte> {
  const [{ vista }, ids] = await Promise.all([almacenPrincipal(companyId), idsAlmacenables()]);
  const fisico = new Map<number, number>();
  const negativos = new Map<number, number>();
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 1000) lotes.push(ids.slice(i, i + 1000));
  const respuestas = await Promise.all(lotes.map((lote) =>
    callOdooRPC<any[]>("product.product", "read", [lote, ["qty_available"]], {
      context: { location: vista, to_date: finDiaUtc(corte), allowed_company_ids: [companyId], active_test: false },
    }),
  ));
  for (const r of respuestas) {
    if (!Array.isArray(r)) throw new Error("Odoo no respondió el stock histórico");
    for (const p of r) {
      const q = Number(p.qty_available) || 0;
      if (q < 0) negativos.set(p.id, r2(q));
      if (q > 0) fisico.set(p.id, r4(q));
    }
  }
  return { fuente: "historico", corte, fisico, reservado: null, negativos };
}

/** Stock del almacén principal al cierre de `corte` (hoy = quants). */
export function stockAlCorte(companyId: number, corte: string, refrescar = false): Promise<StockCorte> {
  const hoy = hoyCaracas();
  if (corte >= hoy) {
    // Los quants se fuerzan una sola vez, antes (datosSede): así la tabla, la
    // serie y la auditoría usan la misma foto de hoy.
    return quantsHoy(companyId).then((q) => ({
      fuente: "quants" as const, corte: hoy, fisico: q.fisico, reservado: q.reservado, negativos: q.negativos,
    }));
  }
  const base = `sm|stock|${companyId}|${corte}`;
  if (refrescar) borrar(base);
  return cachear(llaveViva(base), () => stockHistorico(companyId, corte), 15 * 60 * 1000);
}

// `cachear` de Compras no tiene "refrescar": se fuerza con una llave nueva.
function borrar(llave: string) { forzadas.set(llave, (forzadas.get(llave) ?? 0) + 1); }
function llaveViva(llave: string) { return `${llave}#${forzadas.get(llave) ?? 0}`; }

/**
 * Stock al cierre de cualquier día desde `desde`, reconstruido desde el de hoy
 * deshaciendo los movimientos posteriores (entradas − salidas del almacén;
 * los traslados internos no cambian el total). Lo usa la serie mensual y,
 * como verificación independiente del histórico de Odoo, la auditoría.
 */
export interface Reconstruccion {
  stockAlCierre(id: number, dia: string): number;
  /** Productos con movimientos desde `desde`. */
  conMovimiento: Set<number>;
  movimientos: number;
}

export function reconstruccion(companyId: number, desde: string, refrescar = false): Promise<Reconstruccion> {
  const base = `sm|recons|${companyId}|${desde}|${hoyCaracas()}`;
  if (refrescar) borrar(base);
  return cachear(llaveViva(base), async () => {
    const [alm, hoyQ] = await Promise.all([almacenPrincipal(companyId), quantsHoy(companyId)]);
    const W = alm.ubicaciones;
    const desdeUtc = inicioDiaUtc(desde);
    const campos = ["product_id", "quantity", "date"];
    const [entradas, salidas, almacenables] = await Promise.all([
      leerTodo("stock.move", [["state", "=", "done"], ["date", ">=", desdeUtc], ["location_dest_id", "in", W], ["location_id", "not in", W]], campos),
      leerTodo("stock.move", [["state", "=", "done"], ["date", ">=", desdeUtc], ["location_id", "in", W], ["location_dest_id", "not in", W]], campos),
      idsAlmacenables(),
    ]);
    const esAlmacenable = new Set(almacenables);
    const deltas = new Map<number, Map<string, number>>();
    const sumar = (id: number, dia: string, q: number) => {
      let d = deltas.get(id);
      if (!d) deltas.set(id, (d = new Map()));
      d.set(dia, (d.get(dia) ?? 0) + q);
    };
    for (const m of entradas) if (m.product_id && esAlmacenable.has(m.product_id[0])) sumar(m.product_id[0], diaCaracas(m.date), Number(m.quantity) || 0);
    for (const m of salidas) if (m.product_id && esAlmacenable.has(m.product_id[0])) sumar(m.product_id[0], diaCaracas(m.date), -(Number(m.quantity) || 0));
    const indice = new Map<number, { dias: string[]; posteriores: number[] }>();
    for (const [id, porDia] of deltas) {
      const dias = [...porDia.keys()].sort();
      const posteriores = new Array(dias.length + 1).fill(0);
      for (let i = dias.length - 1; i >= 0; i--) posteriores[i] = posteriores[i + 1] + (porDia.get(dias[i]) ?? 0);
      indice.set(id, { dias, posteriores });
    }
    const hoy = hoyCaracas();
    return {
      conMovimiento: new Set(deltas.keys()),
      movimientos: entradas.length + salidas.length,
      stockAlCierre(id: number, dia: string): number {
        // Se parte de la cantidad real de hoy, negativa incluida: si hoy está en
        // −2 y después del día salieron 7, ese día había 5 (no 7).
        const actual = hoyQ.fisico.get(id) ?? hoyQ.negativos.get(id) ?? 0;
        const x = indice.get(id);
        if (!x || dia >= hoy) return actual;
        let lo = 0;
        let hi = x.dias.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (x.dias[mid] > dia) hi = mid;
          else lo = mid + 1;
        }
        return Math.max(0, r4(actual - x.posteriores[lo]));
      },
    };
  }, 10 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export const TIPOS_VENTA = ["out_invoice", "out_receipt", "out_refund"];
const signo = (moveType: string) => (moveType === "out_refund" ? -1 : 1);

/** Líneas de producto de documentos de cliente publicados en [desde, hasta]. */
export const dominioVentas = (companyId: number, desde: string, hasta: string): any[] => [
  ["move_type", "in", TIPOS_VENTA],
  ["parent_state", "=", "posted"],
  ["display_type", "=", "product"],
  ["company_id", "=", companyId],
  ["product_id", "!=", false],
  ["invoice_date", ">=", desde],
  ["invoice_date", "<=", hasta],
];

export interface VentaProducto {
  /** Unidades netas (facturas − notas de crédito). */
  unidades: number;
  /** Venta neta sin IVA, en moneda de la empresa (−balance). */
  usd: number;
  /** Parte intercompañía de lo anterior. */
  unidadesIC: number;
  usdIC: number;
  lineas: number;
}

/** Venta por producto en [desde, hasta], con la parte intercompañía separada. */
export function ventasPorProducto(companyId: number, desde: string, hasta: string, refrescar = false): Promise<Map<number, VentaProducto>> {
  const base = `sm|ventas|${companyId}|${desde}|${hasta}`;
  if (refrescar) borrar(base);
  return cachear(llaveViva(base), async () => {
    const ic = [...(await partnersIntercompania()).keys()];
    const dom = dominioVentas(companyId, desde, hasta);
    const campos = ["quantity:sum", "balance:sum"];
    const [todo, soloIC] = await Promise.all([
      agrupar("account.move.line", dom, campos, ["product_id", "move_type"]),
      agrupar("account.move.line", [...dom, ["move_id.commercial_partner_id", "in", ic]], campos, ["product_id", "move_type"]),
    ]);
    const mapa = new Map<number, VentaProducto>();
    const fila = (id: number) => {
      let v = mapa.get(id);
      if (!v) mapa.set(id, (v = { unidades: 0, usd: 0, unidadesIC: 0, usdIC: 0, lineas: 0 }));
      return v;
    };
    for (const g of todo) {
      if (!g.product_id) continue;
      const v = fila(g.product_id[0]);
      v.unidades += signo(g.move_type) * (Number(g.quantity) || 0);
      v.usd += -(Number(g.balance) || 0);
      v.lineas += Number(g.__count) || 0;
    }
    for (const g of soloIC) {
      if (!g.product_id) continue;
      const v = fila(g.product_id[0]);
      v.unidadesIC += signo(g.move_type) * (Number(g.quantity) || 0);
      v.usdIC += -(Number(g.balance) || 0);
    }
    for (const v of mapa.values()) {
      v.unidades = r4(v.unidades); v.usd = r2(v.usd); v.unidadesIC = r4(v.unidadesIC); v.usdIC = r2(v.usdIC);
    }
    return mapa;
  }, 3 * 60 * 1000);
}

/** Unidades netas por producto y mes (YYYY-MM) en [desde, hasta], separando intercompañía. */
export function ventasMensuales(companyId: number, desde: string, hasta: string, refrescar = false): Promise<{ todo: Map<number, Map<string, number>>; ic: Map<number, Map<string, number>> }> {
  const base = `sm|mensual|${companyId}|${desde}|${hasta}`;
  if (refrescar) borrar(base);
  return cachear(llaveViva(base), async () => {
    const ic = [...(await partnersIntercompania()).keys()];
    const dom = dominioVentas(companyId, desde, hasta);
    const [todo, soloIC] = await Promise.all([
      agrupar("account.move.line", dom, ["quantity:sum"], ["product_id", "invoice_date:month", "move_type"]),
      agrupar("account.move.line", [...dom, ["move_id.commercial_partner_id", "in", ic]], ["quantity:sum"], ["product_id", "invoice_date:month", "move_type"]),
    ]);
    const leer = (grupos: any[]) => {
      const mapa = new Map<number, Map<string, number>>();
      for (const g of grupos) {
        const id = g.product_id?.[0];
        const mes = String(g.__range?.["invoice_date:month"]?.from || "").slice(0, 7);
        if (!id || !mes) continue;
        let m = mapa.get(id);
        if (!m) mapa.set(id, (m = new Map()));
        m.set(mes, (m.get(mes) ?? 0) + signo(g.move_type) * (Number(g.quantity) || 0));
      }
      return mapa;
    };
    return { todo: leer(todo), ic: leer(soloIC) };
  }, 10 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Costo y última venta
// ---------------------------------------------------------------------------

/**
 * Costo unitario: el de Compras (`standard_price` de la sede o, si está en 0,
 * el precio del proveedor); para los productos que no están en el catálogo
 * activo (archivados), su `standard_price`.
 */
export async function costoProductos(companyId: number, ids: number[]): Promise<Map<number, number>> {
  const base = await costos(companyId);
  const mapa = new Map<number, number>();
  const faltan: number[] = [];
  for (const id of ids) {
    if (base.has(id)) mapa.set(id, base.get(id)!);
    else faltan.push(id);
  }
  for (let i = 0; i < faltan.length; i += 2000) {
    const r = await callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", faltan.slice(i, i + 2000)]]], {
      fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [companyId], active_test: false },
    });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió el costo de los productos");
    for (const p of r) mapa.set(p.id, Number(p.standard_price) || 0);
  }
  return mapa;
}

/** Día de la última factura de cliente de cada producto en la sede hasta `hasta` (sin intercompañía). */
export function ultimaVentaHasta(companyId: number, hasta: string, refrescar = false): Promise<Map<number, string>> {
  const base = `sm|ultima|${companyId}|${hasta}`;
  if (refrescar) borrar(base);
  return cachear(llaveViva(base), async () => {
    const ic = [...(await partnersIntercompania()).keys()];
    const grupos = await agrupar("account.move.line", [
      ["move_type", "in", ["out_invoice", "out_receipt"]],
      ["parent_state", "=", "posted"],
      ["display_type", "=", "product"],
      ["company_id", "=", companyId],
      ["product_id", "!=", false],
      ["quantity", ">", 0],
      ["invoice_date", "<=", hasta],
      ["move_id.commercial_partner_id", "not in", ic],
    ], ["invoice_date:max"], ["product_id"]);
    const mapa = new Map<number, string>();
    for (const g of grupos) if (g.product_id && g.invoice_date) mapa.set(g.product_id[0], String(g.invoice_date).slice(0, 10));
    return mapa;
  }, 10 * 60 * 1000);
}
