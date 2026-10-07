import { requireRoles, requireSession } from "@/lib/auth/roles";
import { guardarManual, listarManuales, puedeEditar, ROLES_EDITORES } from "@/lib/manuales/datos";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Manuales de procedimiento (lib/manuales/datos.ts).
//   GET            -> { manuales, roles? }  los que el rol puede ver; a quien
//                     edita, además la lista de roles para asignar.
//   POST {manual}  -> { id }  crea uno (SuperAdmin y Procesos).

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  const rol = String(auth.payload?.role ?? "");
  const manuales = await listarManuales(rol);
  if (!puedeEditar(rol)) return NextResponse.json({ manuales });
  const [filas] = await db.execute("SELECT name, display_name FROM roles ORDER BY display_name, name");
  const roles = (filas as any[])
    .map((f) => ({ rol: String(f.name).toLowerCase().trim(), nombre: String(f.display_name || f.name) }))
    .filter((r) => r.rol && r.rol !== "superadmin");
  return NextResponse.json({ manuales, roles });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_EDITORES);
  if (auth.error) return auth.error;
  try {
    const id = await guardarManual(null, await request.json(), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
