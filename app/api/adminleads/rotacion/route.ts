import { verifyToken } from "@/lib/jwt";
import { calcularRotacion, resolverCompanies } from "@/lib/adminleads/rotacion";
import { NextRequest, NextResponse } from "next/server";

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
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 401 });
    }

    const companies = resolverCompanies(payload);
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
