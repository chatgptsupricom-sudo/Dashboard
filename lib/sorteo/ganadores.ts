import { randomInt } from "crypto";
import { query } from "@/lib/db";
import type { ConfigSorteo } from "./config";
import { datosSorteo } from "./participantes";

/**
 * Ganadores oficiales del sorteo (tabla `sorteo_ganadores`, ver
 * sql/sorteo_ganadores.sql).
 *
 * El ganador lo elige el servidor, no el navegador: así nadie puede "sacar"
 * un ganador en su pantalla y la lista es la misma para todos. Cada cliente
 * gana una sola vez: el giro sortea entre los clientes con tickets que
 * todavía no ganaron (los premios anulados vuelven a la ruleta).
 *
 * Los ganadores son de un sorteo = sede + mes (`company_id`, `mes`). Si en la
 * configuración se cambia solo el monto por ticket, los premios ya sacados de
 * esa sede y mes siguen valiendo.
 */

export interface Ganador {
  id: number;
  partnerId: number;
  nombre: string;
  compras: number;
  monto: number;
  tickets: number;
  ticketSorteado: number;
  totalTickets: number;
  participantes: number;
  fecha: string;
}

export class SinParticipantesError extends Error {}

const aGanador = (r: any): Ganador => ({
  id: Number(r.id),
  partnerId: Number(r.partner_id),
  nombre: r.nombre,
  compras: Number(r.compras),
  monto: Number(r.monto),
  tickets: Number(r.tickets),
  ticketSorteado: Number(r.ticket_sorteado),
  totalTickets: Number(r.total_tickets),
  participantes: Number(r.participantes),
  fecha: new Date(r.created_at).toISOString(),
});

/**
 * La página pública consulta los ganadores cada pocos segundos: con muchos
 * espectadores a la vez, una caché corta evita una consulta a MySQL por
 * visitante. Se invalida al girar o anular.
 */
const cache = new Map<string, { vence: number; valor: Promise<Ganador[]> }>();

const llaveGanadores = (companyId: number, mes: string) => `${companyId}:${mes}`;

export function listarGanadores(companyId: number, mes: string): Promise<Ganador[]> {
  const llave = llaveGanadores(companyId, mes);
  const x = cache.get(llave);
  if (x && x.vence > Date.now()) return x.valor;
  const valor = (async () => {
    // query() devuelve { rows }, no las filas: leerlo directo daba siempre []
    // (lista vacía y, peor, sin excluir a los que ya ganaron).
    const { rows: filas } = await query(
      `SELECT id, partner_id, nombre, compras, monto, tickets, ticket_sorteado, total_tickets, participantes, created_at
         FROM sorteo_ganadores
        WHERE company_id = ? AND mes = ? AND anulado = 0
        ORDER BY id ASC`,
      [companyId, mes],
    );
    return (Array.isArray(filas) ? filas : []).map(aGanador);
  })();
  const entrada = { vence: Date.now() + 2500, valor };
  cache.set(llave, entrada);
  valor.catch(() => { if (cache.get(llave) === entrada) cache.delete(llave); });
  return valor;
}

// Un giro a la vez: dos operadores girando al mismo tiempo podían sacar al
// mismo cliente dos veces (los dos leen la lista antes de que el otro grabe).
let cola: Promise<unknown> = Promise.resolve();
function enCola<T>(fn: () => Promise<T>): Promise<T> {
  const r = cola.then(fn, fn);
  cola = r.catch(() => undefined);
  return r;
}

export function sortear(sorteo: Pick<ConfigSorteo, "companyId" | "mes" | "montoPorTicket">, quien: string): Promise<Ganador> {
  const { companyId, mes } = sorteo;
  const llave = llaveGanadores(companyId, mes);
  return enCola(async () => {
    cache.delete(llave);
    const [datos, previos] = await Promise.all([datosSorteo(sorteo), listarGanadores(companyId, mes)]);
    const yaGanaron = new Set(previos.map((g) => g.partnerId));
    const pool = datos.clientes.filter((c) => c.tickets > 0 && !yaGanaron.has(c.id));
    const total = pool.reduce((s, c) => s + c.tickets, 0);
    if (!pool.length || total === 0) throw new SinParticipantesError("No quedan clientes con tickets en la ruleta");

    const ticket = randomInt(total);
    let acumulado = 0;
    const ganador = pool.find((c) => (acumulado += c.tickets) > ticket)!;

    const { rows: r } = await query(
      `INSERT INTO sorteo_ganadores
         (company_id, mes, partner_id, nombre, rif, compras, monto, tickets, ticket_sorteado, total_tickets, participantes, sorteado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, mes, ganador.id, ganador.nombre, ganador.rif || null, ganador.compras, ganador.monto, ganador.tickets, ticket, total, pool.length, quien.slice(0, 200)],
    );
    cache.delete(llave);
    return {
      id: Number((r as any)?.insertId),
      partnerId: ganador.id,
      nombre: ganador.nombre,
      compras: ganador.compras,
      monto: ganador.monto,
      tickets: ganador.tickets,
      ticketSorteado: ticket,
      totalTickets: total,
      participantes: pool.length,
      fecha: new Date().toISOString(),
    };
  });
}

/** Anula un premio (id) o todos los del sorteo. La fila queda, con anulado = 1. */
export async function anular(companyId: number, mes: string, quien: string, id?: number) {
  await query(
    `UPDATE sorteo_ganadores SET anulado = 1, anulado_por = ?, anulado_at = NOW()
      WHERE company_id = ? AND mes = ? AND anulado = 0 ${id ? "AND id = ?" : ""}`,
    id ? [quien.slice(0, 200), companyId, mes, id] : [quien.slice(0, 200), companyId, mes],
  );
  cache.delete(llaveGanadores(companyId, mes));
}
