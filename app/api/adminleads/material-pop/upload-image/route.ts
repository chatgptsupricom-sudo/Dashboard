import { query } from "@/lib/db";
import { requireAdminLeadsValencia } from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function detectMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";

  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se envió un archivo" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `El archivo supera los ${MAX_BYTES / 1024 / 1024} MB` },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = detectMime(buf);

    if (!mime || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Usa JPG, PNG o WebP" },
        { status: 400 },
      );
    }

    const userId = auth.payload?.uid || auth.payload?.id || null;
    const cids = auth.payload?.cids || 9;

    const result = await query(
      `INSERT INTO pop_product_images (filename, mime, size, data, cids, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [file.name.slice(0, 255), mime, file.size, buf, cids, userId],
    );

    const imageId = (result.rows as any)?.insertId;

    return NextResponse.json({
      success: true,
      imageId,
      imageUrl: `/api/adminleads/material-pop/images/${imageId}`,
    });
  } catch (error: any) {
    console.error("Error subiendo imagen POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
