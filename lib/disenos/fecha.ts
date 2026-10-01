/**
 * Fecha del diseño (`designer_designs.design_date`): el día que cuenta para los
 * KPIs, distinto de `created_at` (cuándo se subió el archivo). Un lote que se
 * sube junto puede tener flyers de varios días.
 *
 * En SQL siempre se lee con este COALESCE: las filas viejas, o las creadas por
 * un endpoint que todavía no mande la fecha, caen en su día de subida.
 */
export const COLUMNA_FECHA = "COALESCE(d.design_date, DATE(d.created_at))";
export const COLUMNA_FECHA_SIN_ALIAS = "COALESCE(design_date, DATE(created_at))";

/** "YYYY-MM-DD" válido y real, o null. */
export function fechaValida(valor: unknown): string | null {
  const s = String(valor ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return s;
}

/** Fecha de MySQL (Date o string) a "YYYY-MM-DD". */
export function aISO(valor: any): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, "0")}-${String(valor.getDate()).padStart(2, "0")}`;
  }
  return String(valor).slice(0, 10);
}
