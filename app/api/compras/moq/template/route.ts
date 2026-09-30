import { query } from "@/lib/db";
import { almacenables } from "@/lib/compras/datosOdoo";
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

    // Almacenables activos con código; marca = la de Odoo (spiff_brand_id),
    // la misma que en el resto de Compras. Antes era la primera palabra del
    // nombre, que salía vacía en los nombres que empiezan con espacio.
    const productsData = await almacenables();

    const moqsDb = await query("SELECT sku, cantidad, costo FROM moqs");
    const moqMap = new Map(moqsDb.rows.map((row: any) => [row.sku, row]));

    const productsWithMeta = productsData
      .filter((p) => !p.codigo.startsWith("PROD-"))
      .map((p) => {
        const registro = moqMap.get(p.codigo);
        return {
          sku: p.codigo,
          nombre: p.nombre,
          marca: p.marca,
          categoria: p.categoria,
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
