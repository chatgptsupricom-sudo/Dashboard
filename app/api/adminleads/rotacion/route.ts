import { calcularRotacion, resolverCompanies } from "@/lib/adminleads/rotacion";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/adminleads/rotacion
 *
 * Reporte de rotación de SKUs para el equipo de contenido. Solo cantidades
 * físicas: nada de precios, márgenes, costos ni facturación (ver
 * lib/adminleads/rotacion.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const companies = resolverCompanies(auth.payload!);
    if (!companies) {
      return NextResponse.json(
        { success: false, error: "Sin sucursal asignada" },
        { status: 403 },
      );
    }

    const data = await calcularRotacion(companies);
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("GET /api/adminleads/rotacion error:", error?.message);
    return NextResponse.json(
      { success: false, error: "No se pudo calcular la rotación" },
      { status: 500 },
    );
  }
}
