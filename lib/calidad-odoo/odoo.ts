import { callOdooRPC } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";

/**
 * Lectura de Odoo (solo lectura) para la revisión de calidad de datos. Todo
 * se lee de las 3 sedes de una vez; el filtro por sede se hace después.
 */

export const SEDES = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
  { id: 7, nombre: "Panamá" },
] as const;
export const IDS_SEDES = SEDES.map((s) => s.id) as number[];
export const nombreSede = (id: number | null | undefined) =>
  id == null ? "Compartido" : SEDES.find((s) => s.id === id)?.nombre ?? `Empresa ${id}`;

export { CORTE_ODOO };

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

const m2o = (v: any): [number, string] | null => (Array.isArray(v) && v.length >= 2 ? [v[0], String(v[1])] : null);
const txt = (v: any): string => (v === false || v == null ? "" : String(v));

/** Fecha de Odoo (UTC "YYYY-MM-DD HH:MM:SS" o "YYYY-MM-DD") a día de Caracas. */
export function diaCaracas(v: any): string | null {
  const s = txt(v);
  if (!s) return null;
  if (s.length === 10) return s;
  const utc = Date.parse(s.replace(" ", "T") + "Z");
  return Number.isFinite(utc) ? new Date(utc - 4 * 3600 * 1000).toISOString().slice(0, 10) : null;
}

// ───────────────────────── Contactos ─────────────────────────

export interface Contacto {
  id: number;
  nombre: string;
  rif: string;
  companyId: number | null;
  cliente: boolean;
  proveedor: boolean;
  email: string;
  telefono: string;
  movil: string;
  ciudad: string;
  estado: [number, string] | null;
  pais: [number, string] | null;
  vendedor: [number, string] | null;
  esEmpresa: boolean;
  tipoId: string;
  etiquetas: number[];
  creadoPor: string;
  creado: string | null;
}

/** Contactos comerciales (no las direcciones hijas) que son clientes o proveedores. */
export async function leerContactos(): Promise<Contacto[]> {
  const r = await leerTodo(
    "res.partner",
    [["parent_id", "=", false], "|", ["customer_rank", ">", 0], ["supplier_rank", ">", 0],
      "|", ["company_id", "in", IDS_SEDES], ["company_id", "=", false]],
    ["name", "vat", "company_id", "customer_rank", "supplier_rank", "email", "phone", "mobile", "city",
      "state_id", "country_id", "user_id", "is_company", "l10n_latam_identification_type_id", "category_id",
      "create_uid", "create_date"],
  );
  return r.map((p) => ({
    id: p.id,
    nombre: txt(p.name),
    rif: txt(p.vat),
    companyId: m2o(p.company_id)?.[0] ?? null,
    cliente: p.customer_rank > 0,
    proveedor: p.supplier_rank > 0,
    email: txt(p.email),
    telefono: txt(p.phone),
    movil: txt(p.mobile),
    ciudad: txt(p.city),
    estado: m2o(p.state_id),
    pais: m2o(p.country_id),
    vendedor: m2o(p.user_id),
    esEmpresa: !!p.is_company,
    tipoId: m2o(p.l10n_latam_identification_type_id)?.[1] ?? "",
    etiquetas: Array.isArray(p.category_id) ? p.category_id : [],
    creadoPor: m2o(p.create_uid)?.[1] ?? "",
    creado: diaCaracas(p.create_date),
  }));
}

/** País de cada estado/provincia (el nombre trae el código, pero mejor el dato). */
export async function paisDeEstados(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const r = await leerTodo("res.country.state", [["id", "in", ids]], ["country_id"]);
  return new Map(r.map((s) => [s.id, m2o(s.country_id)?.[0] ?? 0]));
}

export interface Usuario {
  id: number;
  nombre: string;
  activo: boolean;
  companyId: number | null;
  companyIds: number[];
}

export async function leerUsuarios(): Promise<Usuario[]> {
  const r = await leerTodo("res.users", [["share", "=", false]], ["name", "active", "company_id", "company_ids"], { active_test: false });
  return r.map((u) => ({ id: u.id, nombre: txt(u.name), activo: !!u.active, companyId: m2o(u.company_id)?.[0] ?? null, companyIds: u.company_ids || [] }));
}

export interface Etiqueta { id: number; nombre: string; contactos: number }

export async function leerEtiquetas(): Promise<Etiqueta[]> {
  const r = await leerTodo("res.partner.category", [], ["name", "partner_ids"]);
  return r.map((c) => ({ id: c.id, nombre: txt(c.name), contactos: (c.partner_ids || []).length }));
}

export interface Equipo { id: number; nombre: string; companyId: number | null; miembros: number }

