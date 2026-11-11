import { query } from "@/lib/db";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_MARKETING_ELECTRO } from "@/lib/auth/marketingElectro";
import { filtroBancoGerente } from "@/lib/gerente-marca/banco";
import { ROL_GERENTE_MARCA } from "@/lib/gerente-marca/tipos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [
    "adminleads",
    "gerente de operaciones",
    "vendedor",
    "seller",
    "diseñador",
    ROL_BI,
    ROL_GERENTE_MARCA,
    ROL_MARKETING_ELECTRO,
  ]);
  if (auth.error) return auth.error;

  try {
    const deSusMarcas = await filtroBancoGerente(auth.payload);
    const result = await query(
      `SELECT DISTINCT category FROM product_images pi
        WHERE category IS NOT NULL AND category != ''${deSusMarcas ? ` AND ${deSusMarcas.sql}` : ""}
        ORDER BY category ASC`,
      deSusMarcas?.params ?? []
    );
    const categories = (result.rows || []).map((r: any) => r.category);
    // Marcas con su cantidad de flyers, para los filtros de la galería.
    const marcas = await query(
      `SELECT brand AS nombre, COUNT(*) AS n FROM product_images pi
        WHERE brand IS NOT NULL AND brand != ''${deSusMarcas ? ` AND ${deSusMarcas.sql}` : ""}
        GROUP BY brand ORDER BY brand ASC`,
      deSusMarcas?.params ?? []
    );
    const brands = (marcas.rows || []).map((r: any) => ({ nombre: r.nombre, n: Number(r.n) }));
    const res = await query(
      `SELECT COUNT(*) AS total,
              SUM(created_at >= NOW() - INTERVAL 7 DAY) AS nuevos,
              SUM(price IS NULL OR price <= 0) AS sin_precio
         FROM product_images pi${deSusMarcas ? ` WHERE ${deSusMarcas.sql}` : ""}`,
      deSusMarcas?.params ?? []
    );
    const r = res.rows?.[0] || {};
    const resumen = { total: Number(r.total) || 0, nuevos: Number(r.nuevos) || 0, sinPrecio: Number(r.sin_precio) || 0 };
    return NextResponse.json({ success: true, categories, brands, resumen });
  } catch (error: any) {
    console.error("Error fetching gallery categories:", error.message);
    return NextResponse.json({ success: false, categories: [] }, { status: 500 });
  }
}
