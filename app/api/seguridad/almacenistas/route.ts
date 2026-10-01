import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/seguridad/almacenistas
// Devuelve la lista de todos los almacenistas que tienen calificaciones,
// con su promedio y total. Para alimentar el indice /seguridad/almacenista.
export async function GET(request: NextRequest) {
  // Faltaba: este endpoint devolvía nombres de empleados con su calificación
  // promedio a cualquiera, sin sesión. El criterio del issue #1 del rol dice
  // que no debe haber endpoints públicos.
  const auth = await requireSeguridad(request);
  if (auth.error) return auth.error;

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  try {
    const result = await query(
      `SELECT almacenista_nombre AS almacenista,
              AVG(calificacion) AS promedio,
              COUNT(*) AS total
       FROM seguridad_calificaciones
       ${cids !== null ? "WHERE cids = ?" : ""}
       GROUP BY almacenista_nombre
       ORDER BY promedio DESC, total DESC`,
      cids !== null ? [cids] : [],
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