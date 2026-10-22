import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { sedeSinSeguridad } from "@/lib/rma/sedesSeguridad";

export const dynamic = "force-dynamic";

// /api/rma/[id]/prueba
//
// Pruebas de recepción y entrega cuando el cliente no está para firmar, en
// una sede sin Seguridad (lib/rma/sedesSeguridad.ts):
//
//   llegada_encomienda  foto de la guía o del paquete de un equipo que llegó
//                       por encomienda (el acta de recepción la firma solo RMA
//                       y la exige antes de guardarse).
//   nota_entrega        foto de la nota de entrega firmada por el cliente, que
//                       trae el chofer de la ruta al volver.
//
// La guía de la agencia de una salida por encomienda sigue siendo
// /api/rma/[id]/guia (le manda el correo al cliente).
//
// Van a rma_ticket_adjuntos con su `tipo`, como la guía. GET ?adjunto=<id>
// las muestra con la sesión de RMA (los casos sin tracking_token no tienen
// enlace público).

const TIPOS_PRUEBA = ["llegada_encomienda", "nota_entrega"] as const;

// Solo fotos: se ven en la galería de adjuntos del caso, que no muestra PDF.
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 20 * 1024 * 1024;

// Mismos magic bytes que /api/rma/[id]/guia.
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
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
    if (["heic", "heix", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

async function ensureTipoColumn() {
  try {
    await query(`ALTER TABLE rma_ticket_adjuntos ADD COLUMN tipo VARCHAR(30) DEFAULT 'reporte'`);
  } catch (e: any) {
    if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) {
      console.error("[rma/prueba] ensureTipoColumn:", e.message);
    }
  }
}

/** El caso, si es de una sede sin Seguridad y de la sede de la sesión. */
async function casoDeLaSede(id: string, payload: any) {
  const r = await query(`SELECT id, company_id, tracking_token FROM rma_cases WHERE id = ?`, [id]);
  const caso = (r.rows as any[])[0];
  if (!caso) return null;
  const rol = String(payload?.role || "").toLowerCase().trim();
  const cids = Number(payload?.cids);
  if (rol !== "superadmin" && Number.isFinite(cids) && cids > 0 && Number(caso.company_id) !== cids) return null;
  return caso;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const caso = await casoDeLaSede(id, auth.payload);
    const adjuntoId = parseInt(new URL(request.url).searchParams.get("adjunto") || "", 10);
    if (!caso || !adjuntoId) return new NextResponse("No encontrado", { status: 404 });
    const r = await query(
      `SELECT filename, mime, data FROM rma_ticket_adjuntos
        WHERE id = ? AND ticket_id = ? AND tipo IN (${TIPOS_PRUEBA.map(() => "?").join(",")})`,
      [adjuntoId, caso.id, ...TIPOS_PRUEBA],
    );
    const a = (r.rows as any[])[0];
    if (!a) return new NextResponse("No encontrado", { status: 404 });
    const buf = Buffer.isBuffer(a.data) ? a.data : Buffer.from(a.data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": a.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${String(a.filename || "prueba").replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: any) {
    console.error("Error leyendo prueba de RMA:", error);
    return new NextResponse("Error", { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const caso = await casoDeLaSede(id, auth.payload);
    if (!caso) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    if (!sedeSinSeguridad(caso.company_id)) {
      return NextResponse.json({ error: "En esta sede la recepción y la entrega las registra Seguridad" }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Peticion invalida" }, { status: 400 });
    }
    const tipo = String(formData.get("tipo") || "");
    if (!(TIPOS_PRUEBA as readonly string[]).includes(tipo)) {
      return NextResponse.json({ error: "Tipo de prueba inválido" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo supera 20 MB" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = detectMime(buf);
    if (!mime || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: "Sube una foto (JPG, PNG, WEBP o HEIC)" }, { status: 400 });
    }

    await ensureTipoColumn();
    const r = await query(
      `INSERT INTO rma_ticket_adjuntos (ticket_id, tracking_token, filename, mime, size, data, tipo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [caso.id, caso.tracking_token || "", (file.name || tipo).slice(0, 255), mime, file.size, buf, tipo],
    );
    return NextResponse.json({ success: true, id: (r.rows as any)?.insertId ?? null });
  } catch (error: any) {
    console.error("Error subiendo prueba de RMA:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
