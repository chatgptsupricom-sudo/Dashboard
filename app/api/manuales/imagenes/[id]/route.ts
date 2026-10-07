import { requireSession } from "@/lib/auth/roles";
import { obtenerImagen, obtenerManual, puedeVer } from "@/lib/manuales/datos";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// GET: la imagen, si el rol puede ver el manual al que pertenece.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  const img = await obtenerImagen(Number((await params).id));
  const manual = img ? await obtenerManual(img.manualId) : null;
  if (!img || !manual || !puedeVer(manual, String(auth.payload?.role ?? "")))
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
