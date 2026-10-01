/**
 * De donde sale cada calificacion, para no mezclar en un promedio trabajos
 * distintos: el despacho de RMA, el picking del egreso y el despacho del
 * egreso (issue #302: cada egreso trae dos notas).
 *
 * Sin dependencias de servidor: lo usan la API (lib/seguridad/calificaciones)
 * y el tablero de Seguridad en el navegador.
 */
export const ORIGENES = ["rma", "picking", "despacho"] as const;
export type Origen = (typeof ORIGENES)[number];

export type ResumenOrigen = { promedio: number | null; total: number };

/** Lee las columnas `promedio_<origen>` / `total_<origen>` de una fila agregada. */
export function leerPorOrigen(fila: any): Record<Origen, ResumenOrigen> {
  const r = {} as Record<Origen, ResumenOrigen>;
  for (const o of ORIGENES) {
    const p = fila?.[`promedio_${o}`];
    r[o] = {
      promedio: p === null || p === undefined ? null : Math.round(Number(p) * 10) / 10,
      total: Number(fila?.[`total_${o}`] || 0),
    };
  }
  return r;
}
