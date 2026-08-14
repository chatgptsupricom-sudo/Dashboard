import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, brands: [], categories: [] }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const companyId = Number(payload.cids) || 9;

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "1", 10);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1)
      .toISOString()
      .split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const domain: any[] = [
      ["move_id.move_type", "=", "out_invoice"],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", startDate],
      ["move_id.invoice_date", "<=", endDate],
      ["move_id.company_id", "=", companyId],
      ["product_id", "!=", false],
      ["quantity", ">", 0],
    ];

    const lines = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [domain],
      {
        fields: ["product_id", "quantity"],
        limit: 50000,
      },
    );

    if (!lines || lines.length === 0) {
      return NextResponse.json({
        success: true,
        brands: [],
        categories: [],
        period: { startDate, endDate },
      });
    }

    // Fetch product details to get brand and category
    const productIds = [...new Set(lines.map((l: any) => l.product_id?.[0]).filter(Boolean))];

    // Process in batches of 100
    const productMap = new Map<number, { brand: string; category: string; name: string; code: string }>();
    for (let i = 0; i < productIds.length; i += 100) {
      const batch = productIds.slice(i, i + 100);
      const products = await callOdooRPC<any[]>(
        "product.product",
        "read",
        [batch],
        {
          fields: ["name", "default_code", "x_studio_marca", "categ_id"],
        },
      );
      for (const p of products || []) {
        productMap.set(p.id, {
          brand: Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : (p.x_studio_marca || "Sin marca"),
          category: Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría",
          name: p.name || "",
          code: p.default_code || "",
        });
      }
    }

    // Aggregate by brand
    const brandMap = new Map<string, { qty: number; products: Map<string, { qty: number; name: string; code: string }> }>();
    // Aggregate by category
    const categoryMap = new Map<string, number>();

    for (const line of lines) {
      const pid = line.product_id?.[0];
      if (!pid) continue;
      const info = productMap.get(pid);
      if (!info) continue;
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) continue;

      // Brand aggregation
      if (!brandMap.has(info.brand)) {
        brandMap.set(info.brand, { qty: 0, products: new Map() });
      }
      const brandEntry = brandMap.get(info.brand)!;
      brandEntry.qty += qty;

      const productKey = info.code || info.name;
      if (!brandEntry.products.has(productKey)) {
        brandEntry.products.set(productKey, { qty: 0, name: info.name, code: info.code });
      }
      brandEntry.products.get(productKey)!.qty += qty;

      // Category aggregation
      categoryMap.set(info.category, (categoryMap.get(info.category) || 0) + qty);
    }

    // Convert to sorted arrays
    const brands = [...brandMap.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 20)
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        products: [...data.products.entries()]
          .sort((a, b) => b[1].qty - a[1].qty)
          .slice(0, 10)
          .map(([key, p]) => ({
            code: p.code,
            name: p.name,
            qty: p.qty,
          })),
      }));

    const categories = [...categoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, qty]) => ({ name, qty }));

    return NextResponse.json({
      success: true,
      brands,
      categories,
      period: { startDate, endDate },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/product-stats error:", error.message);
    return NextResponse.json({ success: false, brands: [], categories: [] }, { status: 500 });
  }
}
