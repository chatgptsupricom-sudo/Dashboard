import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const despachoId = parseInt(id, 10);
    if (isNaN(despachoId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const despachoResult = await query(
      "SELECT * FROM seguridad_despachos WHERE id = ?",
      [despachoId],
    );

    if (despachoResult.rows.length === 0) {
      return NextResponse.json({ error: "Despacho no encontrado" }, { status: 404 });
    }

    const row = despachoResult.rows[0];

    let facturas: string[] = [];
    if (row.facturas_json) {
      try {
        const parsed = JSON.parse(row.facturas_json);
        if (Array.isArray(parsed)) facturas = parsed.map((f) => String(f));
      } catch {
        facturas = [];
      }
    }

    const despacho = { ...row, facturas };

    let ingreso: any = null;
    if (despacho.ingreso_id) {
      try {
        const ingresoResult = await query(
          `SELECT id, cliente_nombre, hardware, serial, rma_case_id, fecha_entrega, recibido_por
           FROM seguridad_ingresos
           WHERE id = ?`,
          [despacho.ingreso_id],
        );
        if (ingresoResult.rows.length > 0) {
          ingreso = ingresoResult.rows[0];
        }
      } catch (e: any) {
        console.warn("seguridad_ingresos no disponible para join:", e?.message);
      }
    }

    let rmaCase: any = null;
    if (despacho.rma_case_id) {
      try {
        const rmaResult = await query(
          `SELECT id, case_number, status, invoice_number
           FROM rma_cases
           WHERE id = ?`,
          [despacho.rma_case_id],
        );
        if (rmaResult.rows.length > 0) {
          rmaCase = rmaResult.rows[0];
        }
      } catch (e: any) {
        console.warn("rma_cases no disponible para join:", e?.message);
      }
    }

    let calificacion: any = null;
    try {
      const calResult = await query(
        `SELECT id, calificacion, comentario, calificado_por, created_at
         FROM seguridad_calificaciones
         WHERE relacionado_a = 'despacho' AND relacionado_id = ? AND almacenista_nombre = ?
         ORDER BY created_at DESC LIMIT 1`,
        [despachoId, despacho.almacenista_nombre],
      );
      if (calResult.rows.length > 0) {
        const row = calResult.rows[0] as any;
        calificacion = {
          id: row.id,
          calificacion: Number(row.calificacion),
          comentario: row.comentario ?? null,
          calificado_por: row.calificado_por ?? null,
          created_at: row.created_at,
        };
      }
    } catch (e: any) {
      console.warn("seguridad_calificaciones no disponible:", e?.message);
    }

    return NextResponse.json({ success: true, despacho, ingreso, rma_case: rmaCase, calificacion });
  } catch (error: any) {
    console.error("Error obteniendo despacho:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
