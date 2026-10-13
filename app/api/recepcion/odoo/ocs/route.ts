import { ocsPendientes } from "@/lib/recepcion/odoo";
import { requireRecepcion } from "@/lib/recepcion/servidor";
import { SUCURSALES } from "@/lib/recepcion/flujo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/recepcion/odoo/ocs?cids=9
 *
 * OC confirmadas de Odoo de la sede que todavia esperan mercancia: Compras
 * elige en cual se carga el packing list al cerrarlo. Almacen ve solo las de
 * su sucursal.
 */
export async function GET(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    const pedido = Number(new URL(request.url).searchParams.get("cids"));
    const cids = sesion!.cids ?? pedido;
    if (!SUCURSALES.some((s) => s.cids === cids)) {
      return NextResponse.json({ error: "Sucursal invalida" }, { status: 400 });
    }
    return NextResponse.json({ success: true, ocs: await ocsPendientes(cids) });
  } catch (e: any) {
    console.error("[recepcion] error leyendo OC de Odoo:", e?.message);
    return NextResponse.json({ error: "No se pudieron leer las OC de Odoo" }, { status: 502 });
  }
}
