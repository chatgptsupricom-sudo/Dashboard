import { idValido, lectorDe, requireEditorPoliticas } from "@/lib/politicas/acceso";
import { EXTENSIONES_ADJUNTO, guardarAdjunto, MAX_ADJUNTO, obtenerPolitica } from "@/lib/politicas/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST multipart { politicaId, archivo } -> { id, nombre, mime, tamano }.
// Documento original (PDF, Word, Excel o imagen). Procesos y SuperAdmin.
export async function POST(request: NextRequest) {
  const auth = await requireEditorPoliticas(request);
  if (auth.error) return auth.error;
  const form = await request.formData().catch(() => null);
  const politicaId = idValido(form?.get("politicaId"));
  const archivo = form?.get("archivo");
  if (!politicaId || !(await obtenerPolitica(lectorDe(auth.payload), politicaId)))
    return NextResponse.json({ error: "Guarda la política antes de adjuntar." }, { status: 400 });
  const ext = archivo instanceof File ? archivo.name.split(".").pop()?.toLowerCase() || "" : "";
  const mime = EXTENSIONES_ADJUNTO[ext];
  if (!(archivo instanceof File) || !mime)
    return NextResponse.json({ error: "Sube un PDF, Word, Excel o imagen (PNG, JPG, WebP)." }, { status: 400 });
  if (archivo.size > MAX_ADJUNTO)
    return NextResponse.json({ error: "El archivo pesa más de 10 MB." }, { status: 400 });
  const id = await guardarAdjunto(politicaId, archivo.name, mime, Buffer.from(await archivo.arrayBuffer()));
  return NextResponse.json({ id, nombre: archivo.name, mime, tamano: archivo.size });
}
