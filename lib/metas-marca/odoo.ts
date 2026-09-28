import { callOdooRPC } from "@/lib/odoo";
import { claveMarca, SIN_MARCA } from "./marcas";

/**
 * Lectura de Odoo para Metas por marca (solo lectura).
 *
 * Venta = facturas y notas de crédito de cliente publicadas, por
 * `invoice_date`, sin IVA. El monto sale de `balance` (moneda de la empresa,
 * con signo) y no de `price_subtotal` (moneda de la factura): si algún día se
 * factura en otra moneda, la venta sigue en dólares. Las notas de crédito
 * restan.
 *
 * A diferencia de Cobertura de marcas del Stoplight:
 * - Se incluyen las facturas sin vendedor: la meta es de la marca en la sede,
 *   no de un vendedor.
 * - Se excluyen las ventas intercompañía (Valencia le factura a Caracas, etc.):
 *   en sep-2026 Valencia le facturó $1,56M a SUPRICOM CCS 21 (~45% de su
 *   facturación). Contarlas inflaba la marca en la sede que vende y la volvía
 *   a contar cuando la otra sede le vende al cliente final.
 */

export const SEDES = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
  { id: 7, nombre: "Panamá" },
] as const;

export const esSedeValida = (id: number) => SEDES.some((s) => s.id === id);
export const nombreSede = (id: number) => SEDES.find((s) => s.id === id)?.nombre ?? `Empresa ${id}`;

export interface FacturaVenta {
  id: number;
  numero: string;
  fecha: string;
  tipo: "out_invoice" | "out_refund";
  clienteId: number;
  cliente: string;
  vendedorId: number | null;
  vendedor: string;
  /** Base imponible con signo, en moneda de la empresa (cabecera de la factura). */
  baseFirmada: number;
  moneda: string;
  intercompania: boolean;
}

export interface LineaVenta {
  facturaId: number;
  fecha: string;
  tipo: "out_invoice" | "out_refund";
  clienteId: number;
  cliente: string;
  vendedorId: number | null;
  vendedor: string;
  productoId: number | null;
  producto: string;
  codigo: string;
  productoActivo: boolean;
  marcaId: number | null;
  marcaOdoo: string;
  clave: string;
  cantidad: number;
  /** −balance: venta sin IVA en moneda de la empresa, negativa en notas de crédito. */
  ingreso: number;
  /** price_subtotal con el signo del documento (moneda de la factura), para la auditoría. */
  subtotalFirmado: number;
  intercompania: boolean;
}

export interface VentasSede {
  companyId: number;
  desde: string;
  hasta: string;
  facturas: FacturaVenta[];
  lineas: LineaVenta[];
  intercompania: Map<number, string>;
  monedaEmpresa: string;
}

const dominioFacturas = (companyId: number, desde: string, hasta: string) => [
  ["move_type", "in", ["out_invoice", "out_refund"]],
  ["state", "=", "posted"],
  ["company_id", "=", companyId],
  ["invoice_date", ">=", desde],
  ["invoice_date", "<=", hasta],
];

/** Mismo universo, visto desde `account.move.line` (campos relacionados almacenados). */
export const dominioLineas = (companyId: number, desde: string, hasta: string) => [
  ["move_type", "in", ["out_invoice", "out_refund"]],
  ["parent_state", "=", "posted"],
  ["company_id", "=", companyId],
  ["invoice_date", ">=", desde],
  ["invoice_date", "<=", hasta],
  ["display_type", "=", "product"],
];

