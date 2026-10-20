/**
 * El papel llega en el packing list contado por hoja (a veces por resma),
 * pero en Odoo se compra y se recibe por bulto: la "unidad" de la OC es un
 * bulto (P-00112: 6.384 bultos de HP Office a ~26 $ c/u). Almacen tambien
 * cuenta bultos. Por eso lo que viene en hojas o resmas se pasa a bultos al
 * leer el packing list, y de ahi en adelante (conteo, carga a Odoo) todo va
 * en bultos.
 */

export const RESMAS_POR_BULTO = 10;
export const HOJAS_POR_RESMA = 500;
export const HOJAS_POR_BULTO = RESMAS_POR_BULTO * HOJAS_POR_RESMA;

export type UnidadPapel = "hojas" | "resmas";

const POR_BULTO: Record<UnidadPapel, number> = {
  hojas: HOJAS_POR_BULTO,
  resmas: RESMAS_POR_BULTO,
};

/** Lo que el packing list decia antes de pasarlo a bultos. */
export type Conversion = { unidad: UnidadPapel; cantidad: number };

export function unidadPapel(v: unknown): UnidadPapel | null {
  return v === "hojas" || v === "resmas" ? v : null;
}

/** La unidad de un encabezado de Excel ("QTY (SHEETS)", "Resmas"). */
export function unidadDeEncabezado(encabezado: string): UnidadPapel | null {
  if (/(hojas?|sheets?)\b/i.test(encabezado)) return "hojas";
  if (/(resmas?|reams?)\b/i.test(encabezado)) return "resmas";
  return null;
}

/** Hasta 3 decimales: si no da bultos enteros, se ve y Compras lo revisa. */
export function aBultos(cantidad: number, unidad: UnidadPapel): number {
  return Math.round((cantidad / POR_BULTO[unidad]) * 1000) / 1000;
}

export const porBulto = (unidad: UnidadPapel) => POR_BULTO[unidad];
