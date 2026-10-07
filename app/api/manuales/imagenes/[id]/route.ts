import { requireProcesos } from "@/lib/manuales/acceso";
import { obtenerImagen } from "@/lib/manuales/datos";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// GET: una captura de manual. Solo rol Procesos.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProcesos(request);
  if (auth.error) return auth.error;
  const img = await obtenerImagen(Number((await params).id));
  if (!img)
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
