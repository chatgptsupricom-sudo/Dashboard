import { lectorDe, requireEditorPoliticas, requireLectorPoliticas } from "@/lib/politicas/acceso";
import { guardarPolitica, listarPoliticas } from "@/lib/politicas/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Políticas y Acuerdos (lib/politicas/datos.ts).
//   GET             -> { politicas }  las que ve quien consulta (con su acuse).
//   POST {politica} -> { id }  crea una (Procesos y SuperAdmin).

export async function GET(request: NextRequest) {
  const auth = await requireLectorPoliticas(request);
  if (auth.error) return auth.error;
  return NextResponse.json({ politicas: await listarPoliticas(lectorDe(auth.payload)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireEditorPoliticas(request);
  if (auth.error) return auth.error;
  try {
    const id = await guardarPolitica(null, await request.json(), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
