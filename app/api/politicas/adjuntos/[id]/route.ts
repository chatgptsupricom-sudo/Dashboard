import { idValido, lectorDe, requireEditorPoliticas, requireLectorPoliticas } from "@/lib/politicas/acceso";
import { borrarAdjunto, obtenerAdjunto, obtenerPolitica } from "@/lib/politicas/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET: un adjunto, si quien consulta puede ver su política.
// PDF e imágenes se abren en el navegador; Word y Excel se descargan.
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await requireLectorPoliticas(request);
  if (auth.error) return auth.error;
  const id = idValido((await params).id);
  const adj = id ? await obtenerAdjunto(id) : null;
  if (!adj || !(await obtenerPolitica(lectorDe(auth.payload), adj.politicaId)))
    return new Response("No encontrado", { status: 404 });
  const buf = Buffer.isBuffer(adj.data) ? adj.data : Buffer.from(adj.data);
  const enLinea = adj.mime === "application/pdf" || adj.mime.startsWith("image/");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": adj.mime,
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(adj.nombre)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await requireEditorPoliticas(request);
  if (auth.error) return auth.error;
  const id = idValido((await params).id);
  if (id) await borrarAdjunto(id);
  return NextResponse.json({ ok: true });
}
