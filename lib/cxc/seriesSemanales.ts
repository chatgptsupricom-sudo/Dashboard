import { callOdooRPC } from "@/lib/odoo";

/**
 * Series semanales de Cartera Vencida y Recuperación de Vencidos.
 *
 * Las dos necesitan lo mismo: saber cuánto debía cada factura en una fecha
 * PASADA. `amount_residual` solo da el saldo de hoy, así que el saldo en un
 * corte C se reconstruye hacia atrás:
 *
 *   saldo(factura, C) = saldo de hoy + todo lo que se le concilió DESPUÉS de C
 *
 * Con eso:
 *
 *   Cartera vencida al cierre de la semana W
 *     = Σ saldo(f, finW) de las facturas ya vencidas en finW
 *     ÷ Σ saldo(f, finW) de toda la cartera
 *
 *   Recuperación de la semana W
 *     = pagos conciliados dentro de W sobre facturas ya vencidas al iniciar W
 *     ÷ saldo vencido al iniciar W
 *
 * ── Por qué se incluyen facturas ya pagadas ──
 *
 * Una factura que en agosto tenía saldo y hoy está cobrada SÍ formaba parte de
 * la cartera de agosto. Si solo se miraran las facturas que hoy siguen
 * abiertas, la historia saldría subestimada (medido: agosto daría ~33% en vez
 * de ~52-61%). Por eso el universo se arma con las facturas abiertas HOY más
 * las que recibieron alguna conciliación dentro del período.
 *
 * ── Consecuencia sobre el KPI mensual ──
 *
 * Cartera Vencida pasa a calcularse desde `account.move` en vez de
 * `digiflex.cxc.report`, para que el promedio y las celdas semanales salgan de
 * la misma fuente y aten. Eso mueve el valor de hoy ~1,7 puntos (45,0% → 46,7%)
 * y de paso resuelve el desvío de ~3% entre las dos fuentes que quedó
 * documentado en el issue #190. El resto de la pantalla (aging, top deudores,
 * por vendedor, por sede) sigue leyendo el reporte de Odoo, que es donde tiene
 * el detalle por renglón.
 */

export interface SemanaRango {
  inicio: Date;
  fin: Date;
}

export interface SeriesCxC {
  /** % de cartera vencida al cierre de cada semana. */
  carteraVencidaSemana: (string | null)[];
  /** % recuperado en cada semana. */
  recuperacionSemana: (string | null)[];
  /** Cartera vencida de HOY, con el mismo método que las semanas. */
  carteraHoy: { pct: number | null; vencido: number; total: number };
}

const PAGE = 5000;

