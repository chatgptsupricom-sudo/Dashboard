import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { listarFacturasVentaPendientes } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/pendientes
 *
 * Facturas de venta de Odoo que Almacen todavia no proceso como egreso —
 * para que las navegue ANTES de registrar, en vez de tener que saber de
 * memoria el numero exacto (unica forma que habia hasta ahora, via
 * /api/seguridad/mercancia/odoo/[nombre]).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const ordenes = await listarFacturasVentaPendientes(cids);
    return NextResponse.json({ success: true, ordenes });
  } catch (error: any) {
    console.error("Error listando facturas de venta pendientes:", error);
    return NextResponse.json(
      { error: "No se pudo consultar Odoo" },
      { status: 502 },
    );
  }
}
