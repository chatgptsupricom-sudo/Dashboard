/**
 * Reporte de Ventas del Gerente de Ventas (equivalente a la vista de Smartbitt).
 *
 * Dos salidas:
 *  1. Desglose de facturación agregado por Vendedor / Cliente / Marca / Producto
 *     con Cantidad, Precio de Venta (promedio) y Total ($) — todo NETO, sin IVA.
 *  2. Clientes inactivos: la cartera asignada a cada vendedor (res.partner.user_id
 *     en Odoo) que no registra compras en los últimos 3 o 6 meses.
 *
 * Fuente: `account.move.line` de facturas de cliente (`out_invoice`) menos notas
 * de crédito (`out_refund`), estado `posted`, de las compañías en alcance
 * (7 Panamá · 9 Valencia · 10 Caracas), `invoice_date` dentro del rango pedido.
 * La marca sale de `product.(product).x_studio_marca` (mismo patrón que el
 * reporte trimestral).
 *
 * Solo lectura sobre Odoo: ninguna de estas funciones escribe.
 */

import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { marcasDeSede } from "@/lib/reportes-comerciales/reporteTrimestral";

export const COMPANY_NAME: Record<number, string> = {
  9: "Valencia",
  10: "Caracas",
  7: "Panamá",
};
/** Todas las sedes (para superadmin). */
export const COMPANY_IDS_ALL = [9, 10, 7];

/** Valor del selector de marca que no filtra. */
export const MARCA_TODAS = "TODAS";

/** Clientes internos / inter-compañía que nunca entran al reporte. */
const CLIENTES_EXCLUIDOS_SUBSTR = ["supricom", "office solution"];

function clienteExcluido(nombre: string): boolean {
  const n = (nombre || "").toLowerCase();
  return CLIENTES_EXCLUIDOS_SUBSTR.some((s) => n.includes(s));
}

export function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Quita el sufijo " (v)" / " (V)" de los nombres de vendedor. */
function limpiarVendedor(s: string): string {
  return (s || "").replace(/\s*\((?:v|V)\)\s*$/i, "").trim();
}

/** "[CS-H6C-...] EZVIZ H6C PRO 2K" -> "EZVIZ H6C PRO 2K". */
function limpiarProducto(s: string): string {
  return (s || "").replace(/^\s*\[[^\]]*\]\s*/, "").trim();
}

/** search_read paginado (Odoo no devuelve más de unos miles por llamada). */
async function searchReadPaginado(
  model: string,
  domain: any[],
  fields: string[],
  pageSize = 2000,
): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  // Tope de seguridad: 80k líneas. El rango está limitado a 12 meses en la ruta.
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
    const recs =
      (await callOdooRPC<any[]>(model, "read", [batch], { fields })) || [];
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

/* ─────────────────────────── Vendedores de la sede ─────────────────────────── */

export interface VendedorOpt {
  userId: number;
  nombre: string;
}

/** Vendedores (tabla `sellers`) de las compañías en alcance, con su user_id de Odoo. */
export async function vendedoresDeSede(
  companyIds: number[],
): Promise<VendedorOpt[]> {
  if (companyIds.length === 0) return [];
  const ph = companyIds.map(() => "?").join(",");
  const { rows } = await query(
    `SELECT DISTINCT user_id, name FROM sellers
      WHERE cids IN (${ph}) AND user_id IS NOT NULL
      ORDER BY name`,
    companyIds,
  );
  return (rows as any[])
    .map((r) => ({ userId: Number(r.user_id), nombre: String(r.name || "").trim() }))
    .filter((v) => v.userId && v.nombre);
}

/* ─────────────────────────── Opciones de filtros ─────────────────────────── */

export interface OpcionesFiltros {
  vendedores: VendedorOpt[];
  clientes: { id: number; nombre: string; vendedorUserId: number | null }[];
  marcas: string[];
}

/**
 * Puebla los tres selectores. Los clientes salen de la cartera asignada en Odoo
 * (`res.partner.user_id` = alguno de los vendedores de la sede); el front filtra
 * en vivo por vendedor sin volver a pedir.
 */
