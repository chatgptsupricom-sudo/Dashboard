import { query } from "@/lib/db";

/**
 * Calificaciones de un egreso por aspecto (issue #302): `picking` y
 * `despacho`, en la columna `seguridad_calificaciones.aspecto`.
 *
 * Hasta que se corra sql/egreso_calificaciones.sql la columna no existe: las
 * consultas usan `sqlAspecto()`, que en ese caso trata todo como `despacho`
 * (lo que era la unica nota de antes), en vez de romper el dashboard.
 */

let hayAspecto: boolean | null = null;

/** Si ya existe la columna `aspecto`. Se pregunta hasta que aparece; despues queda en memoria. */
export async function hayColumnaAspecto(): Promise<boolean> {
  if (hayAspecto) return true;
  try {
    const r = await query("SHOW COLUMNS FROM seguridad_calificaciones LIKE 'aspecto'");
    hayAspecto = (r.rows as any[]).length > 0;
  } catch {
    hayAspecto = false;
  }
  return hayAspecto;
}

/**
 * Expresion SQL del aspecto de una calificacion de egreso. `NULL` (egresos de
 * antes de #302, con una sola nota) cuenta como `despacho`.
 */
export async function sqlAspecto(alias = "c"): Promise<string> {
  return (await hayColumnaAspecto()) ? `COALESCE(${alias}.aspecto, 'despacho')` : "'despacho'";
}

/** Calificaciones de un egreso, con su aspecto. */
export async function leerCalificacionesEgreso(mercanciaId: number) {
  const aspecto = await sqlAspecto();
  try {
    const r = await query(
      `SELECT c.id, c.almacenista_nombre, c.calificacion, c.comentario, c.calificado_por,
              c.created_at, ${aspecto} AS aspecto
         FROM seguridad_calificaciones c
        WHERE c.relacionado_a = 'mercancia' AND c.relacionado_id = ?
        ORDER BY c.id`,
      [mercanciaId],
    );
    return r.rows as any[];
  } catch {
    return [];
  }
}
