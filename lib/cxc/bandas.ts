/**
 * Bandas de antigüedad de la cartera (días vencidos a la fecha de corte).
 * Los cortes siguen los plazos de crédito que se usan (7, 15, 21, 30, 45 días,
 * como en Contado/Crédito) para que se vea en qué punto del plazo se atrasan.
 * Lo usan Cartera Vencida, Antigüedad de Cartera y sus modales, en el
 * servidor y en la pantalla (sin dependencias).
 */
export const BANDAS = [
  { key: "corriente", label: "Corriente", max: 0 },
  { key: "1-7", label: "1-7 días", max: 7 },
  { key: "8-15", label: "8-15 días", max: 15 },
  { key: "16-21", label: "16-21 días", max: 21 },
  { key: "22-30", label: "22-30 días", max: 30 },
  { key: "31-45", label: "31-45 días", max: 45 },
  { key: "46-60", label: "46-60 días", max: 60 },
  { key: "61-90", label: "61-90 días", max: 90 },
  { key: "91+", label: "91+ días", max: Infinity },
] as const;

export type Banda = (typeof BANDAS)[number]["key"];

/** Banda de una factura según sus días vencidos (0 o menos = corriente). */
export function bandaDeDias(diasVencidos: number): Banda {
  return BANDAS.find((b) => diasVencidos <= b.max)!.key;
}

export const agingVacio = (): Record<Banda, number> =>
  Object.fromEntries(BANDAS.map((b) => [b.key, 0])) as Record<Banda, number>;

/** Colores de cada banda (de verde a rojo oscuro), para barras y tarjetas. */
export const COLOR_BANDA: Record<Banda, { barra: string; fondo: string; texto: string }> = {
  corriente: { barra: "bg-emerald-400", fondo: "bg-emerald-50", texto: "text-emerald-700" },
  "1-7": { barra: "bg-lime-400", fondo: "bg-lime-50", texto: "text-lime-700" },
  "8-15": { barra: "bg-yellow-400", fondo: "bg-yellow-50", texto: "text-yellow-700" },
  "16-21": { barra: "bg-amber-400", fondo: "bg-amber-50", texto: "text-amber-700" },
  "22-30": { barra: "bg-orange-400", fondo: "bg-orange-50", texto: "text-orange-700" },
  "31-45": { barra: "bg-orange-600", fondo: "bg-orange-100", texto: "text-orange-800" },
  "46-60": { barra: "bg-red-400", fondo: "bg-red-50", texto: "text-red-700" },
  "61-90": { barra: "bg-red-600", fondo: "bg-red-100", texto: "text-red-800" },
  "91+": { barra: "bg-red-800", fondo: "bg-red-200", texto: "text-red-900" },
};
