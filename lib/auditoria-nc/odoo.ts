import { callOdooRPC } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { categorizarMotivo, extraerMotivo, type CategoriaMotivo } from "./motivos";

/**
 * Lectura de Odoo (solo lectura) para la auditoría de notas de crédito,
 * facturas anuladas y facturas reabiertas (publicadas que se devolvieron a
 * borrador). Todo por sede (company_id) y documentos de cliente
 * (out_invoice / out_refund).
 *
 * El "quién y cuándo" de anulaciones y reaperturas sale del chatter:
 * `mail.tracking.value` del campo `state` (Registrado → Borrador, Borrador →
 * Cancelado, …). Las etiquetas se guardan en el idioma de quien hizo el
 * cambio: casi siempre en español, a veces en inglés.
 */

export const SEDES = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
  { id: 7, nombre: "Panamá" },
] as const;
export const esSedeValida = (id: number) => SEDES.some((s) => s.id === id);
export const nombreSede = (id: number) => SEDES.find((s) => s.id === id)?.nombre ?? `Empresa ${id}`;

export type Estado = "posted" | "draft" | "cancel" | "";
const ETIQUETAS: Record<string, Estado> = {
  REGISTRADO: "posted", PUBLICADO: "posted", POSTED: "posted", CONTABILIZADO: "posted",
  BORRADOR: "draft", DRAFT: "draft",
  CANCELADO: "cancel", CANCELLED: "cancel", CANCELED: "cancel", ANULADO: "cancel",
};
export const estadoDeEtiqueta = (s: string | false | null | undefined): Estado =>
  ETIQUETAS[String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase()] ?? "";

