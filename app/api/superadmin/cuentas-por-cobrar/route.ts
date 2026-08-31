import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

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
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

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
    const companyId = companyIds[0] || 9;

    const cxcMetasResult = await query(
      "SELECT kpi_key, meta_mensual FROM kpi_targets WHERE company_id = ? AND mes = ? AND kpi_key IN ('efectividad_cobranza', 'cartera_vencida', 'recuperacion_vencidos', 'dso')",
      [companyId, mes]
    );
    const cxcMetas: Record<string, number> = {};
    (cxcMetasResult.rows as any[]).forEach((r: any) => { cxcMetas[r.kpi_key] = Number(r.meta_mensual); });

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

    // Filtrar solo facturas (excluir notas de crédito y asientos internos)
    const reportInvoices = reportData.filter((r: any) =>
      r.amount_residual > 0 && !((r.partner_name || "").toLowerCase().includes("supricom"))
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
      const residual = Math.abs(r.amount_residual || 0);
      totalReceivable += residual;
      if (r.days_overdue > 0) totalOverdue += residual;

      agingDistribution["corriente"] += Math.abs(r.amount_current || 0);
      agingDistribution["1-30"] += Math.abs(r.amount_1_30 || 0);
      agingDistribution["31-60"] += Math.abs(r.amount_31_60 || 0);
      agingDistribution["61-90"] += Math.abs(r.amount_61_90 || 0);
      agingDistribution["91+"] += Math.abs(r.amount_91_plus || 0);
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
        const residual = Math.abs(r.amount_residual || 0);
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
        const residual = Math.abs(r.amount_residual || 0);
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
      const coTotalReceivable = coRecords.reduce((s, r) => s + Math.abs(r.amount_residual || 0), 0);
      const coTotalOverdue = coOverdue.reduce((s, r) => s + Math.abs(r.amount_residual || 0), 0);
      const coTotalCurrent = coRecords.reduce((s, r) => s + Math.abs(r.amount_current || 0), 0);

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
          "1-30": Math.round(coRecords.reduce((s, r) => s + Math.abs(r.amount_1_30 || 0), 0) * 100) / 100,
          "31-60": Math.round(coRecords.reduce((s, r) => s + Math.abs(r.amount_31_60 || 0), 0) * 100) / 100,
          "61-90": Math.round(coRecords.reduce((s, r) => s + Math.abs(r.amount_61_90 || 0), 0) * 100) / 100,
          "91+": Math.round(coRecords.reduce((s, r) => s + Math.abs(r.amount_91_plus || 0), 0) * 100) / 100,
        },
      };
    });

    // ═══════════════════════════════════════════════════════════════════
    // KPIs calculados desde digiflex.cxc.report (aging bands)
    // ═══════════════════════════════════════════════════════════════════
    const totalCurrent = agingDistribution["corriente"];
    const total1_30 = agingDistribution["1-30"];
    const total31_60 = agingDistribution["31-60"];
    const total61_90 = agingDistribution["61-90"];
    const total91Plus = agingDistribution["91+"];

    // ── Efectividad Cobranza: % de cartera que está al día (corriente) ──
    const efectividad = totalReceivable > 0
      ? Math.round((totalCurrent / totalReceivable) * 10000) / 100
      : null;

    // ── Cartera Vencida: % de cartera que está vencida ── (ya calculado arriba)

    // ── Recuperación Vencidos: % de vencido que NO está estancado en 91+ ──
    const totalOverdueBands = total1_30 + total31_60 + total61_90 + total91Plus;
    const recuperacion = totalOverdueBands > 0
      ? Math.round(((totalOverdueBands - total91Plus) / totalOverdueBands) * 10000) / 100
      : null;

    // ── DSO: días promedio de cobro usando bandas del aging (midpoints) ──
    // 1-30 → 15d, 31-60 → 45d, 61-90 → 75d, 91+ → 105d
    const dsoNumerator = (total1_30 * 15) + (total31_60 * 45) + (total61_90 * 75) + (total91Plus * 105);
    const totalOverdueWeighted = total1_30 + total31_60 + total61_90 + total91Plus;
    const dso = totalOverdueWeighted > 0
      ? Math.round(dsoNumerator / totalOverdueWeighted)
      : null;

    // ═══════════════════════════════════════════════════════════════════
    // Respuesta
    // ═══════════════════════════════════════════════════════════════════
    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          efectividad: {
            value: efectividad,
            meta: cxcMetas["efectividad_cobranza"] || 95,
            // OJO: esto es la cartera "corriente" (aun no vencida), NO plata
            // ya cobrada. El campo se llamaba `cobradoMes` y el frontend lo
            // rotulaba "Cobrado", pero es simplemente el numerador de
            // Efectividad Cobranza (corriente / cartera total) — nadie cobro
            // nada, sigue siendo saldo pendiente. El "cobrado" real de verdad
            // (dinero recibido) es `totalCobrado` en /kpi-detail, que sale de
            // otro calculo (facturas cuyo vencimiento cae en el mes).
            corrienteMes: Math.round(totalCurrent * 100) / 100,
            exigibleMes: Math.round(totalReceivable * 100) / 100,
            pendiente: Math.round(totalOverdue * 100) / 100,
          },
          carteraVencida: {
            value: carteraVencidaPct,
            meta: cxcMetas["cartera_vencida"] || 10,
            saldoVencido: Math.round(totalOverdue * 100) / 100,
            carteraTotal: Math.round(totalReceivable * 100) / 100,
          },
          recuperacion: {
            value: recuperacion,
            meta: cxcMetas["recuperacion_vencidos"] || 60,
            vencidoInicial: Math.round(totalOverdueBands * 100) / 100,
            vencidoRestante: Math.round(total91Plus * 100) / 100,
          },
          dso: {
            value: dso,
            meta: cxcMetas["dso"] || 45,
            carteraAbierta: Math.round(totalReceivable * 100) / 100,
            ventasCredito90d: Math.round(totalOverdueWeighted * 100) / 100,
          },
        },
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
    });
  } catch (error: any) {
    console.error("Error CxC API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
