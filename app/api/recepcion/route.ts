import { query } from "@/lib/db";
import {
  insertarContenedores,
  insertarItems,
  validarCabeceraEItems,
} from "@/lib/recepcion/validacion";
import { emitirRecepcion, puedeComo, requireRecepcion } from "@/lib/recepcion/servidor";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";
import { guardarReparto } from "@/lib/recepcion/conteo";
import { ErrorRecepcion, guardarOcElegida, packingListRepetido, validarOcElegida } from "@/lib/recepcion/odoo";
import { avisarMaterialFaltante } from "@/lib/recepcion/avisoMaterial";
import { getPublicOrigin } from "@/lib/publicOrigin";
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

    let conOdoo = true;
    try {
      await asegurarColumnasOdoo();
    } catch {
      conOdoo = false;
    }
    // Los descartados (recibidos por fuera del panel) solo los ve el
    // SuperAdmin, en su pestana, para poder restaurarlos.
    if (conOdoo && sesion!.rol !== "superadmin") where.push("r.descartado_at IS NULL");
    const res = await query(
      `SELECT r.id, r.cids, r.proveedor, r.referencia, r.contenedor, r.oc_referencia,
              ${conOdoo ? "r.origen, r.odoo_estado, r.odoo_oc_nombre, r.descartado_at, r.descartado_por, r.descartado_motivo," : ""}
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
                 FROM recepcion_packing_contenedores c WHERE c.recepcion_id = r.id) AS contenedores,
              -- Inicio del tiempo de recepcion: la primera foto del contenedor al llegar.
              (SELECT MIN(a.created_at) FROM recepcion_packing_archivos a
                WHERE a.recepcion_id = r.id AND a.tipo = 'foto_llegada') AS inicio_at
         FROM recepcion_packing r
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        -- Abiertos primero, por fecha estimada; los cerrados, el más reciente
        -- primero: antes iban del más viejo al más nuevo y, con el LIMIT, los
        -- últimos cerrados eran los que desaparecían de la lista.
        ORDER BY (r.etapa = 'cerrado') ASC,
                 IF(r.etapa = 'cerrado', NULL, COALESCE(r.fecha_estimada, DATE(r.created_at))) ASC,
                 r.cerrado_at DESC, r.id DESC
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
    // El mismo packing list dos veces cargaria la misma mercancia dos veces en Odoo.
    const repetido = await packingListRepetido(cab.cids, cab.referencia);
    if (repetido) {
      return NextResponse.json(
        { error: `El packing list ${cab.referencia} ya esta cargado en esa sucursal (#${repetido})`, id: repetido },
        { status: 409 },
      );
    }
    // La OC de Odoo donde se carga lo contado al cerrar (opcional).
    let oc;
    try {
      oc = await validarOcElegida(cab.cids, body?.odoo_purchase_order_id);
    } catch (e: any) {
      if (e instanceof ErrorRecepcion) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

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
    // Lo que trae cada contenedor, si el packing list lo dice.
    await guardarReparto(id, items.map((i) => i.reparto));
    if (oc) await guardarOcElegida(id, oc);

    emitirRecepcion({
      accion: "creado",
      id,
      cids: cab.cids,
      referencia: cab.referencia,
      proveedor: cab.proveedor,
    });
    // Productos sin imagen en Odoo o sin flyer: correo a los adminLeads.
    avisarMaterialFaltante(id, getPublicOrigin(request));

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    console.error("Error creando recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
