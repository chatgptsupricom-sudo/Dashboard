import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/seguridad/almacenistas
// Devuelve la lista de todos los almacenistas que tienen calificaciones,
// con su promedio y total. Para alimentar el indice /seguridad/almacenista.
export async function GET(_request: NextRequest) {
  try {
    const result = await query(
      `SELECT almacenista_nombre AS almacenista,
              AVG(calificacion) AS promedio,
              COUNT(*) AS total
       FROM seguridad_calificaciones
       GROUP BY almacenista_nombre
       ORDER BY promedio DESC, total DESC`,
    );
    const rows = (result as any).rows ?? result;
    const almacenistas = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      almacenista: r.almacenista,
      promedio: Number(r.promedio) || 0,
      total: Number(r.total) || 0,
    }));
    return NextResponse.json({ success: true, almacenistas });
  } catch (error: any) {
    console.error("[seguridad/almacenistas] error:", error.message);
    return NextResponse.json(
      { error: "Error al listar almacenistas" },
      { status: 500 },
    );
  }
}