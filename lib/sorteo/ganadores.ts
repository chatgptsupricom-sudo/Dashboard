import { randomInt } from "crypto";
import { query } from "@/lib/db";
import { SORTEO } from "./config";
import { datosSorteo } from "./participantes";

/**
 * Ganadores oficiales del sorteo (tabla `sorteo_ganadores`, ver
 * sql/sorteo_ganadores.sql).
 *
 * El ganador lo elige el servidor, no el navegador: así nadie puede "sacar"
 * un ganador en su pantalla y la lista es la misma para todos. Cada cliente
 * gana una sola vez: el giro sortea entre los clientes con tickets que
 * todavía no ganaron (los premios anulados vuelven a la ruleta).
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

export function listarGanadores(mes: string): Promise<Ganador[]> {
  const x = cache.get(mes);
  if (x && x.vence > Date.now()) return x.valor;
  const valor = (async () => {
    const filas: any = await query(
      `SELECT id, partner_id, nombre, compras, monto, tickets, ticket_sorteado, total_tickets, participantes, created_at
         FROM sorteo_ganadores
        WHERE company_id = ? AND mes = ? AND anulado = 0
        ORDER BY id ASC`,
      [SORTEO.companyId, mes],
    );
    return (Array.isArray(filas) ? filas : []).map(aGanador);
  })();
  const entrada = { vence: Date.now() + 2500, valor };
  cache.set(mes, entrada);
  valor.catch(() => { if (cache.get(mes) === entrada) cache.delete(mes); });
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

export function sortear(mes: string, quien: string): Promise<Ganador> {
  return enCola(async () => {
    cache.delete(mes);
    const [datos, previos] = await Promise.all([datosSorteo(mes), listarGanadores(mes)]);
    const yaGanaron = new Set(previos.map((g) => g.partnerId));
    const pool = datos.clientes.filter((c) => c.tickets > 0 && !yaGanaron.has(c.id));
    const total = pool.reduce((s, c) => s + c.tickets, 0);
    if (!pool.length || total === 0) throw new SinParticipantesError("No quedan clientes con tickets en la ruleta");

    const ticket = randomInt(total);
    let acumulado = 0;
    const ganador = pool.find((c) => (acumulado += c.tickets) > ticket)!;

    const r: any = await query(
      `INSERT INTO sorteo_ganadores
         (company_id, mes, partner_id, nombre, rif, compras, monto, tickets, ticket_sorteado, total_tickets, participantes, sorteado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [SORTEO.companyId, mes, ganador.id, ganador.nombre, ganador.rif || null, ganador.compras, ganador.monto, ganador.tickets, ticket, total, pool.length, quien.slice(0, 200)],
    );
    cache.delete(mes);
    return {
      id: Number(r?.insertId),
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

/** Anula un premio (id) o todos los del mes. La fila queda, con anulado = 1. */
export async function anular(mes: string, quien: string, id?: number) {
  await query(
    `UPDATE sorteo_ganadores SET anulado = 1, anulado_por = ?, anulado_at = NOW()
      WHERE company_id = ? AND mes = ? AND anulado = 0 ${id ? "AND id = ?" : ""}`,
    id ? [quien.slice(0, 200), SORTEO.companyId, mes, id] : [quien.slice(0, 200), SORTEO.companyId, mes],
  );
  cache.delete(mes);
}
