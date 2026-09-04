import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest } from "next/server";

const ROLES = ["diseñador"]; // superadmin siempre pasa via requireRoles

// Sirve el binario de un diseño guardado en MySQL.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    const result = await query(
      `SELECT image_data, image_mime FROM designer_designs WHERE id = ?`,
      [id]
    );
    const row = result.rows?.[0];

    if (!row || !row.image_data) {
      return new Response("Not found", { status: 404 });
    }

    const buf = Buffer.isBuffer(row.image_data)
      ? row.image_data
      : Buffer.from(row.image_data);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.image_mime || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("GET /api/disenador/disenos/image:", error.message);
    return new Response("Error", { status: 500 });
  }
}
