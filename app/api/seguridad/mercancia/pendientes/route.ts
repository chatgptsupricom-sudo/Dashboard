import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { listarPickingsEgresoPendientes } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/pendientes
 *
 * Ordenes de despacho (stock.picking) de Odoo, ya "Listas" para salir, que
 * Almacen todavia no proceso como egreso — para que las navegue ANTES de
 * registrar, en vez de tener que saber de memoria el numero exacto (unica
 * forma que habia hasta ahora, via /api/seguridad/mercancia/odoo/[nombre]).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const ordenes = await listarPickingsEgresoPendientes(cids);
    return NextResponse.json({ success: true, ordenes });
  } catch (error: any) {
    console.error("Error listando ordenes de despacho pendientes:", error);
    // El mensaje trae [odoo]/[mysql] al frente (ver listarPickingsEgresoPendientes)
    // para que se pueda diagnosticar sin acceso a los logs del servidor.
    return NextResponse.json(
      { error: `No se pudieron cargar las ordenes de despacho: ${error?.message || error}` },
      { status: 502 },
    );
  }
}
