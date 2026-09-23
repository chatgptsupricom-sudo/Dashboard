import { query } from "@/lib/db";
import {
  alinearPrecintos,
  compararPrecintos,
  limpiarPrecintos,
} from "@/lib/recepcion/flujo";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/recepcion/[id]/contenedores/[contenedorId]/precintos
 * { precintos_recibidos: string[], motivo: string }
 *
 * Corrige los precintos que Almacen anoto al llegar el contenedor (ej. un
 * error de tipeo: "FX445T2691" en vez de "FX44502691"), nunca sin dejar
 * rastro: se guarda que habia antes, que quedo, el motivo y quien lo hizo.
 *
 * Solo mientras el packing list esta abierto: cerrado, no se modifica nada.
 */

const MOTIVO_MIN = 5;
const MOTIVO_MAX = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contenedorId: string }> },
) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "Los precintos los corrige Almacen" }, { status: 403 });
    }

    const p = await params;
    const id = parseInt(p.id, 10);
    const contenedorId = parseInt(p.contenedorId, 10);
    if (isNaN(id) || isNaN(contenedorId)) {
      return NextResponse.json({ error: "id invalido" }, { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const datos = await cargarRecepcion(id);
    if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    // Cerrado = no se modifica nada, tampoco los precintos.
    if (datos.recepcion.etapa === "cerrado") {
      return NextResponse.json(
        { error: "El packing list esta cerrado: ya no se puede modificar" },
        { status: 409 },
      );
    }
    const contenedor = datos.contenedores.find((c) => Number(c.id) === contenedorId);
    if (!contenedor) return NextResponse.json({ error: "Contenedor invalido" }, { status: 404 });
    if (contenedor.etapa === "por_llegar") {
      return NextResponse.json(
        { error: "Ese contenedor todavia no llego: los precintos se anotan al registrar la llegada" },
        { status: 409 },
      );
    }

    const motivo = String(body?.motivo ?? "").trim().slice(0, MOTIVO_MAX);
    if (motivo.length < MOTIVO_MIN) {
      return NextResponse.json({ error: "Escribe el motivo de la correccion" }, { status: 400 });
    }
    const nuevos = alinearPrecintos(
      limpiarPrecintos(body?.precintos_recibidos),
      contenedor.precintos_esperados,
    );
    if (nuevos.length === 0) {
      return NextResponse.json({ error: "Falta al menos un precinto" }, { status: 400 });
    }
    const antes: string[] = contenedor.precintos_recibidos;
    if (JSON.stringify(nuevos) === JSON.stringify(antes)) {
      return NextResponse.json({ error: "Los precintos no cambiaron" }, { status: 400 });
    }

    const cmp = compararPrecintos(contenedor.precintos_esperados, nuevos);
    const coincide = cmp.coincide === null ? null : cmp.coincide ? 1 : 0;
    const correcciones = [
      ...(contenedor.precintos_correcciones || []),
      { antes, despues: nuevos, motivo, por: sesion!.nombre, at: new Date().toISOString() },
    ];

    // Se escribe solo si nadie lo cambio en el medio (mismos precintos que
    // se leyeron, tal cual estan guardados): si dos corrigen a la vez, el
    // segundo recibe 409.
    const guardado = (
      await query("SELECT precintos_recibidos FROM recepcion_packing_contenedores WHERE id = ?", [
        contenedorId,
      ])
    ).rows[0]?.precintos_recibidos ?? null;
    const res = await query(
      `UPDATE recepcion_packing_contenedores
          SET precinto_recibido = ?, precintos_recibidos = ?, precinto_coincide = ?,
              precintos_correcciones = ?
        WHERE id = ? AND recepcion_id = ?
          AND COALESCE(precintos_recibidos, '') = COALESCE(?, '')
          AND (SELECT etapa FROM recepcion_packing WHERE id = ?) <> 'cerrado'`,
      [
        nuevos[0],
        JSON.stringify(nuevos),
        coincide,
        JSON.stringify(correcciones),
        contenedorId,
        id,
        guardado,
        id,
      ],
    );
    if (Number((res.rows as any)?.affectedRows || 0) !== 1) {
      return NextResponse.json(
        { error: "Los precintos o el packing list cambiaron mientras tanto. Se actualizo la pantalla." },
        { status: 409 },
      );
    }

    const rec = datos.recepcion;
    console.warn(
      `[recepcion ${id}] precintos de ${contenedor.numero} corregidos por ${sesion!.nombre}: ` +
        `[${antes.join(", ")}] -> [${nuevos.join(", ")}]. Motivo: ${motivo}`,
    );
    emitirRecepcion({
      accion: "editado",
      id,
      cids: Number(rec.cids),
      referencia: rec.referencia,
      proveedor: rec.proveedor,
      contenedor: contenedor.numero,
    });

    return NextResponse.json({ success: true, ...(await cargarRecepcion(id)) });
  } catch (e: any) {
    console.error("[recepcion] no se pudieron corregir los precintos:", e?.message);
    const sinColumna = /Unknown column|precintos_correcciones/i.test(e?.message || "");
    return NextResponse.json(
      { error: sinColumna ? "Falta correr sql/recepcion_correccion_precintos.sql" : "No se pudo guardar" },
      { status: 500 },
    );
  }
}
