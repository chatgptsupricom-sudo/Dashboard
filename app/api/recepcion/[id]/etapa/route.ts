import { query } from "@/lib/db";
import { evaluarConteo, normalizarPrecinto } from "@/lib/recepcion/flujo";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/recepcion/[id]/etapa  { accion, ...datos }   — solo Almacen
 *
 *  registrar_llegada  por_llegar  -> descargando   (fotos contenedor + precinto, numero de precinto)
 *  guardar_conteo     descargando (no avanza)      (guarda el avance del conteo)
 *  cerrar             descargando -> cerrado       (conteo completo + foto de cierre)
 *
 * El avance se escribe con `WHERE etapa = <la esperada>`: si dos personas
 * pulsan a la vez, la segunda recibe 409 en vez de repetir el paso.
 */

const MAX = { precinto: 50, motivo: 300, nota: 300, notas: 5000 };

function texto(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function conflicto() {
  return NextResponse.json(
    { error: "Esta recepcion ya cambio de etapa. Se actualizo la pantalla." },
    { status: 409 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "La recepcion la hace Almacen" }, { status: 403 });
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
    const rec = datos.recepcion;
    const tiposSubidos = new Set(datos.archivos.map((a) => a.tipo));

    switch (body?.accion) {
      case "registrar_llegada": {
        if (rec.etapa !== "por_llegar") return conflicto();
        const precinto = texto(body?.precinto_recibido, MAX.precinto);
        const faltan: string[] = [];
        if (!tiposSubidos.has("foto_llegada")) faltan.push("la foto del contenedor al llegar");
        if (!tiposSubidos.has("foto_precinto")) faltan.push("la foto del precinto");
        if (!precinto) faltan.push("el numero de precinto");
        if (faltan.length) {
          return NextResponse.json({ error: `Falta ${faltan.join(", ")}` }, { status: 400 });
        }
        // Sin precinto esperado no hay contra que comparar: queda NULL, no "no coincide".
        const coincide = rec.precinto_esperado
          ? normalizarPrecinto(rec.precinto_esperado) === normalizarPrecinto(precinto)
            ? 1
            : 0
          : null;

        const res = await query(
          `UPDATE recepcion_packing
              SET etapa = 'descargando', llegada_at = NOW(), llegada_por = ?,
                  precinto_recibido = ?, precinto_coincide = ?
            WHERE id = ? AND etapa = 'por_llegar'`,
          [sesion!.nombre, precinto, coincide, id],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();
        if (coincide === 0) {
          console.warn(
            `[recepcion ${id}] PRECINTO DISTINTO: esperado ${rec.precinto_esperado}, recibido ${precinto}`,
          );
        }
        emitirRecepcion({
          accion: "llegada",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          proveedor: rec.proveedor,
        });
        break;
      }

      case "guardar_conteo":
      case "cerrar": {
        if (rec.etapa !== "descargando") return conflicto();

        // Se guarda el conteo (tambien al cerrar: el cierre manda el ultimo).
        const porId = new Map<number, any>(datos.items.map((i) => [Number(i.id), i]));
        for (const c of Array.isArray(body?.items) ? body.items : []) {
          const item = porId.get(Number(c?.id));
          if (!item) continue;
          const bruto = c?.cantidad_recibida;
          const cantidad = bruto === null || bruto === undefined || bruto === "" ? null : Number(bruto);
          if (cantidad !== null && (!Number.isFinite(cantidad) || cantidad < 0)) {
            return NextResponse.json(
              { error: `Cantidad invalida en "${item.producto}"` },
              { status: 400 },
            );
          }
          const golpeado = c?.golpeado === true;
          const motivo = texto(c?.motivo_diferencia, MAX.motivo);
          const nota = golpeado ? texto(c?.golpeado_nota, MAX.nota) : null;
          await query(
            `UPDATE recepcion_packing_items
                SET cantidad_recibida = ?, motivo_diferencia = ?, golpeado = ?, golpeado_nota = ?
              WHERE id = ? AND recepcion_id = ?`,
            [cantidad, motivo, golpeado ? 1 : 0, nota, item.id, id],
          );
          Object.assign(item, {
            cantidad_recibida: cantidad,
            motivo_diferencia: motivo,
            golpeado: golpeado ? 1 : 0,
            golpeado_nota: nota,
          });
        }

        if (body.accion === "guardar_conteo") break;

        const fotosGolpe = new Set(
          datos.archivos
            .filter((a) => a.tipo === "foto_golpe" && a.item_id)
            .map((a) => Number(a.item_id)),
        );
        const ev = evaluarConteo(
          datos.items.map((i) => ({
            id: Number(i.id),
            cantidad_esperada: Number(i.cantidad_esperada),
            cantidad_recibida: i.cantidad_recibida === null ? null : Number(i.cantidad_recibida),
            motivo_diferencia: i.motivo_diferencia,
            golpeado: Number(i.golpeado) === 1,
          })),
          fotosGolpe,
        );
        const faltan: string[] = [];
        if (ev.sinContar) faltan.push(`${ev.sinContar} renglon(es) sin contar`);
        if (ev.sinMotivo) faltan.push(`el motivo en ${ev.sinMotivo} renglon(es) con diferencia`);
        if (ev.golpesSinFoto) faltan.push(`la foto de ${ev.golpesSinFoto} caja(s) golpeada(s)`);
        if (!tiposSubidos.has("foto_cierre")) faltan.push("la foto del contenedor al terminar");
        if (faltan.length) {
          return NextResponse.json(
            { error: `No se puede cerrar: falta ${faltan.join(", ")}`, evaluacion: ev },
            { status: 400 },
          );
        }

        const novedades =
          ev.faltantes > 0 ||
          ev.sobrantes > 0 ||
          ev.golpeados > 0 ||
          Number(rec.precinto_coincide) === 0;
        const resultado = novedades ? "con_novedades" : "conforme";
        const res = await query(
          `UPDATE recepcion_packing
              SET etapa = 'cerrado', cerrado_at = NOW(), cerrado_por = ?,
                  resultado = ?, notas_cierre = ?
            WHERE id = ? AND etapa = 'descargando'`,
          [sesion!.nombre, resultado, texto(body?.notas_cierre, MAX.notas), id],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();
        emitirRecepcion({
          accion: "cerrado",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          proveedor: rec.proveedor,
          resultado,
        });
        break;
      }

      default:
        return NextResponse.json({ error: "accion invalida" }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(await cargarRecepcion(id)) });
  } catch (e: any) {
    console.error("Error en etapa de recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