export async function leerEquipos(): Promise<Equipo[]> {
  const r = await leerTodo("crm.team", [], ["name", "company_id", "member_ids"]);
  return r.map((t) => ({ id: t.id, nombre: txt(t.name), companyId: m2o(t.company_id)?.[0] ?? null, miembros: (t.member_ids || []).length }));
}

// ───────────────────────── Productos ─────────────────────────

export interface Producto {
  id: number;
  nombre: string;
  codigo: string;
  categoria: [number, string] | null;
  tipo: string;
  vendible: boolean;
  marca: [number, string] | null;
  companyId: number | null;
  creadoPor: string;
  creado: string | null;
}

export async function leerProductos(): Promise<Producto[]> {
  const r = await leerTodo(
    "product.template",
    [["active", "=", true]],
    ["name", "default_code", "categ_id", "detailed_type", "sale_ok", "spiff_brand_id", "company_id", "create_uid", "create_date"],
  );
  return r.map((t) => ({
    id: t.id,
    nombre: txt(t.name),
    codigo: txt(t.default_code),
    categoria: m2o(t.categ_id),
    tipo: txt(t.detailed_type),
    vendible: !!t.sale_ok,
    marca: m2o(t.spiff_brand_id),
    companyId: m2o(t.company_id)?.[0] ?? null,
    creadoPor: m2o(t.create_uid)?.[1] ?? "",
    creado: diaCaracas(t.create_date),
  }));
}

export interface Marca { id: number; nombre: string; productos: number }

export async function leerMarcas(): Promise<Marca[]> {
  const [marcas, conteo] = await Promise.all([
    leerTodo("spiff.brand", [], ["name"]),
    callOdooRPC<any[]>("product.template", "read_group", [[["active", "=", true], ["spiff_brand_id", "!=", false]], ["spiff_brand_id"], ["spiff_brand_id"]], { lazy: false }),
  ]);
  const n = new Map<number, number>();
  for (const g of conteo || []) if (m2o(g.spiff_brand_id)) n.set(g.spiff_brand_id[0], g.__count);
  return marcas.map((b) => ({ id: b.id, nombre: txt(b.name), productos: n.get(b.id) || 0 }));
}

export interface Categoria { id: number; nombre: string; ruta: string; productos: number }

export async function leerCategorias(): Promise<Categoria[]> {
  const r = await leerTodo("product.category", [], ["name", "complete_name", "product_count"]);
  return r.map((c) => ({ id: c.id, nombre: txt(c.name), ruta: txt(c.complete_name), productos: c.product_count || 0 }));
}

/** Costo y stock de cada almacenable vistos desde una sede (son por empresa). */
export async function costoYStock(companyId: number): Promise<Map<number, { costo: number; stock: number }>> {
  const r = await leerTodo(
    "product.template",
    [["active", "=", true], ["detailed_type", "=", "product"]],
    ["standard_price", "qty_available"],
    { allowed_company_ids: [companyId], company_id: companyId },
  );
  return new Map(r.map((t) => [t.id, { costo: Number(t.standard_price) || 0, stock: Number(t.qty_available) || 0 }]));
}

export interface ListaPrecios {
  id: number;
  nombre: string;
  companyId: number;
  /** Precios fijos (cantidad mínima ≤ 1) por plantilla de producto. */
  precios: Map<number, number[]>;
}

/**
 * Lista de precios principal de cada sede: la activa de esa empresa con más
 * reglas (Valencia "Lista de Precios", Caracas "Lista de Precios O", Panamá
 * "Supricom S.A - Lista USD"). En Odoo el precio de venta del producto es 1
 * en casi todos: el precio real está en estas listas.
 */
