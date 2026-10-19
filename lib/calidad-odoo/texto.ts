/** Normalizaciones de texto para comparar datos escritos a mano en Odoo. */

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Mayúsculas, sin acentos, solo letras y dígitos separados por un espacio. */
export const palabras = (s: string) =>
  sinAcentos(s).toUpperCase().replace(/[^A-Z0-9Ñ]+/g, " ").trim();

/** Solo letras y dígitos: "J-50062527-8" y "J500625278" quedan iguales. */
export const compacto = (s: string) => sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Nombre de empresa sin la forma jurídica ni signos, para encontrar el mismo
 * cliente escrito de dos maneras ("COMPURAMA, C.A" / "Compurama CA").
 */
export function nombreBase(s: string): string {
  return palabras(s)
    .replace(/\b(C A|CA|S A|SA|S R L|SRL|INC|LLC|CORP|CORPORATION|LTD|S A S|SAS|COMPANIA ANONIMA|SOCIEDAD ANONIMA)\b/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

/** Espacios al inicio, al final o dobles. */
export const espaciosDeMas = (s: string) => /^\s|\s$|\s{2}/.test(s);

/** Muestra los espacios invisibles: "·" donde hay espacio de más. */
export const marcarEspacios = (s: string) =>
  s.replace(/^\s+|\s+$/g, (m) => "·".repeat(m.length)).replace(/\s{2,}/g, (m) => " " + "·".repeat(m.length - 1));

/** Días entre dos días "YYYY-MM-DD" (b − a). */
export function diasEntre(a: string | null | undefined, b: string): number | null {
  if (!a) return null;
  const d = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d) : null;
}

/** Día de hoy en Caracas (UTC-4), corrido `dias` hacia atrás. */
export function diaCaracasMenos(dias = 0): string {
  return new Date(Date.now() - 4 * 3_600_000 - dias * 86_400_000).toISOString().slice(0, 10);
}

/** Agrupa por una clave; devuelve solo los grupos con 2 o más. */
export function repetidos<T>(lista: T[], clave: (x: T) => string | null): T[][] {
  const m = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

/** " (ej. a, b, c)" con los primeros distintos de la lista; vacío si no hay. */
export function ejemplos(lista: string[], n = 3): string {
  const unicos = [...new Set(lista)].slice(0, n);
  return unicos.length ? ` (ej. ${unicos.join(", ")})` : "";
}
