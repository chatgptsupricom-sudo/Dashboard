import { query } from "@/lib/db";
import { procesarEscaneo } from "@/lib/escaneo/procesar";
import { contenedorDeConteo, recontarSeriales, sumarUno } from "@/lib/recepcion/conteo";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/recepcion/[id]/escaneo?contenedor_id=
 * { codigo, item_id?, aprender_item_id?, forzar_serial?, contenedor_id? }
 *
 * Lo que lee la pistola durante el conteo. Que es cada lectura (conteo,
 * producto seleccionado, serial, desconocido) lo decide lib/escaneo/procesar,
 * el mismo que usa la verificacion del egreso. Aca solo va lo propio de la
 * recepcion: en que tablas se suma y donde se guardan los seriales.
 *
 * Cada lectura suma en el contenedor que esta descargando ese telefono
 * (`contenedor_id`, en el body o en la URL: la pistola es la misma de otros
 * flujos y solo conoce su endpoint). La respuesta trae `cantidad` (el total
 * del renglon) y `cantidad_contenedor` (lo de ese contenedor).
 *
 * Un serial repetido en el mismo packing list -> 409 "repetido". Si ya entro
 * en otro packing list se avisa (`en_otro`) pero no se bloquea.
 *
 * Solo mientras se esta contando (packing list descargando).
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "El conteo lo hace Almacen" }, { status: 403 });
    }
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

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
    if (datos.recepcion.etapa !== "descargando") {
      return NextResponse.json(
        { error: "El conteo no esta abierto: se pistolea con algun contenedor recibido y el packing list sin cerrar" },
        { status: 409 },
      );
    }
    const items = datos.items as any[];
    const cont = contenedorDeConteo(
      datos.contenedores,
      body?.contenedor_id ?? request.nextUrl.searchParams.get("contenedor_id"),
    );
    if ("error" in cont) return NextResponse.json({ error: cont.error }, { status: cont.status });
    // Lo de ese contenedor despues de la lectura, para la respuesta.
    let enContenedor: number | null = null;

    const r = await procesarEscaneo(body, items, {
      quien: sesion!.nombre,
      sumarUno: async (item) => {
        const c = await sumarUno(id, Number(item.id), cont.id, sesion!.nombre);
        enContenedor = c.contenedor;
        return Number(c.total || 0);
      },
      registrarSerial: async (item, serial) => {
        const repetido = await query(
          "SELECT item_id FROM recepcion_packing_seriales WHERE recepcion_id = ? AND serial = ?",
          [id, serial],
        );
        if ((repetido.rows as any[]).length > 0) {
          return {
            status: 409,
            body: { resultado: "repetido", item_id: Number((repetido.rows as any[])[0].item_id), serial },
          };
        }
        // Aviso (no bloquea): el mismo serial ya entro en otro packing list.
        const enOtro = await query(
          `SELECT r.referencia FROM recepcion_packing_seriales s
             JOIN recepcion_packing r ON r.id = s.recepcion_id
            WHERE s.serial = ? AND s.recepcion_id <> ? LIMIT 1`,
          [serial, id],
        );
        try {
          await query(
            `INSERT INTO recepcion_packing_seriales (recepcion_id, item_id, serial, escaneado_por, contenedor_id)
             VALUES (?, ?, ?, ?, ?)`,
            [id, item.id, serial, sesion!.nombre, cont.id],
          );
        } catch (e: any) {
          if (/Duplicate entry/i.test(e?.message || "")) {
            return { status: 409, body: { resultado: "repetido", item_id: item.id, serial } };
          }
          throw e;
        }
        const c = await recontarSeriales(id, Number(item.id), cont.id, sesion!.nombre);
        enContenedor = c.contenedor;
        const cantidad = Number(c.total || 0);
        const ins = await query(
          `SELECT id, item_id, serial, escaneado_por, created_at, contenedor_id
             FROM recepcion_packing_seriales WHERE recepcion_id = ? AND serial = ?`,
          [id, serial],
        );
        return {
          status: 200,
          body: {
            resultado: "serial",
            item_id: item.id,
            serial: (ins.rows as any[])[0],
            cantidad,
            en_otro: (enOtro.rows as any[])[0]?.referencia ?? null,
          },
        };
      },
    });
    if (r.status === 200 && (r.body.resultado === "conteo" || r.body.resultado === "serial")) {
      r.body.cantidad_contenedor = enContenedor ?? 0;
      r.body.contenedor_id = cont.id;
      // Los otros telefonos que cuentan este packing list ven el avance.
      emitirRecepcion({ accion: "conteo", id, cids: Number(datos.recepcion.cids) });
    }
    return NextResponse.json(r.body, { status: r.status });
  } catch (e: any) {
    console.error("[recepcion] error en escaneo:", e?.message);
    const sinTabla = /doesn't exist|no existe|Unknown column/i.test(e?.message || "");
    return NextResponse.json(
      { error: sinTabla ? "Falta correr sql/recepcion_seriales.sql" : "No se pudo registrar la lectura" },
      { status: 500 },
    );
  }
}
