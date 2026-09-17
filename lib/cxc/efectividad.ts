import { obtenerCobros } from "@/lib/cxc/cobros";

/**
 * KPI "Efectividad Cobranza" — criterio ESTRICTO (issue #188).
 *
 *   Efectividad = cobrado HASTA EL CIERRE del mes
 *               ÷ exigible de las facturas que vencen en el mes
 *
 * "Cobrado" sale de lib/cxc/cobros.ts, la misma fuente que "Cobrado" de
 * Contado/Crédito: dinero que entró a banco/caja, fechado por la CONFIRMACIÓN
 * del pago. Así cuadra con esa pantalla:
 *
 *   cobradoEnElMes = tramo "vencen en el período" de Contado/Crédito (sin internos)
 *   cobradoAntes   = lo que esas facturas ya habían cobrado como "adelantado"
 *                    en meses anteriores
 *   cobradoAlCierre = cobradoEnElMes + cobradoAntes
 *
 * Notas de crédito, retenciones y descuentos NO son cobro: bajan el saldo pero
 * no entró dinero. Las notas de crédito del mes ya restan del exigible; el
 * resto queda visible en `ajustes` (exigible − cobrado a hoy − pendiente).
 *
 * ── Por qué estricto ──
 *
 * Derivar lo cobrado de `amount_total − amount_residual` usa el saldo de HOY:
 * un pago que entró dos meses tarde contaba en el mes en que la factura vencía
 * y los meses cerrados salían casi perfectos (mayo 99,3% cuando dentro del mes
 * se cobró 81,4%). `value` (estricta) va al semáforo y un mes cerrado ya no
 * cambia; `valueAcumulado` ("cobrado a hoy") queda como dato secundario.
 */

export interface EfectividadResultado {
  /** % estricto — el del semáforo. `null` si no hay exigible. */
  value: number | null;
  /** Cobrado hasta el último día del mes (= cobradoEnElMes + cobradoAntes). */
  cobradoAlCierre: number;
  /** Cobrado dentro del mes. */
  cobradoEnElMes: number;
  /** Cobrado antes de empezar el mes (pagos adelantados). */
  cobradoAntes: number;
  /** Exigible del mes (con notas de crédito restando). */
  exigibleMes: number;
  /** % "cobrado a hoy". Dato secundario. */
  valueAcumulado: number | null;
  /** Cobrado a hoy, incluidos pagos posteriores al cierre. */
  cobradoAHoy: number;
  /** Saldo que aún queda de esas facturas. */
  pendiente: number;
  /** Retenciones, descuentos y otros ajustes: bajaron el saldo sin ser cobro. */
  ajustes: number;
  /** true cuando el mes ya terminó: recién ahí las dos cifras se separan. */
  mesCerrado: boolean;
  /** Fila semanal con el mismo criterio estricto. */
  semana: (string | null)[];
}

export interface FacturaExigible {
  id: number;
  amountTotal: number;
  amountResidual: number;
  dueDate: Date | null;
}

export interface Semana {
  inicio: Date;
  fin: Date;
}

const iso = (d: Date) => d.toISOString().split("T")[0];

export async function calcularEfectividad(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  facturas: FacturaExigible[],
  semanas: Semana[],
  hoy: Date,
): Promise<EfectividadResultado> {
  const desde = iso(monthStart);
  const hasta = iso(monthEnd);
  const hoyStr = iso(hoy);

  const exigibleMes = facturas.reduce((s, f) => s + f.amountTotal, 0);
  const pendiente = facturas.reduce((s, f) => s + f.amountResidual, 0);

  // Cobros de EXACTAMENTE las facturas del exigible (mismo universo que el
  // denominador), hasta hoy o hasta el cierre si el mes aún no terminó.
  const idsFacturas = facturas.map((f) => f.id);
  const cobros = idsFacturas.length
    ? await obtenerCobros(companyIds, {
        hasta: hoyStr > hasta ? hoyStr : hasta,
        dominioFactura: [["id", "in", idsFacturas]],
      })
    : [];

  let cobradoAntes = 0;
  let cobradoEnElMes = 0;
  let cobradoAHoy = 0;
  for (const c of cobros) {
    cobradoAHoy += c.monto;
    if (c.fecha < desde) cobradoAntes += c.monto;
    else if (c.fecha <= hasta) cobradoEnElMes += c.monto;
  }
  const cobradoAlCierre = cobradoAntes + cobradoEnElMes;

  // ── Fila semanal, mismo criterio estricto ──
  const semana: (string | null)[] = semanas.map(() => null);
  if (semanas.length > 0 && facturas.length > 0) {
    const semanaDeFactura = new Map<number, number>();
    const acc = semanas.map(() => ({ exigible: 0, cobrado: 0 }));
    facturas.forEach((f) => {
      if (!f.dueDate) return;
      const w = semanas.findIndex((s) => f.dueDate! >= s.inicio && f.dueDate! <= s.fin);
      if (w < 0) return;
      semanaDeFactura.set(f.id, w);
      acc[w].exigible += f.amountTotal;
    });
    for (const c of cobros) {
      const w = semanaDeFactura.get(c.facturaId);
      if (w === undefined) continue;
      // Estricto también por semana: solo cuenta si se cobró antes de que esa
      // semana cerrara.
      if (c.fecha > iso(semanas[w].fin)) continue;
      acc[w].cobrado += c.monto;
    }
    acc.forEach((s, i) => {
      if (semanas[i].inicio > hoy) return; // semana futura: nada que medir
      if (s.exigible <= 0) return;
      semana[i] = `${Math.round((s.cobrado / s.exigible) * 100)}%`;
    });
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pct = (num: number) =>
    exigibleMes > 0 ? Math.round((num / exigibleMes) * 10000) / 100 : null;

  return {
    value: pct(cobradoAlCierre),
    cobradoAlCierre: r2(cobradoAlCierre),
    cobradoEnElMes: r2(cobradoEnElMes),
    cobradoAntes: r2(cobradoAntes),
    exigibleMes: r2(exigibleMes),
    valueAcumulado: pct(cobradoAHoy),
    cobradoAHoy: r2(cobradoAHoy),
    pendiente: r2(pendiente),
    ajustes: r2(exigibleMes - cobradoAHoy - pendiente),
    mesCerrado: hoy > monthEnd,
    semana,
  };
}
