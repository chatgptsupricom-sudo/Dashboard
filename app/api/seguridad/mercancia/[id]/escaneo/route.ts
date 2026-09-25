import { query } from "@/lib/db";
import { normalizarCodigo } from "@/lib/escaneo/codigos";
import { MAX_CODIGO, procesarEscaneo, type RespuestaEscaneo } from "@/lib/escaneo/procesar";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { puedeHacer, verificaPorSerial } from "@/lib/seguridad/egresoFlujo";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { cargarMovimiento } from "@/lib/seguridad/mercancia";
import { registrarNovedadEscaneo, serialDeOtroEgreso } from "@/lib/seguridad/novedades";
import { faltaMigracion } from "@/lib/seguridad/seriales";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Verificacion de Seguridad en C4 con pistola (issue #301).
 *
 * POST  { codigo, item_id?, aprender_item_id?, forzar_serial?, sobrante? }
 *   Una lectura de la pistola. Que es lo decide lib/escaneo/procesar (el
 *   mismo de la recepcion); aca va lo propio del egreso:
 *    - Un serial esperado (del picking de Odoo, #299) ya dice de que renglon
 *      es: se marca verificado y cuenta 1, sin seleccionar el producto.
 *    - Un serial que no esta en el picking no cuenta: queda como novedad
 *      ("serial_sobra"), o "serial_otra_orden" si es de otra orden (se dice
 *      cual).
 *    - `sobrante: true`: el codigo es de un producto que no esta en la orden
 *      (la pantalla lo pregunta cuando no reconoce el codigo).
 *   Resultado "novedad" = se registro una novedad, con status 200.
 *
 * PATCH { item_id, cantidad?, no_salio?, observacion? }
 *   Lo que no se pistolea: la cantidad de un producto sin codigo (se busca
 *   por nombre y se escribe) y "No salio" con su motivo.
 *
 * Todo se guarda al momento: al cerrar, la verificacion se lee de la base,
 * no de lo que mande el navegador. Solo en `por_verificar`, y solo Seguridad.
 */

const MAX = { observacion: 300, nombre: 200 };

type Contexto = {
  id: number;
  mov: any;
  items: any[];
  seriales: Array<{ id: number; item_id: number; serial: string; verificado_at: string | null }>;
  quien: string;
};

async function preparar(
  request: NextRequest,
  params: Promise<{ id: string }>,
): Promise<Contexto | NextResponse> {
  const auth = await requireAlmacenOSeguridad(request);
  if (auth.error) return auth.error;
  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  const rol = String(auth.payload?.role || "");
  if (!puedeHacer("verificar_seguridad", rol)) {
    return NextResponse.json({ error: "La verificacion en C4 la hace Seguridad" }, { status: 403 });
  }
  const id = parseInt((await params).id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const datos = await cargarMovimiento(id);
  if (!datos || (cids !== null && Number(datos.movimiento.cids) !== cids)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (datos.movimiento.tipo !== "egreso" || datos.movimiento.etapa !== "por_verificar") {
    return NextResponse.json(
      { error: "Este egreso no esta en verificacion de Seguridad" },
      { status: 409 },
    );
  }
  const quien = String(auth.payload?.name || auth.payload?.email || rol).slice(0, MAX.nombre);
  return { id, mov: datos.movimiento, items: datos.items, seriales: datos.seriales, quien };
}

/** Cantidad verificada de un renglon por serial = sus seriales pistoleados. */
async function recontar(id: number, itemId: number): Promise<number> {
  const r = await query(
    `SELECT COUNT(*) AS n FROM seguridad_mercancia_seriales
      WHERE mercancia_id = ? AND item_id = ? AND verificado_at IS NOT NULL`,
    [id, itemId],
  );
  const n = Number((r.rows as any[])[0]?.n || 0);
  await query(
    "UPDATE seguridad_mercancia_items SET cantidad_verificada = ? WHERE id = ? AND mercancia_id = ?",
    [n, itemId, id],
  );
  return n;
}

function avisar(ctx: Contexto) {
  // Otra persona pistoleando el mismo egreso ve los conteos al momento.
  emitirMercancia(
    {
      accion: "conteo",
      id: ctx.id,
      tipo: "egreso",
      etapa: ctx.mov.etapa,
      estado: ctx.mov.estado,
      documento: ctx.mov.odoo_picking_name,
    },
    Number(ctx.mov.cids) || null,
  );
}

function errorServidor(e: any) {
  console.error("[egreso] error en la verificacion con pistola:", e?.message || e);
  return NextResponse.json(
    {
      error: faltaMigracion(e)
        ? "Falta correr sql/egreso_verificacion_c4.sql"
        : "No se pudo registrar la lectura",
    },
    { status: 500 },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await preparar(request, params);
    if (ctx instanceof NextResponse) return ctx;
    const { id, mov, seriales, quien } = ctx;
    const ronda = Number(mov.ronda_verificacion || 1);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    // Para la pistola, un renglon "lleva serial" solo si tiene seriales
    // esperados: sin ellos se cuenta como cualquier producto.
    const items = ctx.items.map((i) => ({
      ...i,
      lleva_serial: verificaPorSerial(i, seriales) ? 1 : 0,
    }));
    const esperado = new Map(seriales.map((s) => [s.serial, s]));

    // Producto que no esta en la orden: lo dice Seguridad al no reconocerlo.
    if (body?.sobrante === true) {
      const codigo = normalizarCodigo(String(body?.codigo ?? "").slice(0, MAX_CODIGO));
      if (!codigo) return NextResponse.json({ error: "Codigo vacio" }, { status: 400 });
      const r = await registrarNovedadEscaneo(
        id,
        ronda,
        { tipo: "producto_ajeno", item_id: null, producto: codigo, serial: codigo },
        quien,
      );
      avisar(ctx);
      return NextResponse.json({
        resultado: "novedad",
        novedad: "producto_ajeno",
        item_id: null,
        codigo,
        cantidad: r.contado,
      });
    }

    const r: RespuestaEscaneo = await procesarEscaneo(body, items, {
      quien,
      serialEsperado: async (codigo) => {
        const s = esperado.get(codigo);
        return s ? items.find((i) => Number(i.id) === Number(s.item_id)) || null : null;
      },
      sumarUno: async (item) => {
        await query(
          `UPDATE seguridad_mercancia_items
              SET cantidad_verificada = COALESCE(cantidad_verificada, 0) + 1
            WHERE id = ? AND mercancia_id = ?`,
          [item.id, id],
        );
        const c = await query("SELECT cantidad_verificada FROM seguridad_mercancia_items WHERE id = ?", [item.id]);
        return Number((c.rows as any[])[0]?.cantidad_verificada || 0);
      },
      registrarSerial: async (item, serial) => {
        const s = esperado.get(serial);
        if (s) {
          // La guarda `verificado_at IS NULL` hace que, con dos personas
          // pistoleando a la vez, el mismo serial cuente una sola vez.
          const upd = await query(
            `UPDATE seguridad_mercancia_seriales
                SET verificado_at = NOW(), verificado_por = ?
              WHERE mercancia_id = ? AND serial = ? AND verificado_at IS NULL`,
            [quien, id, serial],
          );
          if (Number((upd.rows as any)?.affectedRows || 0) !== 1) {
            return { status: 409, body: { resultado: "repetido", item_id: Number(s.item_id), serial } };
          }
          const cantidad = await recontar(id, Number(s.item_id));
          return {
            status: 200,
            body: {
              resultado: "serial",
              item_id: Number(s.item_id),
              serial: { id: s.id, item_id: Number(s.item_id), serial, escaneado_por: quien, created_at: new Date().toISOString() },
              cantidad,
              en_otro: null,
            },
          };
        }
        // No esta en el picking: no cuenta, queda como novedad.
        const otra = await serialDeOtroEgreso(serial, id);
        const n = await registrarNovedadEscaneo(
          id,
          ronda,
          {
            tipo: otra ? "serial_otra_orden" : "serial_sobra",
            item_id: Number(item.id),
            producto: item.producto,
            serial,
            otra_orden: otra,
          },
          quien,
        );
        if (n.repetido) {
          return { status: 409, body: { resultado: "repetido", item_id: Number(item.id), serial } };
        }
        return {
          status: 200,
          body: {
            resultado: "novedad",
            novedad: otra ? "serial_otra_orden" : "serial_sobra",
            item_id: Number(item.id),
            serial,
            referencia: otra,
          },
        };
      },
    });

    // Codigo que no es de ningun producto de la orden: si es un serial de otra
    // orden, eso ya es la novedad, sin preguntar de que producto es.
    if (r.body.resultado === "desconocido" && !r.body.pista) {
      const codigo = String(r.body.codigo || "");
      const otra = codigo ? await serialDeOtroEgreso(codigo, id) : null;
      if (otra) {
        const n = await registrarNovedadEscaneo(
          id,
          ronda,
          // Sin renglon: el serial no es de ningun producto de esta orden.
          { tipo: "serial_otra_orden", item_id: null, producto: "", serial: codigo, otra_orden: otra },
          quien,
        );
        if (n.repetido) {
          return NextResponse.json({ resultado: "repetido", item_id: null, serial: codigo }, { status: 409 });
        }
        avisar(ctx);
        return NextResponse.json({
          resultado: "novedad",
          novedad: "serial_otra_orden",
          item_id: null,
          serial: codigo,
          referencia: otra,
        });
      }
    }

    if (r.status === 200 && r.body.resultado !== "desconocido" && r.body.resultado !== "seleccionado") {
      avisar(ctx);
    }
    return NextResponse.json(r.body, { status: r.status });
  } catch (e: any) {
    return errorServidor(e);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await preparar(request, params);
    if (ctx instanceof NextResponse) return ctx;
    const { id, seriales } = ctx;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const item = ctx.items.find((i) => Number(i.id) === Number(body?.item_id));
    if (!item) return NextResponse.json({ error: "Renglon invalido" }, { status: 400 });

    const sets: string[] = [];
    const valores: unknown[] = [];

    if (body?.cantidad !== undefined) {
      // Un producto con seriales se verifica pistoleando cada uno: su
      // cantidad es la de seriales verificados, no se escribe.
      if (verificaPorSerial(item, seriales)) {
        return NextResponse.json(
          { error: `"${item.producto}" lleva serial: se verifica pistoleando cada serial` },
          { status: 400 },
        );
      }
      const c = body.cantidad;
      const n = c === null || c === "" ? null : Number(c);
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        return NextResponse.json({ error: `Cantidad invalida en "${item.producto}"` }, { status: 400 });
      }
      sets.push("cantidad_verificada = ?");
      valores.push(n);
    }

    if (body?.no_salio !== undefined) {
      const noSalio = body.no_salio === true;
      const observacion = noSalio
        ? String(body?.observacion ?? "").trim().slice(0, MAX.observacion) || null
        : null;
      sets.push("no_salio = ?", "observacion = ?");
      valores.push(noSalio ? 1 : 0, observacion);
    }

    if (sets.length === 0) return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });

    await query(
      `UPDATE seguridad_mercancia_items SET ${sets.join(", ")} WHERE id = ? AND mercancia_id = ?`,
      [...valores, item.id, id],
    );
    avisar(ctx);
    return NextResponse.json({ success: true, ...(await cargarMovimiento(id)) });
  } catch (e: any) {
    return errorServidor(e);
  }
}
