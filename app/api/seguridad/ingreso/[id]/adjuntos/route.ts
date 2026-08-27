import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const ingresoId = parseInt(id, 10);
    if (isNaN(ingresoId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const ingresoResult = await query(
      "SELECT rma_case_id FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );

    if (ingresoResult.rows.length === 0) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    const rmaCaseId = ingresoResult.rows[0].rma_case_id;
    if (!rmaCaseId) {
      return NextResponse.json({ success: true, adjuntos: [] });
    }

    let rmaCase: any = null;
    try {
      const rmaResult = await query(
        "SELECT tracking_token FROM rma_cases WHERE id = ?",
        [rmaCaseId],
      );
      if (rmaResult.rows.length > 0) {
        rmaCase = rmaResult.rows[0];
      }
    } catch (e: any) {
      console.warn("rma_cases no disponible:", e?.message);
    }

    const trackingToken = rmaCase?.tracking_token;
    if (!trackingToken) {
      return NextResponse.json({ success: true, adjuntos: [] });
    }

    let adjuntos: any[] = [];
    try {
      const adjResult = await query(
        `SELECT id, filename, mime, size, created_at
         FROM rma_ticket_adjuntos
         WHERE tracking_token = ?
         ORDER BY created_at ASC`,
        [trackingToken],
      );
      adjuntos = adjResult.rows.map((row: any) => ({
        id: row.id,
        filename: row.filename,
        mime: row.mime,
        size: row.size,
        created_at: row.created_at,
        url: `/api/servicio-tecnico/ticket/adjuntos/${trackingToken}/${row.id}`,
      }));
    } catch (e: any) {
      console.warn("rma_ticket_adjuntos no disponible:", e?.message);
    }

    return NextResponse.json({ success: true, adjuntos });
  } catch (error: any) {
    console.error("Error listando adjuntos del ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
