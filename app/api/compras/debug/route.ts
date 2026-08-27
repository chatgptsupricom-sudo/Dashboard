import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    await jwtVerify(token, jwtSecretBytes());

    const sku = request.nextUrl.searchParams.get("sku") || "006R04403";

    // 1. Buscar el product.product por SKU
    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["default_code", "=", sku]]],
      { fields: ["id", "name", "default_code", "product_tmpl_id"] },
    );

    if (!productos || productos.length === 0) {
      return NextResponse.json({
        error: `Producto ${sku} no encontrado en Odoo`,
      });
    }

    const prod = productos[0];
    const prodId = prod.id;
    const tmplId = prod.product_tmpl_id?.[0];

    // 2. Total de facturas visibles para el usuario RPC (sin contexto extra)
    const totalInvoicesSample = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
          ["state", "=", "posted"],
        ],
      ],
      { fields: ["id", "name", "invoice_date"], limit: 5, order: "id desc" },
    );

    // Contar total real sin límite (solo IDs)
    const allInvoiceIds = await callOdooRPC<any[]>(
      "account.move",
      "search",
      [
        [
          ["move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
          ["state", "=", "posted"],
        ],
      ],
      { limit: 0 },
    );

    // 3. Líneas de factura con este producto (búsqueda directa por product_id)
    const lineasDirectas = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [
        [
          ["product_id", "=", prodId],
          [
            "move_id.move_type",
            "in",
            ["out_invoice", "out_refund", "out_receipt"],
          ],
          ["move_id.state", "=", "posted"],
        ],
      ],
      {
        fields: ["id", "move_id", "quantity", "date"],
        limit: 10,
        order: "id desc",
      },
    );

    // 4. Costo del template
    const tmplData = tmplId
      ? await callOdooRPC<any[]>(
          "product.template",
          "search_read",
          [[["id", "=", tmplId]]],
          { fields: ["id", "name", "standard_price"] },
        )
      : null;

    return NextResponse.json({
      producto: {
        id: prodId,
        sku: prod.default_code,
        nombre: prod.name,
        tmplId,
      },
      totalFacturasVisiblesParaRPC: allInvoiceIds?.length ?? 0,
      ultimasFacturas: totalInvoicesSample?.map((i) => ({
        id: i.id,
        nombre: i.name,
        fecha: i.invoice_date,
      })),
      lineasConEsteProducto: lineasDirectas?.length ?? 0,
      ultimasLineas: lineasDirectas?.map((l) => ({
        lineaId: l.id,
        factura: l.move_id?.[1],
        cantidad: l.quantity,
        fecha: l.date,
      })),
      costoTemplate: tmplData?.[0]?.standard_price ?? "no encontrado",
      conclusion:
        (lineasDirectas?.length ?? 0) === 0
          ? "NUNCA VENDIDO CONFIRMADO — no aparece en ninguna factura visible para el RPC user"
          : `TIENE VENTAS — aparece en ${lineasDirectas?.length} líneas de factura`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
