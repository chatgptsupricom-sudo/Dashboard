// ============================================================
// API — Búsqueda de productos Odoo para Frecuencia CPM
// GET /api/plan-contenido/frecuencia/odoo?tipo=marca&valor=HP
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { callOdooRPC } from "@/lib/odoo";

const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = {
  9: 9, // Valencia
  10: 10, // Caracas
};

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") || "";
    const valor = searchParams.get("valor") || "";
    const sede = parseInt(searchParams.get("sede") || "9");

    if (!["marca", "categoria", "producto"].includes(tipo)) {
      return NextResponse.json(
        { error: "Tipo inválido. Use: marca, categoria o producto" },
        { status: 400 },
      );
    }

    if (!valor.trim()) {
      return NextResponse.json(
        { error: "Debe proporcionar un valor de búsqueda" },
        { status: 400 },
      );
    }

    // Get warehouse location
    const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[sede];
    let locationIds: number[] = [];
    if (warehouseId) {
      const warehouseData = await callOdooRPC<any[]>(
        "stock.warehouse",
        "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 1 },
      );
      const locId = warehouseData?.[0]?.lot_stock_id?.[0];
      if (locId) locationIds = [locId];
    }

    // Build search domain
    let domain: any[] = [
      ["sale_ok", "=", true],
      ["active", "=", true],
      ["type", "=", "product"],
    ];

    if (tipo === "marca") {
      domain.push(["x_studio_marca", "ilike", valor]);
    } else if (tipo === "categoria") {
      const categs = await callOdooRPC<any[]>(
        "product.category",
        "search_read",
        [["name", "ilike", valor]],
        { fields: ["id", "name"], limit: 1 },
      );
      if (categs && categs.length > 0) {
        domain.push(["categ_id", "=", categs[0].id]);
      }
    } else if (tipo === "producto") {
      domain.push(["name", "ilike", valor]);
    }

    // Search products
    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: [
          "id",
          "display_name",
          "name",
          "default_code",
          "categ_id",
          "x_studio_marca",
          "company_sale_price",
        ],
        limit: 5000,
        order: "name asc",
        context: { allowed_company_ids: [sede], lang: "es_VE" },
      },
    );

    if (!productos || productos.length === 0) {
      return NextResponse.json({ products: [], totalStock: 0, count: 0 });
    }

    // Get stock
    const productIds = productos.map((p: any) => p.id);
    const stockDomain: any[] = [["product_id", "in", productIds]];
    if (locationIds.length > 0) {
      stockDomain.push(["location_id", "child_of", locationIds]);
    } else {
      stockDomain.push(["location_id.usage", "=", "internal"]);
    }

    const stockData = await callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [stockDomain],
      {
        fields: ["product_id", "quantity"],
        context: { allowed_company_ids: [sede] },
      },
    );

    // Map stock by product
    const stockMap: Record<number, number> = {};
    if (stockData) {
      stockData.forEach((s: any) => {
        const pid = Array.isArray(s.product_id) ? s.product_id[0] : s.product_id;
        stockMap[pid] = Math.floor(s.quantity || 0);
      });
    }

    // Format results
    const products = productos.map((p: any) => ({
      id: p.id,
      sku: p.default_code || `ID-${p.id}`,
      name: p.display_name || p.name,
      brand: p.x_studio_marca || "Sin marca",
      stock: stockMap[p.id] || 0,
      price: p.company_sale_price || 0,
    }));

    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

    return NextResponse.json({
      products,
      totalStock,
      count: products.length,
    });
  } catch (error) {
    console.error("[plan-contenido/frecuencia/odoo]", error);
    return NextResponse.json(
      { error: "Error al buscar productos en Odoo" },
      { status: 500 },
    );
  }
}
