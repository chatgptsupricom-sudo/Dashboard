import { requireRoles } from "@/lib/auth/roles";
import { guardarPermiso, NIVELES, normCorreo, normRol, permisosAgente, type Nivel } from "@/lib/agenteia/acceso";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Quién usa el Agente IA, por correo (lib/agenteia/acceso.ts). Solo SuperAdmin.
//
//   GET                                    -> { usuarios: [{ email, nombre, rol, superadmin, nivel }] }
//   PUT { email, nivel: "consultor" | "editor" | null } -> guarda (null = sin acceso)

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const [filas] = await db.execute(
    `SELECT uc.email, uc.name, r.name AS rol, r.display_name
     FROM users_config uc LEFT JOIN roles r ON r.id = uc.role_id
     WHERE uc.email IS NOT NULL AND uc.email <> ''
     ORDER BY uc.name, uc.email`,
  );
  const permisos = await permisosAgente();
  const usuarios = (filas as any[]).map((f) => {
    const superadmin = normRol(f.rol) === "superadmin";
    return {
      email: normCorreo(f.email),
      nombre: String(f.name || ""),
      rol: String(f.display_name || f.rol || ""),
      superadmin,
      nivel: superadmin ? "editor" : (permisos.get(normCorreo(f.email)) ?? null),
    };
  });
  return NextResponse.json({ usuarios });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const email = normCorreo(body?.email);
  const nivel = body?.nivel ?? null;
  if (!email || email.length > 190 || !email.includes("@") || (nivel !== null && !NIVELES.includes(nivel)))
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  const por = String(auth.payload?.email ?? auth.payload?.uid ?? "");
  await guardarPermiso(email, nivel as Nivel | null, por);
  console.log(`[agenteia] acceso de ${email} -> ${nivel ?? "sin acceso"} (por ${por})`);
  return NextResponse.json({ email, nivel });
}
