import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { calcularEfectividad } from "@/lib/cxc/efectividad";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { calcularRecuperacion } from "@/lib/cxc/recuperacion";
import { obtenerSemanasDelMes, obtenerSemanasDelRango } from "@/lib/feriados";
import { ensureKpiTargetsPeso } from "@/lib/kpiTargets";
import { NextRequest, NextResponse } from "next/server";

// La lectura de `digiflex.cxc.report` es paginada y puede traer miles de
// renglones: sin esto el request se cortaba a los ~15s y el grupo de CxC del
// Stoplight quedaba vacío.
export const runtime = "nodejs";
export const maxDuration = 60;

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

// La consulta a `digiflex.cxc.report` es cara (paginado de miles de renglones,
// varios segundos). El Stoplight la pide cada vez que se abre y varios roles la
// comparten con los mismos parámetros, así que se cachea en memoria por 10 min
// — mismo patrón que app/api/compras/mayor_rotacion/route.ts.
const cxcCache = new Map<string, { data: any; ts: number }>();
const CXC_CACHE_TTL = 10 * 60 * 1000;

const COMPANY_NAMES: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const cacheKey = JSON.stringify([empresa, userCidsParam, monthParam, yearParam, startDateParam, endDateParam]);
    const cached = cxcCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CXC_CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    let monthStart: Date, monthEnd: Date, currentYear: number, currentMonth: number;

    if (startDateParam && endDateParam) {
      monthStart = new Date(startDateParam + "T00:00:00");
      monthEnd = new Date(endDateParam + "T23:59:59");
      currentYear = monthStart.getFullYear();
      currentMonth = monthStart.getMonth();
    } else {
      currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
      currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
      monthStart = getMonthStart(currentYear, currentMonth);
      monthEnd = new Date(currentYear, currentMonth + 1, 0);
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const mes = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    // company_id para leer metas/pesos de `kpi_targets` (tabla por sede). Con
    // filtro de empresa o de usuario coincide con `companyIds[0]`; en la
    // vista consolidada (sin filtro, `companyIds = [7,9,10]`) se usa Valencia
    // (9) como sede de referencia explícita -- antes se tomaba
    // `companyIds[0] || 9`, que por el orden del array quedaba en Panamá (7)
    // sin que nadie lo hubiera decidido así (issue #190).
    const companyId = empresa && COMPANY_MAP[empresa]
      ? COMPANY_MAP[empresa]
      : userCidsParam
        ? parseInt(userCidsParam, 10)
        : 9;

    await ensureKpiTargetsPeso();
    const cxcMetasResult = await query(
      "SELECT kpi_key, meta_mensual, peso FROM kpi_targets WHERE company_id = ? AND mes = ? AND kpi_key IN ('efectividad_cobranza', 'cartera_vencida', 'recuperacion_vencidos', 'dso')",
      [companyId, mes]
    );
    const cxcMetas: Record<string, number> = {};
    const cxcPesos: Record<string, number> = {};
    (cxcMetasResult.rows as any[]).forEach((r: any) => {
      cxcMetas[r.kpi_key] = Number(r.meta_mensual);
      const p = Number(r.peso);
      if (Number.isFinite(p) && p > 0) cxcPesos[r.kpi_key] = p;
    });

    // ═══════════════════════════════════════════════════════════════════
    // FUENTE 1: digiflex.cxc.report — Aging, balances, top deudores
    // ═══════════════════════════════════════════════════════════════════
    const reportDomain: any[] = [
      ["company_id", "in", companyIds],
    ];

    const reportData = await fetchPaginated(
      "digiflex.cxc.report",
      reportDomain,
      [
        "id", "move_id", "partner_id", "partner_name",
        "user_id", "user_name", "company_id", "company_name",
        "invoice_date", "date_maturity", "days_overdue",
        "amount_residual", "amount_current",
        "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus",
        "transaction_type", "document_number",
      ],
    );

    // Filtrar renglones con saldo abierto (excluye asientos internos de Supricom).
    // Incluye notas de credito abiertas: en este modelo traen amount_residual
    // NEGATIVO (verificado contra Odoo real, ej. RNC/2026/00650 de GRUPO CMW,
    // S.A. = -545), asi que sumarlas con signo resta correctamente del saldo
    // del cliente en vez de excluirlas o contarlas como deuda.
    const reportInvoices = reportData.filter((r: any) =>
      r.amount_residual !== 0 && !((r.partner_name || "").toLowerCase().includes("supricom"))
    );

    // Aging distribution (rangos del reporte Odoo: corriente, 1-30, 31-60, 61-90, 91+)
    const agingDistribution: Record<string, number> = {
      "corriente": 0,
      "1-30": 0,
      "31-60": 0,
      "61-90": 0,
      "91+": 0,
    };

    let totalReceivable = 0;
    let totalOverdue = 0;

    reportInvoices.forEach((r: any) => {
      // Con signo: una nota de credito abierta (residual negativo) debe
      // restar del total, no sumarse en valor absoluto. Las bandas de aging
      // (amount_current, amount_1_30, ...) vienen con el mismo signo que
      // amount_residual (verificado: para estas filas su suma da exactamente
      // amount_residual), asi que se agregan igual sin Math.abs para que las
      // bandas sigan sumando el mismo total.
      const residual = r.amount_residual || 0;
      totalReceivable += residual;
      if (r.days_overdue > 0) totalOverdue += residual;

      agingDistribution["corriente"] += r.amount_current || 0;
      agingDistribution["1-30"] += r.amount_1_30 || 0;
      agingDistribution["31-60"] += r.amount_31_60 || 0;
      agingDistribution["61-90"] += r.amount_61_90 || 0;
      agingDistribution["91+"] += r.amount_91_plus || 0;
    });

    const carteraVencidaPct = totalReceivable > 0
      ? Math.round((totalOverdue / totalReceivable) * 10000) / 100
      : null;

    // Top deudores
    const topDebtors = (() => {
      const byClient: Record<number, { name: string; total: number; overdue: number; oldest: number; count: number }> = {};
      reportInvoices.forEach((r: any) => {
        const pid = r.partner_id?.[0] || 0;
        if (!pid) return;
        if (!byClient[pid]) {
          byClient[pid] = { name: r.partner_name || r.partner_id?.[1] || "Sin cliente", total: 0, overdue: 0, oldest: 0, count: 0 };
        }
        const residual = r.amount_residual || 0;
        byClient[pid].total += residual;
        byClient[pid].count++;
        if (r.days_overdue > 0) byClient[pid].overdue += residual;
        if ((r.days_overdue || 0) > byClient[pid].oldest) byClient[pid].oldest = r.days_overdue;
      });
      return Object.entries(byClient)
        .map(([id, data]) => ({ partnerId: parseInt(id), ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    })();

    // Por vendedor
    const bySalesperson = (() => {
      const byUser: Record<number, { name: string; total: number; overdue: number; count: number }> = {};
      reportInvoices.forEach((r: any) => {
        const uid = r.user_id?.[0] || 0;
        if (!uid) return;
        if (!byUser[uid]) {
          byUser[uid] = { name: r.user_name || r.user_id?.[1] || "Sin asignar", total: 0, overdue: 0, count: 0 };
        }
        const residual = r.amount_residual || 0;
        byUser[uid].total += residual;
        byUser[uid].count++;
        if (r.days_overdue > 0) byUser[uid].overdue += residual;
      });
      return Object.entries(byUser)
        .map(([id, data]) => ({ userId: parseInt(id), ...data }))
        .sort((a, b) => b.total - a.total);
    })();

    // Por compañía
    const byCompany = companyIds.map((cid) => {
      const coRecords = reportInvoices.filter((r: any) => (r.company_id?.[0] || 0) === cid);
      const coOverdue = coRecords.filter((r: any) => r.days_overdue > 0);
      const coTotalReceivable = coRecords.reduce((s, r) => s + (r.amount_residual || 0), 0);
      const coTotalOverdue = coOverdue.reduce((s, r) => s + (r.amount_residual || 0), 0);
      const coTotalCurrent = coRecords.reduce((s, r) => s + (r.amount_current || 0), 0);

      return {
        companyId: cid,
        companyName: COMPANY_NAMES[cid] || `Sucursal ${cid}`,
        totalReceivable: Math.round(coTotalReceivable * 100) / 100,
        totalOverdue: Math.round(coTotalOverdue * 100) / 100,
        overduePct: coTotalReceivable > 0 ? Math.round((coTotalOverdue / coTotalReceivable) * 10000) / 100 : 0,
        // Mismo calculo que el KPI global "Efectividad Cobranza" (corriente /
        // cartera total) pero por sede — la tabla "Por Sede" lo pedia y nunca
        // se calculo, asi que el frontend mostraba literalmente "undefined%"
        // (el chequeo `!== null` no atajaba `undefined`).
        efectividad: coTotalReceivable > 0 ? Math.round((coTotalCurrent / coTotalReceivable) * 10000) / 100 : null,
        openInvoices: coRecords.length,
        overdueInvoices: coOverdue.length,
        aging: {
          corriente: Math.round(coTotalCurrent * 100) / 100,
          "1-30": Math.round(coRecords.reduce((s, r) => s + (r.amount_1_30 || 0), 0) * 100) / 100,
          "31-60": Math.round(coRecords.reduce((s, r) => s + (r.amount_31_60 || 0), 0) * 100) / 100,
          "61-90": Math.round(coRecords.reduce((s, r) => s + (r.amount_61_90 || 0), 0) * 100) / 100,
          "91+": Math.round(coRecords.reduce((s, r) => s + (r.amount_91_plus || 0), 0) * 100) / 100,
        },
      };
    });

    // ═══════════════════════════════════════════════════════════════════
    // FUENTE 2: account.move — Efectividad, Recuperación, DSO
    // Mismas consultas y fórmulas que /kpi-detail para que la tarjeta y su
    // propio modal de detalle siempre coincidan (antes cada uno calculaba
    // algo distinto con el mismo nombre y el mismo semáforo/meta).
    // ═══════════════════════════════════════════════════════════════════
    const isSupricom = (inv: any) => (inv.partner_id?.[1] || "").toLowerCase().includes("supricom");
    const d90 = new Date(today);
    d90.setDate(d90.getDate() - 90);

    const [efectividadInvoicesRaw, recuperacionCalc, creditSalesRaw] = await Promise.all([
      fetchPaginated(
        "account.move",
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date_due", ">=", monthStart.toISOString().split("T")[0]],
          ["invoice_date_due", "<=", monthEnd.toISOString().split("T")[0]],
        ],
        ["id", "partner_id", "move_type", "amount_total", "amount_residual", "invoice_date_due"],
      ),
      // Recuperación Vencidos: reconstruye el saldo vencido al inicio del mes
      // y lo compara con los pagos conciliados durante el mes. Ver
      // lib/cxc/recuperacion.ts para el detalle del método y por qué no se
      // puede leer directo de `amount_residual` (issue #189).
      calcularRecuperacion(companyIds, monthStart, monthEnd),
      fetchPaginated(
        "account.move",
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date", ">=", d90.toISOString().split("T")[0]],
        ],
        ["id", "amount_total", "invoice_payment_term_id"],
      ),
    ]);

    // ── Efectividad Cobranza: cobrado ÷ exigible de facturas que vencen este mes ──
    // Una nota de credito (`out_refund`) debe restar tanto del exigible como
    // del cobrado -- antes `amount_residual` se tomaba siempre en valor
    // absoluto y el pago se recortaba a 0 con `Math.max(...,0)`, asi que cada
    // nota de credito bajaba el denominador sin bajar el numerador e inflaba
    // el cociente por encima de 100% (issue #187). Aplicando el mismo signo a
    // `amount_total` y `amount_residual` una nota de credito resta lo mismo
    // de los dos lados, que es lo coherente.
    const efectividadInvoices = efectividadInvoicesRaw.filter((inv: any) => !isSupricom(inv)).map((inv: any) => {
      const signo = inv.move_type === "out_refund" ? -1 : 1;
      const amountTotal = signo * Math.abs(inv.amount_total || 0);
      const amountResidual = signo * Math.abs(inv.amount_residual || 0);
      return {
        id: inv.id,
        amountTotal,
        amountResidual,
        dueDate: inv.invoice_date_due ? new Date(inv.invoice_date_due + "T00:00:00") : null,
      };
    });

    // ── Efectividad y su fila semanal: criterio estricto (issue #188) ──
    // Se usan las mismas semanas que arma el Stoplight de ventas (mismo
    // helper) para que la fila quede alineada con los encabezados
    // `weekHeaders`. La lógica vive en lib/cxc/efectividad.ts, compartida con
    // el modal de detalle para que nunca discrepen.
    const semanasCxc = (startDateParam && endDateParam)
      ? obtenerSemanasDelRango(new Date(startDateParam), new Date(endDateParam))
      : obtenerSemanasDelMes(currentYear, currentMonth + 1);

    // Series semanales de Cartera Vencida y Recuperación: las dos reconstruyen
    // el saldo de cada factura en cortes pasados (lib/cxc/seriesSemanales.ts).
    // `carteraHoy` sale del mismo método que las celdas semanales, para que el
    // promedio del KPI y su fila aten entre sí.
    const seriesCxc = await calcularSeriesCxC(companyIds, semanasCxc, today);

    const efectividadCalc = await calcularEfectividad(
      companyIds, monthStart, monthEnd, efectividadInvoices, semanasCxc, today,
    );
    const efectividad = efectividadCalc.value;
    const semanaEfectividad = efectividadCalc.semana;

    // ── Cartera Vencida: % de cartera que está vencida ── (ya calculado arriba)

    // ── Recuperación Vencidos: ya calculado arriba por calcularRecuperacion() ──
    const recuperacion = recuperacionCalc.value;

    // ── DSO: (cartera abierta ÷ ventas a crédito de 90 días) × 90 ──
    // `totalReceivable` (numerador) sale de digiflex.cxc.report y viene con
    // impuestos; antes el denominador usaba `amount_untaxed` (sin impuestos),
    // una base fiscal distinta a cada lado (issue #190). Se unifica a
    // `amount_total` en los dos lados.
    // Además, el denominador traía TODAS las ventas de 90 días, contado
    // incluido, y el comentario decía "a crédito" -- se filtran las de
    // contado con el mismo criterio que ya usa contado-credito/route.ts: sin
    // plazo de pago, o un plazo cuyo nombre no tiene ningún número de días
    // (ej. "Contado"), es venta de contado.
    const creditTermIds = [...new Set(
      creditSalesRaw
        .map((inv: any) => inv.invoice_payment_term_id?.[0])
        .filter((id: any): id is number => Boolean(id))
    )];
    let creditTermNames: Record<number, string> = {};
    if (creditTermIds.length > 0) {
      try {
        const terms = await callOdooRPC<any[]>("account.payment.term", "read", [creditTermIds], { fields: ["id", "name"] });
        (terms || []).forEach((t: any) => { creditTermNames[t.id] = t.name; });
      } catch (_) {}
    }
    const esVentaACredito = (inv: any) => {
      const termName = creditTermNames[inv.invoice_payment_term_id?.[0] ?? -1] || "Contado";
      return /\d/.test(termName);
    };
    // Nota: `totalReceivable` (digiflex.cxc.report) y estas ventas de 90 días
    // (account.move) son fuentes distintas que en la práctica difieren en
    // torno a un 3% (granularidad y alcance distintos, ver issue #190) -- el
    // DSO las combina asumiendo que esa diferencia es aceptable.
    const totalCreditSales90d = creditSalesRaw
      .filter(esVentaACredito)
      .reduce((s, inv: any) => s + Math.abs(inv.amount_total || 0), 0);
    const dso = totalCreditSales90d > 0
      ? Math.round((totalReceivable / totalCreditSales90d) * 90)
      : null;

    // ═══════════════════════════════════════════════════════════════════
    // Respuesta
    // ═══════════════════════════════════════════════════════════════════
    const payload = {
      success: true,
      data: {
        kpis: {
          efectividad: {
            // `value` es la ESTRICTA (cobrado hasta el cierre del mes): es la
            // que va al semáforo porque es comparable entre meses y un mes
            // cerrado ya no cambia. `valueAcumulado` es el criterio viejo
            // ("cobrado a hoy"), que se conserva como dato secundario porque
            // sigue diciendo cuánto de lo que venció ya entró (issue #188).
            value: efectividad,
            meta: cxcMetas["efectividad_cobranza"] || 95,
            cobradoMes: efectividadCalc.cobradoAlCierre,
            exigibleMes: efectividadCalc.exigibleMes,
            pendiente: efectividadCalc.pendiente,
            valueAcumulado: efectividadCalc.valueAcumulado,
            cobradoAHoy: efectividadCalc.cobradoAHoy,
            mesCerrado: efectividadCalc.mesCerrado,
          },
          carteraVencida: {
            // Se calcula con el mismo método que la fila semanal (reconstruyendo
            // el saldo en el corte) y no con `days_overdue` del reporte de Odoo,
            // para que el promedio y las celdas de la semana aten. Mueve el
            // valor ~1,7 pts respecto a la fuente anterior y de paso unifica el
            // desvío entre fuentes del issue #190. El aging, los top deudores y
            // el corte por sede siguen leyendo el reporte, que es donde está el
            // detalle por renglón.
            value: seriesCxc.carteraHoy.pct,
            meta: cxcMetas["cartera_vencida"] || 10,
            saldoVencido: seriesCxc.carteraHoy.vencido,
            carteraTotal: seriesCxc.carteraHoy.total,
          },
          recuperacion: {
            value: recuperacion,
            meta: cxcMetas["recuperacion_vencidos"] || 60,
            // Nombres nuevos y explícitos: `vencidoInicial`/`vencidoRestante`
            // se retiran a propósito porque significaban otra cosa (todo lo
            // facturado en la historia y su saldo) y arrastrarlos invitaba a
            // leerlos mal. Ver lib/cxc/recuperacion.ts.
            saldoVencidoInicial: recuperacionCalc.saldoVencidoInicial,
            recuperadoEnElMes: recuperacionCalc.recuperadoEnElMes,
            saldoVencidoHoy: recuperacionCalc.saldoVencidoHoy,
            conciliadoDesdeElCorte: recuperacionCalc.conciliadoDesdeElCorte,
            facturasConSaldo: recuperacionCalc.facturasConSaldo,
          },
          dso: {
            value: dso,
            meta: cxcMetas["dso"] || 45,
            carteraAbierta: Math.round(totalReceivable * 100) / 100,
            ventasCredito90d: Math.round(totalCreditSales90d * 100) / 100,
          },
        },
        semanaEfectividad,
        semanaCarteraVencida: seriesCxc.carteraVencidaSemana,
        semanaRecuperacion: seriesCxc.recuperacionSemana,
        pesos: cxcPesos,
        agingDistribution,
        byCompany,
        topDebtors,
        bySalesperson,
        summary: {
          totalReceivable: Math.round(totalReceivable * 100) / 100,
          totalOverdue: Math.round(totalOverdue * 100) / 100,
          openInvoiceCount: reportInvoices.length,
          overdueInvoiceCount: reportInvoices.filter((r: any) => r.days_overdue > 0).length,
        },
        filters: {
          empresa,
          month: currentMonth + 1,
          year: currentYear,
          companyIds,
        },
        updatedAt: new Date().toISOString(),
      },
    };

    cxcCache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error CxC API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
