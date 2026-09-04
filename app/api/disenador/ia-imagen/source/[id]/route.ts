import { query } from "@/lib/db";
import { NextRequest } from "next/server";

// Sirve la imagen fuente de un job para que KIE (y el navegador) puedan
// descargarla por URL pública.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