export async function listasPrincipales(): Promise<ListaPrecios[]> {
  const listas = await leerTodo("product.pricelist", [["company_id", "in", IDS_SEDES]], ["name", "company_id", "item_ids"]);
  const principales = IDS_SEDES.map((co) =>
    listas.filter((l) => m2o(l.company_id)?.[0] === co).sort((a, b) => b.item_ids.length - a.item_ids.length)[0],
  ).filter(Boolean);
  if (!principales.length) return [];

  const items = await leerTodo(
    "product.pricelist.item",
    [["pricelist_id", "in", principales.map((l) => l.id)], ["compute_price", "=", "fixed"], ["min_quantity", "<=", 1]],
    ["pricelist_id", "applied_on", "product_tmpl_id", "product_id", "fixed_price"],
  );
  // Las reglas por variante apuntan al product.product: se pasan a su plantilla.
  const varIds = [...new Set(items.filter((i) => !m2o(i.product_tmpl_id) && m2o(i.product_id)).map((i) => i.product_id[0]))];
  const plantilla = new Map<number, number>();
  if (varIds.length) {
    const vs = await leerTodo("product.product", [["id", "in", varIds]], ["product_tmpl_id"], { active_test: false });
    for (const v of vs) plantilla.set(v.id, m2o(v.product_tmpl_id)?.[0] ?? 0);
  }

  return principales.map((l) => {
    const precios = new Map<number, number[]>();
    for (const i of items) {
      if (m2o(i.pricelist_id)?.[0] !== l.id) continue;
      const tmpl = m2o(i.product_tmpl_id)?.[0] ?? (m2o(i.product_id) ? plantilla.get(i.product_id[0]) : 0);
      if (!tmpl) continue;
      if (!precios.has(tmpl)) precios.set(tmpl, []);
      precios.get(tmpl)!.push(Number(i.fixed_price) || 0);
    }
    return { id: l.id, nombre: txt(l.name), companyId: m2o(l.company_id)![0], precios };
  });
}

// ───────────────────────── Operaciones ─────────────────────────

export async function stockNegativo() {
  const r = await leerTodo(
    "stock.quant",
    [["quantity", "<", 0], ["location_id.usage", "=", "internal"], ["company_id", "in", IDS_SEDES]],
    ["product_id", "location_id", "quantity", "company_id", "lot_id"],
  );
  return r.map((q) => ({
    id: q.id, companyId: m2o(q.company_id)?.[0] ?? null, producto: m2o(q.product_id)?.[1] ?? "",
    productoId: m2o(q.product_id)?.[0] ?? 0, ubicacion: m2o(q.location_id)?.[1] ?? "", cantidad: Number(q.quantity) || 0,
    lote: m2o(q.lot_id)?.[1] ?? "",
  }));
}

export async function traslados(domain: any[]) {
  const r = await leerTodo(
    "stock.picking",
    [["company_id", "in", IDS_SEDES], ...domain],
    ["name", "picking_type_id", "partner_id", "scheduled_date", "create_date", "origin", "state", "company_id", "user_id"],
  );
  return r.map((p) => ({
    id: p.id, companyId: m2o(p.company_id)?.[0] ?? null, numero: txt(p.name), tipo: m2o(p.picking_type_id)?.[1] ?? "",
    contacto: m2o(p.partner_id)?.[1] ?? "", programada: diaCaracas(p.scheduled_date), creado: diaCaracas(p.create_date),
    origen: txt(p.origin), estado: txt(p.state), responsable: m2o(p.user_id)?.[1] ?? "",
  }));
}

export async function pedidosVenta(domain: any[]) {
  const r = await leerTodo(
    "sale.order",
    [["company_id", "in", IDS_SEDES], ...domain],
    ["name", "partner_id", "user_id", "date_order", "amount_total", "state", "invoice_status", "company_id"],
  );
  return r.map((o) => ({
    id: o.id, companyId: m2o(o.company_id)?.[0] ?? null, numero: txt(o.name), cliente: m2o(o.partner_id)?.[1] ?? "",
    vendedor: m2o(o.user_id)?.[1] ?? "", fecha: diaCaracas(o.date_order), total: Number(o.amount_total) || 0, estado: txt(o.state),
  }));
}

export async function ordenesCompra(domain: any[]) {
  const r = await leerTodo(
    "purchase.order",
    [["company_id", "in", IDS_SEDES], ...domain],
    ["name", "partner_id", "user_id", "date_order", "date_approve", "amount_total", "state", "receipt_status", "invoice_status", "company_id"],
  );
  return r.map((o) => ({
    id: o.id, companyId: m2o(o.company_id)?.[0] ?? null, numero: txt(o.name), proveedor: m2o(o.partner_id)?.[1] ?? "",
    comprador: m2o(o.user_id)?.[1] ?? "", fecha: diaCaracas(o.date_approve || o.date_order), total: Number(o.amount_total) || 0,
    recepcion: txt(o.receipt_status),
  }));
}

export async function asientos(domain: any[]) {
  const r = await leerTodo(
    "account.move",
    [["company_id", "in", IDS_SEDES], ...domain],
    ["name", "ref", "move_type", "journal_id", "partner_id", "date", "invoice_date", "amount_total_signed", "create_uid", "create_date", "company_id", "invoice_user_id"],
  );
  return r.map((m) => ({
    id: m.id, companyId: m2o(m.company_id)?.[0] ?? null, numero: txt(m.name) === "/" ? "(sin número)" : txt(m.name),
    referencia: txt(m.ref), tipo: txt(m.move_type), diario: m2o(m.journal_id)?.[1] ?? "", contacto: m2o(m.partner_id)?.[1] ?? "",
    contactoId: m2o(m.partner_id)?.[0] ?? 0, fecha: diaCaracas(m.invoice_date || m.date), total: Math.abs(Number(m.amount_total_signed) || 0),
    creadoPor: m2o(m.create_uid)?.[1] ?? "", creado: diaCaracas(m.create_date), vendedor: m2o(m.invoice_user_id)?.[1] ?? "",
  }));
}

