import { query } from "@/lib/db";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { partnersIntercompania, sinIntercompania } from "@/lib/intercompania";
import { claveMarca, SIN_MARCA } from "@/lib/metas-marca/marcas";
import { callOdooRPC } from "@/lib/odoo";
import { SQL_SIN_INTERCOMPANIA, desdeOdoo, rangoSmartbit, ultimaVentaSmartbit } from "@/lib/smartbit";

/**
 * Lecturas de Odoo que comparten todas las pantallas de Compras (resumen,
 * Sugeridos, Menor/Mayor rotación, Cobertura, Rotación por categoría,
 * Tendencia y el Stoplight), para que un mismo dato salga igual en todas.
 *
 * Reglas, verificadas contra Odoo el 30-sep-2026:
 *
 * - Venta = líneas de producto (`display_type = 'product'`) de facturas,
 *   recibos y notas de crédito de cliente publicadas. Cada línea de un
 *   producto almacenable trae además dos líneas de costo (COGS) con el mismo
 *   producto y la misma cantidad: sin ese filtro las unidades salían al
 *   triple (Valencia y Caracas desde abr-2026, Panamá desde sep-2026).
 * - Las notas de crédito traen la cantidad en positivo: restan.
 * - Sin intercompañía (`lib/intercompania`, la misma detección del Stoplight
 *   y Metas por marca: nombre, RIF y contactos hijos) ni productos de tipo
 *   servicio (Saldo Inicial, fletes, servicio técnico).
 * - Antes del corte (`CORTE_ODOO`) la venta real está en Smartbit
 *   (`ventas_smartbit`): las ventanas que lo cruzan suman las dos fuentes.
 * - Stock = almacén principal de la sede entero, con la ubicación de Entrada
 *   de la recepción en dos pasos. En Panamá y Caracas Entrada no cuelga de
 *   Existencias y lo recibido sin ubicar (en Panamá ~5.000 unidades, $462k,
 *   el 30-sep) no salía ni como stock ni como tránsito. Lo reservado en
 *   Entrada es el traslado a Existencias, no un pedido: no cuenta.
 * - Tránsito = movimientos de recepción pendientes de órdenes de compra, no
 *   "pedido − recibido" de la línea: en Valencia había ~86.000 unidades de
 *   órdenes recibidas y devueltas al proveedor (P-00103, P-00031, P-00028)
 *   que seguían contando como por llegar.
 */

// ---------------------------------------------------------------------------
// Fechas: calendario de Caracas (UTC-4, sin horario de verano), como texto
// "YYYY-MM-DD" para no depender de la zona horaria del servidor.
// ---------------------------------------------------------------------------

const MS_DIA = 86_400_000;

export function hoyCaracas(): string {
  return new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
}

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Días de calendario de `desde` a `hasta` (0 si es el mismo día). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
}

/** Día en Caracas de un datetime de Odoo (Odoo los guarda en UTC). */
export function diaCaracas(datetimeUtc: string): string {
  const utc = Date.parse(String(datetimeUtc).replace(" ", "T") + "Z");
  return new Date(utc - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Primer instante (en UTC, formato de Odoo) de un día de Caracas. */
export function inicioDiaUtc(dia: string): string {
  return `${dia} 04:00:00`;
}

/** Día de un Date a medianoche local (las semanas del Stoplight, las fechas de MySQL). */
export function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Caché de promesas: las pantallas que llegan mientras la primera lectura
// sigue en vuelo la comparten, y si falla no se guarda el error.
// ---------------------------------------------------------------------------

const cache = new Map<string, { vence: number; valor: Promise<unknown> }>();

export function cachear<T>(llave: string, leer: () => Promise<T>, ms = 10 * 60 * 1000): Promise<T> {
  const ahora = Date.now();
  const x = cache.get(llave);
  if (x && x.vence > ahora) return x.valor as Promise<T>;
  // Las llaves llevan fechas: sin barrer, lo vencido de días anteriores
  // (historias de stock del Stoplight, ventas por día) quedaba en memoria.
  for (const [k, v] of cache) if (v.vence <= ahora) cache.delete(k);
  const valor = leer();
  const entrada = { vence: Date.now() + ms, valor };
  cache.set(llave, entrada);
  valor.catch(() => {
    if (cache.get(llave) === entrada) cache.delete(llave);
  });
  return valor;
}

/** search_read paginado: un limit fijo cortaba en silencio. */
export async function leerTodo(model: string, domain: any[], fields: string[], extra: Record<string, any> = {}): Promise<any[]> {
  const pagina = 5000;
  const todo: any[] = [];
  for (let offset = 0; ; offset += pagina) {
    const r = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields, limit: pagina, offset, order: "id asc", ...extra,
    });
    if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}`);
    todo.push(...r);
    if (r.length < pagina) return todo;
  }
}

async function agrupar(model: string, domain: any[], fields: string[], groupby: string[], context?: Record<string, any>): Promise<any[]> {
  const r = await callOdooRPC<any[]>(model, "read_group", [domain, fields, groupby], {
    lazy: false, ...(context ? { context } : {}),
  });
  if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}.read_group`);
  return r;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export interface ProductoCompras {
  id: number;
  /** default_code, o `PROD-<id>` si no tiene. */
  codigo: string;
  nombre: string;
  /** Marca de Odoo (`spiff_brand_id`, la de Metas por marca), normalizada. */
  marca: string;
  categoria: string;
  /** `product` (almacenable) o `consu` (consumible). */
  tipo: string;
  tmplId: number | null;
}

