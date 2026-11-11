import { requireSession } from "@/lib/auth/roles";
import { esProcesos } from "@/lib/manuales/permisos";
import { NextRequest, NextResponse } from "next/server";

/**
 * Guardia de lo que escribe en Manuales: solo el rol Procesos. No se usa
 * requireRoles porque ese deja pasar siempre al SuperAdmin, y escribir
 * manuales es solo de Procesos.
 */
export async function requireProcesos(request: NextRequest): Promise<{ payload?: any; error?: NextResponse }> {
  const auth = await requireSession(request);
  if (auth.error) return auth;
  if (!esProcesos(auth.payload?.role))
    return { error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }) };
  return auth;
}

/**
 * Guardia de lectura: cualquier sesión. Quien no es Procesos solo ve lo
 * publicado para su rol (`puedeLeerManual`); eso lo filtra cada ruta.
 */
export async function requireLector(
  request: NextRequest,
): Promise<{ payload?: any; editor?: boolean; error?: NextResponse }> {
  const auth = await requireSession(request);
  if (auth.error) return auth;
  return { payload: auth.payload, editor: esProcesos(auth.payload?.role) };
}
