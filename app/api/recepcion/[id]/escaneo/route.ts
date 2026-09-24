import { query } from "@/lib/db";
import { esCodigoDeProducto, normalizarCodigo, productoPorPrefijo } from "@/lib/recepcion/flujo";
import { buscarAlias, recontarSeriales } from "@/lib/recepcion/seriales";
import {
  cargarRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/recepcion/[id]/escaneo
 * { codigo, item_id?, aprender_item_id? }
 *
 * Lo que lee la pistola durante el conteo. La pistola "escribe" el codigo y
 * pulsa Enter; la pantalla lo manda aca y esto decide que es:
 *
 *  1. El codigo de un producto del packing list, su codigo con una variante
 *     ("5HB10D#B1K" es la caja de "5HB10D") o un codigo de caja ya
 *     aprendido que apunta a uno:
 *       - sin serial: suma 1 a lo recibido            -> "conteo"
 *       - con serial: lo deja seleccionado            -> "seleccionado"
 *  2. Si no, y hay un producto con serial seleccionado (`item_id`), es un
 *     serial de ese producto: se guarda y suma 1     -> "serial"
 *     (repetido en el mismo packing list             -> 409 "repetido")
 *     Salvo que parezca un UPC/EAN (codigo del modelo, igual en todas las
 *     cajas): eso no se guarda como serial sin que lo confirmen
 *     (`forzar_serial`)                              -> "desconocido"
 *  3. Si no, no se sabe que es                        -> "desconocido"
 *     y la pantalla pregunta de que producto es. Al responder, vuelve con
 *     `aprender_item_id`: se guarda el codigo de caja -> producto y se
 *     aplica la lectura.
 *
 * Solo mientras se esta contando (packing list descargando).
 */

const MAX_CODIGO = 100;

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

    const crudo = String(body?.codigo ?? "").trim().slice(0, MAX_CODIGO);
    const codigo = normalizarCodigo(crudo);
    if (!codigo) return NextResponse.json({ error: "Codigo vacio" }, { status: 400 });

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
    const porCodigo = (c: string) => items.find((i) => i.codigo && normalizarCodigo(i.codigo) === c);

    // Aprender: este codigo de caja es de tal producto (queda para siempre).
    if (body?.aprender_item_id !== undefined) {
      const destino = items.find((i) => Number(i.id) === Number(body.aprender_item_id));
      if (!destino) return NextResponse.json({ error: "Renglon invalido" }, { status: 400 });
      if (!destino.codigo) {
        return NextResponse.json(
          { error: "Ese renglon no tiene codigo de producto: no se puede asociar" },
          { status: 400 },
        );
      }
      if (porCodigo(codigo)) {
        return NextResponse.json({ error: "Ese codigo ya es el de un producto" }, { status: 400 });
      }
      await query(
        `INSERT INTO recepcion_codigos_alias (codigo, producto_codigo, creado_por) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE producto_codigo = ?, creado_por = ?`,
        [codigo, normalizarCodigo(destino.codigo), sesion!.nombre, normalizarCodigo(destino.codigo), sesion!.nombre],
      );
    }

    // 1. Codigo de producto (directo, con variante o aprendido).
    let producto = porCodigo(codigo) || productoPorPrefijo(items, codigo);
    if (!producto) {
      const alias = await buscarAlias(codigo);
      if (alias) producto = porCodigo(alias);
    }
    if (producto) {
      if (producto.lleva_serial) {
        return NextResponse.json({ resultado: "seleccionado", item_id: producto.id, codigo });
      }
      await query(
        `UPDATE recepcion_packing_items SET cantidad_recibida = COALESCE(cantidad_recibida, 0) + 1
          WHERE id = ? AND recepcion_id = ?`,
        [producto.id, id],
      );
      const r = await query("SELECT cantidad_recibida FROM recepcion_packing_items WHERE id = ?", [producto.id]);
      return NextResponse.json({
        resultado: "conteo",
        item_id: producto.id,
        codigo,
        cantidad: Number((r.rows as any[])[0]?.cantidad_recibida || 0),
      });
    }

    // 2. Serial del producto seleccionado.
    const seleccionado =
      body?.item_id !== undefined && body?.item_id !== null
        ? items.find((i) => Number(i.id) === Number(body.item_id))
        : null;
    if (seleccionado?.lleva_serial && esCodigoDeProducto(codigo) && body?.forzar_serial !== true) {
      return NextResponse.json({ resultado: "desconocido", codigo, pista: "codigo_de_producto" });
    }
    if (seleccionado?.lleva_serial) {
      const repetido = await query(
        "SELECT item_id FROM recepcion_packing_seriales WHERE recepcion_id = ? AND serial = ?",
        [id, codigo],
      );
      if ((repetido.rows as any[]).length > 0) {
        return NextResponse.json(
          { resultado: "repetido", item_id: Number((repetido.rows as any[])[0].item_id), serial: codigo },
          { status: 409 },
        );
      }
      // Aviso (no bloquea): el mismo serial ya entro en otro packing list.
      const enOtro = await query(
        `SELECT r.referencia FROM recepcion_packing_seriales s
           JOIN recepcion_packing r ON r.id = s.recepcion_id
          WHERE s.serial = ? AND s.recepcion_id <> ? LIMIT 1`,
        [codigo, id],
      );
      try {
        await query(
          `INSERT INTO recepcion_packing_seriales (recepcion_id, item_id, serial, escaneado_por)
           VALUES (?, ?, ?, ?)`,
          [id, seleccionado.id, codigo, sesion!.nombre],
        );
      } catch (e: any) {
        if (/Duplicate entry/i.test(e?.message || "")) {
          return NextResponse.json({ resultado: "repetido", item_id: seleccionado.id, serial: codigo }, { status: 409 });
        }
        throw e;
      }
      const cantidad = await recontarSeriales(seleccionado.id);
      const ins = await query(
        "SELECT id, item_id, serial, escaneado_por, created_at FROM recepcion_packing_seriales WHERE recepcion_id = ? AND serial = ?",
        [id, codigo],
      );
      return NextResponse.json({
        resultado: "serial",
        item_id: seleccionado.id,
        serial: (ins.rows as any[])[0],
        cantidad,
        en_otro_packing_list: (enOtro.rows as any[])[0]?.referencia ?? null,
      });
    }

    // 3. No se sabe que es.
    return NextResponse.json({ resultado: "desconocido", codigo });
  } catch (e: any) {
    console.error("[recepcion] error en escaneo:", e?.message);
    const sinTabla = /doesn't exist|no existe|Unknown column/i.test(e?.message || "");
    return NextResponse.json(
      { error: sinTabla ? "Falta correr sql/recepcion_seriales.sql" : "No se pudo registrar la lectura" },
      { status: 500 },
    );
  }
}
