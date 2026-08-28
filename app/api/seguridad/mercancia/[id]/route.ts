import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, requireSeguridad } from "@/lib/seguridad/auth";
import { evaluarDescuadre, parsearLista } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function cargar(id: number) {
  const mov = await query("SELECT * FROM seguridad_mercancia WHERE id = ?", [id]);
  if (mov.rows.length === 0) return null;
  const items = await query(
    "SELECT * FROM seguridad_mercancia_items WHERE mercancia_id = ? ORDER BY id",
    [id],
  );
  // Plural: puede haber mas de un almacenista por egreso (issue #43), y cada
  // uno se califica aparte. Antes se traia solo uno con LIMIT 1, que se
  // quedaba con la primera calificacion y ocultaba el resto.
  const calif = await query(
    `SELECT id, almacenista_nombre, calificacion, comentario, calificado_por, created_at
       FROM seguridad_calificaciones
      WHERE relacionado_a = 'mercancia' AND relacionado_id = ?
      ORDER BY id`,
    [id],
  ).catch(() => ({ rows: [] as any[] }));

  const fila = mov.rows[0] as any;
  const facturas = parsearLista(fila.facturas_json).length
    ? parsearLista(fila.facturas_json)
    : fila.factura_numero
      ? [fila.factura_numero]
      : [];
  const almacenistas = parsearLista(fila.almacenistas_json).length
    ? parsearLista(fila.almacenistas_json)
    : [fila.almacenista_nombre];

  return {
    movimiento: { ...fila, facturas, almacenistas },
    items: items.rows,
    calificaciones: calif.rows,
  };
}

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

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    const datos = await cargar(id);
    if (!datos) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

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

      await query(
        `UPDATE seguridad_mercancia_items
            SET cantidad_verificada = ?, observacion = ?
          WHERE id = ? AND mercancia_id = ?`,
        [
          cantidad,
          c?.observacion ? String(c.observacion).slice(0, 300) : null,
          item.id,
          id,
        ],
      );
      item.cantidad_verificada = cantidad;
    }

    const { estado, diferencias } = evaluarDescuadre(
      datos.items.map((i: any) => ({
        cantidad_cargada: Number(i.cantidad_cargada),
        cantidad_verificada:
          i.cantidad_verificada === null || i.cantidad_verificada === undefined
            ? null
            : Number(i.cantidad_verificada),
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