export async function cargarFiltros(
  companyIds: number[],
): Promise<OpcionesFiltros> {
  const vendedores = await vendedoresDeSede(companyIds);
  const userIds = vendedores.map((v) => v.userId);

  const partners = userIds.length
    ? (await callOdooRPC<any[]>("res.partner", "search_read", [
        [["user_id", "in", userIds]],
      ], { fields: ["name", "user_id"], limit: 0 })) || []
    : [];

  const clientes = partners
    .filter((p: any) => p.name && !clienteExcluido(p.name))
    .map((p: any) => ({
      id: p.id as number,
      nombre: String(p.name),
      vendedorUserId: p.user_id?.[0] ?? null,
    }))
    .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, "es"));

  const marcasSet = new Set<string>();
  for (const cid of companyIds) {
    for (const m of await marcasDeSede(cid)) marcasSet.add(m);
  }
  const marcas = [...marcasSet].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));

  return { vendedores, clientes, marcas };
}

/* ─────────────────────────── Desglose de ventas ─────────────────────────── */

export interface FilaDesglose {
  vendedor: string;
  cliente: string;
  marca: string;
  producto: string;
  cantidad: number;
  precioVenta: number; // promedio ponderado = total / cantidad
  total: number; // neto, sin IVA (price_subtotal)
}

