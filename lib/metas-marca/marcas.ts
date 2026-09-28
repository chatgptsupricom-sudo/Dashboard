/**
 * Identidad de una marca (`spiff.brand` de Odoo) para Metas por marca.
 *
 * En Odoo hay marcas repetidas que solo cambian en mayúsculas o espacios
 * ("SMARTBITT" y "SMARTBITT ", "HAVIT" y "Havit", "TP-LINK" y "TP-LINK "): los
 * productos se reparten entre las dos y la venta de la marca queda partida.
 * Por eso aquí la marca se identifica por su nombre normalizado (`clave`) y no
 * por el id: las variantes triviales se suman solas. Las variantes que cambian
 * letras ("SMARTBIT", "KINGSTONE", "XTEH") NO se juntan, porque podría ser otra
 * marca; la auditoría las lista como posibles duplicados para corregir en Odoo.
 */

export const SIN_MARCA = "SIN MARCA";

export function claveMarca(nombre: string | null | undefined): string {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return limpio || SIN_MARCA;
}

/**
 * Nombres cargados como marca que en realidad son un tipo de producto, un
 * servicio o un comodín ("No Asignado"). Su venta cuenta en el total de la
 * sede, pero la auditoría avisa: no es una marca a la que se le ponga meta.
 */
const GENERICAS = new Set([
  "NO ASIGNADO", "GENERAL", "SERVICIOS", "SERVICIO TECNICO", "SOFTWARE", "PAPEL",
  "CARTUCHO", "TONER", "AUDIFONO", "BARRA", "TECLADO", "TABLET", "POWER",
  "ACCESORIOS DE COMPUTO", "CALCULADORAS CANON", "CONSU A",
]);

export function esMarcaGenerica(clave: string): boolean {
  if (GENERICAS.has(clave)) return true;
  // Parece un código de producto (ej. "5539C001AA-EX"): letras y dígitos, sin espacios.
  return /\d/.test(clave) && /[A-Z]/.test(clave) && !clave.includes(" ") && clave.length >= 8;
}

/** Solo letras y dígitos: "TP-LINK" y "TPLINK" quedan iguales. */
const compacta = (clave: string) => clave.replace(/[^A-Z0-9]/g, "");

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return fila[b.length];
}

/**
 * ¿Dos claves distintas parecen la misma marca mal escrita? Mismo nombre sin
 * signos ("TP-LINK"/"TPLINK"), una letra de diferencia en nombres de 5+
 * letras ("SMARTBIT"/"SMARTBITT", "XTECH"/"XTEH") o una es el comienzo de la
 * otra ("KLIPX"/"KLIPXTREME").
 */
export function parecenLaMisma(a: string, b: string): boolean {
  const x = compacta(a);
  const y = compacta(b);
  if (!x || !y || x === SIN_MARCA || y === SIN_MARCA) return false;
  if (x === y) return true;
  const corta = x.length <= y.length ? x : y;
  const larga = x.length <= y.length ? y : x;
  if (corta.length >= 4 && larga.startsWith(corta)) return true;
  if (corta.length >= 5 && distancia(x, y) <= (corta.length >= 10 ? 2 : 1)) return true;
  return false;
}