/** RIF del contacto comercial de cada factura (para facturas a clientes sin RIF). */
export async function facturasSinRif() {
  const r = await leerTodo(
    "account.move",
    [["company_id", "in", IDS_SEDES], ["state", "=", "posted"], ["move_type", "=", "out_invoice"],
      ["invoice_date", ">=", CORTE_ODOO], ["commercial_partner_id.vat", "=", false],
      // Consumidor final (Panamá) factura sin RUC a propósito: su tipo de identificación no es fiscal.
      "|", ["commercial_partner_id.l10n_latam_identification_type_id", "=", false],
      ["commercial_partner_id.l10n_latam_identification_type_id.is_vat", "=", true]],
    ["name", "partner_id", "commercial_partner_id", "invoice_date", "amount_total_signed", "invoice_user_id", "company_id"],
  );
  return r.map((m) => ({
    id: m.id, companyId: m2o(m.company_id)?.[0] ?? null, numero: txt(m.name), cliente: m2o(m.commercial_partner_id)?.[1] ?? "",
    clienteId: m2o(m.commercial_partner_id)?.[0] ?? 0, fecha: diaCaracas(m.invoice_date), total: Math.abs(Number(m.amount_total_signed) || 0),
    vendedor: m2o(m.invoice_user_id)?.[1] ?? "",
  }));
}

export async function pagos(domain: any[]) {
  const r = await leerTodo(
    "account.payment",
    [["company_id", "in", IDS_SEDES], ...domain],
    ["name", "partner_id", "partner_type", "payment_type", "amount_company_currency_signed", "date", "journal_id", "ref", "company_id", "create_uid", "move_id", "reconciled_invoice_ids", "reconciled_bill_ids"],
  );
  return r.map((p) => ({
    moveId: m2o(p.move_id)?.[0] ?? 0,
    aplicadoA: (p.reconciled_invoice_ids?.length || 0) + (p.reconciled_bill_ids?.length || 0),
    id: p.id, companyId: m2o(p.company_id)?.[0] ?? null, numero: txt(p.name) === "/" ? "(sin número)" : txt(p.name),
    contacto: m2o(p.partner_id)?.[1] ?? "", tipo: p.partner_type === "supplier" ? "Proveedor" : "Cliente",
    direccion: p.payment_type === "outbound" ? "Enviado" : "Recibido", monto: Math.abs(Number(p.amount_company_currency_signed) || 0),
    fecha: diaCaracas(p.date), diario: m2o(p.journal_id)?.[1] ?? "", referencia: txt(p.ref), creadoPor: m2o(p.create_uid)?.[1] ?? "",
  }));
}

/**
 * Lo que le queda sin aplicar a cada pago: el saldo de su línea de cuentas por
 * cobrar/pagar (moneda de la empresa). Un pago aplicado a una factura de menor
 * monto queda «sin conciliar» con el sobrante.
 */
export async function saldoSinAplicar(moveIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < moveIds.length; i += 1000) {
    const r = await leerTodo(
      "account.move.line",
      [["move_id", "in", moveIds.slice(i, i + 1000)], ["account_type", "in", ["asset_receivable", "liability_payable"]]],
      ["move_id", "amount_residual"],
    );
    for (const l of r) {
      const id = m2o(l.move_id)?.[0];
      if (id) out.set(id, (out.get(id) || 0) + (Number(l.amount_residual) || 0));
    }
  }
  return out;
}

export async function extractoSinConciliar() {
  const r = await leerTodo(
    "account.bank.statement.line",
    [["company_id", "in", IDS_SEDES], ["is_reconciled", "=", false]],
    ["date", "payment_ref", "partner_id", "amount", "journal_id", "company_id", "move_id"],
  );
  return r.map((l) => ({
    id: l.id, moveId: m2o(l.move_id)?.[0] ?? l.id, companyId: m2o(l.company_id)?.[0] ?? null, fecha: diaCaracas(l.date), concepto: txt(l.payment_ref),
    contacto: m2o(l.partner_id)?.[1] ?? "", monto: Number(l.amount) || 0, diario: m2o(l.journal_id)?.[1] ?? "",
  }));
}
