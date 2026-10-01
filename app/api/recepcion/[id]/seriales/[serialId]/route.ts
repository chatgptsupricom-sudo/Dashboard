import { query } from "@/lib/db";
import { recontarSeriales } from "@/lib/recepcion/seriales";
import {
  cargarRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/recepcion/[id]/seriales/[serialId]
 *
 * Quita un serial pistoleado por error (y resta 1 a lo recibido de su
 * renglon). Solo mientras se esta contando: cerrado, no se modifica nada.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; serialId: string }> },
) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "El conteo lo hace Almacen" }, { status: 403 });
    }
    const p = await params;
    const id = parseInt(p.id, 10);
    const serialId = parseInt(p.serialId, 10);
    if (isNaN(id) || isNaN(serialId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    const datos = await cargarRecepcion(id);
    if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (datos.recepcion.etapa !== "descargando") {
      return NextResponse.json({ error: "El conteo no esta abierto: ya no se puede modificar" }, { status: 409 });
    }

    const r = await query("SELECT item_id FROM recepcion_packing_seriales WHERE id = ? AND recepcion_id = ?", [
      serialId,
      id,
    ]);
    const itemId = (r.rows as any[])[0]?.item_id;
    if (!itemId) return NextResponse.json({ error: "Serial no encontrado" }, { status: 404 });

    await query("DELETE FROM recepcion_packing_seriales WHERE id = ? AND recepcion_id = ?", [serialId, id]);
    const cantidad = await recontarSeriales(Number(itemId));
    return NextResponse.json({ success: true, item_id: Number(itemId), cantidad });
  } catch (e: any) {
    console.error("[recepcion] no se pudo quitar el serial:", e?.message);
    return NextResponse.json({ error: "No se pudo quitar el serial" }, { status: 500 });
  }
}
