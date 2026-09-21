import { query } from "@/lib/db";
import { insertarItems, validarCabeceraEItems } from "@/lib/recepcion/validacion";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET    detalle (Compras y Almacen de la sucursal)
 * PATCH  Compras corrige el packing list — solo mientras no llega el contenedor
 * DELETE Compras lo anula — idem
 *
 * Una vez que Almacen registro la llegada, el packing list es la referencia
 * contra la que se esta contando: cambiarlo a mitad de la descarga haria
 * que el conteo compare contra otra cosa.
 */

async function obtener(request: NextRequest, params: Promise<{ id: string }>) {
  const { sesion, error } = await requireRecepcion(request);
  if (error) return { error };
  const id = parseInt((await params).id, 10);
  if (isNaN(id)) return { error: NextResponse.json({ error: "id invalido" }, { status: 400 }) };
  const datos = await cargarRecepcion(id);
  if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
    return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  }
  return { sesion: sesion!, id, datos };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const r = await obtener(request, params);
    if (r.error) return r.error;
    return NextResponse.json({ success: true, ...r.datos });
  } catch (e: any) {
    console.error("Error leyendo recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const r = await obtener(request, params);
    if (r.error) return r.error;
    if (!puedeComo(r.sesion!, "compras")) {
      return NextResponse.json({ error: "El packing list lo edita Compras" }, { status: 403 });
    }
    if (r.datos!.recepcion.etapa !== "por_llegar") {
      return NextResponse.json(
        { error: "El contenedor ya llego: el packing list no se puede cambiar" },
        { status: 409 },
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const validado = validarCabeceraEItems(body);
    if ("error" in validado) return NextResponse.json({ error: validado.error }, { status: 400 });
    const { cab, items } = validado;

    const res = await query(
      `UPDATE recepcion_packing
          SET cids = ?, proveedor = ?, referencia = ?, contenedor = ?, precinto_esperado = ?,
              purchase_order_id = ?, oc_referencia = ?, fecha_estimada = ?, observaciones = ?
        WHERE id = ? AND etapa = 'por_llegar'`,
      [
        cab.cids,
        cab.proveedor,
        cab.referencia,
        cab.contenedor,
        cab.precinto_esperado,
        cab.purchase_order_id,
        cab.oc_referencia,
        cab.fecha_estimada,
        cab.observaciones,
        r.id,
      ],
    );
    if (Number((res.rows as any)?.affectedRows || 0) !== 1) {
      return NextResponse.json({ error: "El contenedor acaba de llegar" }, { status: 409 });
    }
    await query("DELETE FROM recepcion_packing_items WHERE recepcion_id = ?", [r.id]);
    await insertarItems(r.id!, items);

    emitirRecepcion({ accion: "editado", id: r.id!, cids: cab.cids, referencia: cab.referencia });
    // Si cambio de sucursal, la anterior tambien tiene que enterarse.
    if (Number(r.datos!.recepcion.cids) !== cab.cids) {
      emitirRecepcion({ accion: "eliminado", id: r.id!, cids: Number(r.datos!.recepcion.cids) });
    }

    return NextResponse.json({ success: true, ...(await cargarRecepcion(r.id!)) });
  } catch (e: any) {
    console.error("Error editando recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const r = await obtener(request, params);
    if (r.error) return r.error;
    if (!puedeComo(r.sesion!, "compras")) {
      return NextResponse.json({ error: "El packing list lo anula Compras" }, { status: 403 });
    }
    const res = await query(
      "DELETE FROM recepcion_packing WHERE id = ? AND etapa = 'por_llegar'",
      [r.id],
    );
    if (Number((res.rows as any)?.affectedRows || 0) !== 1) {
      return NextResponse.json(
        { error: "El contenedor ya llego: no se puede anular" },
        { status: 409 },
      );
    }
    emitirRecepcion({ accion: "eliminado", id: r.id!, cids: Number(r.datos!.recepcion.cids) });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Error anulando recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
