import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
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

    const [efectividadInvoicesRaw, recuperacionInvoicesRaw, creditSalesRaw] = await Promise.all([
      fetchPaginated(
        "account.move",
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date_due", ">=", monthStart.toISOString().split("T")[0]],
          ["invoice_date_due", "<=", monthEnd.toISOString().split("T")[0]],
        ],
        ["id", "partner_id", "move_type", "amount_total", "amount_residual"],
      ),
      fetchPaginated(
        "account.move",
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date_due", "<", monthStart.toISOString().split("T")[0]],
        ],
        ["id", "partner_id", "move_type", "amount_total", "amount_residual"],
      ),
      fetchPaginated(
        "account.move",
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date", ">=", d90.toISOString().split("T")[0]],
        ],
        ["id", "amount_untaxed"],
      ),
    ]);

    // ── Efectividad Cobranza: cobrado ÷ exigible de facturas que vencen este mes ──
    const efectividadInvoices = efectividadInvoicesRaw.filter((inv: any) => !isSupricom(inv)).map((inv: any) => {
      const amountTotal = inv.move_type === "out_refund" ? -Math.abs(inv.amount_total || 0) : Math.abs(inv.amount_total || 0);
      const residual = Math.abs(inv.amount_residual || 0);
      return { amountTotal, amountPaid: Math.max(amountTotal - residual, 0), amountResidual: residual };
    });
    const totalExigibleMes = efectividadInvoices.reduce((s, i) => s + i.amountTotal, 0);
    const totalCobradoMes = efectividadInvoices.reduce((s, i) => s + i.amountPaid, 0);
    const totalPendienteMes = efectividadInvoices.reduce((s, i) => s + i.amountResidual, 0);
    const efectividad = totalExigibleMes > 0
      ? Math.round((totalCobradoMes / totalExigibleMes) * 10000) / 100
      : null;

    // ── Cartera Vencida: % de cartera que está vencida ── (ya calculado arriba)

    // ── Recuperación Vencidos: cuánto de lo vencido al inicio del mes ya se cobró ──
    const recuperacionInvoices = recuperacionInvoicesRaw.filter((inv: any) => !isSupricom(inv)).map((inv: any) => {
      const amountTotal = inv.move_type === "out_refund" ? -Math.abs(inv.amount_total || 0) : Math.abs(inv.amount_total || 0);
      return { amountTotal, amountResidual: Math.abs(inv.amount_residual || 0) };
    });
    const vencidoInicial = recuperacionInvoices.reduce((s, i) => s + i.amountTotal, 0);
    const vencidoRestante = recuperacionInvoices.reduce((s, i) => s + i.amountResidual, 0);
    const recuperacion = vencidoInicial > 0
      ? Math.round(((vencidoInicial - vencidoRestante) / vencidoInicial) * 10000) / 100
      : null;

    // ── DSO: (cartera abierta ÷ ventas a crédito de 90 días) × 90 ──
    const totalCreditSales90d = creditSalesRaw.reduce((s, inv: any) => s + Math.abs(inv.amount_untaxed || 0), 0);
    const dso = totalCreditSales90d > 0
      ? Math.round((totalReceivable / totalCreditSales90d) * 90)
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
            // Dinero realmente cobrado de las facturas que vencen este mes
            // (mismo cálculo que /kpi-detail?type=efectividad).
            cobradoMes: Math.round(totalCobradoMes * 100) / 100,
            exigibleMes: Math.round(totalExigibleMes * 100) / 100,
            pendiente: Math.round(totalPendienteMes * 100) / 100,
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
            vencidoInicial: Math.round(vencidoInicial * 100) / 100,
            vencidoRestante: Math.round(vencidoRestante * 100) / 100,
          },
          dso: {
            value: dso,
            meta: cxcMetas["dso"] || 45,
            carteraAbierta: Math.round(totalReceivable * 100) / 100,
            ventasCredito90d: Math.round(totalCreditSales90d * 100) / 100,
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
