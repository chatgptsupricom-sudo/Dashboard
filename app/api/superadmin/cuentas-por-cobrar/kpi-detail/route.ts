import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

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
    const type = searchParams.get("type"); // efectividad | cartera | recuperacion | dso
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    if (!type || !["efectividad", "cartera", "recuperacion", "dso"].includes(type)) {
      return NextResponse.json({ error: "type requerido: efectividad | cartera | recuperacion | dso" }, { status: 400 });
    }

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = getMonthStart(currentYear, currentMonth);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    if (type === "efectividad") {
      // Facturas con vencimiento en el mes, con detalle de pagado/pendiente
      const allInvoices = await fetchPaginated(
        "account.move",
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date_due", ">=", monthStart.toISOString().split("T")[0]],
          ["invoice_date_due", "<=", monthEnd.toISOString().split("T")[0]],
        ],
        ["id", "name", "partner_id", "company_id", "move_type",
         "invoice_date", "invoice_date_due", "payment_state",
         "amount_untaxed", "amount_total", "amount_residual"],
      );

      const invoices = allInvoices.map((inv: any) => {
        const amountTotal = inv.move_type === "out_refund" ? -Math.abs(inv.amount_total || 0) : Math.abs(inv.amount_total || 0);
        const residual = inv.amount_residual || 0;
        const pagado = amountTotal - Math.abs(residual);
        return {
          id: inv.id,
          name: inv.name || "",
          partnerName: inv.partner_id?.[1] || "Sin cliente",
          partnerId: inv.partner_id?.[0] || 0,
          companyName: inv.company_id?.[1] || "",
          moveType: inv.move_type,
          invoiceDate: inv.invoice_date || null,
          invoiceDateDue: inv.invoice_date_due || null,
          paymentState: inv.payment_state || "not_paid",
          amountTotal,
          amountPaid: Math.round(Math.max(pagado, 0) * 100) / 100,
          amountResidual: Math.round(Math.abs(residual) * 100) / 100,
        };
      });

      const totalExigible = invoices.reduce((s, i) => s + i.amountTotal, 0);
      const totalCobrado = invoices.reduce((s, i) => s + i.amountPaid, 0);
      const totalPendiente = invoices.reduce((s, i) => s + i.amountResidual, 0);

      return NextResponse.json({
        success: true,
        data: {
          type: "efectividad",
          summary: {
            totalExigible: Math.round(totalExigible * 100) / 100,
            totalCobrado: Math.round(totalCobrado * 100) / 100,
            totalPendiente: Math.round(totalPendiente * 100) / 100,
            efectividad: totalExigible > 0 ? Math.round((totalCobrado / totalExigible) * 10000) / 100 : 0,
            count: invoices.length,
            paidCount: invoices.filter(i => i.paymentState === "paid" || i.amountResidual <= 0).length,
            pendingCount: invoices.filter(i => i.paymentState !== "paid" && i.amountResidual > 0).length,
          },
          invoices: invoices.sort((a, b) => (a.invoiceDateDue || "").localeCompare(b.invoiceDateDue || "")),
        },
      });
    }

    if (type === "cartera") {
      // Todas las facturas abiertas con saldo, agrupadas por aging band
      const reportData = await fetchPaginated(
        "digiflex.cxc.report",
        [["company_id", "in", companyIds], ["amount_residual", ">", 0]],
        ["id", "move_id", "partner_id", "partner_name", "user_id", "user_name",
         "company_id", "company_name", "invoice_date", "date_maturity",
         "days_overdue", "amount_residual", "amount_current",
         "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus",
         "document_number", "transaction_type"],
      );

      const filtered = reportData.filter((r: any) => !((r.partner_name || "").toLowerCase().includes("supricom")));

      function getAgingBand(r: any): string {
        if (r.days_overdue <= 0) return "corriente";
        if (r.days_overdue <= 30) return "1-30";
        if (r.days_overdue <= 60) return "31-60";
        if (r.days_overdue <= 90) return "61-90";
        return "91+";
      }

      const invoices = filtered.map((r: any) => ({
        id: r.id,
        name: r.document_number || "",
        partnerName: r.partner_name || "Sin cliente",
        partnerId: r.partner_id?.[0] || 0,
        companyName: r.company_name || "",
        userName: r.user_name || "Sin asignar",
        invoiceDate: r.invoice_date || null,
        invoiceDateDue: r.date_maturity || null,
        daysOverdue: r.days_overdue || 0,
        agingBand: getAgingBand(r),
        amountResidual: Math.round(Math.abs(r.amount_residual || 0) * 100) / 100,
      }));

      const total = invoices.reduce((s, i) => s + i.amountResidual, 0);
      const overdue = invoices.filter(i => i.daysOverdue > 0).reduce((s, i) => s + i.amountResidual, 0);

      const byBand: Record<string, { count: number; total: number }> = {};
      invoices.forEach(i => {
        if (!byBand[i.agingBand]) byBand[i.agingBand] = { count: 0, total: 0 };
        byBand[i.agingBand].count++;
        byBand[i.agingBand].total += i.amountResidual;
      });

      return NextResponse.json({
        success: true,
        data: {
          type: "cartera",
          summary: {
            totalReceivable: Math.round(total * 100) / 100,
            totalOverdue: Math.round(overdue * 100) / 100,
            overduePct: total > 0 ? Math.round((overdue / total) * 10000) / 100 : 0,
            count: invoices.length,
            overdueCount: invoices.filter(i => i.daysOverdue > 0).length,
          },
          byBand,
          invoices: invoices.sort((a, b) => b.daysOverdue - a.daysOverdue),
        },
      });
    }

    if (type === "recuperacion") {
      // Cohorte: facturas vencidas al inicio del mes
      const cohortStart = getMonthStart(currentYear, currentMonth);
      const allInvoices = await fetchPaginated(
        "account.move",
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["invoice_date_due", "<", cohortStart.toISOString().split("T")[0]],
        ],
        ["id", "name", "partner_id", "company_id", "move_type",
         "invoice_date", "invoice_date_due", "payment_state",
         "amount_total", "amount_residual"],
      );

      const invoices = allInvoices.map((inv: any) => {
        const amountTotal = inv.move_type === "out_refund" ? -Math.abs(inv.amount_total || 0) : Math.abs(inv.amount_total || 0);
        const residual = inv.amount_residual || 0;
        const pagado = amountTotal - Math.abs(residual);
        return {
          id: inv.id,
          name: inv.name || "",
          partnerName: inv.partner_id?.[1] || "Sin cliente",
          partnerId: inv.partner_id?.[0] || 0,
          companyName: inv.company_id?.[1] || "",
          moveType: inv.move_type,
          invoiceDate: inv.invoice_date || null,
          invoiceDateDue: inv.invoice_date_due || null,
          paymentState: inv.payment_state || "not_paid",
          amountTotal,
          amountPaid: Math.round(Math.max(pagado, 0) * 100) / 100,
          amountResidual: Math.round(Math.abs(residual) * 100) / 100,
          status: residual <= 0 ? "Recuperado" : "Pendiente",
        };
      });

      const totalInicial = invoices.reduce((s, i) => s + i.amountTotal, 0);
      const totalRestante = invoices.reduce((s, i) => s + i.amountResidual, 0);
      const totalRecuperado = totalInicial - totalRestante;

      return NextResponse.json({
        success: true,
        data: {
          type: "recuperacion",
          summary: {
            vencidoInicial: Math.round(totalInicial * 100) / 100,
            vencidoRestante: Math.round(totalRestante * 100) / 100,
            recuperado: Math.round(totalRecuperado * 100) / 100,
            recuperacion: totalInicial > 0 ? Math.round((totalRecuperado / totalInicial) * 10000) / 100 : 0,
            count: invoices.length,
            recoveredCount: invoices.filter(i => i.status === "Recuperado").length,
            pendingCount: invoices.filter(i => i.status === "Pendiente").length,
          },
          invoices: invoices.sort((a, b) => a.invoiceDateDue?.localeCompare(b.invoiceDateDue || "") || 0),
        },
      });
    }

    if (type === "dso") {
      // Ventas crédito últimos 90 días + cartera abierta
      const d90 = new Date(today);
      d90.setDate(d90.getDate() - 90);

      const [creditSales, receivableData] = await Promise.all([
        fetchPaginated(
          "account.move",
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["company_id", "in", companyIds],
            ["invoice_date", ">=", d90.toISOString().split("T")[0]],
          ],
          ["id", "name", "partner_id", "company_id",
           "invoice_date", "invoice_date_due", "payment_state",
           "amount_untaxed", "amount_total", "amount_residual"],
        ),
        fetchPaginated(
          "digiflex.cxc.report",
          [["company_id", "in", companyIds], ["amount_residual", ">", 0]],
          ["amount_residual"],
        ),
      ]);

      const totalReceivable = receivableData
        .filter((r: any) => !["supricom"].some(s => (r.partner_name || "").toLowerCase().includes(s)))
        .reduce((s, r) => s + Math.abs(r.amount_residual || 0), 0);

      const sales = creditSales.map((inv: any) => ({
        id: inv.id,
        name: inv.name || "",
        partnerName: inv.partner_id?.[1] || "Sin cliente",
        partnerId: inv.partner_id?.[0] || 0,
        companyName: inv.company_id?.[1] || "",
        invoiceDate: inv.invoice_date || null,
        invoiceDateDue: inv.invoice_date_due || null,
        paymentState: inv.payment_state || "not_paid",
        amountUntaxed: Math.round(Math.abs(inv.amount_untaxed || 0) * 100) / 100,
        amountTotal: Math.round(Math.abs(inv.amount_total || 0) * 100) / 100,
        amountResidual: Math.round(Math.abs(inv.amount_residual || 0) * 100) / 100,
      }));

      const totalCreditSales = sales.reduce((s, i) => s + i.amountUntaxed, 0);
      const dso = totalCreditSales > 0 ? Math.round((totalReceivable / totalCreditSales) * 90) : 0;

      return NextResponse.json({
        success: true,
        data: {
          type: "dso",
          summary: {
            carteraAbierta: Math.round(totalReceivable * 100) / 100,
            ventasCredito90d: Math.round(totalCreditSales * 100) / 100,
            dso,
            count: sales.length,
          },
          invoices: sales.sort((a, b) => (a.invoiceDate || "").localeCompare(b.invoiceDate || "")),
        },
      });
    }

    return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  } catch (error: any) {
    console.error("Error KPI detail:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