/** Datetime UTC de Odoo ("YYYY-MM-DD HH:MM:SS") a ISO en hora de Venezuela (UTC-4). */
export function aCaracas(dt: string | false | null | undefined): string | null {
  if (!dt) return null;
  const utc = Date.parse(String(dt).replace(" ", "T") + "Z");
  if (!Number.isFinite(utc)) return null;
  const c = new Date(utc - 4 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${c.getUTCFullYear()}-${p(c.getUTCMonth() + 1)}-${p(c.getUTCDate())}T${p(c.getUTCHours())}:${p(c.getUTCMinutes())}:${p(c.getUTCSeconds())}-04:00`;
}

/** Rango de días de Caracas a rango UTC para filtrar create_date / tracking. */
export function rangoUtc(desde: string, hasta: string) {
  const d = new Date(`${desde}T04:00:00Z`);
  const h = new Date(`${hasta}T04:00:00Z`);
  h.setUTCDate(h.getUTCDate() + 1);
  const f = (x: Date) => x.toISOString().slice(0, 19).replace("T", " ");
  return { desdeUtc: f(d), hastaUtc: f(new Date(h.getTime() - 1000)) };
}

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

async function porLotes<T>(ids: number[], leer: (lote: number[]) => Promise<T[]>, tam = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += tam) out.push(...(await leer(ids.slice(i, i + tam))));
  return out;
}

export interface Documento {
  id: number;
  numero: string;
  tipo: "out_invoice" | "out_refund";
  estado: Estado;
  companyId: number;
  /** invoice_date (fecha del documento). */
  fecha: string | null;
  creado: string | null;
  creadoPorId: number | null;
  creadoPor: string;
  vendedorId: number | null;
  vendedor: string;
  clienteId: number;
  cliente: string;
  /** Base sin IVA, en positivo, moneda de la empresa. */
  base: number;
  total: number;
  ref: string;
  motivo: string;
  categoria: CategoriaMotivo;
  origenId: number | null;
  origenNumero: string;
  estadoPago: string;
  /** Saldo pendiente (moneda de la empresa). */
  residual: number;
  diario: string;
  intercompania: boolean;
  publicadaAntes: boolean;
}

const CAMPOS_MOVE = [
  "id", "name", "move_type", "state", "company_id", "invoice_date", "create_date", "create_uid",
  "invoice_user_id", "commercial_partner_id", "amount_untaxed_signed", "amount_total_signed", "ref",
  "reversed_entry_id", "payment_state", "amount_residual_signed", "journal_id", "posted_before",
];

function aDocumento(m: any, ic: Map<number, string>): Documento {
  const clienteId = m.commercial_partner_id ? m.commercial_partner_id[0] : 0;
  return {
    id: m.id,
    numero: m.name && m.name !== "/" ? m.name : `(sin número, id ${m.id})`,
    tipo: m.move_type,
    estado: (m.state as Estado) || "",
    companyId: m.company_id ? m.company_id[0] : 0,
    fecha: m.invoice_date ? String(m.invoice_date).slice(0, 10) : null,
    creado: aCaracas(m.create_date),
    creadoPorId: m.create_uid ? m.create_uid[0] : null,
    creadoPor: m.create_uid ? m.create_uid[1] || "" : "",
    vendedorId: m.invoice_user_id ? m.invoice_user_id[0] : null,
    vendedor: m.invoice_user_id ? m.invoice_user_id[1] || "" : "",
    clienteId,
    cliente: m.commercial_partner_id ? m.commercial_partner_id[1] || "" : "",
    base: Math.abs(Number(m.amount_untaxed_signed) || 0),
    total: Math.abs(Number(m.amount_total_signed) || 0),
    ref: typeof m.ref === "string" ? m.ref : "",
    motivo: extraerMotivo(m.ref),
    categoria: categorizarMotivo(m.ref),
    origenId: m.reversed_entry_id ? m.reversed_entry_id[0] : null,
    origenNumero: m.reversed_entry_id ? m.reversed_entry_id[1] || "" : "",
    estadoPago: m.payment_state || "",
    residual: Math.abs(Number(m.amount_residual_signed) || 0),
    diario: m.journal_id ? m.journal_id[1] || "" : "",
    intercompania: ic.has(clienteId),
    publicadaAntes: !!m.posted_before,
  };
}

export async function leerDocumentos(ids: number[]): Promise<Documento[]> {
  if (!ids.length) return [];
  const ic = await partnersIntercompania();
  const r = await porLotes(ids, (lote) => leerTodo("account.move", [["id", "in", lote]], CAMPOS_MOVE));
  return r.map((m) => aDocumento(m, ic));
}

/** Documentos de cliente de una sede cuya fecha cae en el rango (o, sin fecha, creados en el rango). */
async function leerPorFecha(companyId: number, tipos: string[], estados: string[], desde: string, hasta: string) {
  const { desdeUtc, hastaUtc } = rangoUtc(desde, hasta);
  const ic = await partnersIntercompania();
  const r = await leerTodo("account.move", [
    ["company_id", "=", companyId],
    ["move_type", "in", tipos],
    ["state", "in", estados],
    "|",
    "&", ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    "&", ["invoice_date", "=", false], "&", ["create_date", ">=", desdeUtc], ["create_date", "<=", hastaUtc],
  ], CAMPOS_MOVE);
  return r.map((m) => aDocumento(m, ic));
}

export const leerNotasCredito = (companyId: number, desde: string, hasta: string) =>
  leerPorFecha(companyId, ["out_refund"], ["posted", "draft"], desde, hasta);

/**
 * Todas las NC publicadas (de cualquier fecha) contra estas facturas: para
 * saber cuánto se acreditó en total sobre cada una.
 */
export async function ncPorFactura(facturaIds: number[]): Promise<Map<number, { id: number; numero: string; base: number; fecha: string | null }[]>> {
  const mapa = new Map<number, { id: number; numero: string; base: number; fecha: string | null }[]>();
  if (!facturaIds.length) return mapa;
  const r = await porLotes(facturaIds, (lote) => leerTodo("account.move", [
    ["move_type", "=", "out_refund"], ["state", "=", "posted"], ["reversed_entry_id", "in", lote],
  ], ["id", "name", "reversed_entry_id", "amount_untaxed_signed", "invoice_date"]));
  for (const m of r) {
    const f = m.reversed_entry_id?.[0];
    if (!f) continue;
    mapa.set(f, [...(mapa.get(f) || []), { id: m.id, numero: m.name || "", base: Math.abs(Number(m.amount_untaxed_signed) || 0), fecha: m.invoice_date || null }]);
  }
  return mapa;
}

/**
 * Documentos anulados de la sede: fecha del documento en el rango, o anulados
 * en el rango aunque la factura sea de antes (se decide después con el
 * historial). Se traen hasta un año hacia atrás.
 */
export async function leerAnulados(companyId: number, desde: string, hasta: string) {
  const d = new Date(`${desde}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return leerPorFecha(companyId, ["out_invoice", "out_refund"], ["cancel"], d.toISOString().slice(0, 10), hasta);
}

export interface Evento {
  moveId: number;
  fecha: string; // ISO Caracas
  usuarioId: number | null;
  usuario: string;
  de: Estado;
  a: Estado;
}

export interface Cambio {
  moveId: number;
  fecha: string;
  usuario: string;
  campo: string; // técnico
  etiqueta: string;
  antes: string;
  despues: string;
  antesNum: number | null;
  despuesNum: number | null;
}

/**
 * Campos del historial que interesan, por modelo. `name`, `partner_id` y
 * `date` existen también en las líneas (descripción, cliente y fecha de cada
 * línea): mezclarlos mostraba la descripción de una línea como "Número" y
 * podía dar falsos "cambió el cliente". De las líneas solo se toman los
 * impuestos.
 */
const CAMPOS_MOVE_HIST = [
  "state", "amount_untaxed", "partner_id", "invoice_date", "date", "invoice_user_id", "currency_id",
  "name", "ref", "amount_total", "invoice_payment_term_id",
];
const CAMPOS_LINEA_HIST = ["tax_ids"];
const ETIQUETA_CAMPO: Record<string, string> = {
  state: "Estado", amount_untaxed: "Monto sin IVA", amount_total: "Total", partner_id: "Cliente",
  invoice_date: "Fecha de factura", date: "Fecha contable", invoice_user_id: "Vendedor", currency_id: "Moneda",
  name: "Número", ref: "Referencia", tax_ids: "Impuestos de línea", invoice_payment_term_id: "Plazo de pago",
};

let cacheCampos: { vence: number; valor: Promise<Map<number, string>> } | null = null;
function camposHistorial(): Promise<Map<number, string>> {
  if (cacheCampos && cacheCampos.vence > Date.now()) return cacheCampos.valor;
  const valor = (async () => {
    const r = await callOdooRPC<any[]>("ir.model.fields", "search_read", [[
      "|",
      "&", ["model", "=", "account.move"], ["name", "in", CAMPOS_MOVE_HIST],
      "&", ["model", "=", "account.move.line"], ["name", "in", CAMPOS_LINEA_HIST],
    ]], { fields: ["id", "name", "model"], limit: 0 });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió ir.model.fields");
    return new Map(r.map((f: any) => [f.id as number, String(f.name)]));
  })();
  const entrada = { vence: Date.now() + 6 * 3600 * 1000, valor };
  cacheCampos = entrada;
  valor.catch(() => { if (cacheCampos === entrada) cacheCampos = null; });
  return valor;
}

const valorTexto = (t: any, lado: "old" | "new"): { texto: string; num: number | null } => {
  const c = t[`${lado}_value_char`];
  const f = t[`${lado}_value_float`];
  const i = t[`${lado}_value_integer`];
  const d = t[`${lado}_value_datetime`];
  if (c) return { texto: String(c), num: null };
  if (d) return { texto: String(d).slice(0, 10), num: null };
  if (typeof f === "number" && f !== 0) return { texto: String(f), num: f };
  if (typeof i === "number" && i !== 0) return { texto: String(i), num: i };
  if (typeof f === "number") return { texto: "0", num: 0 };
  return { texto: "", num: null };
};

/**
 * Historial (estado + campos relevantes) de estos documentos, en orden. Si se
 * pasa `desdeUtc`, solo desde esa fecha (para no traer el historial entero
 * de facturas viejas).
 */
export async function leerHistorial(moveIds: number[], desdeUtc?: string): Promise<{ eventos: Evento[]; cambios: Cambio[] }> {
  if (!moveIds.length) return { eventos: [], cambios: [] };
  const campos = await camposHistorial();
  const fieldIds = [...campos.keys()];
  const tracking = await porLotes(moveIds, (lote) => leerTodo("mail.tracking.value", [
    ["mail_message_id.model", "=", "account.move"],
    ["mail_message_id.res_id", "in", lote],
    ["field_id", "in", fieldIds],
    ...(desdeUtc ? [["create_date", ">=", desdeUtc]] : []),
  ], [
    "field_id", "mail_message_id", "create_date", "create_uid",
    "old_value_char", "new_value_char", "old_value_float", "new_value_float",
    "old_value_integer", "new_value_integer", "old_value_datetime", "new_value_datetime",
  ]), 500);
  const msgIds = [...new Set(tracking.map((t) => t.mail_message_id?.[0]).filter(Boolean))] as number[];
  const mensajes = await porLotes(msgIds, (lote) => leerTodo("mail.message", [["id", "in", lote]], ["id", "res_id"]));
  const resId = new Map(mensajes.map((m) => [m.id as number, m.res_id as number]));

  const eventos: Evento[] = [];
  const cambios: Cambio[] = [];
  for (const t of tracking) {
    const moveId = resId.get(t.mail_message_id?.[0]);
    if (!moveId) continue;
    const campo = campos.get(t.field_id?.[0]) || "";
    const fecha = aCaracas(t.create_date) || "";
    const usuario = t.create_uid ? t.create_uid[1] || "" : "";
    if (campo === "state") {
      eventos.push({
        moveId, fecha, usuarioId: t.create_uid ? t.create_uid[0] : null, usuario,
        de: estadoDeEtiqueta(t.old_value_char), a: estadoDeEtiqueta(t.new_value_char),
      });
      continue;
    }
    const antes = valorTexto(t, "old");
    const despues = valorTexto(t, "new");
    cambios.push({
      moveId, fecha, usuario, campo, etiqueta: ETIQUETA_CAMPO[campo] || campo,
      antes: antes.texto, despues: despues.texto, antesNum: antes.num, despuesNum: despues.num,
    });
  }
  const orden = (a: { fecha: string }, b: { fecha: string }) => a.fecha.localeCompare(b.fecha);
  return { eventos: eventos.sort(orden), cambios: cambios.sort(orden) };
}

/**
 * Documentos de cliente de la sede que en el rango pasaron de publicados a
 * borrador (reabiertos). Devuelve los ids.
 */
export async function idsReabiertos(companyId: number, desde: string, hasta: string): Promise<number[]> {
  const { desdeUtc, hastaUtc } = rangoUtc(desde, hasta);
  const campos = await camposHistorial();
  const stateId = [...campos.entries()].filter(([, n]) => n === "state").map(([id]) => id);
  const t = await leerTodo("mail.tracking.value", [
    ["mail_message_id.model", "=", "account.move"],
    ["field_id", "in", stateId],
    ["create_date", ">=", desdeUtc],
    ["create_date", "<=", hastaUtc],
    ["old_value_char", "in", ["Registrado", "Publicado", "Posted", "Contabilizado"]],
    ["new_value_char", "in", ["Borrador", "Draft"]],
  ], ["mail_message_id"]);
  const msgIds = [...new Set(t.map((x) => x.mail_message_id?.[0]).filter(Boolean))] as number[];
  const mensajes = await porLotes(msgIds, (lote) => leerTodo("mail.message", [["id", "in", lote]], ["res_id"]));
  const posibles = [...new Set(mensajes.map((m) => m.res_id).filter(Boolean))] as number[];
  if (!posibles.length) return [];
  const moves = await porLotes(posibles, (lote) => leerTodo("account.move", [
    ["id", "in", lote], ["company_id", "=", companyId], ["move_type", "in", ["out_invoice", "out_refund"]],
  ], ["id"]));
  return moves.map((m) => m.id as number);
}

/**
 * Posibles facturas de reemplazo de una anulada: mismo cliente, publicadas
 * entre 3 días antes y 15 después de la anulación.
 */
export async function facturasCercanas(companyId: number, clienteIds: number[], desde: string, hasta: string) {
  if (!clienteIds.length) return [];
  const ic = await partnersIntercompania();
  const r = await leerTodo("account.move", [
    ["company_id", "=", companyId], ["move_type", "=", "out_invoice"], ["state", "=", "posted"],
    ["commercial_partner_id", "in", clienteIds], ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
  ], CAMPOS_MOVE);
  return r.map((m) => aDocumento(m, ic));
}

/** Venta (facturas publicadas, sin intercompañía) y NC del rango, agregadas en Odoo. */
export async function totalesSede(companyId: number, desde: string, hasta: string) {
  const ic = await partnersIntercompania();
  const base = [
    ["company_id", "=", companyId], ["state", "=", "posted"],
    ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    ["commercial_partner_id", "not in", [...ic.keys()]],
  ];
  const g = await callOdooRPC<any[]>("account.move", "read_group", [
    [...base, ["move_type", "in", ["out_invoice", "out_refund"]]], ["amount_untaxed_signed:sum"], ["move_type"],
  ], { lazy: false });
  if (!Array.isArray(g)) throw new Error("Odoo no respondió los totales de venta");
  const de = (t: string) => g.find((x) => x.move_type === t);
  return {
    ventas: Number(de("out_invoice")?.amount_untaxed_signed) || 0,
    facturas: Number(de("out_invoice")?.__count) || 0,
    notas: Math.abs(Number(de("out_refund")?.amount_untaxed_signed) || 0),
    cantidadNotas: Number(de("out_refund")?.__count) || 0,
  };
}

/**
 * Serie mensual de ventas y NC (sin intercompañía ni importación masiva)
 * de los `n` meses que terminan en el mes de `hasta`.
 */
export async function serieMensual(companyId: number, hasta: string, n = 12) {
  const ic = await partnersIntercompania();
  const [y, m] = hasta.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - n, 1)).toISOString().slice(0, 10);
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const g = await callOdooRPC<any[]>("account.move", "read_group", [[
    ["company_id", "=", companyId], ["state", "=", "posted"], ["move_type", "in", ["out_invoice", "out_refund"]],
    ["invoice_date", ">=", inicio], ["invoice_date", "<=", fin],
    ["commercial_partner_id", "not in", [...ic.keys()]],
    "|", ["ref", "=", false], ["ref", "not ilike", "masiva"],
  ], ["amount_untaxed_signed:sum"], ["invoice_date:month", "move_type"]], { lazy: false });
  if (!Array.isArray(g)) throw new Error("Odoo no respondió la serie mensual");
  const meses = new Map<string, { ventas: number; notas: number; cantidadNotas: number }>();
  for (const x of g) {
    const desdeMes = String(x.__range?.["invoice_date:month"]?.from || "").slice(0, 7);
    if (!desdeMes) continue;
    const v = meses.get(desdeMes) ?? { ventas: 0, notas: 0, cantidadNotas: 0 };
    if (x.move_type === "out_invoice") v.ventas += Number(x.amount_untaxed_signed) || 0;
    else { v.notas += Math.abs(Number(x.amount_untaxed_signed) || 0); v.cantidadNotas += Number(x.__count) || 0; }
    meses.set(desdeMes, v);
  }
  return Array.from({ length: n }, (_, i) => {
    const mes = new Date(Date.UTC(y, m - n + i, 1)).toISOString().slice(0, 7);
    return { mes, ...(meses.get(mes) ?? { ventas: 0, notas: 0, cantidadNotas: 0 }) };
  });
}

