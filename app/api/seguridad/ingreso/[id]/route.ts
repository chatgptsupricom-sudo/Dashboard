import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);


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
      "SELECT * FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );

    if (ingresoResult.rows.length === 0) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    const ingreso = ingresoResult.rows[0];

    let rmaCase: any = null;
    if (ingreso.rma_case_id) {
      try {
        const rmaResult = await query(
          `SELECT id, case_number, status, invoice_number
           FROM rma_cases
           WHERE id = ?`,
          [ingreso.rma_case_id],
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
         WHERE relacionado_a = 'ingreso' AND relacionado_id = ? AND almacenista_nombre = ?
         ORDER BY created_at DESC LIMIT 1`,
        [ingresoId, ingreso.recibido_por],
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

    return NextResponse.json({ success: true, ingreso, rma_case: rmaCase, calificacion });
  } catch (error: any) {
    console.error("Error obteniendo ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
