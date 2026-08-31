import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_NAMES: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, [
    "cuentas por cobrar",
    "gerente de operaciones",
    "gerencia de ventas",
    "asistente de ventas",
  ]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const invoiceFields = [
      "id", "name", "partner_id", "company_id", "move_type",
      "invoice_date", "invoice_date_due", "payment_state",
      "amount_untaxed", "amount_tax", "amount_total",
      "amount_residual", "invoice_user_id", "invoice_origin",
      "currency_id", "journal_id", "payment_reference",
      "narration", "invoice_line_ids",
    ];

    const invoices = (await callOdooRPC<any[]>(
      "account.move",
      "read",
      [[invoiceId]],
      { fields: invoiceFields },
    )) || [];

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        { success: false, error: "Factura no encontrada" },
        { status: 404 },
      );
    }

    const inv = invoices[0];

    const rawLineIds = Array.isArray(inv.invoice_line_ids) ? inv.invoice_line_ids : [];
    const lineIds = rawLineIds.map((l: any) => Array.isArray(l) ? l[0] : l).filter((id: any) => typeof id === "number");

    let lines: any[] = [];
    if (lineIds.length > 0) {
      lines = (await callOdooRPC<any[]>(
        "account.move.line",
        "read",
        [lineIds],
        {
          fields: [
            "name", "product_id", "quantity", "price_unit",
            "price_subtotal", "price_total", "discount",
            "tax_ids",
          ],
        },
      )) || [];
    }

    let payments: any[] = [];
    try {
      payments = (await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [[
          ["move_id", "=", invoiceId],
          ["account_id.account_type", "in", ["asset_receivable", "liability_payable"]],
        ]],
        {
          fields: ["id", "name", "date", "debit", "credit", "amount_residual", "reconciled"],
          order: "date asc",
        },
      )) || [];
    } catch {
      // ignore
    }

    const totalTax = Math.abs(inv.amount_tax || 0);
    const totalUntaxed = Math.abs(inv.amount_untaxed || 0);
    const totalWithTax = Math.abs(inv.amount_total || 0);
    const residual = Math.abs(inv.amount_residual || 0);
    const paid = totalWithTax - residual;

    const companyId = inv.company_id?.[0] || 0;

    return NextResponse.json({
      success: true,
      data: {
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
        amountUntaxed: totalUntaxed,
        amountTax: totalTax,
        amountTotal: totalWithTax,
        amountResidual: residual,
        amountPaid: paid,
        invoiceUserId: inv.invoice_user_id?.[0] || 0,
        invoiceUserName: inv.invoice_user_id?.[1] || "Sin asignar",
        invoiceOrigin: inv.invoice_origin || "",
        currencyId: inv.currency_id?.[0] || 0,
        currencyName: inv.currency_id?.[1] || "",
        journalId: inv.journal_id?.[0] || 0,
        journalName: inv.journal_id?.[1] || "",
        paymentReference: inv.payment_reference || "",
        narration: inv.narration || "",
        lines: lines.map((line: any) => ({
          id: line.id,
          name: line.name || "",
          productId: line.product_id?.[0] || 0,
          productName: line.product_id?.[1] || "",
          quantity: line.quantity || 0,
          priceUnit: line.price_unit || 0,
          discount: line.discount || 0,
          priceSubtotal: Math.abs(line.price_subtotal || 0),
          priceTotal: Math.abs(line.price_total || 0),
          taxIds: Array.isArray(line.tax_ids) ? line.tax_ids : [],
        })),
        payments,
        totals: {
          subtotal: totalUntaxed,
          tax: totalTax,
          total: totalWithTax,
          paid,
          residual,
        },
      },
    });
  } catch (error: any) {
    console.error("Error invoice detail:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
