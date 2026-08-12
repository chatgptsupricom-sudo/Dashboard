import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(48, parseInt(searchParams.get("limit") || "24"));
    const brand = searchParams.get("brand") || "";
    const category = searchParams.get("category") || "";
    const withFilters = searchParams.get("filters") === "1";

    const domain: any[] = [["sale_ok", "=", true]];

    if (search) {
      domain.push("|");
      domain.push(["default_code", "ilike", search]);
      domain.push(["name", "ilike", search]);
    }
    if (brand) {
      domain.push(["x_studio_marca.name", "ilike", brand]);
    }
    if (category) {
      domain.push(["categ_id.name", "ilike", category]);
    }

    const offset = (page - 1) * limit;

    const [products, total] = await Promise.all([
      callOdooRPC<any[]>("product.product", "search_read", [domain], {
        fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "list_price", "company_sale_price", "image_128"],
        limit,
        offset,
        order: "name asc",
      }),
      callOdooRPC<number>("product.product", "search_count", [domain]),
    ]);

    const results = (products || []).map((p: any) => ({
      id: p.id,
      default_code: p.default_code || "",
      name: p.name || "",
      brand: Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : (p.x_studio_marca || ""),
      category: Array.isArray(p.categ_id) ? p.categ_id[1] : "",
      price: p.company_sale_price || p.list_price || 0,
      image: p.image_128 ? `data:image/png;base64,${p.image_128}` : "",
    }));

    let brands: string[] = [];
    let categories: string[] = [];

    if (withFilters) {
      const [brandGroups, catList] = await Promise.all([
        callOdooRPC<any[]>("product.product", "read_group", [[["sale_ok", "=", true]]], {
          fields: ["x_studio_marca"],
          groupby: ["x_studio_marca"],
          lazy: false,
        }),
        callOdooRPC<any[]>("product.category", "search_read", [[]], {
          fields: ["name"],
          order: "name asc",
          limit: 200,
        }),
      ]);

      brands = (brandGroups || [])
        .map((g: any) => (Array.isArray(g.x_studio_marca) ? g.x_studio_marca[1] : g.x_studio_marca))
        .filter(Boolean)
        .sort();

      categories = (catList || []).map((c: any) => c.name).filter(Boolean);
    }

    return NextResponse.json({
      success: true,
      products: results,
      total: total || 0,
      page,
      totalPages: Math.ceil((total || 0) / limit),
      brands,
      categories,
    });
  } catch (error: any) {
    console.error("GET /api/disenador/productos error:", error.message);
    return NextResponse.json({ success: false, products: [], total: 0, totalPages: 0 });
  }
}
