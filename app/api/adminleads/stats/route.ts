// GET /api/adminleads/stats?sede=&seller_id=&canal=&fecha_inicio=&fecha_fin=
//
// Panel de Métricas de Leads. El cálculo (y sus criterios) está en
// lib/adminleads/metricas.ts, compartido con el Excel de /api/adminleads/export.

import { calcularMetricas } from "@/lib/adminleads/metricas";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(await calcularMetricas(auth.payload, request.nextUrl.searchParams));
  } catch (error: any) {
    console.error("Error en API stats:", error);
    return NextResponse.json(
      { error: "Error en base de datos", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
