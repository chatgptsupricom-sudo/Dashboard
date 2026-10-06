import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import { crearEquipo, crearOrden, equipoDeSede, guardarPlan, listar, marcarRegreso } from "@/lib/mantenimiento/datos";
import {
  PRIORIDADES,
  TAREAS_SUGERIDAS,
  TIPOS_EQUIPO,
  TIPOS_ORDEN,
  esUno,
  type Tarea,
  type TipoOrden,
} from "@/lib/mantenimiento/tipos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mantenimiento de unidades de Almacén (lib/mantenimiento/tipos).
 *
 * GET: los equipos de la sede (camiones y montacargas) con su orden abierta,
 * y las últimas órdenes cerradas.
 * POST { accion, ... }:
 *  - equipo: dar de alta un equipo.
 *  - reportar: abrir una orden de mantenimiento para uno.
 *  - regreso { equipo_id, medidor? }: el camión volvió de la ruta.
 *  - plan { equipo_id, intervalo_dias, intervalo_medidor, proximo_servicio?,
 *    medidor? }: el plan preventivo del equipo.
 *
 * Solo Almacén. El SuperAdmin entra a mirar (ve todas las sedes), pero no
 * registra: sin sede no hay a quién asignarle el equipo.
 */

const MAX = { codigo: 50, descripcion: 200, titulo: 200, detalle: 2000, tarea: 200, tareas: 30 };

function texto(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Kilómetros u horas: entero no negativo, o null si no se indicó. */
function medidor(v: unknown): number | null | "invalido" {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 9_999_999 ? n : "invalido";
}

const soloLectura = () =>
  NextResponse.json({ error: "El SuperAdmin solo consulta: el mantenimiento lo registra Almacén" }, { status: 403 });

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacen(request);
    if (auth.error) return auth.error;
    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    return NextResponse.json({ success: true, puede_editar: cids !== null, ...(await listar(cids)) });
  } catch (error: any) {
    console.error("Error listando mantenimiento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAlmacen(request);
    if (auth.error) return auth.error;
    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;
    if (cids === null) return soloLectura();

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const quien = String(auth.payload?.name || auth.payload?.email || "Almacén").slice(0, 200);

    if (body?.accion === "equipo") {
      if (!esUno(TIPOS_EQUIPO, body?.tipo)) {
        return NextResponse.json({ error: "Indica si es camión o montacargas" }, { status: 400 });
      }
      const codigo = texto(body?.codigo, MAX.codigo)?.toUpperCase();
      if (!codigo) {
        return NextResponse.json({ error: "Falta la placa o el código del equipo" }, { status: 400 });
      }
      const m = medidor(body?.medidor);
      if (m === "invalido") return NextResponse.json({ error: "El kilometraje u horas no es válido" }, { status: 400 });

      const r = await crearEquipo({
        cids,
        tipo: body.tipo,
        codigo,
        descripcion: texto(body?.descripcion, MAX.descripcion),
        medidor: m,
        quien,
      });
      if (r === "repetido") {
        return NextResponse.json({ error: `Ya hay un equipo con el código ${codigo}` }, { status: 409 });
      }
      return NextResponse.json({ success: true, ...(await listar(cids)) }, { status: 201 });
    }

    if (body?.accion === "reportar") {
      const equipoId = Number(body?.equipo_id);
      const equipo = Number.isInteger(equipoId) && equipoId > 0 ? await equipoDeSede(equipoId, cids) : null;
      // 404 también para el de otra sede: adivinar un id no debe confirmar que existe.
      if (!equipo) return NextResponse.json({ error: "No encontramos ese equipo" }, { status: 404 });

      if (!esUno(TIPOS_ORDEN, body?.tipo)) {
        return NextResponse.json({ error: "Indica si es preventivo o correctivo" }, { status: 400 });
      }
      const titulo = texto(body?.titulo, MAX.titulo);
      if (!titulo) return NextResponse.json({ error: "Escribe qué hay que hacerle" }, { status: 400 });
      const m = medidor(body?.medidor);
      if (m === "invalido") return NextResponse.json({ error: "El kilometraje u horas no es válido" }, { status: 400 });

      // Las tareas que mandó la pantalla; sin ninguna, las habituales del servicio.
      const tipoOrden: TipoOrden = body.tipo;
      const pedidas: string[] = [];
      for (const t of Array.isArray(body?.tareas) ? body.tareas : []) {
        const limpia = texto(t, MAX.tarea);
        if (limpia && pedidas.length < MAX.tareas) pedidas.push(limpia);
      }
      const tareas: Tarea[] = [...new Set(pedidas.length > 0 ? pedidas : TAREAS_SUGERIDAS[equipo.tipo][tipoOrden])].map(
        (t) => ({ texto: t, hecha: false }),
      );

      const r = await crearOrden({
        cids,
        equipoId,
        tipo: tipoOrden,
        prioridad: esUno(PRIORIDADES, body?.prioridad) ? body.prioridad : "media",
        titulo,
        detalle: texto(body?.detalle, MAX.detalle),
        medidor: m,
        tareas,
        quien,
      });
      if (r === "ya_tiene") {
        return NextResponse.json(
          { error: "Ese equipo ya tiene un mantenimiento abierto. Se actualizó la pantalla.", ...(await listar(cids)) },
          { status: 409 },
        );
      }
      return NextResponse.json({ success: true, ...(await listar(cids)) }, { status: 201 });
    }

    if (body?.accion === "regreso" || body?.accion === "plan") {
      const equipoId = Number(body?.equipo_id);
      const equipo = Number.isInteger(equipoId) && equipoId > 0 ? await equipoDeSede(equipoId, cids) : null;
      if (!equipo) return NextResponse.json({ error: "No encontramos ese equipo" }, { status: 404 });
      const m = medidor(body?.medidor);
      if (m === "invalido") return NextResponse.json({ error: "El kilometraje u horas no es válido" }, { status: 400 });

      if (body.accion === "regreso") {
        await marcarRegreso(equipoId, m);
      } else {
        const dias = medidor(body?.intervalo_dias);
        const cada = medidor(body?.intervalo_medidor);
        if (dias === "invalido" || cada === "invalido" || dias === 0 || cada === 0) {
          return NextResponse.json({ error: "Los intervalos del plan tienen que ser números mayores que cero" }, { status: 400 });
        }
        let proximo: string | null | undefined;
        if (body?.proximo_servicio === null || body?.proximo_servicio === "") proximo = null;
        else if (body?.proximo_servicio !== undefined) {
          proximo = String(body.proximo_servicio).slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(proximo) || Number.isNaN(new Date(`${proximo}T00:00:00Z`).getTime())) {
            return NextResponse.json({ error: "La fecha del próximo servicio no es válida" }, { status: 400 });
          }
        }
        await guardarPlan(equipoId, { intervaloDias: dias, intervaloMedidor: cada, proximo, medidor: m });
      }
      return NextResponse.json({ success: true, ...(await listar(cids)) });
    }

    return NextResponse.json({ error: "accion invalida" }, { status: 400 });
  } catch (error: any) {
    console.error("Error registrando mantenimiento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
