import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Get categories actually used by saleable products
    const groups = await callOdooRPC<any[]>(
      "product.product",
      "read_group",
      [[["sale_ok", "=", true]]],
      {
        fields: ["categ_id"],
        groupby: ["categ_id"],
        lazy: false,
        limit: 500,
      },
    );

    const categoryIds = (groups || [])
      .map((g: any) => (Array.isArray(g.categ_id) ? g.categ_id[0] : g.categ_id))
      .filter(Boolean);

    if (categoryIds.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Fetch category details with parent
    const categories = await callOdooRPC<any[]>(
      "product.category",
      "search_read",
      [[["id", "in", categoryIds]]],
      {
        fields: ["id", "name", "parent_id"],
        order: "name asc",
        limit: 500,
      },
    );

    return NextResponse.json(
      (categories || []).map((c: any) => ({
        id: c.id,
        name: c.name || "",
        parent: Array.isArray(c.parent_id) ? c.parent_id[1] : "",
      })),
    );
  } catch (error: any) {
    console.error("GET /api/rma/categories error:", error.message);
    return NextResponse.json([]);
  }
}
