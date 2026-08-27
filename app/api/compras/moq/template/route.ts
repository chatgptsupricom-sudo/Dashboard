import { query } from "@/lib/db";
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

    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const brandFilter = searchParams.get("brand")?.trim().toUpperCase() || "";
    const categoryFilter = searchParams.get("category")?.trim() || "";

    const productDomain = [
      ["active", "=", true],
      ["type", "=", "product"],
    ];
    const productFields = ["default_code", "name", "categ_id"];

    const productsData = (await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [productDomain],
      {
        fields: productFields,
        limit: 0,
      },
    )) || [];

    if (!productsData) {
      return NextResponse.json(
        { error: "Error obteniendo SKUs de Odoo" },
        { status: 500 },
      );
    }

    const moqsDb = await query("SELECT sku, cantidad, costo FROM moqs");
    const moqMap = new Map(moqsDb.rows.map((row: any) => [row.sku, row]));

    const productsWithMeta = productsData
      .filter(
        (p) =>
          p.default_code &&
          typeof p.default_code === "string" &&
          p.default_code.trim() !== "",
      )
      .map((p) => {
        const sku = p.default_code.trim();
        const nombre = p.name || "";
        const marca = nombre ? nombre.split(" ")[0].toUpperCase() : "SIN MARCA";
        const categoria = p.categ_id ? p.categ_id[1] : "Sin Categoría";
        const registro = moqMap.get(sku);

        return {
          sku,
          nombre,
          marca,
          categoria,
          cantidad: registro?.cantidad ?? "",
          costo: registro?.costo ?? "",
        };
      })
      .filter((p) => {
        if (brandFilter && p.marca !== brandFilter) return false;
        if (categoryFilter && p.categoria !== categoryFilter) return false;
        return true;
      });

    const brands = [...new Set(productsWithMeta.map((p) => p.marca))].sort();
    const categories = [...new Set(productsWithMeta.map((p) => p.categoria))].sort();

    return NextResponse.json(
      { success: true, data: productsWithMeta, brands, categories },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error generando plantilla:", error.message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
