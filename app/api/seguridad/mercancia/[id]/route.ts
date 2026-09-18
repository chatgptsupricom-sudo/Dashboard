import { query } from "@/lib/db";
import {
  requireAlmacenOSeguridad,
  requireSeguridad,
  resolverCidsSesion,
} from "@/lib/seguridad/auth";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { cargarMovimiento as cargar, evaluarDescuadre } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET: detalle del movimiento.
 *
 * Lo ve tambien Almacen (issue #43) — es como sabe si lo que registro quedo
 * conforme o con descuadre. Lo que Almacen NO tiene es el POST de aqui abajo
 * (la verificacion): ese sigue siendo `requireSeguridad` exclusivo.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    const datos = await cargar(id);
    if (!datos) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // 404 y no 403: adivinar un id de otra sucursal no debe ni confirmar que
    // existe. Mismo criterio en el POST de abajo.
    if (cids !== null && Number(datos.movimiento.cids) !== cids) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...datos });
  } catch (error: any) {
    console.error("Error leyendo mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: la verificacion del porton.
 *
 * Solo Seguridad — Almacen preparo el registro (issue #43), no le toca
 * contarlo ni firmarlo como conforme. Separar quien carga de quien verifica es
 * el punto de todo este reparto de roles.
 *
 * Recibe lo que Seguridad conto por renglon y recalcula el estado. NO bloquea
 * la salida cuando hay descuadre: queda registrado y marcado para que alguien
 * lo vea. Parar un camion es decision de una persona, no del software.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const datos = await cargar(id);
    if (!datos) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    if (cids !== null && Number(datos.movimiento.cids) !== cids) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Un egreso por etapas se verifica con su accion propia
    // (/etapa, "verificar_seguridad"), que ademas decide aprobar o no y lo
    // pasa a calificacion. Verificarlo por aca se saltaria esa decision.
    if (datos.movimiento.etapa) {
      return NextResponse.json(
        { error: "Este egreso sigue el flujo por etapas" },
        { status: 409 },
      );
    }

    const verificadoPor = String(body?.verificado_por || "").trim().slice(0, 200);
    if (!verificadoPor) {
      // Una verificacion anonima no sirve para nada: lo que le da valor es
      // que alguien concreto responda por el conteo.
      return NextResponse.json(
        { error: "verificado_por es obligatorio" },
        { status: 400 },
      );
    }

    const conteos = Array.isArray(body?.items) ? body.items : [];
    const porId = new Map<number, any>(
      datos.items.map((i: any) => [Number(i.id), i]),
    );

    // Se valida todo antes de escribir nada: si un renglon falla, "el
    // guardado falla" tiene que ser literal, no dejar a medias los renglones
    // que ya se habian procesado antes en el mismo array.
    const actualizaciones: Array<{
      item: any;
      cantidad: number | null;
      observacion: string | null;
      noSalio: boolean;
    }> = [];

    for (const c of conteos) {
      const item = porId.get(Number(c?.id));
      if (!item) continue;

      const bruto = c?.cantidad_verificada;
      // null explicito = "sin contar todavia", que no es cero.
      const cantidad =
        bruto === null || bruto === undefined || bruto === ""
          ? null
          : Number(bruto);
      if (cantidad !== null && (!Number.isFinite(cantidad) || cantidad < 0)) {
        return NextResponse.json(
          { error: `cantidad_verificada invalida en "${item.producto}"` },
          { status: 400 },
        );
      }

      const noSalio = c?.no_salio === true;
      const observacion = c?.observacion ? String(c.observacion).trim().slice(0, 300) : null;
      if (noSalio && !observacion) {
        // El checkbox sin motivo no dice nada util: "no salio" y "no salio
        // porque X" son la diferencia entre un dato y una excusa.
        return NextResponse.json(
          { error: `El motivo es obligatorio para "${item.producto}" (no salio)` },
          { status: 400 },
        );
      }

      actualizaciones.push({ item, cantidad, observacion, noSalio });
    }

    for (const { item, cantidad, observacion, noSalio } of actualizaciones) {
      await query(
        `UPDATE seguridad_mercancia_items
            SET cantidad_verificada = ?, observacion = ?, no_salio = ?
          WHERE id = ? AND mercancia_id = ?`,
        [cantidad, observacion, noSalio ? 1 : 0, item.id, id],
      );
      item.cantidad_verificada = cantidad;
      item.observacion = observacion;
      item.no_salio = noSalio ? 1 : 0;
    }

    const { estado, diferencias } = evaluarDescuadre(
      datos.items.map((i: any) => ({
        cantidad_cargada: Number(i.cantidad_cargada),
        cantidad_verificada:
          i.cantidad_verificada === null || i.cantidad_verificada === undefined
            ? null
            : Number(i.cantidad_verificada),
        no_salio: Number(i.no_salio) === 1,
      })),
    );

    await query(
      `UPDATE seguridad_mercancia
          SET estado = ?, verificado_por = ?, verificado_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [estado, verificadoPor, id],
    );

    if (estado === "descuadre") {
      console.warn(
        `[mercancia ${id}] DESCUADRE: ${diferencias} renglon(es) no coinciden. ` +
          `Almacenista(s): ${datos.movimiento.almacenistas.join(", ")}. ` +
          `Verifico: ${verificadoPor}.`,
      );
    }

    // Aviso en vivo: Almacen ve el resultado del porton (conforme o
    // descuadre) en el momento, sin tener que ir a preguntar.
    emitirMercancia(
      {
        accion: "verificado",
        id,
        tipo: datos.movimiento.tipo,
        estado,
        documento: datos.movimiento.odoo_picking_name,
      },
      Number(datos.movimiento.cids) || null,
    );

    return NextResponse.json({
      success: true,
      estado,
      diferencias,
      ...(await cargar(id)),
    });
  } catch (error: any) {
    console.error("Error verificando mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
