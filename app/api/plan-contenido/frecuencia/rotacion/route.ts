import { calcularRotacion } from "@/lib/adminleads/rotacion";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [
    "adminleads",
    "diseñador",
    "marketing",
  ]);
  if (auth.error) return auth.error;

  try {
    // SUPRICOM Venezuela: Valencia (9) + Caracas (10). Sin Panamá (7).
    const data = await calcularRotacion([9, 10]);
    return NextResponse.json({ success: true, sedes: [9, 10], ...data });
  } catch (error: any) {
    console.error(
      "GET /api/plan-contenido/frecuencia/rotacion error:",
      error?.message,
    );
    return NextResponse.json(
      { success: false, error: "No se pudo calcular la rotación" },
      { status: 500 },
    );
  }
}
