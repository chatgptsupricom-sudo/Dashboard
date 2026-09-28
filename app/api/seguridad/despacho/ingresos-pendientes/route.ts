import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";
import { hayTablaProductos } from "@/lib/rma/items";
import { hayTablasSeguridad } from "@/lib/seguridad/productosEnvio";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Pendiente = sin despacho. Con envíos de varios productos (issue #331)
    // también el que ya tuvo un despacho parcial: sigue hasta que sale el
    // último producto del envío.
    const porProducto = (await hayTablaProductos()) && (await hayTablasSeguridad());
    let where = porProducto
      ? `WHERE (NOT EXISTS (SELECT 1 FROM seguridad_despachos d WHERE d.ingreso_id = i.id)
                OR (i.rma_case_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM rma_case_items ci
                       WHERE ci.case_id = i.rma_case_id AND ci.despachado_at IS NULL
                         -- Lo que el ingreso marcó como no recibido nunca
                         -- va a salir: no lo deja pendiente.
                         AND NOT EXISTS (
                           SELECT 1 FROM seguridad_ingreso_items ii
                            WHERE ii.ingreso_id = i.id AND ii.rma_item_id = ci.id AND ii.recibido = 0))))`
      : "WHERE d.id IS NULL";
    const params: any[] = [];

    // Listos para despachar: RMA ya terminó el caso (reparado, nota de
    // crédito o no procesado). Es lo que Seguridad tiene que devolver.
    if (searchParams.get("listos") === "1") {
      where += " AND rc.status IN ('reparado','nota_credito','no_procesado')";
    }
    const ingresoId = parseInt(searchParams.get("ingreso_id") || "", 10);
    if (ingresoId > 0) {
      where += " AND i.id = ?";
      params.push(ingresoId);
    }

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
      `SELECT i.*, rc.status AS rma_status, rc.case_number AS rma_case_number
       FROM seguridad_ingresos i
       LEFT JOIN rma_cases rc ON rc.id = i.rma_case_id
       ${porProducto ? "" : "LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id"}
       ${where}
       -- Primero lo que RMA ya terminó: es lo que hay que despachar.
       ORDER BY (rc.status IN ('reparado','nota_credito','no_procesado')) DESC, i.fecha_entrega DESC
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
