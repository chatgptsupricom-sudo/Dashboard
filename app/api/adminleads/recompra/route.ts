// GET /api/adminleads/recompra?sede=&desde=&hasta=&origen=
//
// Cuántas veces volvió a comprar cada cliente que llegó por un lead, después
// de la primera venta. Ver lib/adminleads/recompra.ts.

import { calcularRecompra, filtrosRecompra } from "@/lib/adminleads/recompra";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    const data = await calcularRecompra({
      userCids: (auth.payload!.cids as number) ?? null,
      ...filtrosRecompra(request.nextUrl.searchParams),
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("GET /api/adminleads/recompra error:", error?.message);
    return NextResponse.json(
      { error: "Error generando el reporte", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
