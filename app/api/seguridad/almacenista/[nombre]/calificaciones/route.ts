import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nombre: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { nombre: rawNombre } = await params;
    let almacenista: string;
    try {
      almacenista = decodeURIComponent(rawNombre).trim();
    } catch {
      almacenista = String(rawNombre || "").trim();
    }
    if (!almacenista) {
      return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
    }

    const filtroCids = cids !== null ? " AND cids = ?" : "";
    const paramsCids = cids !== null ? [almacenista, cids] : [almacenista];

    const summary = await query(
      `SELECT AVG(calificacion) AS promedio, COUNT(*) AS total
       FROM seguridad_calificaciones
       WHERE almacenista_nombre = ?${filtroCids}`,
      paramsCids,
    );

    const total = Number(summary.rows[0]?.total || 0);
    const promedioRaw = summary.rows[0]?.promedio;
    const promedio = promedioRaw === null || promedioRaw === undefined
      ? 0
      : Math.round(Number(promedioRaw) * 10) / 10;

    const distribucionRows = await query(
      `SELECT calificacion, COUNT(*) AS cantidad
       FROM seguridad_calificaciones
       WHERE almacenista_nombre = ?${filtroCids}
       GROUP BY calificacion`,
      paramsCids,
    );

    const distribucion: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const row of distribucionRows.rows as any[]) {
      const key = String(row.calificacion);
      distribucion[key] = Number(row.cantidad || 0);
    }

    const ultimos = await query(
      `SELECT id, calificacion, comentario, relacionado_a, relacionado_id, calificado_por, created_at
       FROM seguridad_calificaciones
       WHERE almacenista_nombre = ?${filtroCids}
       ORDER BY created_at DESC
       LIMIT 50`,
      paramsCids,
    );

    const ultimos_comentarios = (ultimos.rows as any[]).map((row) => {
      const rawDate = row.created_at;
      let dateStr: string | null = null;
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === "string") {
        dateStr = rawDate.slice(0, 10);
      }
      return {
        id: row.id,
        calificacion: row.calificacion,
        comentario: row.comentario ?? null,
        relacionado_a: row.relacionado_a,
        relacionado_id: row.relacionado_id,
        calificado_por: row.calificado_por,
        created_at: dateStr,
      };
    });

    return NextResponse.json({
      success: true,
      almacenista,
      promedio,
      total,
      distribucion,
      ultimos_comentarios,
    });
  } catch (error: any) {
    console.error("Error obteniendo calificaciones del almacenista:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
