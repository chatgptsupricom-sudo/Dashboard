/**
 * Marcas con Plan de Contenido y Frecuencia CPM propios, además de Supricom
 * (la vista de siempre, sin sufijo). Cada marca vive en filas aparte:
 * `<vista>__<marca>`. Para sumar una marca basta agregarla aquí.
 * Sin dependencias de servidor: lo usan las APIs y la pantalla.
 */
export const MARCAS_PLAN = ["asta", "bluetti"] as const;

export const PESTANAS_MARCA: { marca: string; etiqueta: string }[] = [
  { marca: "supricom", etiqueta: "Supricom" },
  { marca: "asta", etiqueta: "Asta" },
  { marca: "bluetti", etiqueta: "Bluetti" },
];

export const esMarcaPlan = (m?: string | null): m is (typeof MARCAS_PLAN)[number] =>
  !!m && (MARCAS_PLAN as readonly string[]).includes(m);

/** Vista de una marca: la base para Supricom, `<base>__<marca>` para las demás. */
export const vistaDeMarca = (base: string, marca?: string | null) => (esMarcaPlan(marca) ? `${base}__${marca}` : base);

/** Marca de una vista: "supricom" para las de siempre. */
export function marcaDeVista(view?: string | null): string {
  const m = String(view || "").split("__")[1];
  return esMarcaPlan(m) ? m : "supricom";
}
