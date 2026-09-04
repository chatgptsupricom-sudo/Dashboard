import { query } from "@/lib/db";
import { NextRequest } from "next/server";

// Sirve la imagen fuente de un job para que KIE (y el navegador) puedan
// descargarla por URL pública.
//
// SIN requireRoles a proposito: quien descarga esto son los servidores de KIE,
// que no tienen la cookie de sesion. Si se le pone el guard, KIE responde
// "File type not supported" y la generacion nunca arranca. Lo que protege el
// acceso es que la URL lleva el id del job y no se puede listar desde fuera.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    // La URL lleva una extensión (ej. "6.png") para que KIE reconozca el tipo de
    // archivo al descargarla; aquí solo nos interesa el id numérico.
    const id = parseInt(rawId, 10);
    if (!Number.isFinite(id)) {
      return new Response("Not found", { status: 404 });
    }
    const result = await query(
      `SELECT source_image_data, source_image_mime FROM designer_ai_jobs WHERE id = ?`,
      [id]
    );
    const row = result.rows?.[0];
    if (!row?.source_image_data) {
      return new Response("Not found", { status: 404 });
    }
    const buf = Buffer.isBuffer(row.source_image_data)
      ? row.source_image_data
      : Buffer.from(row.source_image_data);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.source_image_mime || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("GET /api/disenador/ia-imagen/source:", error.message);
    return new Response("Error", { status: 500 });
  }
}
