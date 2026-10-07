import { requireProcesos } from "@/lib/manuales/acceso";
import { guardarManual, listarManuales } from "@/lib/manuales/datos";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Manuales de procedimiento (lib/manuales/datos.ts). Solo rol Procesos.
//   GET            -> { manuales, roles }  todos, y los roles para marcar lectores.
//   POST {manual}  -> { id }  crea uno.

export async function GET(request: NextRequest) {
  const auth = await requireProcesos(request);
  if (auth.error) return auth.error;
  const manuales = await listarManuales();
  const [filas] = await db.execute("SELECT name, display_name FROM roles ORDER BY display_name, name");
  const roles = (filas as any[])
    .map((f) => ({ rol: String(f.name).toLowerCase().trim(), nombre: String(f.display_name || f.name) }))
    .filter((r) => r.rol && r.rol !== "superadmin");
  return NextResponse.json({ manuales, roles });
}

export async function POST(request: NextRequest) {
  const auth = await requireProcesos(request);
  if (auth.error) return auth.error;
  try {
    const id = await guardarManual(null, await request.json(), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
