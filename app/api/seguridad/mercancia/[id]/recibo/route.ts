import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { cargarMovimiento } from "@/lib/seguridad/mercancia";
import { ReciboNoDisponible, reciboEntregaPdf } from "@/lib/seguridad/reciboOdoo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/[id]/recibo
 *
 * El "Recibo de entrega" de Odoo de la orden del egreso, en PDF, para
 * imprimirlo desde el panel una vez validada (ver lib/seguridad/reciboOdoo).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAlmacenOSeguridad(request);
  if (auth.error) return auth.error;
  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  const id = parseInt((await params).id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const datos = await cargarMovimiento(id);
  if (!datos || (cids !== null && Number(datos.movimiento.cids) !== cids) || datos.movimiento.tipo !== "egreso") {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const pickingId = Number(datos.movimiento.odoo_picking_id);
  if (!pickingId) {
    return NextResponse.json({ error: "Este despacho no tiene orden de Odoo" }, { status: 409 });
  }

  try {
    const { nombre, pdf } = await reciboEntregaPdf(pickingId);
    const ascii = nombre.replace(/[^\x20-\x7e]+/g, "-").replace(/["\\/]+/g, "-");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    if (e instanceof ReciboNoDisponible) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error(`[egreso ${id}] no se pudo traer el recibo de entrega de Odoo:`, e?.message || e);
    return NextResponse.json(
      { error: `No se pudo traer el recibo de entrega de Odoo: ${String(e?.message || e).slice(0, 300)}` },
      { status: 502 },
    );
  }
}
