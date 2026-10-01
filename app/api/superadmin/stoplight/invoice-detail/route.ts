import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import { accesoStoplight, ROLES_DETALLE_VENTAS } from "@/lib/stoplight/acceso";

export async function GET(request: NextRequest) {
  try {
    // CxC también abre facturas desde su modal (vista multi-sede, igual que
    // gerente de operaciones), por eso va en la lista.
    const acceso = await accesoStoplight(request, [...ROLES_DETALLE_VENTAS, "cuentas por cobrar"]);
    if (acceso.error) return acceso.error;
    const { rol, companyId } = acceso;

    const url = new URL(request.url);
    const invoiceId = url.searchParams.get("invoice_id");

    if (!invoiceId) {
      return NextResponse.json({ error: "Falta invoice_id" }, { status: 400 });
    }

    // 1. Fetch invoice header
    const invoiceData = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        // Gerencia de Ventas solo ve facturas de su sede.
        rol === "gerencia de ventas"
          ? [["id", "=", parseInt(invoiceId, 10)], ["company_id", "=", companyId]]
          : [["id", "=", parseInt(invoiceId, 10)]],
      ],
      {
        fields: ["id", "name", "invoice_date", "amount_untaxed", "amount_tax", "amount_total", "move_type", "partner_id", "invoice_user_id"],
        limit: 1,
      }
    );

    if (!invoiceData || invoiceData.length === 0) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }

    const invoice = invoiceData[0];

    // 2. Fetch invoice lines
    const lines = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [
        [
          ["move_id", "=", parseInt(invoiceId, 10)],
          ["display_type", "=", "product"],
          ["product_id", "!=", false],
        ],
      ],
      {
        fields: ["product_id", "name", "quantity", "price_unit", "price_subtotal", "price_total"],
        limit: 100,
      }
    );

    // 3. Build lines with product details
    const invoiceLines = (lines || []).map((line: any) => ({
      productId: line.product_id?.[0] || null,
      productName: line.product_id?.[1] || line.name || "Producto sin nombre",
      description: line.name || "",
      quantity: Number(line.quantity) || 0,
      priceUnit: Number(line.price_unit) || 0,
      subtotal: Number(line.price_subtotal) || 0,
      total: Number(line.price_total) || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: invoice.id,
        reference: invoice.name || "",
        date: invoice.invoice_date,
        moveType: invoice.move_type === "out_refund" ? "Nota de credito" : "Factura",
        subtotal: Number(invoice.amount_untaxed) || 0,
        tax: Number(invoice.amount_tax) || 0,
        total: Number(invoice.amount_total) || 0,
        partnerName: invoice.partner_id?.[1] || "",
        sellerName: invoice.invoice_user_id?.[1] || "",
        lines: invoiceLines,
      },
    });
  } catch (error: any) {
    console.error("Error en API invoice-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
