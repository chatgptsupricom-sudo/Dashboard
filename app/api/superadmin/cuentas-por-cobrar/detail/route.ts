import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

async function fetchPaginated(model: string, domain: any[], fields: string[], order?: string): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order, limit: 5000, offset },
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

    // Paginado en vez de un limit fijo: con un cliente/vendedor de mucho
    // volumen, un solo search_read con limit:2000 descartaba facturas en
    // silencio sin avisar en la respuesta. El orden final que ve el usuario
    // lo aplica el .sort() de mas abajo, asi que aqui basta un orden estable
    // (id) para que la paginacion no repita ni salte filas.
    const records = await fetchPaginated(
      "digiflex.cxc.report",
      domain,
      [
        "id", "move_id", "partner_id", "partner_name",
        "user_id", "user_name", "company_id", "company_name",
        "invoice_date", "date_maturity", "days_overdue",
        "amount_residual", "amount_current",
        "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus",
        "transaction_type", "document_number",
      ],
      "id asc",
    );

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
        moveId: Array.isArray(r.move_id) ? r.move_id[0] : (typeof r.move_id === "number" ? r.move_id : 0),
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
        amountTotal: 0,
      }))
      .filter((inv) => {
        if (agingBand && inv.agingBand !== agingBand) return false;
        return true;
      })
      .sort((a, b) => {
        // Primero: más vencidos primero (days_overdue desc)
        if (b.agingDays !== a.agingDays) return b.agingDays - a.agingDays;
        // Segundo: por fecha de vencimiento más antigua primero
        return (a.invoiceDateDue || "").localeCompare(b.invoiceDateDue || "");
      });

    // Fetch amount_total from account.move for each unique moveId
    const moveIds = [...new Set(results.map((r) => r.moveId).filter((id) => id > 0))];
    if (moveIds.length > 0) {
      try {
        const moves = await callOdooRPC<any[]>(
          "account.move", "search_read",
          [[["id", "in", moveIds]]],
          { fields: ["id", "amount_total"], limit: moveIds.length },
        );
        const moveTotals: Record<number, number> = {};
        (moves || []).forEach((m: any) => { moveTotals[m.id] = Math.abs(m.amount_total || 0); });
        results.forEach((r) => {
          if (r.moveId && moveTotals[r.moveId]) {
            r.amountTotal = Math.round(moveTotals[r.moveId] * 100) / 100;
          }
        });
      } catch {
        // Ignore errors - leave amountTotal as 0
      }
    }

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
