import { query } from "@/lib/db";
import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Tipos MIME permitidos. El cliente puede mentir en Content-Type y en la extension,
// asi que validamos contra los magic bytes del buffer.
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
]);

// Tamano maximo por archivo: 20 MB. Videos cortos de celular pesan entre 10 y 60 MB,
// 20 MB es un techo razonable para subida por datos moviles. Si el equipo decide
// subirlo, hay que pasar a Firebase Storage (issue #21, decision documentada).
const MAX_BYTES = 20 * 1024 * 1024;

// Magic bytes por tipo. Cada firma es un prefijo exacto.
// Fuente: https://en.wikipedia.org/wiki/Magic_number_(programming)
function detectMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";

  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";

  // HEIC/HEIF: en ISO BMFF, bytes 4-10 son "ftyp" + brand. Aceptamos "heic", "heix", "heim", "heis", "mif1"
  if (
    buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
  ) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
    if (["heic", "heix", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }

  // MP4 / MOV: comparte firma ISO BMFF. Box "ftyp" en bytes 4-7 con brand compatible.
  if (
    buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
  ) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
    if (["mp42", "mp41", "isom", "avc1", "qt  ", "3gp4", "3gp5", "3gp6"].includes(brand)) {
      return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
    }
  }

  return null;
}

// Asegura que la tabla existe. Se llama en cada POST para que un deploy
// sin correr la migracion manual no tumbe el portal.
async function ensureAdjuntosTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS rma_ticket_adjuntos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT DEFAULT NULL,
        tracking_token VARCHAR(64) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        mime VARCHAR(100) NOT NULL,
        size INT NOT NULL,
        data LONGBLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tracking_token (tracking_token),
        INDEX idx_ticket (ticket_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e: any) {
    console.error("[adjuntos] ensure table:", e.message);
  }
}

// POST: Recibe archivos para un tracking_token. No requiere sesion (portal publico).
// Body: multipart/form-data con `tracking_token` (string) y `files` (uno o varios File).
// El cliente crea el tracking_token antes de subir (mismo UUID que usara el ticket).
// Si el ticket no existe todavia, ticket_id queda NULL y se enlaza despues (#22).
export async function POST(request: NextRequest) {
  // Este acepta escrituras anónimas en la base sin ninguna identificación: es
  // almacenamiento gratis para quien lo encuentre. Con 5 archivos por ticket y
  // 3 tickets por hora, 20 subidas/hora deja holgura para reintentos.
  const bloqueo = aplicarLimites(request, "adjuntos-subir", [
    { max: 20, ventanaSegundos: 3600 },
  ]);
  if (bloqueo) return bloqueo;

  try {
    await ensureAdjuntosTable();

    // Un POST sin cuerpo multipart hace que formData() lance, y sin esto se
    // iba por el catch de abajo como un 500. Un 500 en una ruta pública es
    // ruido en los logs y, para quien esté sondeando, la señal de que algo
    // reventó por dentro.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Peticion invalida" },
        { status: 400 },
      );
    }

    const trackingToken = formData.get("tracking_token") as string | null;

    if (!trackingToken || trackingToken.length < 16 || trackingToken.length > 64) {
      return NextResponse.json(
        { error: "tracking_token invalido" },
        { status: 400 }
      );
    }

    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No se enviaron archivos" },
        { status: 400 }
      );
    }

    if (files.length > 5) {
      return NextResponse.json(
        { error: "Maximo 5 archivos por ticket" },
        { status: 400 }
      );
    }

    const saved: Array<{ id: number; filename: string; mime: string; size: number }> = [];
    const errors: Array<{ filename: string; reason: string }> = [];

    for (const file of files) {
      const filename = file.name || "archivo";
      const size = file.size;

      if (size === 0) {
        errors.push({ filename, reason: "archivo vacio" });
        continue;
      }
      if (size > MAX_BYTES) {
        errors.push({ filename, reason: `supera 20 MB (${(size / 1024 / 1024).toFixed(1)} MB)` });
        continue;
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const mime = detectMime(buf);

      if (!mime || !ALLOWED_MIME.has(mime)) {
        errors.push({ filename, reason: "tipo de archivo no permitido" });
        continue;
      }

      try {
        const result = await query(
          `INSERT INTO rma_ticket_adjuntos (tracking_token, filename, mime, size, data)
           VALUES (?, ?, ?, ?, ?)`,
          [trackingToken, filename.slice(0, 255), mime, size, buf]
        );
        const newId = (result.rows as any)?.insertId;
        if (newId) {
          saved.push({ id: newId, filename, mime, size });
        }
      } catch (e: any) {
        console.error("[adjuntos] insert error:", e.message);
        errors.push({ filename, reason: "error al guardar" });
      }
    }

    return NextResponse.json(
      {
        success: true,
        saved,
        errors,
        // Importante: aunque algunos fallen, devolvemos success:true si al menos
        // uno se guardo. El cliente decide que hacer con los errores parciales.
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Mensaje generico al cliente, detalle al log (issue #25: no exponer internos)
    console.error("[adjuntos] POST error:", error.message);
    return NextResponse.json(
      { error: "Error al procesar los archivos" },
      { status: 500 }
    );
  }
}

// GET: Lista los adjuntos de un tracking_token. Usado por el cliente para verificar
// que su upload quedo OK, y por el panel interno para mostrar el detalle (#24).
export async function GET(request: NextRequest) {
  const bloqueo = aplicarLimites(request, "adjuntos-listar", [
    { max: 60, ventanaSegundos: 60 },
  ]);
  if (bloqueo) return bloqueo;

  try {
    await ensureAdjuntosTable();
    const url = new URL(request.url);
    const trackingToken = url.searchParams.get("tracking_token");

    if (!trackingToken) {
      return NextResponse.json(
        { error: "tracking_token requerido" },
        { status: 400 }
      );
    }

    // No seleccionamos `data` (pesado) — solo metadata y url de descarga.
    const result = await query(
      `SELECT id, filename, mime, size, created_at
       FROM rma_ticket_adjuntos
       WHERE tracking_token = ?
       ORDER BY created_at ASC`,
      [trackingToken]
    );

    const rows = (result.rows || []).map((r: any) => ({
      ...r,
      url: `/api/servicio-tecnico/ticket/adjuntos/${trackingToken}/${r.id}`,
    }));

    return NextResponse.json({ success: true, adjuntos: rows });
  } catch (error: any) {
    console.error("[adjuntos] GET error:", error.message);
    return NextResponse.json(
      { error: "Error al listar adjuntos" },
      { status: 500 }
    );
  }
}