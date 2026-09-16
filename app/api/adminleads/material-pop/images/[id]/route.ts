import { query } from "@/lib/db";
import { requireAdminLeadsValencia } from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const imageId = Number(id);
    if (!Number.isFinite(imageId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const cids = auth.payload?.cids || null;

    const res = await query(
      "SELECT filename, mime, size, data FROM pop_product_images WHERE id = ? AND (cids = ? OR ? IS NULL) LIMIT 1",
      [imageId, cids, cids],
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    const image = res.rows[0];
    const data = Buffer.from(image.data);

    return new NextResponse(data, {
      headers: {
        "Content-Type": image.mime,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${image.filename}"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("Error sirviendo imagen POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
