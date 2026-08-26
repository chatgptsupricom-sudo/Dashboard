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
