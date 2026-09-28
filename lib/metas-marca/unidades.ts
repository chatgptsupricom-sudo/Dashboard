/**
 * Meta en unidades → meta en $ (puro: lo usan la API y el editor en el
 * navegador). Es la misma proporción del valor del inventario de la marca:
 * 90 de 100 unidades disponibles = 90% de lo que vale ese stock a precio de
 * venta (lib/metas-marca/inventario.ts). `null` si la marca no tiene stock con
 * valor.
 */
export function metaDesdeUnidades(
  unidades: number,
  inv: { unidades: number; valor: number } | null | undefined,
): number | null {
  if (!inv || !(inv.unidades > 0) || !(inv.valor > 0) || !(unidades > 0)) return null;
  return Math.round((unidades / inv.unidades) * inv.valor * 100) / 100;
}
