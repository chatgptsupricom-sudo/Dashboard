import { requireRoles } from "@/lib/auth/roles";
import { guardarRolesConAgente, normRol, rolesConAgente } from "@/lib/agenteia/acceso";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Qué roles del panel usan el Agente IA (lib/agenteia/acceso.ts). Solo SuperAdmin.
//
//   GET                     -> { roles: [{ rol, nombre, permitido }] }
//   PUT { roles: string[] } -> guarda la lista (rol en minúsculas)

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const [filas] = await db.execute("SELECT name, display_name FROM roles ORDER BY display_name, name");
  const habilitados = new Set(await rolesConAgente());
  const roles = (filas as any[])
    .map((f) => ({ rol: normRol(f.name), nombre: String(f.display_name || f.name) }))
    .filter((r) => r.rol && r.rol !== "superadmin")
    .map((r) => ({ ...r, permitido: habilitados.has(r.rol) }));
  return NextResponse.json({ roles });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.roles) || !body.roles.every((r: unknown) => typeof r === "string" && r.length <= 80))
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  const por = String(auth.payload?.email ?? auth.payload?.uid ?? "");
  const roles = await guardarRolesConAgente(body.roles, por);
  console.log(`[agenteia] acceso actualizado por ${por}:`, roles);
  return NextResponse.json({ roles });
}