async function paginar(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields, order: "id asc", limit: PAGE, offset,
    });
    if (!page || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const iso = (d: Date) => d.toISOString().split("T")[0];
const soloFecha = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");

interface Factura {
  /** Fecha de emisión: una factura no existía en un corte anterior a ella. */
  emision: Date | null;
  due: Date | null;
  /** Saldo de hoy, con signo (una nota de crédito abierta resta). */
  residual: number;
  /** Conciliaciones de esta factura dentro del período: [fecha, monto]. */
  pagos: { fecha: Date; monto: number }[];
}

export async function calcularSeriesCxC(
  companyIds: number[],
  semanas: SemanaRango[],
  hoy: Date,
): Promise<SeriesCxC> {
  const vacio: SeriesCxC = {
    carteraVencidaSemana: semanas.map(() => null),
    recuperacionSemana: semanas.map(() => null),
    carteraHoy: { pct: null, vencido: 0, total: 0 },
  };
  if (semanas.length === 0) return vacio;

  const desde = iso(semanas[0].inicio);
  const noInterno: any[] = [["partner_id.name", "not ilike", "supricom"]];

  const [abiertasHoy, conciliaciones] = await Promise.all([
    // Cartera abierta hoy (cualquier vencimiento): la base sobre la que se
    // reconstruye hacia atrás.
    paginar(
      "account.move",
      [
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["amount_residual", "!=", 0],
        ...noInterno,
      ],
      ["id", "move_type", "invoice_date", "invoice_date_due", "amount_residual"],
    ),
    // Conciliaciones del período. Sirven para dos cosas: sumar hacia atrás el
    // saldo de un corte, y ser el numerador de Recuperación.
    paginar(
      "account.partial.reconcile",
      [
        ["debit_move_id.move_id.move_type", "=", "out_invoice"],
        ["debit_move_id.move_id.state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["debit_move_id.move_id.partner_id.name", "not ilike", "supricom"],
        ["max_date", ">=", desde],
      ],
      ["amount", "max_date", "debit_move_id"],
    ),
  ]);

  const facturas = new Map<number, Factura>();
  for (const inv of abiertasHoy as any[]) {
    const signo = inv.move_type === "out_refund" ? -1 : 1;
    facturas.set(inv.id, {
      emision: inv.invoice_date ? soloFecha(inv.invoice_date) : null,
      due: inv.invoice_date_due ? soloFecha(inv.invoice_date_due) : null,
      residual: signo * Math.abs(inv.amount_residual || 0),
      pagos: [],
    });
  }

  // Las conciliaciones apuntan a la LÍNEA por cobrar, no a la factura: hace
  // falta el mapa línea -> factura para colgarlas de su factura.
  const lineIds = Array.from(
    new Set(
      (conciliaciones as any[])
        .map((c) => (Array.isArray(c.debit_move_id) ? c.debit_move_id[0] : c.debit_move_id))
        .filter(Boolean),
    ),
  );
  const facturaDeLinea = new Map<number, number>();
  if (lineIds.length > 0) {
    const lineas = await paginar("account.move.line", [["id", "in", lineIds]], ["id", "move_id"]);
    for (const l of lineas as any[]) {
      const moveId = Array.isArray(l.move_id) ? l.move_id[0] : l.move_id;
      if (moveId) facturaDeLinea.set(l.id, moveId);
    }
  }

  // Facturas que recibieron pagos en el período pero HOY ya están cerradas:
  // no vinieron en `abiertasHoy` y sin ellas la historia sale subestimada.
  const faltantes = Array.from(
    new Set(Array.from(facturaDeLinea.values()).filter((id) => !facturas.has(id))),
  );
  if (faltantes.length > 0) {
    const cerradas = await paginar(
      "account.move",
      [["id", "in", faltantes]],
      ["id", "move_type", "invoice_date", "invoice_date_due", "amount_residual"],
    );
    for (const inv of cerradas as any[]) {
      const signo = inv.move_type === "out_refund" ? -1 : 1;
      facturas.set(inv.id, {
        emision: inv.invoice_date ? soloFecha(inv.invoice_date) : null,
        due: inv.invoice_date_due ? soloFecha(inv.invoice_date_due) : null,
        residual: signo * Math.abs(inv.amount_residual || 0),
        pagos: [],
      });
    }
  }

  for (const c of conciliaciones as any[]) {
    const lineaId = Array.isArray(c.debit_move_id) ? c.debit_move_id[0] : c.debit_move_id;
    const facturaId = facturaDeLinea.get(lineaId);
    const f = facturaId !== undefined ? facturas.get(facturaId) : undefined;
    if (!f || !c.max_date) continue;
    f.pagos.push({ fecha: soloFecha(c.max_date), monto: Number(c.amount || 0) });
  }

  const todas = Array.from(facturas.values());

  /** Saldo de una factura en un corte: el de hoy más lo conciliado después. */
  const saldoEn = (f: Factura, corte: Date) =>
    f.residual + f.pagos.reduce((s, p) => (p.fecha > corte ? s + p.monto : s), 0);

  const carteraEn = (corte: Date) => {
    let total = 0;
    let vencido = 0;
    for (const f of todas) {
      // Una factura emitida después del corte no formaba parte de la cartera
      // en ese momento: sin este filtro, las semanas pasadas salen infladas.
      if (f.emision && f.emision > corte) continue;
      const saldo = saldoEn(f, corte);
      if (Math.abs(saldo) < 0.005) continue;
      total += saldo;
      // Vencida = su fecha de vencimiento ya había pasado EN ESE CORTE. No se
      // puede usar el `days_overdue` del reporte de Odoo, que está calculado
      // contra hoy: una factura que vencía el 10 no estaba vencida el 7.
      if (f.due && f.due < corte) vencido += saldo;
    }
    return { total, vencido, pct: total > 0 ? Math.round((vencido / total) * 10000) / 100 : null };
  };

  const pct1 = (n: number | null) => (n === null ? null : `${Math.round(n)}%`);

  const carteraVencidaSemana = semanas.map((s) =>
    s.inicio > hoy ? null : pct1(carteraEn(s.fin > hoy ? hoy : s.fin).pct),
  );

  const recuperacionSemana = semanas.map((s) => {
    if (s.inicio > hoy) return null;
    let denominador = 0;
    let recuperado = 0;
    for (const f of todas) {
      if (f.emision && f.emision >= s.inicio) continue; // aún no existía
      if (!f.due || f.due >= s.inicio) continue; // no estaba vencida al iniciar la semana
      denominador += f.residual + f.pagos.reduce((a, p) => (p.fecha >= s.inicio ? a + p.monto : a), 0);
      recuperado += f.pagos.reduce(
        (a, p) => (p.fecha >= s.inicio && p.fecha <= s.fin ? a + p.monto : a),
        0,
      );
    }
    if (denominador <= 0) return null;
    return `${Math.round((recuperado / denominador) * 100)}%`;
  });

  const hoyCartera = carteraEn(hoy);
  return {
    carteraVencidaSemana,
    recuperacionSemana,
    carteraHoy: {
      pct: hoyCartera.pct,
      vencido: Math.round(hoyCartera.vencido * 100) / 100,
      total: Math.round(hoyCartera.total * 100) / 100,
    },
  };
}
