/**
 * Formatea una fecha de calendario sin que la zona horaria la corra un día.
 *
 * El vencimiento de una garantía es una FECHA, no un instante. Pero viaja como
 * ISO ("2027-02-25T00:00:00.000Z", porque la columna es DATE y mysql2 la
 * devuelve como Date a medianoche UTC), y si el navegador hace
 * `new Date(...).toLocaleDateString()` estando al oeste de UTC —Caracas está
 * en UTC-4— muestra el día anterior: al cliente le decíamos que su garantía
 * vence el 24 cuando vence el 25.
 *
 * Se toman los componentes Y-M-D tal cual vienen y se arma la fecha en local,
 * sin conversión de zona.
 */
export function formatearFechaCalendario(
  valor: string | null | undefined,
  locale: string,
): string {
  if (!valor) return "";

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) return "";

  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return fecha.toLocaleDateString(locale === "en" ? "en-US" : "es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
