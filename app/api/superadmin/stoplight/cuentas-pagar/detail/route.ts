import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getAgingBand(daysOverdue: number): string {
  if (daysOverdue <= 0) return "corriente";
  if (daysOverdue <= 15) return "1-15";
  if (daysOverdue <= 30) return "16-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const kpiId = searchParams.get("kpi_id") || "pagos_a_tiempo";
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    const companyId = COMPANY_MAP[empresa] || 9;

    const domain: any[] = [
      ["move_type", "in", ["in_invoice", "in_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
    ];

    if (kpiId === "pagos_a_tiempo") {
      domain.push(["invoice_date_due", ">=", formatDate(monthStart)]);
      domain.push(["invoice_date_due", "<=", formatDate(monthEnd)]);
    } else if (kpiId === "procesamiento_oportuno") {
      domain.push(["invoice_date", ">=", formatDate(monthStart)]);
      domain.push(["invoice_date", "<=", formatDate(monthEnd)]);
    }
    // cuentas_pagar_vencidas: no filtra por mes (es snapshot de todo lo abierto)

    const bills = (await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domain],
      {
        fields: [
          "id", "name", "move_type", "partner_id", "invoice_date", "invoice_date_due",
          "amount_untaxed", "amount_residual", "payment_state",
          "company_id", "ref",
        ],
        limit: 5000,
      }
    )) || [];

    const today = new Date();

    const mapped = bills
      .filter((b) => {
        const residual = Math.abs(Number(b.amount_residual) || 0);
        if (kpiId === "pagos_a_tiempo") return residual > 0 || b.payment_state === "paid";
        if (kpiId === "cuentas_pagar_vencidas") return residual > 0 && b.move_type === "in_invoice";
        return true;
      })
      .map((b) => {
        const dueDate = b.invoice_date_due ? new Date(b.invoice_date_due) : null;
        const residual = Math.abs(Number(b.amount_residual) || 0);
        const amount = Math.abs(Number(b.amount_untaxed) || 0);
        const paidAmount = amount - residual;
        const daysOverdue = dueDate ? daysBetween(dueDate, today) : 0;
        const agingBand = getAgingBand(daysOverdue);
        const isRefund = b.move_type === "in_refund";

        let status: string = b.payment_state || "not_paid";
        if (isRefund) status = "nota_credito";

        return {
          id: b.id,
          name: b.name || `INV ${b.id}`,
          partnerName: Array.isArray(b.partner_id) ? b.partner_id[1] : "Desconocido",
          partnerId: Array.isArray(b.partner_id) ? b.partner_id[0] : 0,
          invoiceDate: b.invoice_date || null,
          invoiceDateDue: b.invoice_date_due || null,
          amountUntaxed: amount,
          amountResidual: residual,
          paidAmount: Math.max(0, paidAmount),
          paymentState: status,
          agingBand,
          daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
          isRefund,
          companyId,
        };
      });

    let agingBuckets: Record<string, { count: number; amount: number }> = {};
    mapped.forEach((inv) => {
      if (!agingBuckets[inv.agingBand]) agingBuckets[inv.agingBand] = { count: 0, amount: 0 };
      agingBuckets[inv.agingBand].count++;
      agingBuckets[inv.agingBand].amount += inv.amountResidual;
    });

    const totalAmount = mapped.reduce((s, i) => s + i.amountUntaxed, 0);
    const totalResidual = mapped.reduce((s, i) => s + i.amountResidual, 0);

    return NextResponse.json({
      success: true,
      data: {
        kpiId,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalResidual: Math.round(totalResidual * 100) / 100,
        count: mapped.length,
        agingBuckets,
        bills: mapped,
      },
    });
  } catch (error: any) {
    console.error("Error CPP detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
