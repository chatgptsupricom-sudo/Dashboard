import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q") || "";

    if (!search || search.length < 2) {
      return NextResponse.json([]);
    }

    const domain: any[] = [
      ["sale_ok", "=", true],
      ["default_code", "ilike", search],
    ];

    const products = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "list_price", "type"],
        limit: 20,
      },
    );

    if (!products) {
      return NextResponse.json([]);
    }

    // For each product, try to find the last invoice that includes it
    const results = await Promise.all(
      products.map(async (p: any) => {
        let invoice_number = "";

        try {
          // Find account.move.line records for this product
          const invoiceLines = await callOdooRPC<any[]>(
            "account.move.line",
            "search_read",
            [
              [
                ["product_id", "=", p.id],
                ["move_id.move_type", "=", "out_invoice"],
                ["move_id.state", "=", "posted"],
              ],
            ],
            {
              fields: ["move_id"],
              limit: 1,
              order: "date desc",
            },
          );

          if (invoiceLines && invoiceLines.length > 0) {
            const moveId = invoiceLines[0].move_id[0] || invoiceLines[0].move_id;
            // Fetch the invoice name
            const invoice = await callOdooRPC<any[]>(
              "account.move",
              "search_read",
              [[["id", "=", moveId]]],
              {
                fields: ["name", "invoice_date"],
                limit: 1,
              },
            );
            if (invoice && invoice.length > 0) {
              invoice_number = invoice[0].name || "";
            }
          }
        } catch {
          // Invoice lookup is best-effort, don't fail the whole request
        }

        const m = p.x_studio_marca;
        const cat = p.categ_id;
        const categoryName = Array.isArray(cat) ? cat[1] : cat || "";

        return {
          id: p.id,
          default_code: p.default_code || "",
          name: p.name || "",
          hardware: categoryName,
          brand: Array.isArray(m) ? m[1] : m || "",
          model: p.name || "",
          list_price: p.list_price || 0,
          type: p.type || "",
          invoice_number,
        };
      }),
    );

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("GET /api/rma/products error:", error.message);
    return NextResponse.json([]);
  }
}
