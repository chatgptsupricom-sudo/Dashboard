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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
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
        : userCidsParam
          ? [parseInt(userCidsParam, 10)]
          : [7, 9, 10];

    const domain: any[] = [
      ["company_id", "in", companyIds],
      "|", "|",
      ["partner_name", "ilike", q],
      ["user_name", "ilike", q],
      ["document_number", "ilike", q],
    ];

    const countResult = await callOdooRPC<any>(
      "digiflex.cxc.report",
      "search_count",
      [domain],
    );
    const totalCount = typeof countResult === "number" ? countResult : 0;

    const offset = (page - 1) * limit;

    const records = (await callOdooRPC<any[]>(
      "digiflex.cxc.report",
      "search_read",
      [domain],
      {
        fields: [
          "id", "move_id", "partner_id", "partner_name",
          "user_id", "user_name", "company_id", "company_name",
          "invoice_date", "date_maturity", "days_overdue",
          "amount_residual", "document_number", "transaction_type",
        ],
        limit,
        offset,
        order: "date_maturity asc",
      },
    )) || [];

    function getAgingBand(r: any): string {
      if (!r.amount_residual || r.amount_residual <= 0) return "corriente";
      if (r.days_overdue <= 0) return "corriente";
      if (r.days_overdue <= 30) return "1-30";
      if (r.days_overdue <= 60) return "31-60";
      if (r.days_overdue <= 90) return "61-90";
      return "91+";
    }

    const results = records.map((r: any) => {
      const companyId = r.company_id?.[0] || 0;
      return {
        id: r.id,
        moveId: Array.isArray(r.move_id) ? r.move_id[0] : (typeof r.move_id === "number" ? r.move_id : 0),
        name: r.document_number || "",
        partnerId: r.partner_id?.[0] || 0,
        partnerName: r.partner_name || r.partner_id?.[1] || "Sin cliente",
        companyId,
        companyName:
          COMPANY_NAMES[companyId as keyof typeof COMPANY_NAMES] ||
          r.company_name ||
          "",
        invoiceDate: r.invoice_date || null,
        invoiceDateDue: r.date_maturity || null,
        amountResidual: Math.round(Math.abs(r.amount_residual || 0) * 100) / 100,
        invoiceUserId: r.user_id?.[0] || 0,
        invoiceUserName: r.user_name || r.user_id?.[1] || "Sin asignar",
        agingDays: r.days_overdue || 0,
        agingBand: getAgingBand(r),
        transactionType: r.transaction_type || "",
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        invoices: results,
        count: totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        total: results.reduce((sum, inv) => sum + inv.amountResidual, 0),
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
