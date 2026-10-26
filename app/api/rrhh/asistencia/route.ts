import { requireRoles } from "@/lib/auth/roles";
import { reporte } from "@/lib/asistencia/datos";
import { ROLES_ASISTENCIA } from "@/lib/asistencia/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Asistencia por biométrico (lib/asistencia/). RRHH y SuperAdmin.
//   GET ?sede=9&desde=YYYY-MM-DD&hasta=YYYY-MM-DD -> Reporte (por empleado, con cada día)

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  const p = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await reporte(p.get("sede"), p.get("desde") ?? "", p.get("hasta") ?? ""));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo armar el reporte" }, { status: 400 });
  }
}
