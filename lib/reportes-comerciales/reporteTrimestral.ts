/**
 * Logica de datos del Reporte de Ventas Trimestral (Panama, por marca).
 *
 * Reemplaza el armado manual del Excel: en vez de exportar lineas de factura de
 * Odoo y refrescar tablas dinamicas, se consulta Odoo en vivo y se agregan aca.
 *
 * Fuente: `account.move.line` de facturas de cliente (`out_invoice`) menos notas
 * de credito (`out_refund`), estado `posted`, compania Panama (`company_id = 7`),
 * `invoice_date` dentro del trimestre calendario. La marca sale de
 * `product.(product|template).x_studio_marca` (patron de
 * app/api/adminleads/product-stats/route.ts).
 *
 * NOTA sobre el archivo de muestra: en el .xlsx original el "Total general" de
 * los pivots (1.13M) no cuadraba con la hoja de datos crudos (670k) porque el
 * pivotCache venia de un extracto viejo. Al salir todo de la misma consulta eso
 * deja de pasar.
 */

import { callOdooRPC } from "@/lib/odoo";
import {
  formatTrimestre,
  limitesTrimestre,
  parseTrimestre,
  trimestreAnterior,
  type Trimestre,
} from "@/lib/reportes-comerciales/trimestres";

/** Panama. Ver CLAUDE.md: 9=Valencia, 10=Caracas, 7=Panama. */
export const COMPANY_ID_PANAMA = 7;

/** Valor especial del selector de marca: no filtra. */
export const MARCA_TODAS = "TODAS";

/**
 * Marcas del catalogo de Panama para poblar el selector. Es una lista curada
 * (no una consulta) para no pagar un read_group de productos en cada carga; la
 * marca se puede escribir libre igual, el filtro usa `ilike`.
 */
export const MARCAS_CONOCIDAS = [
  "EZVIZ",
  "CANON",
  "HP",
  "EPSON",
  "KINGSTON",
  "TP-LINK",
  "LOGITECH",
  "BROTHER",
  "PATRIOT",
  "SMARTBITT",
  "TOSHIBA",
  "ASUS",
];

export interface OpcionesReporte {
  trimestre: string; // "2026-Q3"
  marca: string; // "EZVIZ" | "TODAS" | ...
}

export interface FilaRanking {
  nombre: string;
  venta: number;
  unidades: number;
  partnerId?: number | null;
}

export interface Totales {
  venta: number;
  unidades: number;
  facturas: number;
  clientes: number;
}

export interface ReporteTrimestral {
  periodo: {
    trimestre: string;
    desde: string;
    hasta: string;
    marca: string;
    marcasDisponibles: string[];
  };
  totales: Totales;
  comparativo: {
    trimestre: string;
    venta: number;
    unidades: number;
    variacionVentaPct: number | null;
  };
  rankingClientes: FilaRanking[];
  rankingProductos: FilaRanking[];
  porDepartamento: FilaRanking[];
  porVendedor: FilaRanking[];
  porMarca: FilaRanking[]; // solo cuando marca === TODAS; si no, []
}

export interface FilaDetalle {
  fecha: string;
  numero: string;
  cliente: string;
  producto: string;
  vendedor: string;
  departamento: string;
  unidades: number;
  venta: number;
}

interface LineaEnriquecida {
  fecha: string;
  numero: string;
  clienteNombre: string;
  clienteId: number | null;
  productoNombre: string;
  productoId: number | null;
  vendedor: string;
  departamento: string;
  unidades: number;
  venta: number;
}

const DEPARTAMENTO_SIN_ASIGNAR = "No Asignado";

