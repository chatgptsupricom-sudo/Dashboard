/**
 * Promedio de calificación para mostrar.
 *
 * El endpoint devuelve `null` a propósito cuando el almacenista todavía no
 * tiene ninguna calificación, y eso es correcto: "sin calificar" no es lo
 * mismo que "0.0 estrellas". Lo que faltaba era que la pantalla lo
 * contemplara — llamaba a .toFixed() sobre el null y tumbaba el dashboard
 * entero con "Cannot read properties of null".
 *
 * Con las tablas recién creadas y vacías, ese es el estado NORMAL del módulo:
 * el primer día no hay ni una calificación, así que la pantalla se rompía
 * justo al estrenarla.
 */
export function promedioTexto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
    return "—";
  }
  return Number(valor).toFixed(1);
}

/** true cuando hay una calificación real que mostrar. */
export function tienePromedio(valor: number | null | undefined): boolean {
  return valor !== null && valor !== undefined && !Number.isNaN(Number(valor));
}

/**
 * Fecha corta (dd/mm/aa) para los listados.
 *
 * `fecha_entrega` y `fecha_despacho` son columnas DATE, pero mysql2 las
 * devuelve como Date y el JSON las serializa a ISO completo, así que la
 * pantalla mostraba "2026-08-19T04:00:00.000Z" en la celda donde cabe una
 * fecha corta.
 *
 * Se corta el trozo de fecha del ISO en vez de pasar por `new Date(...)`:
 * ese ISO es medianoche de Caracas (UTC-4), y reinterpretarlo en la zona del
 * navegador mueve el día para cualquiera que abra el panel al oeste de
 * Venezuela. Un ingreso del día 19 no puede aparecer como del 18 según quién
 * lo mire — es la fecha de un acta de recepción.
 */
export function fechaCorta(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return texto;
  const [, año, mes, dia] = iso;
  return `${dia}/${mes}/${año.slice(2)}`;
}
