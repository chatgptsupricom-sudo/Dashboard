import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const MAX_BYTES = 500 * 1024;


async function ensureColumns() {
  try {
    await query(`ALTER TABLE seguridad_despachos ADD COLUMN firma_data LONGBLOB NULL`);
  } catch (e: any) {
    if (!e.message?.includes("Duplicate")) console.error("[firma] ensure firma_data:", e.message);
  }
  try {
    await query(`ALTER TABLE seguridad_despachos ADD COLUMN firma_mime VARCHAR(50) DEFAULT 'image/png' NULL`);
  } catch (e: any) {
    if (!e.message?.includes("Duplicate")) console.error("[firma] ensure firma_mime:", e.message);
  }
}

function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;
  const mime = `image/${match[1]}`;
  const base64 = match[2];
  try {
    const buffer = Buffer.from(base64, "base64");
    return { mime, buffer };
  } catch {
    return null;
  }
}

function parseDespachoId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const despachoId = parseDespachoId(id);
    if (despachoId === null) {
      return NextResponse.json({ error: "id invalido" }, { status: 400 });
    }

    await ensureColumns();

    const exists = await query(
      "SELECT id FROM seguridad_despachos WHERE id = ?",
      [despachoId],
    );
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "Despacho no encontrado" }, { status: 404 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const firmaDataUrl = typeof body.firma_data_url === "string" ? body.firma_data_url.trim() : "";
    if (!firmaDataUrl) {
      return NextResponse.json({ error: "firma_data_url requerido" }, { status: 400 });
    }
    if (!firmaDataUrl.startsWith("data:image/png;base64,")) {
      return NextResponse.json(
        { error: "Solo se permite firma en formato PNG" },
        { status: 400 },
      );
    }

    const decoded = decodeDataUrl(firmaDataUrl);
    if (!decoded) {
      return NextResponse.json({ error: "Data URL invalido" }, { status: 400 });
    }

    if (decoded.buffer.length === 0) {
      return NextResponse.json({ error: "Firma vacia" }, { status: 400 });
    }
    if (decoded.buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: `supera 500 KB (${(decoded.buffer.length / 1024).toFixed(1)} KB)` },
        { status: 400 },
      );
    }

    await query(
      "UPDATE seguridad_despachos SET firma_data = ?, firma_mime = ? WHERE id = ?",
      [decoded.buffer, decoded.mime, despachoId],
    );

    return NextResponse.json({
      success: true,
      size: decoded.buffer.length,
    });
  } catch (error: any) {
    console.error("[seguridad/despacho/firma POST] error:", error.message);
    return NextResponse.json({ error: "Error al procesar la firma" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const despachoId = parseDespachoId(id);
    if (despachoId === null) {
      return new Response("Not found", { status: 404 });
    }

    await ensureColumns();

    const result = await query(
      "SELECT firma_data, firma_mime FROM seguridad_despachos WHERE id = ?",
      [despachoId],
    );
    const row = result.rows?.[0];

    if (!row || !row.firma_data) {
      return new Response("Not found", { status: 404 });
    }

    const buf = Buffer.isBuffer(row.firma_data)
      ? row.firma_data
      : Buffer.from(row.firma_data);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.firma_mime || "image/png",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("[seguridad/despacho/firma GET] error:", error.message);
    return new Response("Error", { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const despachoId = parseDespachoId(id);
    if (despachoId === null) {
      return NextResponse.json({ error: "id invalido" }, { status: 400 });
    }

    await ensureColumns();

    const exists = await query(
      "SELECT id FROM seguridad_despachos WHERE id = ?",
      [despachoId],
    );
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "Despacho no encontrado" }, { status: 404 });
    }

    await query(
      "UPDATE seguridad_despachos SET firma_data = NULL, firma_mime = NULL WHERE id = ?",
      [despachoId],
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[seguridad/despacho/firma DELETE] error:", error.message);
    return NextResponse.json({ error: "Error al eliminar la firma" }, { status: 500 });
  }
}
