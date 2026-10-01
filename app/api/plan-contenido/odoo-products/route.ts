// ============================================================
// API — Búsqueda de productos Odoo para Plan de Contenido
// GET /api/plan-contenido/odoo-products
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { searchOdooProducts } from "@/lib/plan-contenido/odoo";

export async function GET(request: NextRequest) {
  // Solo marketing y superAdmin
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

    const products = await searchOdooProducts({ tipo, valor, sede });

    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

    return NextResponse.json({
      products,
      totalStock,
      count: products.length,
    });
  } catch (error) {
    console.error("[plan-contenido/odoo-products]", error);
    return NextResponse.json(
      { error: "Error al buscar productos en Odoo" },
      { status: 500 },
    );
  }
}
