import { query } from "@/lib/db";
import { recontarSeriales } from "@/lib/recepcion/conteo";
import { completarLlevaSerial } from "@/lib/recepcion/seriales";
import { abiertaParaSeriales, renglonesSinSeriales } from "@/lib/recepcion/serialesFaltantes";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/recepcion/[id]/seriales/[serialId]
 *
 * Quita un serial pistoleado por error (y resta 1 a lo recibido de su
 * renglon). Mientras se esta contando. Con la recepcion cerrada, solo en los
 * renglones que esperan seriales para cargarse en Odoo
 * (lib/recepcion/serialesFaltantes.ts), y sin tocar lo recibido.
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
    const cerrada = datos.recepcion.etapa === "cerrado" && abiertaParaSeriales(datos.recepcion);
    if (datos.recepcion.etapa !== "descargando" && !cerrada) {
      return NextResponse.json({ error: "El conteo no esta abierto: ya no se puede modificar" }, { status: 409 });
    }

    const r = await query(
      "SELECT item_id, contenedor_id FROM recepcion_packing_seriales WHERE id = ? AND recepcion_id = ?",
      [serialId, id],
    );
    const itemId = (r.rows as any[])[0]?.item_id;
    if (!itemId) return NextResponse.json({ error: "Serial no encontrado" }, { status: 404 });
    const contenedorId = Number((r.rows as any[])[0]?.contenedor_id) || 0;

    if (cerrada) {
      // Lo ya cargado en Odoo no se toca: solo renglones que esperan seriales.
      const abiertos = await renglonesSinSeriales(datos);
      if (!abiertos.some((x) => x.item_id === Number(itemId))) {
        return NextResponse.json(
          { error: "Ese renglon ya se cargo en Odoo o no lleva serial: no se modifica" },
          { status: 409 },
        );
      }
      await query("DELETE FROM recepcion_packing_seriales WHERE id = ? AND recepcion_id = ?", [serialId, id]);
      emitirRecepcion({ accion: "conteo", id, cids: Number(datos.recepcion.cids) });
      const item = (datos.items as any[]).find((i) => Number(i.id) === Number(itemId));
      return NextResponse.json({
        success: true,
        item_id: Number(itemId),
        cantidad: Number(item?.cantidad_recibida || 0),
        contenedor_id: contenedorId,
        cerrada: true,
        lleva_serial: true,
      });
    }

    await query("DELETE FROM recepcion_packing_seriales WHERE id = ? AND recepcion_id = ?", [serialId, id]);
    // Se resta en el contenedor donde se habia pistoleado.
    const c = await recontarSeriales(id, Number(itemId), contenedorId, sesion!.nombre);
    // Sin seriales, el renglon vuelve a lo que diga Odoo: si se habia elegido
    // a mano por error, se puede volver a escribir la cantidad.
    const item = (datos.items as any[]).find((i) => Number(i.id) === Number(itemId));
    let llevaSerial = !!item?.lleva_serial;
    const quedan = await query("SELECT 1 FROM recepcion_packing_seriales WHERE item_id = ? LIMIT 1", [itemId]);
    if ((quedan.rows as any[]).length === 0 && item) {
      await query("UPDATE recepcion_packing_items SET lleva_serial = NULL WHERE id = ?", [itemId]);
      const [r2] = await completarLlevaSerial([{ id: Number(itemId), codigo: item.codigo ?? null, lleva_serial: null }]);
      llevaSerial = Number(r2.lleva_serial) === 1;
    }
    emitirRecepcion({ accion: "conteo", id, cids: Number(datos.recepcion.cids) });
    return NextResponse.json({
      success: true,
      item_id: Number(itemId),
      cantidad: Number(c.total || 0),
      contenedor_id: contenedorId,
      cantidad_contenedor: c.contenedor ?? 0,
      lleva_serial: llevaSerial,
    });
  } catch (e: any) {
    console.error("[recepcion] no se pudo quitar el serial:", e?.message);
    return NextResponse.json({ error: "No se pudo quitar el serial" }, { status: 500 });
  }
}
