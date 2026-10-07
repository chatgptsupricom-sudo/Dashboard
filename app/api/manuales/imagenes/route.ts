import { requireRoles } from "@/lib/auth/roles";
import { guardarImagen, MAX_IMAGEN, MIMES_IMAGEN, obtenerManual } from "@/lib/manuales/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST multipart { manualId, archivo } -> { id }. Captura para un paso (solo SuperAdmin).
// SVG no se acepta: puede llevar scripts.
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const form = await request.formData().catch(() => null);
  const manualId = Number(form?.get("manualId"));
  const archivo = form?.get("archivo");
  if (!Number.isInteger(manualId) || !(await obtenerManual(manualId)))
    return NextResponse.json({ error: "Guarda el manual antes de subir imágenes." }, { status: 400 });
  if (!(archivo instanceof File) || !MIMES_IMAGEN.has(archivo.type))
    return NextResponse.json({ error: "Sube una imagen PNG, JPG o WebP." }, { status: 400 });
  if (archivo.size > MAX_IMAGEN)
    return NextResponse.json({ error: "La imagen pesa más de 4 MB." }, { status: 400 });
  const id = await guardarImagen(manualId, archivo.type, Buffer.from(await archivo.arrayBuffer()));
  return NextResponse.json({ id });
}
