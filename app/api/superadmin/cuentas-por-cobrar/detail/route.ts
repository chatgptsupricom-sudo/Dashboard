import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const partnerId = searchParams.get("partner_id");
    const salesuserId = searchParams.get("user_id");
    const agingBand = searchParams.get("aging_band");

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const domain: any[] = [
      ["company_id", "in", companyIds],
      ["amount_residual", ">", 0],
    ];

    if (partnerId) {
      domain.push(["partner_id", "=", parseInt(partnerId)]);
    }
    if (salesuserId) {
      domain.push(["user_id", "=", parseInt(salesuserId)]);
    }

    const records = (await callOdooRPC<any[]>(
      "digiflex.cxc.report",
      "search_read",
      [domain],
      {
        fields: [
          "id", "move_id", "partner_id", "partner_name",
          "user_id", "user_name", "company_id", "company_name",
          "invoice_date", "date_maturity", "days_overdue",
          "amount_residual", "amount_current",
          "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus",
          "transaction_type", "document_number",
        ],
        limit: 2000,
        order: "date_maturity asc",
      },
    )) || [];

    // Mapear aging band del reporte Odoo al formato del frontend
    function getAgingBand(r: any): string {
      if (!r.amount_residual || r.amount_residual <= 0) return "corriente";
      if (r.days_overdue <= 0) return "corriente";
      if (r.days_overdue <= 30) return "1-30";
      if (r.days_overdue <= 60) return "31-60";
      if (r.days_overdue <= 90) return "61-90";
      return "91+";
    }

    const results = records
      .map((r: any) => ({
        id: r.id,
        moveId: r.move_id?.[0] || 0,
        name: r.document_number || "",
        partnerId: r.partner_id?.[0] || 0,
        partnerName: r.partner_name || r.partner_id?.[1] || "Sin cliente",
        companyId: r.company_id?.[0] || 0,
        companyName: r.company_name || r.company_id?.[1] || "",
        invoiceDate: r.invoice_date || null,
        invoiceDateDue: r.date_maturity || null,
        amountResidual: Math.round(Math.abs(r.amount_residual || 0) * 100) / 100,
        invoiceUserId: r.user_id?.[0] || 0,
        invoiceUserName: r.user_name || r.user_id?.[1] || "Sin asignar",
        agingDays: r.days_overdue || 0,
        agingBand: getAgingBand(r),
        transactionType: r.transaction_type || "",
      }))
      .filter((inv) => {
        if (agingBand && inv.agingBand !== agingBand) return false;
        return true;
      });

    return NextResponse.json({
      success: true,
      data: {
        invoices: results,
        total: results.reduce((sum, inv) => sum + inv.amountResidual, 0),
        count: results.length,
      },
    });
  } catch (error: any) {
    console.error("Error CxC detail:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
