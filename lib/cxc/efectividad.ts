import { callOdooRPC } from "@/lib/odoo";

/**
 * KPI "Efectividad Cobranza" — criterio ESTRICTO (issue #188).
 *
 *   Efectividad = pagos conciliados HASTA EL CIERRE del mes
 *               ÷ exigible de las facturas que vencen en el mes
 *
 * ── Por qué se cambió ──
 *
 * El cálculo anterior derivaba lo cobrado de `amount_total − amount_residual`,
 * y `amount_residual` es el saldo de HOY: un pago que entró dos meses tarde
 * contaba como cobrado en el mes en que la factura vencía. Los meses cerrados
 * salían casi perfectos y el sesgo crecía cuanto más atrás se mirara. Medido
 * con fechas reales de conciliación: mayo mostraba 99,3% cuando dentro del mes
 * se cobró 81,4%; junio 99,2% vs 71,2%. Hasta 28 puntos de diferencia.
 *
 * ── Se muestran las dos ──
 *
 * `value` (estricta) es la que va al semáforo: es comparable entre meses y un
 * mes cerrado ya no cambia nunca. `valueAcumulado` ("cobrado a hoy", el
 * criterio viejo) se conserva como dato secundario, porque sigue siendo útil
 * para saber cuánto de lo que venció en un mes ya entró.
 *
 * Ambos numeradores viven en el mismo universo de conciliaciones: la ÚNICA
 * diferencia entre ellos es la fecha de corte. No se filtran notas de crédito
 * en ninguno de los dos, para que la comparación aísle exactamente ese efecto
 * (el signo de las notas de crédito se arregló aparte, en el issue #187).
 *
 * Durante el mes en curso ambas cifras coinciden casi exactamente, porque
 * todavía no existe "después del cierre": la estricta solo se separa de la
 * acumulada una vez que el mes termina.
 */

export interface EfectividadResultado {
  /** % estricto — el del semáforo. `null` si no hay exigible. */
  value: number | null;
  /** Pagos conciliados hasta el último día del mes. */
  cobradoAlCierre: number;
  /** Exigible del mes (con notas de crédito restando). */
  exigibleMes: number;
  /** % con el criterio viejo, "cobrado a hoy". Dato secundario. */
  valueAcumulado: number | null;
  /** Cobrado a hoy, incluidos pagos posteriores al cierre. */
  cobradoAHoy: number;
  /** Saldo que aún queda de esas facturas. */
  pendiente: number;
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

const PAGE = 5000;

async function paginar(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields,
      order: "id asc",
      limit: PAGE,
      offset,
    });
    if (!page || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
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

  const exigibleMes = facturas.reduce((s, f) => s + f.amountTotal, 0);
  const cobradoAHoy = facturas.reduce((s, f) => s + (f.amountTotal - f.amountResidual), 0);
  const pendiente = facturas.reduce((s, f) => s + f.amountResidual, 0);

  // Conciliaciones sobre las facturas que vencen en el mes, hasta el cierre.
  // El traversal `debit_move_id.move_id.*` funciona en el dominio de Odoo
  // (verificado contra el SQL equivalente: mismos conjuntos exactos).
  const conciliaciones = await paginar(
    "account.partial.reconcile",
    [
      ["debit_move_id.move_id.move_type", "=", "out_invoice"],
      ["debit_move_id.move_id.state", "=", "posted"],
      ["debit_move_id.move_id.invoice_date_due", ">=", desde],
      ["debit_move_id.move_id.invoice_date_due", "<=", hasta],
      ["debit_move_id.move_id.partner_id.name", "not ilike", "supricom"],
      ["company_id", "in", companyIds],
      ["max_date", "<=", hasta],
    ],
    ["amount", "max_date", "debit_move_id"],
  );

  const cobradoAlCierre = conciliaciones.reduce((s, c: any) => s + Number(c.amount || 0), 0);

  // ── Fila semanal, mismo criterio estricto ──
  // Cada conciliación apunta a una LÍNEA (`debit_move_id`), no a la factura,
  // así que hace falta el mapa línea → factura para saber en qué semana vencía
  // lo que se pagó. Solo se leen las líneas por cobrar de esas facturas.
  const semana: (string | null)[] = semanas.map(() => null);
  if (semanas.length > 0 && facturas.length > 0) {
    const idsFacturas = facturas.map((f) => f.id);
    const lineas = await paginar(
      "account.move.line",
      [
        ["move_id", "in", idsFacturas],
        ["account_id.account_type", "=", "asset_receivable"],
      ],
      ["id", "move_id"],
    );
    const facturaDeLinea = new Map<number, number>();
    for (const l of lineas as any[]) {
      const moveId = Array.isArray(l.move_id) ? l.move_id[0] : l.move_id;
      if (moveId) facturaDeLinea.set(l.id, moveId);
    }

    const semanaDeFactura = new Map<number, number>();
    facturas.forEach((f) => {
      if (!f.dueDate) return;
      const w = semanas.findIndex((s) => f.dueDate! >= s.inicio && f.dueDate! <= s.fin);
      if (w >= 0) semanaDeFactura.set(f.id, w);
    });

    const acc = semanas.map(() => ({ exigible: 0, cobrado: 0 }));
    facturas.forEach((f) => {
      const w = semanaDeFactura.get(f.id);
      if (w !== undefined) acc[w].exigible += f.amountTotal;
    });
    for (const c of conciliaciones as any[]) {
      const lineaId = Array.isArray(c.debit_move_id) ? c.debit_move_id[0] : c.debit_move_id;
      const facturaId = facturaDeLinea.get(lineaId);
      if (facturaId === undefined) continue;
      const w = semanaDeFactura.get(facturaId);
      if (w === undefined) continue;
      // Estricto también por semana: solo cuenta si el pago entró antes de que
      // esa semana cerrara, no en cualquier momento del mes.
      const pagoEl = c.max_date ? new Date(c.max_date + "T00:00:00") : null;
      if (!pagoEl || pagoEl > semanas[w].fin) continue;
      acc[w].cobrado += Number(c.amount || 0);
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
    exigibleMes: r2(exigibleMes),
    valueAcumulado: pct(cobradoAHoy),
    cobradoAHoy: r2(cobradoAHoy),
    pendiente: r2(pendiente),
    mesCerrado: hoy > monthEnd,
    semana,
  };
}