/** Venta del rango por vendedor (facturas publicadas sin intercompañía), por nombre. */
export async function ventasPorVendedor(companyId: number, desde: string, hasta: string): Promise<Map<string, number>> {
  const ic = await partnersIntercompania();
  const g = await callOdooRPC<any[]>("account.move", "read_group", [[
    ["company_id", "=", companyId], ["state", "=", "posted"], ["move_type", "=", "out_invoice"],
    ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    ["commercial_partner_id", "not in", [...ic.keys()]],
  ], ["amount_untaxed_signed:sum"], ["invoice_user_id"]], { lazy: false });
  if (!Array.isArray(g)) throw new Error("Odoo no respondió la venta por vendedor");
  return new Map(g.map((x) => [x.invoice_user_id ? String(x.invoice_user_id[1]) : "(sin vendedor)", Number(x.amount_untaxed_signed) || 0]));
}

/** Nombres de documentos de cliente (publicados o anulados) de la sede en el rango. */
export async function numerosDelRango(companyId: number, desde: string, hasta: string) {
  const r = await leerTodo("account.move", [
    ["company_id", "=", companyId], ["move_type", "in", ["out_invoice", "out_refund"]],
    ["state", "in", ["posted", "cancel"]], ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    ["name", "!=", "/"],
  ], ["id", "name", "move_type", "state"]);
  return r.map((m) => ({ id: m.id as number, nombre: String(m.name || ""), tipo: m.move_type as string, estado: m.state as string }));
}

