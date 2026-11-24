import { query } from "@/lib/db";
import { calcularSobregiro } from "@/lib/cxc/sobregiro";
import { FOTOS, asegurarTablas } from "@/lib/cxc/historialCredito";
import { partnersIntercompania } from "@/lib/intercompania";
import { armarHistorico, type ClienteCupo, type FilaHistorico } from "@/lib/cupo-credito/tipos";

/**
 * Datos de Cupo de crédito (lib/cupo-credito/tipos.ts).
 *
 * Hoy: el cálculo de Sobregiro de cada sede (límite de Odoo contra el saldo
 * por cobrar en esa sede), guardado 5 minutos en memoria por sede: lo abren
 * vendedores y gerentes y cada uno filtra su parte. Es una vista comercial:
 * las empresas del grupo (intercompañía) quedan fuera para todos los roles.
 *
 * Histórico: las fotos diarias de `cxc_credito_fotos` (el cron las guarda
 * cada hora, la última del día gana). Las fotos anteriores a nov-2026 no
 * tienen el id del vendedor: se cruzan por nombre (`unificarVendedores`).
 */

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<number, { vence: number; valor: Promise<ClienteCupo[]> }>();

function sobregiroDeSede(cid: number, refrescar: boolean): Promise<ClienteCupo[]> {
  const c = cache.get(cid);
  if (!refrescar && c && c.vence > Date.now()) return c.valor;
  const valor = calcularSobregiro([cid]).then((r) => r.clientes as ClienteCupo[]);
  const entrada = { vence: Date.now() + CACHE_MS, valor };
  cache.set(cid, entrada);
  valor.catch(() => { if (cache.get(cid) === entrada) cache.delete(cid); });
  return valor;
}

async function idsIntercompania(): Promise<Set<number>> {
  try {
    return new Set((await partnersIntercompania()).keys());
  } catch (e: any) {
    console.error("[cupo-credito] intercompañía:", e?.message);
    return new Set();
  }
}

export async function cupoHoy(sedes: number[], opciones: { uid?: number | null; refrescar?: boolean } = {}): Promise<ClienteCupo[]> {
  const [porSede, ic] = await Promise.all([
    Promise.all(sedes.map((cid) => sobregiroDeSede(cid, !!opciones.refrescar))),
    idsIntercompania(),
  ]);
  return porSede.flat().filter((c) => !ic.has(c.partnerId) && (!opciones.uid || c.vendedorId === opciones.uid));
}

/** Primer día con foto (desde cuándo hay histórico) de esas sedes. */
async function midiendoDesde(sedes: number[]): Promise<string | null> {
  const { rows } = await query(
    `SELECT DATE_FORMAT(MIN(fecha), '%Y-%m-%d') AS desde FROM ${FOTOS} WHERE company_id IN (${sedes.map(() => "?").join(", ")})`,
    sedes,
  );
  return (rows as any[])[0]?.desde || null;
}

/**
 * Serie diaria del consumo de cupo entre `desde` y `hasta` (incluidas), total
 * y por vendedor. Con `uid` (un vendedor) solo su cartera: las fotos viejas
 * sin id se toman por el nombre que ese vendedor tiene en Odoo (`nombreVendedor`).
 */
export async function historicoCupo(
  sedes: number[],
  desde: string,
  hasta: string,
  filtro: { uid?: number | null; nombreVendedor?: string | null } = {},
) {
  await asegurarTablas();
  const ic = [...(await idsIntercompania())];
  const params: any[] = [...sedes, desde, hasta];
  let donde = `company_id IN (${sedes.map(() => "?").join(", ")}) AND fecha BETWEEN ? AND ?`;
  if (ic.length) {
    donde += ` AND partner_id NOT IN (${ic.map(() => "?").join(", ")})`;
    params.push(...ic);
  }
  if (filtro.uid) {
    donde += filtro.nombreVendedor ? " AND (vendedor_id = ? OR (vendedor_id IS NULL AND vendedor = ?))" : " AND vendedor_id = ?";
    params.push(filtro.uid);
    if (filtro.nombreVendedor) params.push(filtro.nombreVendedor);
  }
  const { rows } = await query(
    `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, vendedor_id, vendedor,
            SUM(IF(limite > 0, limite, 0)) AS limite,
            SUM(IF(limite > 0, GREATEST(usado, 0), 0)) AS usado,
            SUM(vencido) AS vencido,
            SUM(limite > 0) AS con_limite,
            SUM(estado = 'excedido') AS excedidos,
            SUM(estado = 'al_limite') AS al_limite,
            SUM(IF(estado = 'excedido', usado - limite, 0)) AS monto_excedido
       FROM ${FOTOS}
      WHERE ${donde}
      GROUP BY fecha, vendedor_id, vendedor
      ORDER BY fecha`,
    params,
  );
  const filas: FilaHistorico[] = (rows as any[]).map((r) => ({
    fecha: r.fecha,
    vendedorId: r.vendedor_id == null ? null : Number(r.vendedor_id),
    vendedor: r.vendedor || "Sin vendedor",
    limite: Number(r.limite) || 0,
    usado: Number(r.usado) || 0,
    vencido: Number(r.vencido) || 0,
    conLimite: Number(r.con_limite) || 0,
    excedidos: Number(r.excedidos) || 0,
    alLimite: Number(r.al_limite) || 0,
    montoExcedido: Number(r.monto_excedido) || 0,
  }));
  return { midiendoDesde: await midiendoDesde(sedes), ...armarHistorico(filas) };
}
