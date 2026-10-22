import { requireRoles } from "@/lib/auth/roles";
import { crearFlujograma, listarFlujogramas } from "@/lib/flujogramas/datos";
import { ROLES_FLUJOGRAMAS } from "@/lib/flujogramas/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Flujogramas de procesos (lib/flujogramas/datos.ts). SuperAdmin y rol Procesos.
//   GET                          -> { flujogramas }  resumen de todos
//   POST {proceso?, subproceso?} -> { id }  uno nuevo con Inicio y Fin
//   POST {ejemplo: true}         -> { id }  el de RRHH (reclutamiento y selección)

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_FLUJOGRAMAS);
  if (auth.error) return auth.error;
  return NextResponse.json({ flujogramas: await listarFlujogramas() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_FLUJOGRAMAS);
  if (auth.error) return auth.error;
  try {
    const id = await crearFlujograma(await request.json().catch(() => ({})), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo crear" }, { status: 400 });
  }
}
