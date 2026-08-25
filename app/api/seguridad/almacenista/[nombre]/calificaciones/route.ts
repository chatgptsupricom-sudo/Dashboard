import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

async function requireSeguridad(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  let payload: any;
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = result.payload;
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  const userRole = ((payload.role as string) || "").toLowerCase().trim();
  if (userRole !== "seguridad" && userRole !== "superadmin") {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return { payload };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nombre: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

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

    const summary = await query(
      `SELECT AVG(calificacion) AS promedio, COUNT(*) AS total
       FROM seguridad_calificaciones
       WHERE almacenista_nombre = ?`,
      [almacenista],
    );

    const total = Number(summary.rows[0]?.total || 0);
    const promedioRaw = summary.rows[0]?.promedio;
    const promedio = promedioRaw === null || promedioRaw === undefined
      ? 0
      : Math.round(Number(promedioRaw) * 10) / 10;

    const distribucionRows = await query(
      `SELECT calificacion, COUNT(*) AS cantidad
       FROM seguridad_calificaciones
       WHERE almacenista_nombre = ?
       GROUP BY calificacion`,
      [almacenista],
    );

    const distribucion: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const row of distribucionRows.rows as any[]) {
      const key = String(row.calificacion);
      distribucion[key] = Number(row.cantidad || 0);
    }

    const ultimos = await query(
      `SELECT id, calificacion, comentario, relacionado_a, relacionado_id, calificado_por, created_at
       FROM seguridad_calificaciones
       WHERE almacenista_nombre = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [almacenista],
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
