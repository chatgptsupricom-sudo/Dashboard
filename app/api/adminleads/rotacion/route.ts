import { calcularRotacion, resolverCompanies, verCostoRotacion } from "@/lib/adminleads/rotacion";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { conSinIntercompaniaParaBI } from "@/lib/intercompania";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/adminleads/rotacion
 *
 * Reporte de rotación de SKUs para el equipo de contenido: cantidades y
 * precio de venta; el costo solo para SuperAdmin e Inteligencia de Negocio
 * (ver lib/adminleads/rotacion.ts).
 */
async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    const companies = resolverCompanies(auth.payload!, new URL(request.url).searchParams.get("sede"));
    if (!companies) {
      return NextResponse.json(
        { success: false, error: "Sin sucursal asignada" },
        { status: 403 },
      );
    }

    const verCosto = verCostoRotacion(auth.payload?.role);
    const data = await calcularRotacion(companies, verCosto);
    return NextResponse.json({ success: true, verCosto, ...data });
  } catch (error: any) {
    console.error("GET /api/adminleads/rotacion error:", error?.message);
    return NextResponse.json(
      { success: false, error: "No se pudo calcular la rotación" },
      { status: 500 },
    );
  }
}

// Inteligencia de Negocio no ve intercompañía (lib/intercompania.ts).
export const GET = conSinIntercompaniaParaBI(leerGET);
