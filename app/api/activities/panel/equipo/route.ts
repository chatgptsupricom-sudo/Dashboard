// Panel de actividades, pestaña Equipo: vencidas, de hoy, en curso y
// culminadas en 7 días por persona que el usuario puede ver.
import { requireSession } from "@/lib/auth/roles";
import { alcanceDe, resumenEquipo, veEquipo } from "@/lib/actividades/datos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  const a = alcanceDe(auth.payload);
  if (!veEquipo(a)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    return NextResponse.json({ equipo: await resumenEquipo(a) });
  } catch (e) {
    console.error("[activities/panel/equipo]", e);
    return NextResponse.json({ error: "Error al leer el equipo" }, { status: 500 });
  }
}
