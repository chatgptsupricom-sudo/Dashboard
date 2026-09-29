import { callOdooRPC } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { hoyCaracas, isoDia } from "@/lib/metas-marca/servicio";
import { SORTEO } from "./config";

/**
 * Sorteo de clientes de Caracas (SuperAdmin > Ventas > Sorteo Caracas).
 *
 * Participa cada cliente de la sede Caracas (company_id 10) con facturas del
 * mes. Cada $5.000 comprados = 1 ticket, sin redondear hacia arriba
 * ($9.999 = 1 ticket).
 *
 * - Monto = total facturado (`amount_total_signed`, con IVA, en la moneda de la
 *   empresa: USD). Es lo que el cliente ve en su factura. En Caracas casi todo
 *   sale exento, así que con o sin IVA la diferencia es chica.
 * - Las notas de crédito del mes restan (son devoluciones de lo comprado).
 * - Se agrupa por `commercial_partner_id`: las sucursales/contactos hijos
 *   suman a la empresa, no participan por separado.
 * - Se excluye la intercompañía (`lib/intercompania`): Valencia/Caracas se
 *   facturan entre sí y no son clientes.
 */

export { SORTEO };

export interface CompraSorteo {
  id: number;
  numero: string;
  fecha: string;
  tipo: "out_invoice" | "out_refund";
  monto: number;
}

export interface ClienteSorteo {
  id: number;
  nombre: string;
  rif: string;
  /** Facturas del mes (las notas de crédito no cuentan como compra). */
  compras: number;
  notasCredito: number;
  /** Total facturado menos notas de crédito, en USD. */
  monto: number;
  tickets: number;
  /** Lo que le falta para el siguiente ticket. */
  faltaSiguiente: number;
  documentos: CompraSorteo[];
}

export interface DatosSorteo {
  mes: string;
  desde: string;
  hasta: string;
  sede: string;
  montoPorTicket: number;
  /** false mientras el mes siga abierto: los tickets todavía pueden cambiar. */
  mesCerrado: boolean;
  clientes: ClienteSorteo[];
  totales: { clientes: number; participantes: number; tickets: number; monto: number; compras: number };
  leido: string;
}

function rangoMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return { desde: isoDia(new Date(y, m - 1, 1)), hasta: isoDia(new Date(y, m, 0)) };
}

/** Cálculo en centavos para que $10.000,00 no quede en 1,99999 tickets. */
export function ticketsDe(monto: number, porTicket = SORTEO.montoPorTicket) {
  const centavos = Math.round(monto * 100);
  const base = porTicket * 100;
  if (centavos <= 0) return { tickets: 0, faltaSiguiente: porTicket };
  const tickets = Math.floor(centavos / base);
  return { tickets, faltaSiguiente: (base - (centavos % base)) / 100 };
}

async function leerTodo(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const pagina = 2000;
  const todo: any[] = [];
  for (let offset = 0; ; offset += pagina) {
    const r = await callOdooRPC<any[]>(model, "search_read", [domain], { fields, limit: pagina, offset, order: "id asc" });
    if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}.search_read`);
    todo.push(...r);
    if (r.length < pagina) return todo;
  }
}

async function leer(mes: string): Promise<DatosSorteo> {
  const { desde, hasta } = rangoMes(mes);
  const ic = await partnersIntercompania();
  const moves = await leerTodo(
    "account.move",
    [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", SORTEO.companyId],
      ["invoice_date", ">=", desde],
      ["invoice_date", "<=", hasta],
      ["commercial_partner_id", "not in", [...ic.keys()]],
    ],
    ["name", "invoice_date", "move_type", "commercial_partner_id", "amount_total_signed"],
  );

  const porCliente = new Map<number, ClienteSorteo>();
  for (const m of moves) {
    const partner = m.commercial_partner_id;
    if (!partner) continue;
    let c = porCliente.get(partner[0]);
    if (!c) {
      c = { id: partner[0], nombre: partner[1] || `Cliente ${partner[0]}`, rif: "", compras: 0, notasCredito: 0, monto: 0, tickets: 0, faltaSiguiente: 0, documentos: [] };
      porCliente.set(partner[0], c);
    }
    const monto = Number(m.amount_total_signed) || 0;
    c.monto += monto;
    if (m.move_type === "out_refund") c.notasCredito++;
    else c.compras++;
    c.documentos.push({ id: m.id, numero: m.name, fecha: m.invoice_date, tipo: m.move_type, monto });
  }

  const ids = [...porCliente.keys()];
  if (ids.length) {
    const partners = await callOdooRPC<any[]>("res.partner", "search_read", [[["id", "in", ids]]], {
      fields: ["id", "vat"], limit: 0, context: { active_test: false },
    });
    for (const p of Array.isArray(partners) ? partners : []) {
      const c = porCliente.get(p.id);
      if (c && p.vat) c.rif = p.vat;
    }
  }

  const clientes = [...porCliente.values()]
    .map((c) => {
      const monto = Math.round(c.monto * 100) / 100;
      return {
        ...c,
        monto,
        ...ticketsDe(monto),
        documentos: c.documentos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero)),
      };
    })
    .sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre));

  const participantes = clientes.filter((c) => c.tickets > 0);
  return {
    mes,
    desde,
    hasta,
    sede: SORTEO.sede,
    montoPorTicket: SORTEO.montoPorTicket,
    mesCerrado: isoDia(hoyCaracas()) > hasta,
    clientes,
    totales: {
      clientes: clientes.length,
      participantes: participantes.length,
      tickets: participantes.reduce((s, c) => s + c.tickets, 0),
      monto: Math.round(clientes.reduce((s, c) => s + c.monto, 0) * 100) / 100,
      compras: clientes.reduce((s, c) => s + c.compras, 0),
    },
    leido: new Date().toISOString(),
  };
}

/** Caché de promesas de 5 min: el sorteo se proyecta en vivo y se recarga seguido. */
const cache = new Map<string, { vence: number; valor: Promise<DatosSorteo> }>();

export function datosSorteo(mes: string, refrescar = false): Promise<DatosSorteo> {
  const x = cache.get(mes);
  if (!refrescar && x && x.vence > Date.now()) return x.valor;
  const valor = leer(mes);
  const entrada = { vence: Date.now() + 5 * 60 * 1000, valor };
  cache.set(mes, entrada);
  valor.catch(() => { if (cache.get(mes) === entrada) cache.delete(mes); });
  return valor;
}

/**
 * Versión para la página pública: nombre, compras, monto y tickets. Sin RIF
 * ni el detalle de facturas, que quedan solo en la vista del SuperAdmin.
 */
export function datosPublicos(d: DatosSorteo): DatosSorteo {
  return { ...d, clientes: d.clientes.map((c) => ({ ...c, rif: "", documentos: [] })) };
}
