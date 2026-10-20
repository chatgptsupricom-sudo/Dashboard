// Meta del KPI de visitas (kpi_targets.kpi_key = "visitas_semanales"; la llave
// se quedó con ese nombre para no perder las metas guardadas).
//
// Desde VISITAS_META_MENSUAL_DESDE la meta que se escribe es la cantidad de
// visitas del MES para todo el equipo de la sede: cada semana se compara
// contra la parte de la meta que le toca por días hábiles, y en la vista de un
// vendedor la meta se reparte entre los vendedores de la sede. Antes de esa
// fecha la meta guardada era por SEMANA (total del equipo) y se sigue leyendo
// así, para que el historial no cambie.

export const VISITAS_META_MENSUAL_DESDE = "2026-10";

/** true si en ese mes (YYYY-MM) la meta de visitas es mensual. */
export const metaVisitasEsMensual = (mes: string) => mes >= VISITAS_META_MENSUAL_DESDE;

/** Meta de una semana (con `diasUtiles` hábiles) a partir de la meta guardada. */
export function metaVisitasSemana(metaGuardada: number, mes: string, diasUtilesSemana: number, diasUtilesMes: number): number {
  if (!(metaGuardada > 0)) return 0;
  if (!metaVisitasEsMensual(mes)) return metaGuardada;
  return diasUtilesMes > 0 ? (metaGuardada * diasUtilesSemana) / diasUtilesMes : 0;
}

/** Meta del mes a partir de la meta guardada (antes del cambio: semanal × semanas del mes). */
export function metaVisitasMes(metaGuardada: number, mes: string, numSemanas: number): number {
  if (!(metaGuardada > 0)) return 0;
  return metaVisitasEsMensual(mes) ? metaGuardada : metaGuardada * numSemanas;
}
