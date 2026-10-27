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
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error("Error fetching gallery categories:", error.message);
    return NextResponse.json({ success: false, categories: [] }, { status: 500 });
  }
}