/** ¿Cuáles de estos números existen en la sede (cualquier fecha, tipo o estado)? */
export async function numerosExistentes(companyId: number, nombres: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < nombres.length; i += 500) {
    const r = await leerTodo("account.move", [["company_id", "=", companyId], ["name", "in", nombres.slice(i, i + 500)]], ["name"]);
    for (const m of r) out.add(String(m.name));
  }
  return out;
}

/** Conteos y sumas de verificación, agregados en el servidor. */
export async function verificacionServidor(companyId: number, desde: string, hasta: string) {
  const { desdeUtc, hastaUtc } = rangoUtc(desde, hasta);
  const porFecha = [
    "|",
    "&", ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    "&", ["invoice_date", "=", false], "&", ["create_date", ">=", desdeUtc], ["create_date", "<=", hastaUtc],
  ];
  const [nNc, gNc, nAnuladas] = await Promise.all([
    callOdooRPC<number>("account.move", "search_count", [[["company_id", "=", companyId], ["move_type", "=", "out_refund"], ["state", "in", ["posted", "draft"]], ...porFecha]]),
    callOdooRPC<any[]>("account.move", "read_group", [[
      ["company_id", "=", companyId], ["move_type", "=", "out_refund"], ["state", "=", "posted"],
      ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    ], ["amount_untaxed_signed:sum"], ["company_id"]], { lazy: false }),
    callOdooRPC<number>("account.move", "search_count", [[
      ["company_id", "=", companyId], ["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "cancel"],
      ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
    ]]),
  ]);
  if (typeof nNc !== "number" || !Array.isArray(gNc) || typeof nAnuladas !== "number") {
    throw new Error("Odoo no respondió una de las consultas de verificación");
  }
  return { nNc, montoNc: Math.abs(Number(gNc[0]?.amount_untaxed_signed) || 0), nAnuladasFecha: nAnuladas };
}
