import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";


const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const MAX_BYTES = 10 * 1024 * 1024;

function detectImageMime(buf: Buffer): string | null {
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
  if (
    buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
  ) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
    if (["heic", "heix", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}


async function ensureFotoColumns() {
  try {
    await query("ALTER TABLE seguridad_ingresos ADD COLUMN foto_estado_data LONGBLOB NULL");
  } catch {}
  try {
    await query("ALTER TABLE seguridad_ingresos ADD COLUMN foto_estado_mime VARCHAR(50) NULL");
  } catch {}
}

function parseIngresoId(raw: string): number | null {
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
    const ingresoId = parseIngresoId(id);
    if (ingresoId === null) {
      return NextResponse.json({ error: "id invalido" }, { status: 400 });
    }

    await ensureFotoColumns();

    const exists = await query(
      "SELECT id FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Peticion invalida" }, { status: 400 });
    }

    const file = formData.get("foto");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Campo 'foto' requerido" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Archivo vacio" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `supera 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = detectImageMime(buf);
    if (!mime || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido" },
        { status: 400 },
      );
    }

    await query(
      "UPDATE seguridad_ingresos SET foto_estado_data = ?, foto_estado_mime = ? WHERE id = ?",
      [buf, mime, ingresoId],
    );

    return NextResponse.json({
      success: true,
      message: "Foto guardada",
      size: buf.length,
      mime,
    });
  } catch (error: any) {
    console.error("[seguridad/ingreso/foto POST] error:", error.message);
    return NextResponse.json({ error: "Error al procesar la foto" }, { status: 500 });
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
    const ingresoId = parseIngresoId(id);
    if (ingresoId === null) {
      return new Response("Not found", { status: 404 });
    }

    await ensureFotoColumns();

    const result = await query(
      "SELECT foto_estado_data, foto_estado_mime FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );
    const row = result.rows?.[0];

    if (!row || !row.foto_estado_data) {
      return new Response("Not found", { status: 404 });
    }

    const buf = Buffer.isBuffer(row.foto_estado_data)
      ? row.foto_estado_data
      : Buffer.from(row.foto_estado_data);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.foto_estado_mime || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("[seguridad/ingreso/foto GET] error:", error.message);
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
    const ingresoId = parseIngresoId(id);
    if (ingresoId === null) {
      return NextResponse.json({ error: "id invalido" }, { status: 400 });
    }

    await ensureFotoColumns();

    const exists = await query(
      "SELECT id FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    await query(
      "UPDATE seguridad_ingresos SET foto_estado_data = NULL, foto_estado_mime = NULL WHERE id = ?",
      [ingresoId],
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[seguridad/ingreso/foto DELETE] error:", error.message);
    return NextResponse.json({ error: "Error al eliminar la foto" }, { status: 500 });
  }
}
