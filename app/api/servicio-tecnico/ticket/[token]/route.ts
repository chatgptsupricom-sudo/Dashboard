import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/servicio-tecnico/ticket/[token]
// Acceso directo al estatus via el tracking_token que recibio el cliente en
// la pantalla de confirmacion. Sin sesion (portal publico).
//
// Privacidad (issue #23): NO devuelve montos, direccion, notas internas,
// ni campos de Odoo. Devuelve solo lo necesario para que el cliente sepa
// en que va su reporte.

interface TicketPublic {
  case_number: string;
  status: string;
  status_label: string; // en lenguaje de cliente, viene del front
  product_name: string;
  product_code: string;
  invoice_number: string;
  serial: string | null;
  created_at: string;
  timeline: Array<{
    from_status: string | null;
    to_status: string;
    to_status_label: string;
    created_at: string;
    notes: string | null;
  }>;
}

// Mensaje generico (issue #23): igual para "no existe" y para "token invalido",
// para no permitir enumeracion.
const NOT_FOUND = "No encontramos ese reporte";

// Mascara telefonica: solo los ultimos 4 digitos.
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token || token.length < 16 || token.length > 64) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    // Buscar el caso por tracking_token. Solo Origen='portal' — los tickets
    // internos del panel no deben ser accesibles publicamente.
    const caseResult = await query(
      `SELECT case_number, status, model, hardware, product_code, invoice_number,
              serial, created_at, origen
       FROM rma_cases
       WHERE tracking_token = ? AND origen = 'portal'
       LIMIT 1`,
      [token],
    );
    const row = caseResult.rows?.[0];

    if (!row) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    // Timeline desde rma_history. NO devolvemos notes (interno).
    // El "changed_by" puede contener el nombre del cliente (portal),
    // es OK que lo vea.
    const historyResult = await query(
      `SELECT from_status, to_status, created_at
       FROM rma_history
       WHERE case_id = (SELECT id FROM rma_cases WHERE tracking_token = ? LIMIT 1)
       ORDER BY created_at ASC`,
      [token],
    );

    const ticket: TicketPublic = {
      case_number: row.case_number,
      status: row.status,
      status_label: row.status, // el front hace el mapeo a texto de cliente
      // `model` es el nombre del producto; `hardware` es la categoría.
      product_name: row.model || row.hardware || "",
      product_code: row.product_code || "",
      invoice_number: row.invoice_number || "",
      serial: row.serial || null,
      created_at: row.created_at,
      timeline: (historyResult.rows || []).map((h: any) => ({
        from_status: h.from_status,
        to_status: h.to_status,
        to_status_label: h.to_status, // el front mapea
        created_at: h.created_at,
        notes: null, // no exponer notas internas
      })),
    };

    return NextResponse.json({ success: true, ticket });
  } catch (error: any) {
    console.error("[ticket-by-token] error:", error.message);
    return NextResponse.json({ error: NOT_FOUND }, { status: 500 });
  }
}