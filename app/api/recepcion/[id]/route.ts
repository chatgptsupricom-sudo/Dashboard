import { query } from "@/lib/db";
import {
  insertarContenedores,
  insertarItems,
  validarCabeceraEItems,
} from "@/lib/recepcion/validacion";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { ErrorRecepcion, guardarOcElegida, packingListRepetido, validarOcElegida } from "@/lib/recepcion/odoo";
import { guardarReparto } from "@/lib/recepcion/conteo";
import { puedeRepartirse } from "@/lib/recepcion/repartoSedes";
import {
  asegurarTablasReparto,
  cambiarActivo,
  recalcularSiReparte,
  type Quien,
} from "@/lib/recepcion/repartoSedesDatos";
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

/**
 * Reparto entre sedes despues de editar el packing list. `repartir` es lo que
 * mando el formulario: true = repartir, false = no repartir, undefined = el
 * formulario no lo toco (se recalcula si ya se repartia). Devuelve el error
 * para mostrarlo, sin hacer fallar la edicion.
 */
async function repartoTrasEditar(
  id: number,
  cids: number,
  repartir: unknown,
  quien: Quien,
): Promise<string | undefined> {
  try {
    await asegurarTablasReparto();
    const act = await query("SELECT activo FROM recepcion_reparto_sedes WHERE recepcion_id = ?", [id]);
    const estabaActivo = !!Number((act.rows as any[])[0]?.activo);

    // Solo se edita un packing list que todavia no llego, asi que su origen
    // es siempre packing_list.
    if (!puedeRepartirse(cids, "packing_list")) {
      if (estabaActivo) {
        await cambiarActivo(id, false, quien, { motivo: "El packing list ya no llega a Valencia ni a Caracas" });
      }
      return undefined;
    }
    if (repartir === false) {
      if (estabaActivo) await cambiarActivo(id, false, quien, { motivo: "Se quitó al editar el packing list" });
      return undefined;
    }
    if (repartir === true && !estabaActivo) {
      await cambiarActivo(id, true, quien, { motivo: "Se activó al editar el packing list" });
      return undefined;
    }
    // Ya se repartia (o el formulario no dijo nada): se recalcula con los
    // renglones nuevos. Nunca lanza: si falla queda anotado en el reparto.
    await recalcularSiReparte(id, quien, "Se editó el packing list");
    return undefined;
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(`[recepcion] reparto entre sedes de #${id} tras editar:`, msg);
    return msg;
  }
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

    // Si Almacen ya empezo a recibir (subio fotos de algun contenedor aunque
    // no haya registrado la llegada), reemplazar los contenedores dejaria esas
    // fotos colgando de un contenedor que ya no existe.
    if (r.datos!.archivos.some((a: any) => a.contenedor_id)) {
      return NextResponse.json(
        { error: "Almacen ya empezo a recibir este packing list: no se puede cambiar" },
        { status: 409 },
      );
    }
    const { cab, items, contenedores } = validado;
    const repetido = await packingListRepetido(cab.cids, cab.referencia, r.id!);
    if (repetido) {
      return NextResponse.json(
        { error: `El packing list ${cab.referencia} ya esta cargado en esa sucursal (#${repetido})` },
        { status: 409 },
      );
    }
    let oc;
    try {
      oc = await validarOcElegida(cab.cids, body?.odoo_purchase_order_id);
    } catch (e: any) {
      if (e instanceof ErrorRecepcion) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

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
    // Mientras ningun contenedor llego no hay fotos colgadas de ellos: se
    // pueden reemplazar enteros (la etapa por_llegar del packing list lo
    // garantiza — pasa a descargando con la primera llegada).
    await query("DELETE FROM recepcion_packing_contenedores WHERE recepcion_id = ?", [r.id]);
    await insertarContenedores(r.id!, contenedores);
    // Lo esperado por contenedor se vuelve a armar (nadie conto nada todavia:
    // el packing list sigue por llegar).
    await query("DELETE FROM recepcion_packing_conteo WHERE recepcion_id = ?", [r.id]);
    await guardarReparto(r.id!, items.map((i) => i.reparto));
    await guardarOcElegida(r.id!, oc, r.sesion!.nombre);

    // Reparto entre sedes (Valencia / Caracas): va por producto, no por
    // renglon, asi que sobrevive a que se borren y se vuelvan a crear. Un
    // fallo aqui no deshace la edicion: se avisa y se reintenta del detalle.
    const repartoSedesError = await repartoTrasEditar(
      r.id!,
      cab.cids,
      body?.repartir_sedes,
      { nombre: r.sesion!.nombre, email: r.sesion!.payload?.email ? String(r.sesion!.payload.email) : null },
    );

    emitirRecepcion({ accion: "editado", id: r.id!, cids: cab.cids, referencia: cab.referencia });
    // Si cambio de sucursal, la anterior tambien tiene que enterarse.
    if (Number(r.datos!.recepcion.cids) !== cab.cids) {
      emitirRecepcion({ accion: "eliminado", id: r.id!, cids: Number(r.datos!.recepcion.cids) });
    }

    return NextResponse.json({
      success: true,
      ...(await cargarRecepcion(r.id!)),
      ...(repartoSedesError ? { reparto_sedes_error: repartoSedesError } : {}),
    });
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
    // El reparto entre sedes se va con el packing list; su historial
    // (recepcion_reparto_eventos) se queda como registro de lo que paso.
    try {
      await asegurarTablasReparto();
      await query("DELETE FROM recepcion_reparto_lineas WHERE recepcion_id = ?", [r.id]);
      await query("DELETE FROM recepcion_reparto_sedes WHERE recepcion_id = ?", [r.id]);
    } catch (e: any) {
      console.warn(`[recepcion] no se borro el reparto entre sedes de #${r.id}:`, e?.message || e);
    }
    emitirRecepcion({ accion: "eliminado", id: r.id!, cids: Number(r.datos!.recepcion.cids) });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Error anulando recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
