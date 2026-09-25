/**
 * Codigos que lee la pistola, sin dependencias de servidor ni de tablas: los
 * usan la recepcion por packing list y la verificacion del egreso en C4.
 */

/**
 * Un codigo leido por la pistola (o escrito), listo para comparar: sin
 * espacios de mas y en mayusculas. Los guiones se respetan: en los codigos de
 * producto significan algo ("SCT5170SR" no es "SCT-5170-SR").
 */
export function normalizarCodigo(v: string | null | undefined): string {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Codigo de producto de comercio (UPC/EAN, GTIN-8/12/13/14): solo digitos,
 * con el digito de control correcto. Es el codigo del MODELO (igual en todas
 * las cajas), asi que no se guarda como serial sin preguntar.
 */
export function esCodigoDeProducto(v: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(v)) return false;
  const d = v.split("").map(Number);
  const control = d.pop()!;
  let suma = 0;
  for (let i = d.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) suma += d[i] * peso;
  return (10 - (suma % 10)) % 10 === control;
}

/**
 * El producto cuyo codigo es el comienzo del leido, seguido de un separador:
 * "5HB10D#B1K" es la caja de "5HB10D" (HP pone la variante despues del #).
 * Si hay varios, el de codigo mas largo.
 */
export function productoPorPrefijo<T extends { codigo: string | null }>(items: T[], leido: string): T | null {
  let mejor: T | null = null;
  let largo = 0;
  for (const i of items) {
    const c = normalizarCodigo(i.codigo);
    if (!c || c.length >= leido.length || !leido.startsWith(c)) continue;
    if (/[A-Z0-9]/.test(leido[c.length])) continue;
    if (c.length > largo) {
      mejor = i;
      largo = c.length;
    }
  }
  return mejor;
}