/** Mercancía activa (todo lo que no es servicio), por id. */
export function catalogo(): Promise<Map<number, ProductoCompras>> {
  return cachear("catalogo", async () => {
    const filas = await leerTodo(
      "product.product",
      [["active", "=", true], ["type", "!=", "service"]],
      ["id", "default_code", "name", "categ_id", "type", "spiff_brand_id", "product_tmpl_id"],
    );
    const mapa = new Map<number, ProductoCompras>();
    for (const p of filas) {
      const codigo = String(p.default_code || "").trim();
      mapa.set(p.id, {
        id: p.id,
        codigo: codigo || `PROD-${p.id}`,
        // Hay nombres que empiezan con espacio (HAVIT, JEMIP, KAPA).
        nombre: String(p.name || "").trim(),
        marca: p.spiff_brand_id ? claveMarca(p.spiff_brand_id[1]) : SIN_MARCA,
        categoria: (p.categ_id && String(p.categ_id[1]).trim()) || "Sin categoría",
        tipo: p.type,
        tmplId: p.product_tmpl_id ? p.product_tmpl_id[0] : null,
      });
    }
    return mapa;
  });
}

/** Solo los almacenables: los consumibles no llevan stock en Odoo (no tienen quants). */
export async function almacenables(): Promise<ProductoCompras[]> {
  return [...(await catalogo()).values()].filter((p) => p.tipo === "product");
}

const normalizarCodigo = (c: string) => String(c || "").trim().toUpperCase();

