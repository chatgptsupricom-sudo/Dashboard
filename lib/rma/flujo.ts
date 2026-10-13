import { query } from "@/lib/db";
import {
  estadoDelEnvio,
  hayTablaProductos,
  leerProductos,
  type EstadoProducto,
} from "@/lib/rma/items";
import { enviarCorreoActualizacion } from "@/lib/rma/emailActualizacion";

/**
 * Estados del flujo con plazos (sql/rma_estados_plazos.sql, lib/rma/plazos.ts):
 * por_llegar → en_diagnostico → en_reparacion → reparado / nota de crédito /
 * no procesado.
 *
 * Todo degrada si no se corrió la migración: los casos nacen "recibido" como
 * antes y el ingreso de Seguridad no cambia el estado.
 */

export const ESTADOS_FLUJO: EstadoProducto[] = ["por_llegar", "en_diagnostico", "en_reparacion"];

let hayEstados = false;

/** Si el ENUM de `status` ya tiene los estados nuevos. Se cachea solo el "sí". */
export async function hayEstadosFlujo(): Promise<boolean> {
  if (hayEstados) return true;
  try {
    const caso = await query("SHOW COLUMNS FROM rma_cases LIKE 'status'");
    let ok = String((caso.rows as any[])[0]?.Type ?? "").includes("en_diagnostico");
    if (ok && (await hayTablaProductos())) {
      const item = await query("SHOW COLUMNS FROM rma_case_items LIKE 'status'");
      ok = String((item.rows as any[])[0]?.Type ?? "").includes("en_diagnostico");
    }
    hayEstados = ok;
  } catch {
    hayEstados = false;
  }
  return hayEstados;
}

/**
 * Estado con el que nace un caso: el ticket del portal (o de un vendedor)
 * espera el equipo; el que RMA abre en el panel ya lo tiene en la mano.
 */
export async function estadoInicial(conEquipo: boolean): Promise<EstadoProducto> {
  if (!(await hayEstadosFlujo())) return "recibido";
  return conEquipo ? "en_diagnostico" : "por_llegar";
}

/** Para los PUT del caso y del producto: un estado nuevo sin la migración corrida. */
export async function errorEstadoFlujo(nuevo: string | undefined | null): Promise<string | null> {
  if (!nuevo || !ESTADOS_FLUJO.includes(nuevo as EstadoProducto)) return null;
  if (await hayEstadosFlujo()) return null;
  return "Falta correr la migración sql/rma_estados_plazos.sql para usar este estado.";
}

/** Estados en los que el equipo todavía no llegó (o, en casos de antes, no se sabía). */
const SIN_LLEGAR = ["por_llegar", "recibido"];

/**
 * Seguridad registró el ingreso del envío (lo firma también RMA): lo que
 * llegó pasa a diagnóstico y empieza a correr el plazo de 48 horas.
 *
 * `recibidos` = productos que el acta marcó como recibidos; null = el envío
 * entero (ingreso de un solo producto). Lo que no llegó sigue por llegar.
 *
 * Nunca rompe el ingreso: si algo falla, se loguea.
 */
export async function registrarLlegada(
  caseId: number,
  opciones: { changedBy: string; recibidos: number[] | null; guia?: string | null; origenPeticion: string },
): Promise<void> {
  try {
    if (!(await hayEstadosFlujo())) return;

    const r = await query(`SELECT id, status, model, hardware FROM rma_cases WHERE id = ?`, [caseId]);
    const caso = (r.rows as any[])[0];
    if (!caso) return;
    const nota = `Ingreso registrado en almacén${opciones.guia ? ` (guía ${opciones.guia})` : ""}: pasa a diagnóstico`;

    const productos = await leerProductos(caseId);
    let despues: string = "en_diagnostico";
    if (productos.length) {
      for (const p of productos) {
        if (!SIN_LLEGAR.includes(p.status)) continue;
        if (opciones.recibidos && !opciones.recibidos.includes(p.id)) continue;
        await query(`UPDATE rma_case_items SET status = 'en_diagnostico' WHERE id = ?`, [p.id]);
        await query(
          `INSERT INTO rma_history (case_id, item_id, from_status, to_status, changed_by, notes)
           VALUES (?, ?, ?, 'en_diagnostico', ?, ?)`,
          [caseId, p.id, p.status, opciones.changedBy, nota],
        );
      }
      despues = estadoDelEnvio((await leerProductos(caseId)).map((p) => p.status));
    } else if (!SIN_LLEGAR.includes(caso.status)) {
      return;
    }

    if (despues === caso.status) return;
    await query(`UPDATE rma_cases SET status = ? WHERE id = ?`, [despues, caseId]);
    await query(
      `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [caseId, caso.status, despues, opciones.changedBy, nota],
    );

    // Al cliente, como cualquier otro cambio de estado: "recibimos tu equipo".
    enviarCorreoActualizacion(
      caseId,
      {
        producto: caso.model || caso.hardware || "",
        estado_anterior: caso.status,
        estado_nuevo: despues,
        tipo: "estado",
      },
      opciones.origenPeticion,
    );
  } catch (e: any) {
    console.error(`[rma/flujo] no se pudo pasar a diagnóstico el caso ${caseId}:`, e?.message);
  }
}
