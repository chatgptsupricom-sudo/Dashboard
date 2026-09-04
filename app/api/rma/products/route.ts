import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Tambien lo usa /adminleads/banco-imagenes para buscar/filtrar productos
// (busqueda generica de productos en Odoo, no algo exclusivo de RMA) — ver
// app/[locale]/adminleads/banco-imagenes/page.tsx.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma", "adminleads", "diseñador"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q") || "";
    const category = searchParams.get("category") || "";
    const fetchInvoice = searchParams.get("fetch_invoice") === "1";
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    if (!category && (!search || search.length < 2)) {
      return NextResponse.json([]);
    }

    const domain: any[] = [["sale_ok", "=", true]];

    if (search) {
      domain.push(["default_code", "ilike", search]);
    }

    if (category) {
      domain.push(["categ_id.name", "ilike", category]);
    }

    const products = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "list_price", "standard_price", "company_sale_price", "type", "image_128"],
        limit,
      },
    );

    if (!products) {
      return NextResponse.json([]);
    }

    // For each product, optionally try to find the last invoice that includes it
    const results = await Promise.all(
      products.map(async (p: any) => {
        let invoice_number = "";

        if (fetchInvoice) {
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
          list_price: p.company_sale_price || p.list_price || 0,
          standard_price: p.standard_price || 0,
          type: p.type || "",
          invoice_number,
          image: p.image_128 ? `data:image/png;base64,${p.image_128}` : "",
        };
      }),
    );

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("GET /api/rma/products error:", error.message);
    return NextResponse.json([]);
  }
}
