import { idValido, lectorDe, requireEditorPoliticas } from "@/lib/politicas/acceso";
import { acusesDe, obtenerPolitica } from "@/lib/politicas/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GET -> { leyeron, pendientes }  de la versión actual (Procesos y SuperAdmin).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEditorPoliticas(request);
  if (auth.error) return auth.error;
  const id = idValido((await params).id);
  const politica = id ? await obtenerPolitica(lectorDe(auth.payload), id) : null;
  if (!politica) return NextResponse.json({ error: "Política no encontrada" }, { status: 404 });
  return NextResponse.json(await acusesDe(politica));
}