/** Código (mayúsculas, sin espacios a los lados) → id, para empatar con Smartbit. */
export async function idsPorCodigo(): Promise<Map<string, number>> {
  const cat = await catalogo();
  const mapa = new Map<string, number>();
  // Si dos productos comparten código queda el de id menor (el catálogo
  // viene ordenado por id), así lo de Smartbit no se cuenta dos veces.
  for (const p of cat.values()) {
    if (p.codigo.startsWith("PROD-")) continue;
    const c = normalizarCodigo(p.codigo);
    if (!mapa.has(c)) mapa.set(c, p.id);
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

const TIPOS_VENTA = ["out_invoice", "out_receipt"];

/** Líneas de producto vendidas a clientes en una sede (sin fechas). */
export async function dominioVentas(companyId: number, conNotasCredito = true): Promise<any[]> {
  return [
    ["move_type", "in", conNotasCredito ? [...TIPOS_VENTA, "out_refund"] : TIPOS_VENTA],
    ["parent_state", "=", "posted"],
    ["display_type", "=", "product"],
    ["company_id", "=", companyId],
    ["product_id", "!=", false],
    ["product_id.type", "!=", "service"],
    await sinIntercompania("move_id.commercial_partner_id"),
  ];
}

export const signoDocumento = (moveType: string) => (moveType === "out_refund" ? -1 : 1);

/** Unidades netas por producto en Odoo, por fecha de factura, solo desde el corte. */
async function unidadesOdoo(companyId: number, desde: string, hasta: string): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  const ini = desdeOdoo(desde);
  if (ini > hasta) return mapa;
  const grupos = await agrupar(
    "account.move.line",
    [...(await dominioVentas(companyId)), ["invoice_date", ">=", ini], ["invoice_date", "<=", hasta]],
    ["quantity:sum"],
    ["product_id", "move_type"],
  );
  for (const g of grupos) {
    const id = g.product_id?.[0];
    if (!id) continue;
    mapa.set(id, (mapa.get(id) ?? 0) + signoDocumento(g.move_type) * (Number(g.quantity) || 0));
  }
  return mapa;
}

/** Filas de `ventas_smartbit` del tramo previo al corte; [] si no hay tabla o MySQL no responde. */
export async function leerSmartbit(sql: string, params: any[]): Promise<any[]> {
  try {
    return (await query(sql, params)).rows as any[];
  } catch (e: any) {
    console.error("[compras] no se pudo leer ventas_smartbit:", e?.message);
    return [];
  }
}

/** Unidades netas por código en Smartbit dentro de [desde, hasta] (solo antes del corte). */
async function unidadesSmartbit(companyId: number, desde: string, hasta: string): Promise<Map<string, number>> {
  const rango = rangoSmartbit(desde, hasta);
  if (!rango) return new Map();
  const filas = await leerSmartbit(
    `SELECT UPPER(TRIM(codigo_articulo)) AS codigo, SUM(unidades) AS unidades
       FROM ventas_smartbit
      WHERE company_id = ? AND fecha BETWEEN ? AND ? AND codigo_articulo IS NOT NULL
        AND ${SQL_SIN_INTERCOMPANIA}
      GROUP BY UPPER(TRIM(codigo_articulo))`,
    [companyId, rango[0], rango[1]],
  );
  return new Map(filas.map((f) => [String(f.codigo), Number(f.unidades) || 0]));
}

/**
 * Unidades netas vendidas por producto en [desde, hasta]: Odoo desde el
 * corte y Smartbit antes, empatado por código. Lo de Smartbit que no tiene
 * un producto activo en Odoo queda fuera (no hay dónde mostrarlo).
 * El mapa devuelto es compartido: no modificarlo.
 */
export function unidadesVendidas(companyId: number, desde: string, hasta: string): Promise<Map<number, number>> {
  return cachear(`ventas|${companyId}|${desde}|${hasta}`, async () => {
    const [odoo, smartbit, codigos] = await Promise.all([
      unidadesOdoo(companyId, desde, hasta),
      unidadesSmartbit(companyId, desde, hasta),
      idsPorCodigo(),
    ]);
    for (const [codigo, unidades] of smartbit) {
      const id = codigos.get(codigo);
      if (id) odoo.set(id, (odoo.get(id) ?? 0) + unidades);
    }
    return odoo;
  });
}

/**
 * Día de la última venta de cada producto en la sede: la factura o recibo de
 * cliente más reciente que lo trae, en Odoo o en Smartbit. Una nota de
 * crédito es una devolución, no una venta: no cuenta. El mapa es compartido.
 */
export function ultimaVenta(companyId: number): Promise<Map<number, string>> {
  return cachear(`ultima|${companyId}|${hoyCaracas()}`, async () => {
    const [grupos, smartbit, codigos] = await Promise.all([
      (async () =>
        agrupar(
          "account.move.line",
          [...(await dominioVentas(companyId, false)), ["quantity", ">", 0]],
          ["invoice_date:max"],
          ["product_id"],
        ))(),
      ultimaVentaSmartbit([companyId]),
      idsPorCodigo(),
    ]);
    const mapa = new Map<number, string>();
    for (const g of grupos) {
      const id = g.product_id?.[0];
      if (id && g.invoice_date) mapa.set(id, String(g.invoice_date).slice(0, 10));
    }
    for (const [codigo, fecha] of smartbit) {
      const id = codigos.get(codigo);
      if (!id || !(fecha instanceof Date) || Number.isNaN(fecha.getTime())) continue;
      const dia = diaLocal(fecha);
      const odoo = mapa.get(id);
      if (!odoo || dia > odoo) mapa.set(id, dia);
    }
    return mapa;
  });
}

/**
 * Día de la última venta intercompañía de cada producto en la sede (factura a
 * otra empresa del grupo, en Odoo o en Smartbit). No es venta a un cliente,
 * pero dice que el producto salió del almacén: en Valencia hay productos que
 * nunca se le vendieron a un cliente y solo se le facturaron a Caracas.
 */
export function ultimaSalidaIntercompania(companyId: number): Promise<Map<number, string>> {
  return cachear(`ultima-ic|${companyId}|${hoyCaracas()}`, async () => {
    const [ic, codigos] = await Promise.all([partnersIntercompania(), idsPorCodigo()]);
    const [grupos, smartbit] = await Promise.all([
      agrupar(
        "account.move.line",
        [
          ["move_type", "in", TIPOS_VENTA],
          ["parent_state", "=", "posted"],
          ["display_type", "=", "product"],
          ["company_id", "=", companyId],
          ["product_id", "!=", false],
          ["quantity", ">", 0],
          ["move_id.commercial_partner_id", "in", [...ic.keys()]],
        ],
        ["invoice_date:max"],
        ["product_id"],
      ),
      leerSmartbit(
        `SELECT UPPER(TRIM(codigo_articulo)) AS codigo, DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS ultima
           FROM ventas_smartbit
          WHERE company_id = ? AND venta > 0 AND codigo_articulo IS NOT NULL
            AND NOT (${SQL_SIN_INTERCOMPANIA})
          GROUP BY UPPER(TRIM(codigo_articulo))`,
        [companyId],
      ),
    ]);
    const mapa = new Map<number, string>();
    for (const g of grupos) if (g.product_id && g.invoice_date) mapa.set(g.product_id[0], String(g.invoice_date).slice(0, 10));
    for (const f of smartbit) {
      const id = codigos.get(String(f.codigo || ""));
      const dia = String(f.ultima || "");
      if (id && dia && (!mapa.has(id) || dia > mapa.get(id)!)) mapa.set(id, dia);
    }
    return mapa;
  });
}

// ---------------------------------------------------------------------------
// Stock y tránsito del almacén principal
// ---------------------------------------------------------------------------

export interface StockProducto {
  /** Unidades en el almacén (Existencias + Entrada). */
  fisico: number;
  /** Reservado para pedidos (no cuenta la reserva del traslado Entrada → Existencias). */
  reservado: number;
  /**
   * Día (Caracas) en que entró la unidad más vieja que queda: `in_date` de
   * los quants, que Odoo conserva en los traslados internos. null = sin stock.
   */
  enStockDesde: string | null;
}

export interface AlmacenSede {
  nombre: string;
  /** Todas las ubicaciones internas del almacén principal. */
  ubicaciones: number[];
  stock: Map<number, StockProducto>;
}

export const disponible = (s?: StockProducto) => (s ? Math.max(0, s.fisico - s.reservado) : 0);

async function ubicacionesAlmacen(companyId: number) {
  const whId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
  if (!whId) throw new Error(`Sede ${companyId} sin almacén principal`);
  const wh = await callOdooRPC<any[]>("stock.warehouse", "search_read", [[["id", "=", whId]]], {
    fields: ["name", "view_location_id", "wh_input_stock_loc_id"],
    limit: 1,
  });
  if (!Array.isArray(wh) || !wh[0]?.view_location_id) throw new Error("Odoo no respondió el almacén principal");
  const vista = wh[0].view_location_id[0];
  const entrada = wh[0].wh_input_stock_loc_id ? wh[0].wh_input_stock_loc_id[0] : null;
  const [internas, deEntrada] = await Promise.all([
    callOdooRPC<number[]>("stock.location", "search", [[["id", "child_of", vista], ["usage", "=", "internal"]]]),
    entrada ? callOdooRPC<number[]>("stock.location", "search", [[["id", "child_of", entrada]]]) : Promise.resolve([]),
  ]);
  if (!Array.isArray(internas) || !Array.isArray(deEntrada)) throw new Error("Odoo no respondió las ubicaciones del almacén");
  return { nombre: String(wh[0].name || ""), vista, internas, deEntrada: new Set(deEntrada) };
}

export function almacenSede(companyId: number): Promise<AlmacenSede> {
  return cachear(
    `almacen|${companyId}`,
    async () => {
      const ubic = await ubicacionesAlmacen(companyId);
      const dominio = [["location_id", "in", ubic.internas], ["company_id", "=", companyId]];
      const [quants, entradas] = await Promise.all([
        agrupar("stock.quant", dominio, ["quantity:sum", "reserved_quantity:sum"], ["product_id", "location_id"]),
        agrupar("stock.quant", [...dominio, ["quantity", ">", 0]], ["in_date:min"], ["product_id"]),
      ]);
      const desde = new Map<number, string>();
      for (const q of entradas) if (q.product_id && q.in_date) desde.set(q.product_id[0], diaCaracas(q.in_date));
      const stock = new Map<number, StockProducto>();
      for (const q of quants) {
        const id = q.product_id?.[0];
        if (!id) continue;
        const s = stock.get(id) ?? { fisico: 0, reservado: 0, enStockDesde: desde.get(id) ?? null };
        s.fisico += Number(q.quantity) || 0;
        if (!ubic.deEntrada.has(q.location_id?.[0])) s.reservado += Number(q.reserved_quantity) || 0;
        stock.set(id, s);
      }
      // Una cantidad negativa es un error de inventario en Odoo: se toma como 0.
      for (const s of stock.values()) {
        s.fisico = Math.max(0, r2(s.fisico));
        s.reservado = Math.min(s.fisico, Math.max(0, r2(s.reservado)));
      }
      return { nombre: ubic.nombre, ubicaciones: ubic.internas, stock };
    },
    5 * 60 * 1000,
  );
}

/**
 * Unidades por llegar al almacén principal: recepciones de órdenes de compra
 * todavía no validadas (desde proveedor o tránsito hacia el almacén).
 */
export function transito(companyId: number): Promise<Map<number, number>> {
  return cachear(
    `transito|${companyId}`,
    async () => {
      const { ubicaciones } = await almacenSede(companyId);
      const grupos = await agrupar(
        "stock.move",
        [
          ["purchase_line_id", "!=", false],
          ["state", "not in", ["draft", "done", "cancel"]],
          ["location_dest_id", "in", ubicaciones],
          ["location_id", "not in", ubicaciones],
        ],
        ["product_uom_qty:sum"],
        ["product_id"],
      );
      const mapa = new Map<number, number>();
      for (const g of grupos) {
        const id = g.product_id?.[0];
        const q = Number(g.product_uom_qty) || 0;
        if (id && q > 0) mapa.set(id, q);
      }
      return mapa;
    },
    5 * 60 * 1000,
  );
}

// ---------------------------------------------------------------------------
// Costo
// ---------------------------------------------------------------------------

/** `standard_price` de cada producto del catálogo en la sede (0 = sin costo en Odoo). */
export function costoOdoo(companyId: number): Promise<Map<number, number>> {
  return cachear(`standard|${companyId}`, async () => {
    const ids = [...(await catalogo()).keys()];
    const costo = new Map<number, number>();
    for (let i = 0; i < ids.length; i += 2000) {
      const r = await callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", ids.slice(i, i + 2000)]]], {
        fields: ["id", "standard_price"],
        limit: 0,
        context: { allowed_company_ids: [companyId] },
      });
      if (!Array.isArray(r)) throw new Error("Odoo no respondió el costo de los productos");
      for (const p of r) costo.set(p.id, Number(p.standard_price) || 0);
    }
    return costo;
  });
}

