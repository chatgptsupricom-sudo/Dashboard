import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import { actualizarEquipoAlCerrar, actualizarOrden, listar, ordenDeSede } from "@/lib/mantenimiento/datos";
import { ACCIONES, esUno, tareasCompletas, type Tarea } from "@/lib/mantenimiento/tipos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/seguridad/mercancia/mantenimiento/[id]  { accion, ...datos }
 *
 * Mueve una orden de mantenimiento (lib/mantenimiento/tipos):
 *  - iniciar { responsable }: reportado → en_taller.
 *  - tarea { indice, hecha } / agregar_tarea { texto }: en el taller.
 *  - terminar: en_taller → listo; exige todas las tareas hechas.
 *  - cerrar { costo?, notas?, medidor?, proximo_servicio? }: listo → cerrado;
 *    el equipo vuelve a operación.
 *
 * Cada cambio se escribe con `WHERE estado = <el esperado>`: si dos personas
 * pulsan a la vez, la segunda recibe 409 y su pantalla se refresca.
 */

const MAX = { responsable: 200, tarea: 200, tareas: 30, notas: 2000 };

function texto(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAlmacen(request);
    if (auth.error) return auth.error;
    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;
    if (cids === null) {
      return NextResponse.json(
        { error: "El SuperAdmin solo consulta: el mantenimiento lo registra Almacén" },
        { status: 403 },
      );
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const accion = body?.accion;
    if (!esUno(ACCIONES, accion)) return NextResponse.json({ error: "accion invalida" }, { status: 400 });

    const orden = await ordenDeSede(id, cids);
    if (!orden) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const quien = String(auth.payload?.name || auth.payload?.email || "Almacén").slice(0, 200);
    const conflicto = async () =>
      NextResponse.json(
        { error: "Este mantenimiento ya cambió de etapa. Se actualizó la pantalla.", ...(await listar(cids)) },
        { status: 409 },
      );

    switch (accion) {
      case "iniciar": {
        if (orden.estado !== "reportado") return conflicto();
        const responsable = texto(body?.responsable, MAX.responsable);
        if (!responsable) {
          return NextResponse.json({ error: "Indica el taller o el mecánico que lo atiende" }, { status: 400 });
        }
        const ok = await actualizarOrden(
          id,
          "reportado",
          "estado = 'en_taller', responsable = ?, iniciado_por = ?, iniciado_at = NOW()",
          [responsable, quien],
        );
        if (!ok) return conflicto();
        break;
      }

      case "tarea":
      case "agregar_tarea": {
        if (orden.estado !== "en_taller") return conflicto();
        const tareas: Tarea[] = orden.tareas.map((t) => ({ ...t }));
        if (accion === "tarea") {
          const indice = Number(body?.indice);
          if (!Number.isInteger(indice) || !tareas[indice]) {
            return NextResponse.json({ error: "Esa tarea no existe" }, { status: 400 });
          }
          const hecha = body?.hecha === true;
          tareas[indice] = {
            texto: tareas[indice].texto,
            hecha,
            por: hecha ? quien : null,
            at: hecha ? new Date().toISOString() : null,
          };
        } else {
          const nueva = texto(body?.texto, MAX.tarea);
          if (!nueva) return NextResponse.json({ error: "Escribe la tarea" }, { status: 400 });
          if (tareas.length >= MAX.tareas) {
            return NextResponse.json({ error: `Son como máximo ${MAX.tareas} tareas` }, { status: 400 });
          }
          if (tareas.some((t) => t.texto.toLowerCase() === nueva.toLowerCase())) {
            return NextResponse.json({ error: "Esa tarea ya está en la lista" }, { status: 400 });
          }
          tareas.push({ texto: nueva, hecha: false });
        }
        const ok = await actualizarOrden(id, "en_taller", "tareas_json = ?", [JSON.stringify(tareas)]);
        if (!ok) return conflicto();
        break;
      }

      case "terminar": {
        if (orden.estado !== "en_taller") return conflicto();
        if (!tareasCompletas(orden.tareas)) {
          return NextResponse.json({ error: "Faltan tareas por marcar: no se puede dar por terminado" }, { status: 400 });
        }
        const ok = await actualizarOrden(id, "en_taller", "estado = 'listo', terminado_por = ?, terminado_at = NOW()", [
          quien,
        ]);
        if (!ok) return conflicto();
        break;
      }

      case "cerrar": {
        if (orden.estado !== "listo") return conflicto();
        let costo: number | null = null;
        if (body?.costo !== undefined && body?.costo !== null && body?.costo !== "") {
          costo = Math.round(Number(body.costo) * 100) / 100;
          if (!Number.isFinite(costo) || costo < 0 || costo > 9_999_999) {
            return NextResponse.json({ error: "El costo no es válido" }, { status: 400 });
          }
        }
        let medidor: number | null = null;
        if (body?.medidor !== undefined && body?.medidor !== null && body?.medidor !== "") {
          medidor = Number(body.medidor);
          if (!Number.isInteger(medidor) || medidor < 0 || medidor > 9_999_999) {
            return NextResponse.json({ error: "El kilometraje u horas no es válido" }, { status: 400 });
          }
        }
        let proximo: string | null = null;
        if (body?.proximo_servicio) {
          proximo = String(body.proximo_servicio).slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(proximo) || Number.isNaN(new Date(`${proximo}T00:00:00Z`).getTime())) {
            return NextResponse.json({ error: "La fecha del próximo servicio no es válida" }, { status: 400 });
          }
        }
        const ok = await actualizarOrden(
          id,
          "listo",
          "estado = 'cerrado', costo = ?, notas_cierre = ?, cerrado_por = ?, cerrado_at = NOW()",
          [costo, texto(body?.notas, MAX.notas), quien],
        );
        if (!ok) return conflicto();
        // La orden ya cerró: si esto falla no se devuelve error, queda en el log.
        try {
          await actualizarEquipoAlCerrar(orden.equipo_id, {
            medidor: medidor ?? orden.medidor,
            proximo,
            preventivo: orden.tipo === "preventivo",
          });
        } catch (e: any) {
          console.error(`[mantenimiento ${id}] no se actualizó el equipo al cerrar:`, e?.message || e);
        }
        break;
      }
    }

    return NextResponse.json({ success: true, ...(await listar(cids)) });
  } catch (error: any) {
    console.error("Error moviendo mantenimiento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
