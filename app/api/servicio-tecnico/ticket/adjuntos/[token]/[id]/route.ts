import { query } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Sirve el binario de un adjunto. La ruta usa el tracking_token para que no
// sea adivinable por id secuencial (issue #25: no exponer endpoints por id).
//
// GET /api/servicio-tecnico/ticket/adjuntos/[token]/[id]
//
// El panel interno (#24) tambien consume este endpoint pasando el token
// desde la consulta del ticket.

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
  } catch {}
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  try {
    await ensureAdjuntosTable();
    const { token, id } = await params;

    // Validar id como entero para evitar SQL injection aunque usemos params.
    const adjuntoId = parseInt(id, 10);
    if (!Number.isFinite(adjuntoId) || adjuntoId <= 0) {
      return new Response("Not found", { status: 404 });
    }

    const result = await query(
      `SELECT data, mime, filename FROM rma_ticket_adjuntos
       WHERE id = ? AND tracking_token = ?
       LIMIT 1`,
      [adjuntoId, token]
    );
    const row = result.rows?.[0];

    if (!row || !row.data) {
      return new Response("Not found", { status: 404 });
    }

    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);

    // Forzar el mime validado (issue #21: nunca servir con el mime del cliente)
    // y disposition segun tipo: inline para imagen/video, attachment para el resto.
    const isMedia = (row.mime || "").startsWith("image/") || (row.mime || "").startsWith("video/");
    const disposition = isMedia ? "inline" : "attachment";

    // Sanitizar filename para evitar header injection.
    const safeName = String(row.filename || "adjunto").replace(/[\r\n"\\]/g, "_");

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.mime || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("[adjuntos/serve] error:", error.message);
    return new Response("Error", { status: 500 });
  }
}