/**
 * Costo unitario de cada producto del catálogo en la sede: `standard_price`
 * (es un campo por empresa, se lee con la empresa en el contexto); si está en
 * 0, el precio del proveedor de esa sede en la moneda de la empresa. 0 = sin
 * costo en Odoo. El mapa es compartido.
 */
export function costos(companyId: number): Promise<Map<number, number>> {
  return cachear(`costos|${companyId}`, async () => {
    const [cat, empresa, standard] = await Promise.all([
      catalogo(),
      callOdooRPC<any[]>("res.company", "read", [[companyId], ["currency_id"]]),
      costoOdoo(companyId),
    ]);
    const ids = [...cat.keys()];
    const costo = new Map(standard);

    const moneda = Array.isArray(empresa) && empresa[0]?.currency_id ? empresa[0].currency_id[0] : null;
    const sinCosto = ids.filter((id) => !(costo.get(id)! > 0));
    const tmpls = [...new Set(sinCosto.map((id) => cat.get(id)!.tmplId).filter(Boolean))] as number[];
    if (tmpls.length > 0 && moneda) {
      const prov = await leerTodo(
        "product.supplierinfo",
        [["product_tmpl_id", "in", tmpls], ["company_id", "in", [companyId, false]], ["currency_id", "=", moneda], ["price", ">", 0]],
        ["product_tmpl_id", "product_id", "price", "sequence"],
      );
      prov.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || b.id - a.id);
      const porTmpl = new Map<number, number>();
      const porVariante = new Map<number, number>();
      for (const s of prov) {
        const precio = Number(s.price) || 0;
        if (s.product_id && !porVariante.has(s.product_id[0])) porVariante.set(s.product_id[0], precio);
        if (!s.product_id && !porTmpl.has(s.product_tmpl_id[0])) porTmpl.set(s.product_tmpl_id[0], precio);
      }
      for (const id of sinCosto) {
        const p = porVariante.get(id) ?? porTmpl.get(cat.get(id)!.tmplId ?? 0);
        if (p) costo.set(id, p);
      }
    }
    return costo;
  });
}
