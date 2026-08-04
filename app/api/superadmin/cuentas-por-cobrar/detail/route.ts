import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const partnerId = searchParams.get("partner_id");
    const salesuserId = searchParams.get("user_id");
    const agingBand = searchParams.get("aging_band");

    const now = new Date();
    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : [7, 9, 10];

    const domain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
      ["amount_residual", ">", 0],
    ];

    if (partnerId) {
      domain.push(["partner_id", "=", parseInt(partnerId)]);
    }
    if (salesuserId) {
      domain.push(["invoice_user_id", "=", parseInt(salesuserId)]);
    }

    const invoices = (await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domain],
      {
        fields: [
          "id", "name", "partner_id", "company_id", "move_type",
          "invoice_date", "invoice_date_due", "payment_state",
          "amount_untaxed", "amount_tax", "amount_total",
          "amount_residual", "invoice_user_id",
        ],
        limit: 2000,
        order: "invoice_date_due asc",
      },
    )) || [];

    const today = new Date();
    const results = invoices
      .map((inv) => {
        const amount = inv.move_type === "out_refund" ? -Math.abs(inv.amount_untaxed || 0) : (inv.amount_untaxed || 0);
        const dueDate = inv.invoice_date_due ? new Date(inv.invoice_date_due) : null;
        const agingDays = dueDate && inv.amount_residual > 0 ? daysBetween(dueDate, today) : 0;

        let band = " corriente";
        if (inv.amount_residual > 0 && dueDate) {
          if (agingDays <= 0) band = " corriente";
          else if (agingDays <= 15) band = "1-15";
          else if (agingDays <= 30) band = "16-30";
          else if (agingDays <= 60) band = "31-60";
          else if (agingDays <= 90) band = "61-90";
          else band = "90+";
        }

        return {
          id: inv.id,
          name: inv.name || "",
          partnerId: inv.partner_id?.[0] || 0,
          partnerName: inv.partner_id?.[1] || "Sin cliente",
          companyId: inv.company_id?.[0] || 0,
          companyName: inv.company_id?.[1] || "",
          moveType: inv.move_type,
          invoiceDate: inv.invoice_date || null,
          invoiceDateDue: inv.invoice_date_due || null,
          paymentState: inv.payment_state || "not_paid",
          amountUntaxed: Math.round(amount * 100) / 100,
          amountTotal: Math.round((inv.amount_total || 0) * 100) / 100,
          amountResidual: Math.round((inv.amount_residual || 0) * 100) / 100,
          invoiceUserId: inv.invoice_user_id?.[0] || 0,
          invoiceUserName: inv.invoice_user_id?.[1] || "Sin asignar",
          agingDays,
          agingBand: band,
        };
      })
      .filter((inv) => {
        if (agingBand && inv.agingBand !== agingBand) return false;
        return true;
      });

    return NextResponse.json({
      success: true,
      data: {
        invoices: results,
        total: results.reduce((sum, inv) => sum + Math.abs(inv.amountResidual), 0),
        count: results.length,
      },
    });
  } catch (error: any) {
    console.error("Error CxC detail:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
