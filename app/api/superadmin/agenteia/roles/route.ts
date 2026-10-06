import { requireRoles } from "@/lib/auth/roles";
import { normRol } from "@/lib/agenteia/acceso";
import { AREAS, AREAS_LISTA, configPorDefecto, configsGuardadas, guardarConfigRol } from "@/lib/agenteia/alcance";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Qué información ve el Agente IA según el rol (lib/agenteia/alcance.ts). Solo SuperAdmin.
//
//   GET                  -> { areas: [{ id, etiqueta, descripcion }], roles: [{ rol, nombre, config, porDefecto }] }
//   PUT { rol, config }  -> guarda { sede: "todas"|"propia", propio, areas[] } de ese rol

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const [filas] = await db.execute("SELECT name, display_name FROM roles ORDER BY display_name, name");
  const guardadas = await configsGuardadas();
  const roles = (filas as any[])
    .map((f) => ({ rol: normRol(f.name), nombre: String(f.display_name || f.name) }))
    .filter((r) => r.rol && r.rol !== "superadmin")
    .map((r) => ({ ...r, config: guardadas.get(r.rol) ?? configPorDefecto(r.rol), porDefecto: !guardadas.has(r.rol) }));
  const areas = AREAS_LISTA.map((id) => ({ id, etiqueta: AREAS[id].etiqueta, descripcion: AREAS[id].descripcion }));
  return NextResponse.json({ areas, roles });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const rol = normRol(body?.rol);
  if (!rol || rol.length > 80 || rol === "superadmin" || typeof body?.config !== "object")
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  const por = String(auth.payload?.email ?? auth.payload?.uid ?? "");
  const config = await guardarConfigRol(rol, body.config, por);
  console.log(`[agenteia] alcance del rol ${rol} -> ${JSON.stringify(config)} (por ${por})`);
  return NextResponse.json({ rol, config });
}
