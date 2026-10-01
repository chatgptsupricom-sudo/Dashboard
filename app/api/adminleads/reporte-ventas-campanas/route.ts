// GET /api/adminleads/reporte-ventas-campanas?desde=&hasta=&sede=
//
// Ventas cerradas del período con la campaña de la que vino cada una.
// A diferencia de /reporte-campanas (economía de la pauta Meta, solo campañas
// con inversión), acá entran todos los canales: Meta, Whatsapp, referidos y los
// leads sin campaña registrada, para que ninguna venta quede fuera del total.

import {
  calcularVentasCampanas,
  resolverRango,
  resolverSede,
} from "@/lib/adminleads/ventasCampanas";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { desde, hasta } = resolverRango(searchParams);

    const data = await calcularVentasCampanas({
      userCids: (auth.payload!.cids as number) ?? null,
      sede: resolverSede(searchParams),
      desde,
      hasta,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("GET /api/adminleads/reporte-ventas-campanas error:", error?.message);
    return NextResponse.json(
      { error: "Error generando el reporte", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
