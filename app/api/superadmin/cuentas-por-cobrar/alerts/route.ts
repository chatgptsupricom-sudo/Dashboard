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

    const companyIds =
      empresa && COMPANY_MAP[empresa]
        ? [COMPANY_MAP[empresa]]
        : [7, 9, 10];

    const moveDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
      ["payment_state", "!=", "paid"],
    ];

    const allInvoices =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [moveDomain],
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
            "amount_total",
            "amount_residual",
            "invoice_user_id",
          ],
        },
      )) || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    threeDaysLater.setHours(23, 59, 59, 999);

    const invoices = allInvoices
      .filter((inv) => !inv.partner_id?.[1]?.toLowerCase().includes("supricom"))
      .filter((inv) => {
        const residual = inv.amount_residual || 0;
        return residual > 0;
      })
      .map((inv) => {
        const amountTotal =
          inv.move_type === "out_refund"
            ? -Math.abs(inv.amount_total || 0)
            : inv.amount_total || 0;
        const residual = inv.amount_residual || 0;
        const dueDateStr = inv.invoice_date_due || null;
        let agingDays = 0;

        if (dueDateStr && residual > 0) {
          const [y, m, d] = dueDateStr.split(" ")[0].split("-").map(Number);
          const dueDate = new Date(y, m - 1, d);
          agingDays = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
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
          invoiceDateDue: dueDateStr,
          paymentState: inv.payment_state || "not_paid",
          amountTotal: amountTotal,
          amountResidual: residual,
          invoiceUserId: inv.invoice_user_id?.[0] || 0,
          invoiceUserName: inv.invoice_user_id?.[1] || "Sin asignar",
          agingDays,
        };
      });

    const openInvoices = invoices;

    const COMPANY_NAMES: Record<number, string> = {
      7: "Panamá",
      9: "Valencia",
      10: "Caracas",
    };

    const facturasPorVencer = openInvoices
      .filter((inv) => {
        if (!inv.invoiceDateDue) return false;
        const [y, m, d] = inv.invoiceDateDue.split(" ")[0].split("-").map(Number);
        const due = new Date(y, m - 1, d);
        return due >= today && due <= threeDaysLater && inv.agingDays <= 0;
      })
      .map((inv) => {
        const [y, m, d] = inv.invoiceDateDue!.split(" ")[0].split("-").map(Number);
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
      .sort(
        (a, b) => {
          const [ay, am, ad] = a.invoiceDateDue!.split(" ")[0].split("-").map(Number);
          const [by, bm, bd] = b.invoiceDateDue!.split(" ")[0].split("-").map(Number);
          return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
        },
      );

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
            (s, i) => s + Math.abs(i.amountResidual),
            0,
          ),
          totalVencidas: facturasVencidas.length,
          totalVencidasMonto: facturasVencidas.reduce(
            (s, i) => s + Math.abs(i.amountResidual),
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
