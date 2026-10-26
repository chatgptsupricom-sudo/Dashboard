// Tablero de leads de Excel de Monitoreo Leads (lib/adminleads/leadsExcel.ts).
//   GET                -> leads de Excel con la forma de /api/adminleads/leads
//   GET ?cerrados=1    -> solo los cerrados desde el tablero (sección Cierres)
//   PATCH              -> mismo cuerpo que PATCH /api/vendedores/leads;
//                         { leadId, newSellerId } reasigna; { id, status, reabrir } reabre

import { actualizarLeadExcel, ErrorLeadExcel, listarLeadsExcel } from "@/lib/adminleads/leadsExcel";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const cidsDe = (payload: any) => Number(payload?.cids) || null;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;
  try {
    const cerrados = request.nextUrl.searchParams.get("cerrados") === "1";
    return NextResponse.json(await listarLeadsExcel(cidsDe(auth.payload), cerrados), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/leads-excel error:", error?.message);
    return NextResponse.json({ error: error?.message || "Error leyendo los leads de Excel" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;
  try {
    await actualizarLeadExcel(await request.json(), cidsDe(auth.payload));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof ErrorLeadExcel) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("PATCH /api/adminleads/leads-excel error:", error?.message);
    return NextResponse.json({ error: error?.message || "Error guardando el lead" }, { status: 500 });
  }
}
