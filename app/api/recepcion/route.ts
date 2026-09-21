import { query } from "@/lib/db";
import {
  insertarContenedores,
  insertarItems,
  validarCabeceraEItems,
} from "@/lib/recepcion/validacion";
import { emitirRecepcion, puedeComo, requireRecepcion } from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET  /api/recepcion         listado (Almacen: su sucursal; Compras: todas, o ?cids=)
 * POST /api/recepcion         Compras carga un packing list nuevo
 */

export async function GET(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;

    const sp = new URL(request.url).searchParams;
    const where: string[] = [];
    const params: any[] = [];

    // Almacen: siempre su sucursal. Compras/superadmin: todas, o la que pida.
    const cidsPedido = Number(sp.get("cids"));
    const cids = sesion!.cids ?? (Number.isFinite(cidsPedido) && cidsPedido > 0 ? cidsPedido : null);
    if (cids !== null) {
      where.push("r.cids = ?");
      params.push(cids);
    }

    const res = await query(
      `SELECT r.id, r.cids, r.proveedor, r.referencia, r.contenedor, r.oc_referencia,
              r.fecha_estimada, r.etapa, r.resultado, r.precinto_coincide,
              r.creado_por, r.created_at, r.llegada_at, r.cerrado_at,
              (SELECT COUNT(*) FROM recepcion_packing_items i WHERE i.recepcion_id = r.id) AS total_items,
              (SELECT COUNT(*) FROM recepcion_packing_items i
                WHERE i.recepcion_id = r.id AND i.cantidad_recibida IS NOT NULL) AS items_contados,
              (SELECT COUNT(*) FROM recepcion_packing_contenedores c
                WHERE c.recepcion_id = r.id) AS contenedores_total,
              (SELECT COUNT(*) FROM recepcion_packing_contenedores c
                WHERE c.recepcion_id = r.id AND c.etapa <> 'por_llegar') AS contenedores_llegados,
              (SELECT GROUP_CONCAT(c.numero ORDER BY c.id SEPARATOR ', ')
                 FROM recepcion_packing_contenedores c WHERE c.recepcion_id = r.id) AS contenedores
         FROM recepcion_packing r
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY (r.etapa = 'cerrado') ASC, COALESCE(r.fecha_estimada, DATE(r.created_at)) ASC, r.id DESC
        LIMIT 200`,
      params,
    );
    return NextResponse.json({ success: true, recepciones: res.rows });
  } catch (e: any) {
    console.error("Error listando recepciones:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "compras")) {
      return NextResponse.json(
        { error: "El packing list lo carga Compras" },
        { status: 403 },
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const validado = validarCabeceraEItems(body);
    if ("error" in validado) {
      return NextResponse.json({ error: validado.error }, { status: 400 });
    }
    const { cab, items, contenedores } = validado;

    const res = await query(
      `INSERT INTO recepcion_packing
         (cids, proveedor, referencia, contenedor, precinto_esperado,
          purchase_order_id, oc_referencia, fecha_estimada, observaciones, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        sesion!.nombre,
      ],
    );
    const id = Number((res.rows as any)?.insertId);
    await insertarItems(id, items);
    await insertarContenedores(id, contenedores);

    emitirRecepcion({
      accion: "creado",
      id,
      cids: cab.cids,
      referencia: cab.referencia,
      proveedor: cab.proveedor,
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    console.error("Error creando recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
