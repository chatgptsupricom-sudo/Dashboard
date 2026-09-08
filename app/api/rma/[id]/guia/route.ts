import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { enviarCorreoEnviadoAgencia } from "@/lib/rma/emailEnviado";
import { getPublicOrigin } from "@/lib/publicOrigin";

export const dynamic = "force-dynamic";

// POST /api/rma/[id]/guia
//
// Al marcar como "entregado" un caso cuyo metodo de entrega es "agencia",
// hace falta adjuntar la guia/comprobante de envio de la agencia (una foto
// o captura) antes de que el despacho quede confirmado -- pedido del
// usuario. Este endpoint hace las tres cosas en una sola llamada: guarda
// la foto, marca despachado_at, y dispara el correo de "ya se envio tu
// equipo" con la foto adjunta.
//
// Reusa la tabla rma_ticket_adjuntos (misma que usa el portal publico
// para las fotos que el cliente sube al reportar la falla) para no
// duplicar el mecanismo de guardado en MySQL -- se distingue por la
// columna `tipo` (nueva).

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 20 * 1024 * 1024;

// Mismos magic bytes que app/api/servicio-tecnico/ticket/adjuntos/route.ts
// (rutas de este modulo son autocontenidas, no se importan entre si).
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
      console.error("[rma/guia] ensureTipoColumn:", e.message);
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    const existing = await query(
      `SELECT id, case_number, status, origen, company_id, odoo_partner_id,
              tracking_token, model, hardware, client_name, client_email,
              entrega_metodo, entrega_agencia, despachado_at
       FROM rma_cases WHERE id = ?`,
      [id],
    );
    const caso = existing.rows?.[0];
    if (!caso) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }
    if (caso.entrega_metodo !== "agencia") {
      return NextResponse.json(
        { error: "Este caso no se va a enviar por agencia -- no hace falta guia." },
        { status: 400 },
      );
    }
    if (caso.despachado_at) {
      return NextResponse.json({ error: "Este caso ya quedo marcado como entregado." }, { status: 409 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Peticion invalida" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta la foto de la guia" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "El archivo esta vacio" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen supera 20 MB" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = detectMime(buf);
    if (!mime || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: "Sube una foto (JPG, PNG, WEBP o HEIC)" }, { status: 400 });
    }

    await ensureTipoColumn();

    // tracking_token puede faltar en un caso creado internamente (no todos
    // pasan por el portal) -- sin token no hay como armar un link publico
    // a la foto, asi que se guarda igual pero el correo se omite (mismo
    // criterio que enviarCorreoReparado).
    const trackingToken: string | null = caso.tracking_token || null;

    const insertResult = await query(
      `INSERT INTO rma_ticket_adjuntos (ticket_id, tracking_token, filename, mime, size, data, tipo)
       VALUES (?, ?, ?, ?, ?, ?, 'guia_agencia')`,
      [caso.id, trackingToken || "", (file.name || "guia").slice(0, 255), mime, file.size, buf],
    );
    const guiaId = (insertResult.rows as any)?.insertId;

    await query(
      `UPDATE rma_cases SET despachado_at = CURDATE() WHERE id = ? AND despachado_at IS NULL`,
      [id],
    );

    if (trackingToken && guiaId) {
      const guiaUrl = `${getPublicOrigin(request)}/api/servicio-tecnico/ticket/adjuntos/${trackingToken}/${guiaId}`;
      enviarCorreoEnviadoAgencia(
        {
          id: caso.id,
          case_number: caso.case_number,
          origen: caso.origen,
          odoo_partner_id: caso.odoo_partner_id,
          model: caso.model,
          hardware: caso.hardware,
          client_name: caso.client_name,
          client_email: caso.client_email,
          entrega_agencia: caso.entrega_agencia,
        },
        guiaUrl,
      );
    }

    return NextResponse.json({ success: true, guia_id: guiaId });
  } catch (error: any) {
    console.error("Error subiendo guia de agencia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
