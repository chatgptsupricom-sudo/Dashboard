import { query } from "@/lib/db";
import {
  alinearPrecintos,
  compararPrecintos,
  evaluarConteo,
  limpiarPrecintos,
  limpiarTiposDano,
} from "@/lib/recepcion/flujo";
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
 * Por contenedor (pueden llegar en dias distintos):
 *  registrar_llegada  { contenedor_id, precintos_recibidos: string[] }
 *                     contenedor por_llegar -> descargando (fotos llegada + precintos;
 *                     puede tener varios precintos, coincide si son los mismos)
 *                     y el packing list pasa a descargando con el primero
 *  cerrar_contenedor  { contenedor_id, notas_cierre }
 *                     contenedor descargando -> cerrado (foto de como quedo)
 *
 * Del packing list entero (el conteo es uno solo):
 *  guardar_conteo     guarda el avance, no avanza
 *  cerrar             descargando -> cerrado: todos los contenedores cerrados
 *                     y el conteo completo
 *
 * Cada avance se escribe con `WHERE etapa = <la esperada>`: si dos personas
 * pulsan a la vez, la segunda recibe 409 en vez de repetir el paso.
 */

const MAX = { motivo: 300, nota: 300, notas: 5000 };

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
    if (rec.etapa === "cerrado") return conflicto();

    // Contenedor sobre el que se actua (acciones de contenedor).
    const contenedor =
      body?.contenedor_id !== undefined
        ? datos.contenedores.find((c) => Number(c.id) === Number(body.contenedor_id))
        : null;
    const fotosDe = (tipo: string, contenedorId: number) =>
      datos.archivos.some((a) => a.tipo === tipo && Number(a.contenedor_id) === contenedorId);

    switch (body?.accion) {
      case "registrar_llegada": {
        if (!contenedor) return NextResponse.json({ error: "Contenedor invalido" }, { status: 400 });
        if (contenedor.etapa !== "por_llegar") return conflicto();
        // Un contenedor puede tener varios precintos: Almacen anota todos los
        // que ve. Se acepta tambien `precinto_recibido` suelto (lo de antes).
        const precintos = alinearPrecintos(
          limpiarPrecintos(
            Array.isArray(body?.precintos_recibidos) ? body.precintos_recibidos : body?.precinto_recibido,
          ),
          contenedor.precintos_esperados,
        );
        const faltan: string[] = [];
        if (!fotosDe("foto_llegada", contenedor.id)) faltan.push("la foto del contenedor al llegar");
        if (!fotosDe("foto_precinto", contenedor.id)) faltan.push("la foto de los precintos");
        if (precintos.length === 0) faltan.push("el numero de al menos un precinto");
        if (faltan.length) {
          return NextResponse.json({ error: `Falta ${faltan.join(", ")}` }, { status: 400 });
        }
        // Coincide solo si son exactamente los mismos; sin esperados, NULL.
        const cmp = compararPrecintos(contenedor.precintos_esperados, precintos);
        const coincide = cmp.coincide === null ? null : cmp.coincide ? 1 : 0;

        const res = await query(
          `UPDATE recepcion_packing_contenedores
              SET etapa = 'descargando', llegada_at = NOW(), llegada_por = ?,
                  precinto_recibido = ?, precintos_recibidos = ?, precinto_coincide = ?
            WHERE id = ? AND recepcion_id = ? AND etapa = 'por_llegar'`,
          [sesion!.nombre, precintos[0], JSON.stringify(precintos), coincide, contenedor.id, id],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();

        // El packing list pasa a "descargando" con el primer contenedor que
        // llega; con los siguientes esto no cambia nada.
        await query(
          `UPDATE recepcion_packing
              SET etapa = 'descargando', llegada_at = COALESCE(llegada_at, NOW()),
                  llegada_por = COALESCE(llegada_por, ?)
            WHERE id = ? AND etapa = 'por_llegar'`,
          [sesion!.nombre, id],
        );

        if (coincide === 0) {
          console.warn(
            `[recepcion ${id}] PRECINTOS DISTINTOS en ${contenedor.numero}: ` +
              `faltan [${cmp.faltan.join(", ")}], no esperados [${cmp.sobran.join(", ")}]`,
          );
        }
        emitirRecepcion({
          accion: "llegada",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          proveedor: rec.proveedor,
          contenedor: contenedor.numero,
          llegados: datos.contenedores.filter((c) => c.etapa !== "por_llegar").length + 1,
          total: datos.contenedores.length,
        });
        break;
      }

      case "cerrar_contenedor": {
        if (!contenedor) return NextResponse.json({ error: "Contenedor invalido" }, { status: 400 });
        if (contenedor.etapa !== "descargando") return conflicto();
        if (!fotosDe("foto_cierre", contenedor.id)) {
          return NextResponse.json(
            { error: "Falta la foto de como quedo el contenedor" },
            { status: 400 },
          );
        }
        const res = await query(
          `UPDATE recepcion_packing_contenedores
              SET etapa = 'cerrado', cerrado_at = NOW(), cerrado_por = ?, notas_cierre = ?
            WHERE id = ? AND recepcion_id = ? AND etapa = 'descargando'`,
          [sesion!.nombre, texto(body?.notas_cierre, MAX.notas), contenedor.id, id],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();
        emitirRecepcion({
          accion: "contenedor_cerrado",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          contenedor: contenedor.numero,
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
          // En que estado llego la caja: danada, humeda y/o abierta. Se
          // acepta tambien el `golpeado` suelto de antes (= danada).
          const tipos = limpiarTiposDano(
            Array.isArray(c?.golpeado_tipos) ? c.golpeado_tipos : c?.golpeado === true ? ["danada"] : [],
          );
          const golpeado = tipos.length > 0;
          const motivo = texto(c?.motivo_diferencia, MAX.motivo);
          const nota = golpeado ? texto(c?.golpeado_nota, MAX.nota) : null;
          await query(
            `UPDATE recepcion_packing_items
                SET cantidad_recibida = ?, motivo_diferencia = ?, golpeado = ?,
                    golpeado_tipos = ?, golpeado_nota = ?
              WHERE id = ? AND recepcion_id = ?`,
            [cantidad, motivo, golpeado ? 1 : 0, golpeado ? JSON.stringify(tipos) : null, nota, item.id, id],
          );
          Object.assign(item, {
            cantidad_recibida: cantidad,
            motivo_diferencia: motivo,
            golpeado: golpeado ? 1 : 0,
            golpeado_tipos: tipos,
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
        const abiertos = datos.contenedores.filter((c) => c.etapa !== "cerrado");
        const faltan: string[] = [];
        if (abiertos.length) {
          faltan.push(
            `terminar ${abiertos.length} contenedor(es): ${abiertos.map((c) => c.numero).join(", ")}`,
          );
        }
        if (ev.sinContar) faltan.push(`${ev.sinContar} renglon(es) sin contar`);
        if (ev.sinMotivo) faltan.push(`el motivo en ${ev.sinMotivo} renglon(es) con diferencia`);
        if (ev.golpesSinFoto) faltan.push(`la foto de ${ev.golpesSinFoto} caja(s) en mal estado`);
        if (faltan.length) {
          return NextResponse.json(
            { error: `No se puede cerrar: falta ${faltan.join(", ")}`, evaluacion: ev },
            { status: 400 },
          );
        }

        const precintoDistinto = datos.contenedores.some((c) => Number(c.precinto_coincide) === 0);
        const novedades =
          ev.faltantes > 0 || ev.sobrantes > 0 || ev.golpeados > 0 || precintoDistinto;
        const resultado = novedades ? "con_novedades" : "conforme";
        const res = await query(
          `UPDATE recepcion_packing
              SET etapa = 'cerrado', cerrado_at = NOW(), cerrado_por = ?,
                  resultado = ?, notas_cierre = ?,
                  precinto_coincide = ?
            WHERE id = ? AND etapa = 'descargando'`,
          [
            sesion!.nombre,
            resultado,
            texto(body?.notas_cierre, MAX.notas),
            // Resumen en la cabecera: 0 si algun precinto no coincidio.
            precintoDistinto ? 0 : datos.contenedores.some((c) => c.precinto_coincide !== null) ? 1 : null,
            id,
          ],
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
