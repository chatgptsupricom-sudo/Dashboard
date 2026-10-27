import { query } from "@/lib/db";
import { procesarEscaneo } from "@/lib/escaneo/procesar";
import { contenedorDeConteo, recontarSeriales, sumarUno } from "@/lib/recepcion/conteo";
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
 * El producto seleccionado recibe seriales aunque no este marcado como con
 * serial: el primero lo marca (`lleva_serial = 1`) y desde ahi se cuenta
 * pistoleando. Si se quitan todos, vuelve a lo que diga Odoo.
 *
 * Un serial repetido en el mismo packing list -> 409 "repetido". Si ya entro
 * en otro packing list se avisa (`en_otro`) pero no se bloquea.
 *
 * Mientras se esta contando (packing list descargando). Con la recepcion
 * cerrada, solo los seriales que faltan para cargarla en Odoo (ver
 * `escanearCerrada` y lib/recepcion/serialesFaltantes.ts).
 */

/** Un serial ya pistoleado en esta recepcion (409) o, solo aviso, en otra. */
async function serialRepetido(id: number, serial: string) {
  const repetido = await query(
    "SELECT item_id FROM recepcion_packing_seriales WHERE recepcion_id = ? AND serial = ?",
    [id, serial],
  );
  const enOtro = await query(
    `SELECT r.referencia FROM recepcion_packing_seriales s
       JOIN recepcion_packing r ON r.id = s.recepcion_id
      WHERE s.serial = ? AND s.recepcion_id <> ? LIMIT 1`,
    [serial, id],
  );
  return {
    itemId: (repetido.rows as any[]).length ? Number((repetido.rows as any[])[0].item_id) : null,
    enOtro: ((enOtro.rows as any[])[0]?.referencia as string | undefined) ?? null,
  };
}

/**
 * Recepcion cerrada cuya carga en Odoo espera seriales: solo los renglones de
 * `renglonesSinSeriales` (producto con serial en Odoo, todavia sin cargar).
 * El codigo de uno de esos productos lo selecciona y lo demas es un serial del
 * seleccionado. `cantidad_recibida` no cambia: se suman seriales hasta ella y
 * pasarse se rechaza. No se aprenden codigos de caja.
 */
async function escanearCerrada(
  id: number,
  body: any,
  datos: { recepcion: any; items: any[]; contenedores: any[] },
  quien: string,
) {
  if (body?.aprender_item_id !== undefined) {
    return NextResponse.json({ error: "Con la recepcion cerrada solo se pistolean seriales" }, { status: 400 });
  }
  const abiertos = new Map((await renglonesSinSeriales(datos)).map((r) => [r.item_id, r]));
  const items = (datos.items as any[])
    .filter((i) => abiertos.has(Number(i.id)))
    .map((i) => ({ ...i, lleva_serial: true }));

  const r = await procesarEscaneo(body, items, {
    quien,
    sumarUno: async () => {
      // Todos van con serial: un codigo de producto solo selecciona.
      throw new Error("sumarUno con la recepcion cerrada");
    },
    registrarSerial: async (item, serial) => {
      const renglon = abiertos.get(Number(item.id))!;
      if (renglon.faltan <= 0) {
        return {
          status: 409,
          body: {
            error: `${item.producto}: ya tiene sus ${renglon.cantidad} seriales (lo recibido). Si alguno esta mal, quitalo primero.`,
          },
        };
      }
      const { itemId: repetidoEn, enOtro } = await serialRepetido(id, serial);
      if (repetidoEn !== null) {
        return { status: 409, body: { resultado: "repetido", item_id: repetidoEn, serial } };
      }
      // Sin contenedor elegido: el del renglon si se conto en uno solo.
      const filas = (item.conteo || []).filter((f: any) => Number(f.cantidad_recibida) > 0);
      const contenedorId = filas.length === 1 ? Number(filas[0].contenedor_id) || 0 : 0;
      try {
        await query(
          `INSERT INTO recepcion_packing_seriales (recepcion_id, item_id, serial, escaneado_por, contenedor_id)
           VALUES (?, ?, ?, ?, ?)`,
          [id, item.id, serial, quien, contenedorId],
        );
      } catch (e: any) {
        if (/Duplicate entry/i.test(e?.message || "")) {
          return { status: 409, body: { resultado: "repetido", item_id: item.id, serial } };
        }
        throw e;
      }
      // Dos telefonos a la vez: si se paso de lo recibido, se deshace.
      const n = await query("SELECT COUNT(*) AS n FROM recepcion_packing_seriales WHERE item_id = ?", [item.id]);
      const pistoleados = Number((n.rows as any[])[0]?.n || 0);
      if (pistoleados > renglon.cantidad) {
        await query("DELETE FROM recepcion_packing_seriales WHERE recepcion_id = ? AND serial = ?", [id, serial]);
        return {
          status: 409,
          body: { error: `${item.producto}: ya tiene sus ${renglon.cantidad} seriales (lo recibido).` },
        };
      }
      // Para que la lista del renglon los muestre (no cambia la cantidad).
      await query("UPDATE recepcion_packing_items SET lleva_serial = 1 WHERE id = ? AND NOT (lleva_serial <=> 1)", [item.id]);
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
          // En la pistola, "van X": los seriales del renglon.
          cantidad: pistoleados,
          faltan: Math.max(0, renglon.cantidad - pistoleados),
          en_otro: enOtro,
        },
      };
    },
  });
  if (r.status === 200 && r.body.resultado === "serial") {
    emitirRecepcion({ accion: "conteo", id, cids: Number(datos.recepcion.cids) });
  }
  return NextResponse.json(r.body, { status: r.status });
}

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
    if (datos.recepcion.etapa === "cerrado" && abiertaParaSeriales(datos.recepcion)) {
      return await escanearCerrada(id, body, datos, sesion!.nombre);
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
      // Almacen elige el producto y pistolea sus seriales aunque Odoo no lo
      // marque (packing list sin codigo): desde ahi se cuenta por serial.
      serialEnCualquiera: true,
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
        if (!item.lleva_serial) {
          await query("UPDATE recepcion_packing_items SET lleva_serial = 1 WHERE id = ?", [item.id]);
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
