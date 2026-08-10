import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

const COMPANY_NAMES: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const q = searchParams.get("q")?.trim() || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!q) {
      return NextResponse.json({
        success: true,
        data: { invoices: [], count: 0, total: 0 },
      });
    }

    const companyIds =
      empresa && COMPANY_MAP[empresa]
        ? [COMPANY_MAP[empresa]]
        : [7, 9, 10];

    const domain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
    ];

    if (q) {
      domain.push("|", "|", ["name", "ilike", q], ["partner_id.name", "ilike", q], ["invoice_user_id.name", "ilike", q]);
    }

    const countResult = await callOdooRPC<any>(
      "account.move",
      "search_count",
      [domain],
    );
    const totalCount = typeof countResult === "number" ? countResult : 0;

    const offset = (page - 1) * limit;

    const invoices =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [domain],
        {
          fields: [
            "id",
            "name",
            "partner_id",
            "company_id",
            "move_type",
            "invoice_date",
            "invoice_date_due",
            "payment_state",
            "amount_untaxed",
            "amount_tax",
            "amount_total",
            "amount_residual",
            "invoice_user_id",
            "invoice_origin",
          ],
          limit,
          offset,
          order: "invoice_date_due asc",
        },
      )) || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = invoices.map((inv) => {
      const amount =
        inv.move_type === "out_refund"
          ? -Math.abs(inv.amount_untaxed || 0)
          : inv.amount_untaxed || 0;
      const amountTotal =
        inv.move_type === "out_refund"
          ? -Math.abs(inv.amount_total || 0)
          : inv.amount_total || 0;
      const residual = inv.amount_residual || 0;

      function parseLocalDate(dateStr: string | null): Date | null {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split(" ")[0].split("-").map(Number);
        return new Date(y, m - 1, d);
      }

      const dueDate = parseLocalDate(inv.invoice_date_due);

      let agingDays = 0;
      if (dueDate && residual > 0) {
        agingDays = daysBetween(dueDate, today);
      }

      let agingBand = "corriente";
      if (residual > 0 && dueDate) {
        if (agingDays <= 0) agingBand = "corriente";
        else if (agingDays <= 15) agingBand = "1-15";
        else if (agingDays <= 30) agingBand = "16-30";
        else if (agingDays <= 60) agingBand = "31-60";
        else if (agingDays <= 90) agingBand = "61-90";
        else agingBand = "90+";
      }

      const companyId = inv.company_id?.[0] || 0;

      return {
        id: inv.id,
        name: inv.name || "",
        partnerId: inv.partner_id?.[0] || 0,
        partnerName: inv.partner_id?.[1] || "Sin cliente",
        companyId,
        companyName:
          COMPANY_NAMES[companyId as keyof typeof COMPANY_NAMES] ||
          inv.company_id?.[1] ||
          "",
        moveType: inv.move_type,
        invoiceDate: inv.invoice_date || null,
        invoiceDateDue: inv.invoice_date_due || null,
        paymentState: inv.payment_state || "not_paid",
        amountUntaxed: Math.round(amount * 100) / 100,
        amountTotal: Math.round(amountTotal * 100) / 100,
        amountResidual: Math.round(residual * 100) / 100,
        invoiceUserId: inv.invoice_user_id?.[0] || 0,
        invoiceUserName: inv.invoice_user_id?.[1] || "Sin asignar",
        invoiceOrigin: inv.invoice_origin || "",
        agingDays,
        agingBand,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        invoices: results,
        count: totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        total: results.reduce((sum, inv) => sum + Math.abs(inv.amountResidual), 0),
      },
    });
  } catch (error: any) {
    console.error("Error CxC search:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
