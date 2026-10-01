/**
 * Formateo de fechas de calendario (columnas DATE).
 *
 * Vive fuera de `lib/seguridad/` porque lo necesitan tanto el modulo Seguridad
 * como las pantallas de RMA y el portal publico.
 */

/**
 * Fecha corta (dd/mm/aa) para listados.
 *
 * Las columnas DATE llegan como Date desde mysql2 y el JSON las serializa a
 * ISO completo, asi que sin esto la pantalla muestra
 * "2026-08-19T04:00:00.000Z" en la celda donde cabe una fecha corta.
 *
 * Se corta el trozo de fecha del ISO en vez de pasar por `new Date(...)`: ese
 * ISO es medianoche de Caracas (UTC-4), y reinterpretarlo en la zona del
 * navegador mueve el dia para cualquiera que abra el panel al oeste de
 * Venezuela. Un ingreso del dia 19 no puede aparecer como del 18 segun quien
 * lo mire — es la fecha de un acta de recepcion.
 */
export function fechaCorta(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return texto;
  const [, año, mes, dia] = iso;
  return `${dia}/${mes}/${año.slice(2)}`;
}

/** Igual que `fechaCorta` pero con el año completo (dd/mm/aaaa). */
export function fechaLarga(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return texto;
  const [, año, mes, dia] = iso;
  return `${dia}/${mes}/${año}`;
}
