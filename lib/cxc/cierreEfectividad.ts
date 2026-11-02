import { query } from "@/lib/db";
import { terminosSinIC } from "@/lib/intercompania";
import type { DetalleEfectividad } from "@/lib/cxc/efectividad";

/**
 * Foto de cierre de la Efectividad de Cobranza.
 *
 * Con el mes ya cerrado la efectividad se recalculaba con los datos de Odoo de hoy, así
 * que el exigible de un mes viejo se podía seguir moviendo: un pago o una nota
 * de crédito cargados después con fecha de ese mes, un vencimiento o un plazo
 * corregidos, una factura anulada. Para que un mes cerrado valga siempre lo
 * mismo se guarda su resultado (tarjeta, fila semanal, por sede y el detalle
 * por cliente del modal) una sola vez y de ahí en adelante se lee la foto.
 *
 * Cuándo: el día 1 del mes siguiente a las 23:00 (cron de server.js →
 * /api/cron/cierre-efectividad-cxc), así CxC tiene el día 1 para terminar de
 * cargar lo del mes. Si el cron no corrió, la primera vez que alguien abra el
 * mes desde el día 2 (`desdeFotoSinCron`) se toma ahí.
 * El primero que guarda gana (INSERT IGNORE); `forzar` la reemplaza.
 *
 * Una foto por juego de sedes (9, 10, 7 o la consolidada 7,9,10) y aparte la
 * de Inteligencia de Negocio, que no ve intercompañía (lib/intercompania.ts).
 */

const TABLA = "cxc_efectividad_cierres";
let tablaLista = false;

async function asegurarTabla() {
  if (tablaLista) return;
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLA} (
      clave VARCHAR(40) NOT NULL,
      mes CHAR(7) NOT NULL,
      datos LONGTEXT NOT NULL,
      creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (clave, mes)
    )`,
  );
  tablaLista = true;
}

/** Juego de sedes + si esta request excluye intercompañía (BI). */
export function claveCierre(companyIds: number[]): string {
  const sedes = [...companyIds].sort((a, b) => a - b).join(",");
  return terminosSinIC().length > 0 ? `${sedes}|sinIC` : sedes;
}

/**
 * Desde cuándo se puede tomar la foto sin el cron: día 2 a las 6:00 hora del
 * servidor. Con el servidor en UTC eso es la madrugada del día 2 en Caracas,
 * después del cron del día 1 a las 23:00.
 */
const desdeFotoSinCron = (monthEnd: Date) =>
  new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 2, 6);

export interface EfectividadDelMes {
  detalle: DetalleEfectividad;
  /** Fecha (ISO) en que se guardó la foto; null = calculado en vivo. */
  cierreGuardado: string | null;
}

async function leer(clave: string, mes: string): Promise<EfectividadDelMes | null> {
  await asegurarTabla();
  const { rows } = await query(`SELECT datos, creado_at FROM ${TABLA} WHERE clave = ? AND mes = ?`, [clave, mes]);
  const fila = (rows as any[])[0];
  if (!fila) return null;
  return { detalle: JSON.parse(fila.datos), cierreGuardado: new Date(fila.creado_at).toISOString() };
}

/** Guarda la foto. Sin `forzar`, si ya había una se queda la que estaba. */
export async function guardarCierre(clave: string, mes: string, detalle: DetalleEfectividad, forzar = false): Promise<boolean> {
  await asegurarTabla();
  const sql = forzar
    ? `REPLACE INTO ${TABLA} (clave, mes, datos) VALUES (?, ?, ?)`
    : `INSERT IGNORE INTO ${TABLA} (clave, mes, datos) VALUES (?, ?, ?)`;
  const { rows } = await query(sql, [clave, mes, JSON.stringify(detalle)]);
  return Number((rows as any).affectedRows || 0) > 0;
}

/**
 * Efectividad del mes `mes` (YYYY-MM): la foto si el mes ya cerró y existe; si
 * no, `calcular()` en vivo, y desde el día 2 del mes siguiente la deja guardada.
 * Si la MySQL falla se calcula en vivo (el KPI no se cae por la foto).
 */
export async function efectividadDelMes(
  companyIds: number[],
  mes: string,
  monthEnd: Date,
  hoy: Date,
  calcular: () => Promise<DetalleEfectividad>,
): Promise<EfectividadDelMes> {
  const fin = new Date(monthEnd);
  fin.setHours(23, 59, 59, 999);
  if (hoy <= fin) return { detalle: await calcular(), cierreGuardado: null };

  const clave = claveCierre(companyIds);
  try {
    const foto = await leer(clave, mes);
    if (foto) return foto;
  } catch (e: any) {
    console.error("[cierre-efectividad] no se pudo leer la foto:", e?.message);
    return { detalle: await calcular(), cierreGuardado: null };
  }

  const detalle = await calcular();
  if (new Date() < desdeFotoSinCron(monthEnd)) return { detalle, cierreGuardado: null };
  try {
    await guardarCierre(clave, mes, detalle);
    return (await leer(clave, mes)) ?? { detalle, cierreGuardado: null };
  } catch (e: any) {
    console.error("[cierre-efectividad] no se pudo guardar la foto:", e?.message);
    return { detalle, cierreGuardado: null };
  }
}
