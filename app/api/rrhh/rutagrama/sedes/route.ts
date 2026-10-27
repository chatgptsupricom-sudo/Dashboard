import { requireRoles } from "@/lib/auth/roles";
import { guardarSitio, sitiosSedes } from "@/lib/rutagrama/datos";
import { ROLES_RUTAGRAMA } from "@/lib/rutagrama/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Sitio de trabajo de cada sede (el trabajador lo ve ya marcado en su mapa).
//   GET                              -> { sitios: [{sede, lat, lng, direccion}] }
//   PUT {sede, lat, lng, direccion?}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  return NextResponse.json({ sitios: await sitiosSedes() });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  try {
    await guardarSitio(await request.json().catch(() => ({})), String(auth.payload?.email ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
