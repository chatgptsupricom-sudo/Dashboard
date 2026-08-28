import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    let where = "WHERE d.id IS NULL";
    const params: any[] = [];

    if (search) {
      where += " AND (i.cliente_nombre LIKE ? OR i.serial LIKE ? OR i.factura_numero LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    // Los pendientes de despacho son ingresos: se filtra por la sucursal del
    // ingreso (i.cids), no la del despacho (que aqui todavia no existe).
    if (cids !== null) {
      where += " AND i.cids = ?";
      params.push(cids);
    }

    const result = await query(
      `SELECT i.*
       FROM seguridad_ingresos i
       LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
       ${where}
       ORDER BY i.fecha_entrega DESC
       LIMIT ${limit}`,
      params,
    );

    return NextResponse.json({
      success: true,
      ingresos: result.rows,
    });
  } catch (error: any) {
    console.error("Error listando ingresos pendientes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