export function normalizarNombre(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** search_read paginado (Odoo no devuelve mas de unos miles por llamada). */
async function searchReadPaginado(
  model: string,
  domain: any[],
  fields: string[],
  pageSize = 2000,
): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  // Tope de seguridad: 60k lineas / trimestre es holgado para una sola sede.
  for (let i = 0; i < 40; i++) {
    const page =
      (await callOdooRPC<any[]>(model, "search_read", [domain], {
        fields,
        limit: pageSize,
        offset,
        order: "id asc",
      })) || [];
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function readEnLotes(
  model: string,
  ids: number[],
  fields: string[],
  lote = 200,
): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  for (let i = 0; i < ids.length; i += lote) {
    const batch = ids.slice(i, i + lote);
    const recs = (await callOdooRPC<any[]>(model, "read", [batch], { fields })) || [];
    for (const r of recs) map.set(r.id, r);
  }
  return map;
}

/** IDs de producto de la marca dada. `null` si la marca es TODAS (sin filtro). */
async function idsProductoDeMarca(marca: string): Promise<number[] | null> {
  if (!marca || marca.toUpperCase() === MARCA_TODAS) return null;
  const prods =
    (await callOdooRPC<any[]>("product.product", "search_read", [
      [["x_studio_marca", "ilike", marca]],
    ], { fields: ["id"], limit: 0 })) || [];
  return prods.map((p: any) => p.id);
}

function dominioLineas(
  desde: string,
  hasta: string,
  idsProducto: number[] | null,
): any[] {
  const dom: any[] = [
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.state", "=", "posted"],
    ["move_id.company_id", "=", COMPANY_ID_PANAMA],
    ["move_id.invoice_date", ">=", desde],
    ["move_id.invoice_date", "<=", hasta],
    ["display_type", "=", "product"],
    ["product_id", "!=", false],
  ];
  if (idsProducto) dom.push(["product_id", "in", idsProducto]);
  return dom;
}

async function cargarLineas(
  desde: string,
  hasta: string,
  marca: string,
): Promise<{ lineas: LineaEnriquecida[]; sinProductosDeMarca: boolean }> {
  const idsProducto = await idsProductoDeMarca(marca);
  if (idsProducto && idsProducto.length === 0) {
    return { lineas: [], sinProductosDeMarca: true };
  }

  const crudas = await searchReadPaginado(
    "account.move.line",
    dominioLineas(desde, hasta, idsProducto),
    ["move_id", "partner_id", "product_id", "quantity", "price_subtotal"],
  );
  if (crudas.length === 0) return { lineas: [], sinProductosDeMarca: false };

  const moveIds = [
    ...new Set(crudas.map((l: any) => l.move_id?.[0]).filter(Boolean)),
  ] as number[];
  const partnerIds = [
    ...new Set(crudas.map((l: any) => l.partner_id?.[0]).filter(Boolean)),
  ] as number[];

  const moves = await readEnLotes("account.move", moveIds, [
    "invoice_user_id",
    "move_type",
    "name",
    "invoice_date",
  ]);
  const partners = await readEnLotes("res.partner", partnerIds, ["state_id"]);

  return {
    sinProductosDeMarca: false,
    lineas: crudas.map((l: any): LineaEnriquecida => {
      const mv = moves.get(l.move_id?.[0]) || {};
      const esNota = mv.move_type === "out_refund";
      const signo = esNota ? -1 : 1;
      const pt = partners.get(l.partner_id?.[0]) || {};
      const depto = Array.isArray(pt.state_id) ? String(pt.state_id[1]) : "";
      return {
        fecha: mv.invoice_date || "",
        numero: mv.name || "",
        clienteNombre: l.partner_id?.[1] || "(sin cliente)",
        clienteId: l.partner_id?.[0] || null,
        productoNombre: l.product_id?.[1] || "(sin producto)",
        productoId: l.product_id?.[0] || null,
        vendedor: mv.invoice_user_id?.[1] || "(sin vendedor)",
        departamento: depto || DEPARTAMENTO_SIN_ASIGNAR,
        unidades: signo * (Number(l.quantity) || 0),
        venta: signo * (Number(l.price_subtotal) || 0),
      };
    }),
  };
}

function ranking(
  lineas: LineaEnriquecida[],
  clave: (l: LineaEnriquecida) => string,
  extra?: (l: LineaEnriquecida) => Partial<FilaRanking>,
): FilaRanking[] {
  const map = new Map<string, FilaRanking>();
  for (const l of lineas) {
    const k = clave(l);
    const acc =
      map.get(k) || { nombre: k, venta: 0, unidades: 0, ...(extra ? extra(l) : {}) };
    acc.venta += l.venta;
    acc.unidades += l.unidades;
    map.set(k, acc);
  }
  return [...map.values()].map((f) => ({
    ...f,
    venta: redondear(f.venta),
    unidades: redondear(f.unidades),
  }));
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function marcasDeProductos(
  lineas: LineaEnriquecida[],
): Promise<Map<number, string>> {
  const ids = [
    ...new Set(lineas.map((l) => l.productoId).filter(Boolean)),
  ] as number[];
  const prods = await readEnLotes("product.product", ids, ["x_studio_marca"]);
  const map = new Map<number, string>();
  for (const [id, p] of prods) {
    const m = Array.isArray(p.x_studio_marca)
      ? p.x_studio_marca[1]
      : p.x_studio_marca || "Sin marca";
    map.set(id, String(m).toUpperCase());
  }
  return map;
}

function totalesDe(lineas: LineaEnriquecida[]): Totales {
  return {
    venta: redondear(lineas.reduce((s, l) => s + l.venta, 0)),
    unidades: redondear(lineas.reduce((s, l) => s + l.unidades, 0)),
    facturas: new Set(lineas.map((l) => l.numero).filter(Boolean)).size,
    clientes: new Set(lineas.map((l) => l.clienteId).filter(Boolean)).size,
  };
}

/** Carga las lineas del trimestre pedido y del anterior en una sola pasada. */
async function cargarActualYPrev(
  opts: OpcionesReporte,
): Promise<{
  t: Trimestre;
  marca: string;
  lineas: LineaEnriquecida[];
  lineasPrev: LineaEnriquecida[];
}> {
  const t = parseTrimestre(opts.trimestre);
  const marca = (opts.marca || "EZVIZ").trim();
  const { desde, hasta } = limitesTrimestre(t);
  const rangoPrev = limitesTrimestre(trimestreAnterior(t));

  const [act, prev] = await Promise.all([
    cargarLineas(desde, hasta, marca),
    cargarLineas(rangoPrev.desde, rangoPrev.hasta, marca),
  ]);
  return { t, marca, lineas: act.lineas, lineasPrev: prev.lineas };
}

async function armarReporte(
  t: Trimestre,
  marca: string,
  lineas: LineaEnriquecida[],
  lineasPrev: LineaEnriquecida[],
): Promise<ReporteTrimestral> {
  const tPrev = trimestreAnterior(t);
  const { desde, hasta } = limitesTrimestre(t);

  const totales = totalesDe(lineas);
  const totPrev = totalesDe(lineasPrev);

  const esTodas = marca.toUpperCase() === MARCA_TODAS;
  let porMarca: FilaRanking[] = [];
  if (esTodas && lineas.length > 0) {
    const marcaPorId = await marcasDeProductos(lineas);
    porMarca = ordenarPorVenta(
      ranking(lineas, (l) =>
        l.productoId ? marcaPorId.get(l.productoId) || "Sin marca" : "Sin marca",
      ),
    );
  }

  return {
    periodo: {
      trimestre: formatTrimestre(t),
      desde,
      hasta,
      marca: esTodas ? MARCA_TODAS : marca.toUpperCase(),
      marcasDisponibles: [MARCA_TODAS, ...MARCAS_CONOCIDAS],
    },
    totales,
    comparativo: {
      trimestre: formatTrimestre(tPrev),
      venta: totPrev.venta,
      unidades: totPrev.unidades,
      variacionVentaPct:
        totPrev.venta > 0
          ? redondear(((totales.venta - totPrev.venta) / totPrev.venta) * 100)
          : null,
    },
    rankingClientes: ordenarPorVenta(
      ranking(
        lineas,
        (l) => l.clienteNombre,
        (l) => ({ partnerId: l.clienteId }),
      ),
    ),
    rankingProductos: ordenarPorUnidades(ranking(lineas, (l) => l.productoNombre)),
    porDepartamento: ordenarPorVenta(ranking(lineas, (l) => l.departamento)),
    porVendedor: ordenarPorVenta(ranking(lineas, (l) => l.vendedor)),
    porMarca,
  };
}

/** Reporte completo para la vista (agregados + comparativo con el trimestre anterior). */
export async function construirReporte(
  opts: OpcionesReporte,
): Promise<ReporteTrimestral> {
  const { t, marca, lineas, lineasPrev } = await cargarActualYPrev(opts);
  return armarReporte(t, marca, lineas, lineasPrev);
}

/** Como construirReporte pero incluye el detalle linea a linea (para el Excel). */
export async function construirReporteCompleto(
  opts: OpcionesReporte,
): Promise<{ reporte: ReporteTrimestral; detalle: FilaDetalle[] }> {
  const { t, marca, lineas, lineasPrev } = await cargarActualYPrev(opts);
  const reporte = await armarReporte(t, marca, lineas, lineasPrev);

  const detalle: FilaDetalle[] = lineas
    .map((l) => ({
      fecha: l.fecha,
      numero: l.numero,
      cliente: l.clienteNombre,
      producto: l.productoNombre,
      vendedor: l.vendedor,
      departamento: l.departamento,
      unidades: redondear(l.unidades),
      venta: redondear(l.venta),
    }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.numero.localeCompare(b.numero)));

  return { reporte, detalle };
}

function ordenarPorVenta(filas: FilaRanking[]): FilaRanking[] {
  return [...filas].sort((a, b) => b.venta - a.venta);
}
function ordenarPorUnidades(filas: FilaRanking[]): FilaRanking[] {
  return [...filas].sort((a, b) => b.unidades - a.unidades);
}

/**
 * Cruza el ranking de clientes con las cuentas EPP (metas anuales) y calcula
 * meta trimestral, real y cumplimiento.
 */
export interface CuentaEppCalculada {
  id: number;
  clienteNombre: string;
  odooPartnerId: number | null;
  metaAnual: number;
  metaTrimestre: number;
  realTrimestre: number;
  cumplimiento: number; // 0..1+
}

export function calcularEpp(
  rankingClientes: FilaRanking[],
  filasEpp: Array<{
    id: number;
    cliente_nombre: string;
    odoo_partner_id: number | null;
    meta_anual: number | string;
  }>,
): CuentaEppCalculada[] {
  const porId = new Map<number, number>();
  const porNombre = new Map<string, number>();
  for (const f of rankingClientes) {
    if (f.partnerId) porId.set(f.partnerId, f.venta);
    porNombre.set(normalizarNombre(f.nombre), f.venta);
  }

  return filasEpp.map((f) => {
    const metaAnual = Number(f.meta_anual) || 0;
    const metaTrimestre = redondear(metaAnual / 4);
    const real =
      (f.odoo_partner_id != null ? porId.get(f.odoo_partner_id) : undefined) ??
      porNombre.get(normalizarNombre(f.cliente_nombre)) ??
      0;
    return {
      id: f.id,
      clienteNombre: f.cliente_nombre,
      odooPartnerId: f.odoo_partner_id ?? null,
      metaAnual,
      metaTrimestre,
      realTrimestre: redondear(real),
      cumplimiento: metaTrimestre > 0 ? redondear(real / metaTrimestre) : 0,
    };
  });
}
