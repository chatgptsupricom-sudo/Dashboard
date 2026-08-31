import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
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
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");

    const companyIds =
      empresa && COMPANY_MAP[empresa]
        ? [COMPANY_MAP[empresa]]
        : userCidsParam
          ? [parseInt(userCidsParam, 10)]
          : [7, 9, 10];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    threeDaysLater.setHours(23, 59, 59, 999);

    // Usar digiflex.cxc.report — renglones con saldo abierto (facturas y
    // notas de credito; estas ultimas traen amount_residual NEGATIVO en este
    // modelo, verificado contra Odoo real, asi que "!= 0" las incluye).
    const domain: any[] = [
      ["company_id", "in", companyIds],
      ["amount_residual", "!=", 0],
    ];

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
      },
    )) || [];

    const openInvoices = records
      .filter((r: any) => !((r.partner_name || "").toLowerCase().includes("supricom")))
      .map((r: any) => {
        // Con signo (negativo = nota de credito abierta) para que los
        // totales sumados mas abajo neten correctamente.
        const residual = r.amount_residual || 0;
        const dueDateStr = r.date_maturity || null;
        let agingDays = r.days_overdue || 0;

        return {
          id: r.id,
          moveId: Array.isArray(r.move_id) ? r.move_id[0] : (typeof r.move_id === "number" ? r.move_id : 0),
          name: r.document_number || "",
          partnerId: r.partner_id?.[0] || 0,
          partnerName: r.partner_name || r.partner_id?.[1] || "Sin cliente",
          companyId: r.company_id?.[0] || 0,
          companyName: r.company_name || r.company_id?.[1] || "",
          invoiceDate: r.invoice_date || null,
          invoiceDateDue: dueDateStr,
          amountResidual: residual,
          invoiceUserId: r.user_id?.[0] || 0,
          invoiceUserName: r.user_name || r.user_id?.[1] || "Sin asignar",
          agingDays,
          transactionType: r.transaction_type || "",
        };
      });

    const facturasPorVencer = openInvoices
      .filter((inv) => {
        if (!inv.invoiceDateDue) return false;
        const [y, m, d] = inv.invoiceDateDue.split("-").map(Number);
        const due = new Date(y, m - 1, d);
        return due >= today && due <= threeDaysLater && inv.agingDays <= 0;
      })
      .map((inv) => {
        const [y, m, d] = inv.invoiceDateDue!.split("-").map(Number);
        const due = new Date(y, m - 1, d);
        return {
          ...inv,
          daysUntilDue: Math.ceil(
            (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          ),
          companyName:
            COMPANY_NAMES[inv.companyId as keyof typeof COMPANY_NAMES] ||
            inv.companyName,
        };
      })
      .sort((a, b) => {
        const [ay, am, ad] = a.invoiceDateDue!.split("-").map(Number);
        const [by, bm, bd] = b.invoiceDateDue!.split("-").map(Number);
        return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
      });

    const facturasVencidas = openInvoices
      .filter((inv) => inv.agingDays > 0)
      .map((inv) => ({
        ...inv,
        companyName:
          COMPANY_NAMES[inv.companyId as keyof typeof COMPANY_NAMES] ||
          inv.companyName,
      }))
      .sort((a, b) => b.agingDays - a.agingDays);

    return NextResponse.json({
      success: true,
      data: {
        facturasPorVencer,
        facturasVencidas,
        summary: {
          totalPorVencer: facturasPorVencer.length,
          totalPorVencerMonto: facturasPorVencer.reduce(
            (s, i) => s + i.amountResidual,
            0,
          ),
          totalVencidas: facturasVencidas.length,
          totalVencidasMonto: facturasVencidas.reduce(
            (s, i) => s + i.amountResidual,
            0,
          ),
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching CxC alerts:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar alertas" },
      { status: 500 },
    );
  }
}
