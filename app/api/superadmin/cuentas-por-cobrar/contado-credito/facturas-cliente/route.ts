import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const partnerIdParam = searchParams.get("partnerId");
    if (!partnerIdParam) {
      return NextResponse.json({ error: "partnerId es requerido" }, { status: 400 });
    }
    const partnerId = parseInt(partnerIdParam, 10);

    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = getMonthStart(currentYear, currentMonth);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const invoicesRaw = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [[
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["partner_id", "=", partnerId],
        ["invoice_date", ">=", monthStart.toISOString().split("T")[0]],
        ["invoice_date", "<=", monthEnd.toISOString().split("T")[0]],
      ]],
      { fields: ["id", "name", "invoice_date", "move_type", "amount_total", "invoice_payment_term_id"], order: "invoice_date desc" },
    );

    const invoices = invoicesRaw || [];

    const ptIds = [...new Set(invoices.map((f) => f.invoice_payment_term_id?.[0]).filter(Boolean))];
    let ptMap: Record<number, string> = {};
    if (ptIds.length > 0) {
      try {
        const pts = await callOdooRPC<any[]>("account.payment.term", "read", [ptIds], { fields: ["id", "name"] });
        (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
      } catch (_) {}
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const facturas = invoices.map((inv) => ({
      id: inv.id,
      name: inv.name || "",
      invoiceDate: inv.invoice_date || null,
      moveType: inv.move_type,
      amountTotal: round2(inv.move_type === "out_refund" ? -(inv.amount_total || 0) : (inv.amount_total || 0)),
      paymentTermName: ptMap[inv.invoice_payment_term_id?.[0]] || "Contado",
    }));

    return NextResponse.json({
      success: true,
      data: {
        partnerId,
        facturas,
        total: round2(facturas.reduce((s, f) => s + f.amountTotal, 0)),
        filters: { empresa, month: currentMonth + 1, year: currentYear, companyIds },
      },
    });
  } catch (error: any) {
    console.error("Error CxC facturas-cliente API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
