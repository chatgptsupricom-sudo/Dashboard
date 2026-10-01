import { callOdooRPC } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { hoyCaracas, isoDia } from "@/lib/metas-marca/servicio";
import { claveSorteo, nombreSedeSorteo, type ConfigSorteo } from "./config";

/**
 * Participantes del sorteo de clientes (SuperAdmin › Ventas › Sorteo de
 * clientes). La sede, el mes y el monto por ticket salen de la configuración
 * activa (lib/sorteo/configuracion.ts).
 *
 * Participa cada cliente de la sede con facturas del mes. Cada
 * `montoPorTicket` comprado = 1 ticket, sin redondear hacia arriba (con
 * $5.000: $9.999 = 1 ticket).
 *
 * - Monto = total facturado (`amount_total_signed`, con IVA, en la moneda de la
 *   empresa: USD en las tres sedes). Es lo que el cliente ve en su factura.
 * - Las notas de crédito del mes restan (son devoluciones de lo comprado).
 * - Se agrupa por `commercial_partner_id`: las sucursales/contactos hijos
 *   suman a la empresa, no participan por separado.
 * - Se excluye la intercompañía (`lib/intercompania`): Valencia/Caracas se
 *   facturan entre sí y no son clientes.
 */

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
export function ticketsDe(monto: number, porTicket: number) {
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

type Sorteo = Pick<ConfigSorteo, "companyId" | "mes" | "montoPorTicket">;

async function leer({ companyId, mes, montoPorTicket }: Sorteo): Promise<DatosSorteo> {
  const { desde, hasta } = rangoMes(mes);
  const ic = await partnersIntercompania();
  const moves = await leerTodo(
    "account.move",
    [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
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
        ...ticketsDe(monto, montoPorTicket),
        documentos: c.documentos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero)),
      };
    })
    .sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre));

  const participantes = clientes.filter((c) => c.tickets > 0);
  return {
    mes,
    desde,
    hasta,
    sede: nombreSedeSorteo(companyId),
    montoPorTicket,
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

export function datosSorteo(sorteo: Sorteo, refrescar = false): Promise<DatosSorteo> {
  const llave = claveSorteo(sorteo);
  const x = cache.get(llave);
  if (!refrescar && x && x.vence > Date.now()) return x.valor;
  const valor = leer(sorteo);
  const entrada = { vence: Date.now() + 5 * 60 * 1000, valor };
  cache.set(llave, entrada);
  valor.catch(() => { if (cache.get(llave) === entrada) cache.delete(llave); });
  return valor;
}

/**
 * Lo que ve la landing pública. La ruleta es anónima («? ? ?») y no hay tabla
 * de participantes, así que por cliente solo va el id (para ubicar al ganador
 * en la ruleta) y sus tickets: ni nombre, ni RIF, ni compras, ni montos. Si
 * mandara los nombres, cualquiera los leería de la API y el anonimato sería
 * de adorno. El nombre se conoce recién cuando gana (lista de ganadores).
 */
export interface SorteoPublico {
  sorteo: {
    clave: string;
    titulo: string | null;
    sede: string;
    mes: string;
    desde: string;
    hasta: string;
    montoPorTicket: number;
    mesCerrado: boolean;
  };
  participantes: { id: number; tickets: number }[];
  totales: { clientes: number; participantes: number; tickets: number };
  leido: string;
}

export function datosPublicos(d: DatosSorteo, config: ConfigSorteo): SorteoPublico {
  return {
    sorteo: {
      clave: claveSorteo(config),
      titulo: config.titulo,
      sede: d.sede,
      mes: d.mes,
      desde: d.desde,
      hasta: d.hasta,
      montoPorTicket: d.montoPorTicket,
      mesCerrado: d.mesCerrado,
    },
    participantes: d.clientes.filter((c) => c.tickets > 0).map((c) => ({ id: c.id, tickets: c.tickets })),
    totales: { clientes: d.totales.clientes, participantes: d.totales.participantes, tickets: d.totales.tickets },
    leido: d.leido,
  };
}
