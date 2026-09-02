import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin" && userRole !== "gerente de operaciones") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const url = new URL(request.url);
    const invoiceId = url.searchParams.get("invoice_id");
    const companyIdParam = url.searchParams.get("company_id");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : 0;

    if (!invoiceId) {
      return NextResponse.json({ error: "Falta invoice_id" }, { status: 400 });
    }

    // 1. Fetch invoice header
    const invoiceData = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [["id", "=", parseInt(invoiceId, 10)]],
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
