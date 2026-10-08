import { CORTE_ODOO } from "@/lib/smartbit";
import { diasEntre, hoyCaracas, sumarDias } from "@/lib/compras/datosOdoo";

/**
 * Período de Stock por marca.
 *
 * - "mes": un mes calendario. Si está en curso, el corte es hoy.
 * - "30" / "90": los últimos N días terminando hoy.
 *
 * Nada empieza antes de `CORTE_ODOO` (abril 2026): antes se facturaba en
 * Smartbit y el inventario se cargó en Odoo ese mes, así que ni la venta ni
 * el stock histórico salen de Odoo.
 */

export type ModoPeriodo = "mes" | "30" | "90";

export interface Periodo {
  modo: ModoPeriodo;
  /** Mes elegido (solo modo "mes"). */
  mes: string | null;
  desde: string;
  hasta: string;
  /** Día cuyo cierre se toma como stock: `hasta`, o hoy si el período sigue abierto. */
  corte: string;
  /** Días de calendario de `desde` a `corte`, inclusive. */
  dias: number;
  enCurso: boolean;
  /** Mismo largo, inmediatamente antes (para comparar). null si cae antes de Odoo. */
  anterior: { desde: string; corte: string } | null;
  /** Primer mes elegible. */
  minMes: string;
  /** El inicio se recortó a CORTE_ODOO. */
  recortado: boolean;
}

export const MIN_MES = CORTE_ODOO.slice(0, 7);
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export const mesDeDia = (dia: string) => dia.slice(0, 7);

export function finDeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Meses desde `desde` hasta `hasta` (YYYY-MM), inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let m = desde; m <= hasta; m = moverMes(m, 1)) out.push(m);
  return out;
}

export function periodoDe(modo: string | null, mes: string | null, hoy = hoyCaracas()): Periodo {
  const mesHoy = mesDeDia(hoy);
  if (modo === "30" || modo === "90") {
    const n = Number(modo);
    const ideal = sumarDias(hoy, -(n - 1));
    const desde = ideal < CORTE_ODOO ? CORTE_ODOO : ideal;
    const dias = diasEntre(desde, hoy) + 1;
    const desdeA = sumarDias(desde, -dias);
    return {
      modo, mes: null, desde, hasta: hoy, corte: hoy, dias, enCurso: true,
      anterior: desdeA >= CORTE_ODOO ? { desde: desdeA, corte: sumarDias(desde, -1) } : null,
      minMes: MIN_MES, recortado: desde !== ideal,
    };
  }

  let m = mes && MES.test(mes) ? mes : mesHoy;
  if (m > mesHoy) m = mesHoy;
  if (m < MIN_MES) m = MIN_MES;
  const desde = `${m}-01`;
  const hasta = finDeMes(m);
  const corte = hasta < hoy ? hasta : hoy;
  const dias = diasEntre(desde, corte) + 1;
  // Un mes cerrado se compara con el mes anterior completo; uno en curso,
  // con el mismo tramo del anterior (del 1 al mismo día), no con el mes entero.
  const previo = moverMes(m, -1);
  let anterior: Periodo["anterior"] = null;
  if (previo >= MIN_MES) {
    const finPrevio = finDeMes(previo);
    const dia = corte === hasta ? finPrevio : sumarDias(`${previo}-01`, dias - 1);
    anterior = { desde: `${previo}-01`, corte: dia < finPrevio ? dia : finPrevio };
  }
  return {
    modo: "mes", mes: m, desde, hasta, corte, dias, enCurso: corte === hoy,
    anterior, minMes: MIN_MES, recortado: false,
  };
}
