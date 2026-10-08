import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { guardarAutorizacion, MAX_BYTES_AUTORIZACION, mimeDeImagen } from "@/lib/ventas/autorizacionTransporte";

export const dynamic = "force-dynamic";

/**
 * POST /api/ventas/metodo-retiro/autorizacion (multipart, campo `file`)
 * Sube la foto de la autorización del cliente para el transporte externo y
 * devuelve su id, que después va en el PUT del método
 * (lib/ventas/autorizacionTransporte.ts). La suben quienes cargan el método:
 * vendedor, Asistente de Ventas y Almacén (cuando lo cambia).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["seller", "vendedor", "asistente de ventas", "almacen"]);
  if (auth.error) return auth.error;

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta la foto de la autorización" }, { status: 400 });
    }
    if (file.size > MAX_BYTES_AUTORIZACION) {
      return NextResponse.json({ error: "La foto supera 15 MB" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = mimeDeImagen(buf);
    if (!mime) {
      return NextResponse.json({ error: "Sube una foto en JPG, PNG o WEBP" }, { status: 400 });
    }
    const id = await guardarAutorizacion({
      buf,
      mime,
      filename: file.name || "autorizacion",
      autor: auth.payload?.name || auth.payload?.email || "",
      email: String(auth.payload?.email || ""),
    });
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("POST /api/ventas/metodo-retiro/autorizacion error:", error?.message);
    return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 });
  }
}
