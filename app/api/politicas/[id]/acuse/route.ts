import { idValido, lectorDe, requireLectorPoliticas } from "@/lib/politicas/acceso";
import { marcarLeida, obtenerPolitica } from "@/lib/politicas/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST -> { ok }  "Leído y entendido" de la versión actual, a nombre de quien consulta.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLectorPoliticas(request);
  if (auth.error) return auth.error;
  const lector = lectorDe(auth.payload);
  const id = idValido((await params).id);
  const politica = id ? await obtenerPolitica(lector, id) : null;
  if (!politica || politica.estado !== "vigente")
    return NextResponse.json({ error: "Solo se confirma la lectura de una política vigente." }, { status: 400 });
  if (!lector.email) return NextResponse.json({ error: "Tu sesión no tiene correo." }, { status: 400 });
  await marcarLeida(lector, politica);
  return NextResponse.json({ ok: true });
}
