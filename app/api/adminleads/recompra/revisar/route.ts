// GET /api/adminleads/recompra/revisar
//
// Leads de Excel para revisar a mano: vendidos sin cliente ubicado y posibles
// ventas que quedaron como contactado/negociación. Ver revisarLeads().

import { revisarLeads } from "@/lib/adminleads/recompra";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { payloadLeads, sedeElegida } from "@/lib/adminleads/sucursal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;
  auth.payload = payloadLeads(request, auth.payload);

  try {
    const elegida = sedeElegida(auth.payload);
    const leads = await revisarLeads(
      typeof elegida === "number" ? elegida : elegida !== "todas" && Number(auth.payload!.cids) === 7 ? 7 : null,
    );
    return NextResponse.json({ leads });
  } catch (error: any) {
    console.error("GET /api/adminleads/recompra/revisar error:", error?.message);
    return NextResponse.json({ error: error?.message || "No se pudo revisar" }, { status: 500 });
  }
}
