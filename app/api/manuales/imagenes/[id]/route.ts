import { requireLector } from "@/lib/manuales/acceso";
import { obtenerImagen, obtenerManual } from "@/lib/manuales/datos";
import { puedeLeerManual } from "@/lib/manuales/permisos";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// GET: una captura de manual. Procesos cualquiera; otro rol, solo las de un
// manual publicado para su rol.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLector(request);
  if (auth.error) return auth.error;
  const img = await obtenerImagen(Number((await params).id));
  const manual = img && !auth.editor ? await obtenerManual(img.manualId) : null;
  if (!img || (!auth.editor && !(manual && puedeLeerManual(manual, auth.payload?.role))))
    return new Response("No encontrada", { status: 404 });
  const buf = Buffer.isBuffer(img.data) ? img.data : Buffer.from(img.data);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