/** search_read paginado: un `limit` fijo cortaba en silencio los meses grandes. */
async function leerTodo(model: string, domain: any[], fields: string[], context?: Record<string, any>): Promise<any[]> {
  const pagina = 5000;
  const todo: any[] = [];
  for (let offset = 0; ; offset += pagina) {
    const r = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields, limit: pagina, offset, order: "id asc", ...(context ? { context } : {}),
    });
    if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}.search_read`);
    todo.push(...r);
    if (r.length < pagina) return todo;
  }
}

let cacheIC: { vence: number; mapa: Map<number, string> } | null = null;

/**
 * Contactos (empresa comercial) que son del grupo: las propias empresas del
 * Odoo y los clientes creados con su nombre o RIF en cada sede (en Odoo hay un
 * "SUPRICOM CCS 21, C.A." distinto por empresa, ninguno es el partner de la
 * compañía). Se compara contra `commercial_partner_id`, así los contactos
 * hijos también quedan fuera.
 *
 * Incluye SUPRICOM USA, LLC y SUPRICOM, LLC (EE. UU.), que no son empresas en
 * este Odoo pero sí del grupo (confirmado 2026-09-28): son el grueso de lo
 * que factura Panamá (62% en sep-2026).
 *
 * Los RIF van sin guiones y recortados: en Odoo están escritos de varias
 * formas ("87-1576706", "J-31163115-1", "RUC155595002").
 */
export async function partnersIntercompania(): Promise<Map<number, string>> {
  if (cacheIC && cacheIC.vence > Date.now()) return cacheIC.mapa;
  const [partners, empresas] = await Promise.all([
    callOdooRPC<any[]>("res.partner", "search_read", [[
      "|", "|", "|", "|", "|", "|",
      ["name", "ilike", "supricom"],
      ["name", "ilike", "office solutions center"],
      ["name", "ilike", "ofimaster"],
      ["vat", "ilike", "501193738"],
      ["vat", "ilike", "31163115"],
      ["vat", "ilike", "155595002"],
      ["vat", "ilike", "1576706"],
    ]], { fields: ["id", "name"], limit: 0, context: { active_test: false } }),
    callOdooRPC<any[]>("res.company", "search_read", [[]], { fields: ["partner_id"], limit: 0 }),
  ]);
  if (!Array.isArray(partners) || !Array.isArray(empresas)) throw new Error("Odoo no respondió los contactos intercompañía");
  const mapa = new Map<number, string>();
  for (const p of partners) mapa.set(p.id, p.name || "");
  for (const e of empresas) if (e.partner_id) mapa.set(e.partner_id[0], e.partner_id[1] || "");
  cacheIC = { vence: Date.now() + 30 * 60 * 1000, mapa };
  return mapa;
}

interface InfoProducto { nombre: string; codigo: string; activo: boolean; marcaId: number | null; marca: string }

export async function leerProductos(ids: number[]): Promise<Map<number, InfoProducto>> {
  const mapa = new Map<number, InfoProducto>();
  for (let i = 0; i < ids.length; i += 2000) {
    const lote = ids.slice(i, i + 2000);
    const r = await callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", lote]]], {
      fields: ["id", "name", "default_code", "active", "spiff_brand_id"], limit: 0, context: { active_test: false },
    });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió product.product");
    for (const p of r) {
      mapa.set(p.id, {
        nombre: p.name || "",
        codigo: p.default_code || "",
        activo: p.active !== false,
        marcaId: p.spiff_brand_id ? p.spiff_brand_id[0] : null,
        marca: p.spiff_brand_id ? p.spiff_brand_id[1] || "" : "",
      });
    }
  }
  return mapa;
}

export async function leerVentasSede(companyId: number, desde: string, hasta: string): Promise<VentasSede> {
  const [intercompania, movs, lineasOdoo, empresa] = await Promise.all([
    partnersIntercompania(),
    leerTodo("account.move", dominioFacturas(companyId, desde, hasta), [
      "id", "name", "invoice_date", "move_type", "commercial_partner_id", "invoice_user_id",
      "amount_untaxed_signed", "currency_id",
    ]),
    leerTodo("account.move.line", dominioLineas(companyId, desde, hasta), [
      "move_id", "product_id", "quantity", "balance", "price_subtotal",
    ]),
    callOdooRPC<any[]>("res.company", "read", [[companyId], ["currency_id"]]),
  ]);

  const facturas: FacturaVenta[] = movs.map((m: any) => {
    const clienteId = m.commercial_partner_id ? m.commercial_partner_id[0] : 0;
    return {
      id: m.id,
      numero: m.name || "",
      fecha: String(m.invoice_date || "").slice(0, 10),
      tipo: m.move_type,
      clienteId,
      cliente: m.commercial_partner_id ? m.commercial_partner_id[1] || "" : "",
      vendedorId: m.invoice_user_id ? m.invoice_user_id[0] : null,
      vendedor: m.invoice_user_id ? m.invoice_user_id[1] || "" : "",
      baseFirmada: Number(m.amount_untaxed_signed) || 0,
      moneda: m.currency_id ? m.currency_id[1] || "" : "",
      intercompania: intercompania.has(clienteId),
    };
  });
  const porId = new Map(facturas.map((f) => [f.id, f]));

  const productIds = [...new Set(lineasOdoo.map((l: any) => l.product_id?.[0]).filter(Boolean))] as number[];
  const productos = await leerProductos(productIds);

  const lineas: LineaVenta[] = [];
  for (const l of lineasOdoo) {
    const f = porId.get(l.move_id?.[0]);
    if (!f) continue;
    const productoId = l.product_id ? l.product_id[0] : null;
    const p = productoId ? productos.get(productoId) : undefined;
    const signo = f.tipo === "out_refund" ? -1 : 1;
    lineas.push({
      facturaId: f.id,
      fecha: f.fecha,
      tipo: f.tipo,
      clienteId: f.clienteId,
      cliente: f.cliente,
      vendedorId: f.vendedorId,
      vendedor: f.vendedor,
      productoId,
      producto: p?.nombre || (l.product_id ? l.product_id[1] : "") || "(sin producto)",
      codigo: p?.codigo || "",
      productoActivo: p?.activo ?? true,
      marcaId: p?.marcaId ?? null,
      marcaOdoo: p?.marca ?? "",
      clave: p?.marcaId ? claveMarca(p.marca) : SIN_MARCA,
      cantidad: signo * (Number(l.quantity) || 0),
      ingreso: -(Number(l.balance) || 0),
      subtotalFirmado: signo * (Number(l.price_subtotal) || 0),
      intercompania: f.intercompania,
    });
  }

  return {
    companyId, desde, hasta, facturas, lineas, intercompania,
    monedaEmpresa: Array.isArray(empresa) && empresa[0]?.currency_id ? empresa[0].currency_id[1] : "",
  };
}

const cacheHistorial = new Map<string, { vence: number; valor: Map<string, number> }>();

/**
 * Venta de un mes cerrado por marca (clave), agrupada en el servidor de Odoo
 * (`read_group` por producto). Sin intercompañía salvo `incluirIC`. Los meses
 * pasados casi no cambian: caché de 30 min.
 */
export async function ventaMesPorMarca(companyId: number, mes: string, incluirIC: boolean): Promise<Map<string, number>> {
  const llave = `${companyId}|${mes}|${incluirIC ? 1 : 0}`;
  const cache = cacheHistorial.get(llave);
  if (cache && cache.vence > Date.now()) return cache.valor;

  const [y, m] = mes.split("-").map(Number);
  const hasta = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const domain: any[] = dominioLineas(companyId, `${mes}-01`, hasta);
  if (!incluirIC) {
    const ic = await partnersIntercompania();
    domain.push(["move_id.commercial_partner_id", "not in", [...ic.keys()]]);
  }
  const grupos = await callOdooRPC<any[]>("account.move.line", "read_group", [domain, ["balance:sum"], ["product_id"]], { lazy: false });
  if (!Array.isArray(grupos)) throw new Error("Odoo no respondió el historial de ventas");

  const ids = grupos.map((g) => g.product_id?.[0]).filter(Boolean) as number[];
  const productos = await leerProductos(ids);
  const porMarca = new Map<string, number>();
  for (const g of grupos) {
    const p = g.product_id ? productos.get(g.product_id[0]) : undefined;
    const clave = p?.marcaId ? claveMarca(p.marca) : SIN_MARCA;
    porMarca.set(clave, (porMarca.get(clave) || 0) - (Number(g.balance) || 0));
  }
  cacheHistorial.set(llave, { vence: Date.now() + 30 * 60 * 1000, valor: porMarca });
  return porMarca;
}
