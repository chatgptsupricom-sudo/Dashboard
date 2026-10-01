import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const filtroCids = cids !== null ? " AND cids = ?" : "";
    const paramsCids = cids !== null ? [cids] : [];

    let rows: any[] = [];
    try {
      const result = await query(
        `SELECT id, fecha_entrega, cliente_nombre, hardware, serial, factura_numero, rma_case_id
         FROM seguridad_ingresos
         WHERE id NOT IN (
           SELECT ingreso_id FROM seguridad_despachos WHERE ingreso_id IS NOT NULL
         )
         ${filtroCids}
         ORDER BY fecha_entrega DESC
         LIMIT 50`,
        paramsCids,
      );
      rows = result.rows;
    } catch (e: any) {
      console.warn("seguridad_despachos no disponible para pendientes:", e?.message);
      const result = await query(
        `SELECT id, fecha_entrega, cliente_nombre, hardware, serial, factura_numero, rma_case_id
         FROM seguridad_ingresos
         WHERE 1=1${filtroCids}
         ORDER BY fecha_entrega DESC
         LIMIT 50`,
        paramsCids,
      );
      rows = result.rows;
    }

    return NextResponse.json({ success: true, ingresos: rows });
  } catch (error: any) {
    console.error("Error listando ingresos pendientes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
