import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import { menorRotacion } from "@/lib/compras/reportes";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/estancados?sede=9 — Menor rotación: productos con stock
 * disponible que no se venden hace 30 días o más. Días inactivos = días desde
 * la última venta del producto en la sede (lib/compras/reportes.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const data = await menorRotacion(sedeId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("❌ Error en API Estancados:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
