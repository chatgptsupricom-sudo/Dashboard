import { requireSession } from "@/lib/auth/roles";
import { esProcesos } from "@/lib/manuales/permisos";
import { NextRequest, NextResponse } from "next/server";

/**
 * Guardia de todas las APIs de Manuales: solo el rol Procesos. No se usa
 * requireRoles porque ese deja pasar siempre al SuperAdmin, y Manuales por
 * ahora es solo de Procesos.
 */
export async function requireProcesos(request: NextRequest): Promise<{ payload?: any; error?: NextResponse }> {
  const auth = await requireSession(request);
  if (auth.error) return auth;
  if (!esProcesos(auth.payload?.role))
    return { error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }) };
  return auth;
}