export interface DesgloseResult {
  filas: FilaDesglose[];
  totales: { cantidad: number; total: number; lineas: number; clientes: number };
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function cargarDesglose(opts: {
  companyIds: number[];
  desde: string;
  hasta: string;
  vendedorUserId?: number | null;
  clienteId?: number | null;
  marca?: string | null;
}): Promise<DesgloseResult> {
  const marca = (opts.marca || MARCA_TODAS).trim();
  const idsProducto = await idsProductoDeMarca(marca);
  if (idsProducto && idsProducto.length === 0) {
    return { filas: [], totales: { cantidad: 0, total: 0, lineas: 0, clientes: 0 } };
  }

  const dom: any[] = [
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.state", "=", "posted"],
    ["move_id.company_id", "in", opts.companyIds],
    ["move_id.invoice_date", ">=", opts.desde],
    ["move_id.invoice_date", "<=", opts.hasta],
    ["display_type", "=", "product"],
    ["product_id", "!=", false],
  ];
  if (opts.vendedorUserId) dom.push(["move_id.invoice_user_id", "=", opts.vendedorUserId]);
  if (opts.clienteId) dom.push(["partner_id", "=", opts.clienteId]);
  if (idsProducto) dom.push(["product_id", "in", idsProducto]);

  const crudas = await searchReadPaginado("account.move.line", dom, [
    "move_id",
    "partner_id",
    "product_id",
    "quantity",
    "price_subtotal",
  ]);
  if (crudas.length === 0) {
    return { filas: [], totales: { cantidad: 0, total: 0, lineas: 0, clientes: 0 } };
  }

  const moveIds = [...new Set(crudas.map((l: any) => l.move_id?.[0]).filter(Boolean))] as number[];
  const productIds = [...new Set(crudas.map((l: any) => l.product_id?.[0]).filter(Boolean))] as number[];

  const moves = await readEnLotes("account.move", moveIds, ["invoice_user_id", "move_type"]);
  const prods = await readEnLotes("product.product", productIds, ["x_studio_marca"]);

  const marcaDe = (id: number | undefined): string => {
    const p = id ? prods.get(id) : null;
    if (!p) return "Sin marca";
    const m = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca;
    return m ? String(m).toUpperCase().trim() : "Sin marca";
  };

  // Agregado por Vendedor / Cliente / Marca / Producto.
  const map = new Map<string, FilaDesglose>();
  const clientesSet = new Set<number>();
  let lineas = 0;

  for (const l of crudas) {
    const nombreCliente = l.partner_id?.[1] || "(sin cliente)";
    if (clienteExcluido(nombreCliente)) continue;

    const mv = moves.get(l.move_id?.[0]) || {};
    const signo = mv.move_type === "out_refund" ? -1 : 1;
    const vendedor = limpiarVendedor(mv.invoice_user_id?.[1] || "") || "(sin vendedor)";
    const marcaProd = marcaDe(l.product_id?.[0]);
    const producto = limpiarProducto(l.product_id?.[1] || "") || "(sin producto)";
    const cantidad = signo * (Number(l.quantity) || 0);
    const total = signo * (Number(l.price_subtotal) || 0);

    const k = `${vendedor}|||${nombreCliente}|||${marcaProd}|||${producto}`;
    const acc =
      map.get(k) ||
      { vendedor, cliente: nombreCliente, marca: marcaProd, producto, cantidad: 0, precioVenta: 0, total: 0 };
    acc.cantidad += cantidad;
    acc.total += total;
    map.set(k, acc);

    if (l.partner_id?.[0]) clientesSet.add(l.partner_id[0]);
    lineas++;
  }

  const filas = [...map.values()]
    .map((f) => ({
      ...f,
      cantidad: redondear(f.cantidad),
      total: redondear(f.total),
      precioVenta: f.cantidad ? redondear(f.total / f.cantidad) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    filas,
    totales: {
      cantidad: redondear(filas.reduce((s, f) => s + f.cantidad, 0)),
      total: redondear(filas.reduce((s, f) => s + f.total, 0)),
      lineas,
      clientes: clientesSet.size,
    },
  };
}

/* ─────────────────────────── Clientes inactivos ─────────────────────────── */

export interface ClienteInactivo {
  clienteId: number;
  cliente: string;
  vendedor: string;
  vendedorUserId: number | null;
  ultimaCompra: string | null; // YYYY-MM-DD | null (nunca compró)
  diasSinComprar: number | null;
}

/**
 * Cartera asignada (res.partner.user_id ∈ vendedores de la sede) cuya última
 * factura de cliente es anterior a `meses` atrás — o que nunca facturó.
 */
export async function clientesInactivos(opts: {
  companyIds: number[];
  meses: number; // 3 | 6
  vendedorUserId?: number | null;
}): Promise<ClienteInactivo[]> {
  const vendedores = await vendedoresDeSede(opts.companyIds);
  const nombreVendedor = new Map<number, string>(
    vendedores.map((v) => [v.userId, v.nombre]),
  );
  const userIds = opts.vendedorUserId
    ? [opts.vendedorUserId]
    : vendedores.map((v) => v.userId);
  if (userIds.length === 0) return [];

  const partners =
    (await callOdooRPC<any[]>("res.partner", "search_read", [
      [["user_id", "in", userIds]],
    ], { fields: ["name", "user_id"], limit: 0 })) || [];

  const cartera = partners.filter(
    (p: any) => p.name && !clienteExcluido(p.name),
  );
  if (cartera.length === 0) return [];

  const partnerIds = cartera.map((p: any) => p.id);

  // Última fecha de factura por cliente (una sola llamada agregada).
  const grupos =
    (await callOdooRPC<any[]>("account.move", "read_group", [
      [
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "in", opts.companyIds],
        ["partner_id", "in", partnerIds],
      ],
      ["invoice_date:max"],
      ["partner_id"],
    ])) || [];

  const ultimaPorPartner = new Map<number, string>();
  for (const g of grupos) {
    const pid = g.partner_id?.[0];
    const fecha = g["invoice_date:max"] || g.invoice_date || g.invoice_date_max;
    if (pid && fecha) ultimaPorPartner.set(pid, String(fecha).slice(0, 10));
  }

  const hoy = new Date();
  const corte = new Date();
  corte.setMonth(corte.getMonth() - opts.meses);
  const corteStr = corte.toISOString().slice(0, 10);
  const MS_DIA = 24 * 60 * 60 * 1000;

  const filas: ClienteInactivo[] = [];
  for (const p of cartera) {
    const ultima = ultimaPorPartner.get(p.id) || null;
    // Inactivo = nunca compró, o su última compra es anterior al corte.
    if (ultima && ultima >= corteStr) continue;
    const dias = ultima
      ? Math.floor((hoy.getTime() - new Date(ultima + "T00:00:00").getTime()) / MS_DIA)
      : null;
    filas.push({
      clienteId: p.id,
      cliente: String(p.name),
      vendedorUserId: p.user_id?.[0] ?? null,
      vendedor: nombreVendedor.get(p.user_id?.[0]) || p.user_id?.[1] || "(sin vendedor)",
      ultimaCompra: ultima,
      diasSinComprar: dias,
    });
  }

  // Los que más tiempo llevan sin comprar primero; los que nunca compraron, al final.
  return filas.sort((a, b) => {
    if (a.diasSinComprar == null) return 1;
    if (b.diasSinComprar == null) return -1;
    return b.diasSinComprar - a.diasSinComprar;
  });
}
