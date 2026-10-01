import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code") || "";

    if (!code) {
      return NextResponse.json({ error: "Provide ?code=XXXX" }, { status: 400 });
    }

    const products = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["default_code", "ilike", code]]],
      { limit: 1 },
    );

    if (!products || products.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const p = products[0];
    // Return ALL fields of the product
    return NextResponse.json({ product: p });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
