import { renglonesSinSeriales } from "@/lib/recepcion/serialesFaltantes";
import { cargarRecepcion, fueraDeAlcance, requireRecepcion } from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/recepcion/[id]/seriales
 *
 * Renglones de una recepcion cerrada que esperan seriales para cargarse en
 * Odoo (lib/recepcion/serialesFaltantes.ts), con cuantos faltan. Vacio si la
 * recepcion no esta en ese caso. Se pistolean por /escaneo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
    const datos = await cargarRecepcion(id);
    if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, renglones: await renglonesSinSeriales(datos) });
  } catch (e: any) {
    console.error("[recepcion] no se pudieron leer los seriales que faltan:", e?.message);
    return NextResponse.json(
      { error: "No se pudo consultar en Odoo que productos llevan serial: " + String(e?.message || e).slice(0, 300) },
      { status: 502 },
    );
  }
}
