import { requireRoles } from "@/lib/auth/roles";
import { leerFacturaPDF } from "@/lib/compras/validarFactura";
import { hayIA } from "@/lib/inteligencia-negocio/clasificacion/ia";
import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * POST (multipart: archivo) — lee una factura en PDF o foto con la IA y
 * devuelve proveedor, número y renglones. No guarda nada; los Excel los lee la
 * pantalla sola.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"], { soloLee: true });
  if (auth.error) return auth.error;
  if (!hayIA()) return NextResponse.json({ error: "No hay IA configurada para leer PDF: carga la factura en Excel" }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (!TIPOS.includes(archivo.type)) return NextResponse.json({ error: "Sube un PDF, una foto o un Excel" }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "El archivo pasa de 15 MB" }, { status: 400 });

  try {
    const r = await leerFacturaPDF(Buffer.from(await archivo.arrayBuffer()), archivo.type);
    if (!r.renglones.length) return NextResponse.json({ error: "No se encontraron productos en el documento" }, { status: 422 });
    return NextResponse.json(r);
  } catch (e: any) {
    console.error("❌ validar-factura/leer:", e?.message);
    return NextResponse.json({ error: e?.message || "No se pudo leer el documento" }, { status: 502 });
  }
}
