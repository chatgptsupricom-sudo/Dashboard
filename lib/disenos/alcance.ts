/**
 * Cada diseñador ve y toca solo sus diseños (catálogo, KPIs, imágenes, .zip,
 * papelera, editor con IA). SuperAdmin e Inteligencia de Negocio ven todo.
 *
 * El dueño es el correo del token (`designer_designs.created_by_email`); el
 * nombre que mandaba la pantalla ya no cuenta para escribir. Las filas de
 * antes no tienen correo: esas se reconocen por `created_by` = nombre del token,
 * que es el mismo `user.name` que la pantalla mandaba al subirlas.
 */

export const ROL_DISENADOR = "diseñador";

export function esDisenador(payload: any): boolean {
  return String(payload?.role || "").toLowerCase().trim() === ROL_DISENADOR;
}

export function duenoDelToken(payload: any): { email: string; nombre: string } {
  return {
    email: String(payload?.email || "").toLowerCase().trim(),
    nombre: String(payload?.name || "").trim(),
  };
}

/** Condición SQL (sin alias, empieza con " AND") para `designer_designs`; vacía para quien ve todo. */
export function filtroDueno(payload: any): { sql: string; params: string[] } {
  if (!esDisenador(payload)) return { sql: "", params: [] };
  const { email, nombre } = duenoDelToken(payload);
  return {
    sql: " AND (created_by_email = ? OR (created_by_email IS NULL AND created_by = ?))",
    params: [email, nombre],
  };
}
