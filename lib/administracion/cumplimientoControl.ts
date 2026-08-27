import { searchReadTodo, RefsAdminKpis } from "./odooRefs";

/**
 * Cumplimiento y Control (issue #8, 10 pts).
 *
 * "Documentos sin soporte" NO se implementa a propósito: se investigó contra
 * datos reales (solo 1,8% de facturas de proveedor tienen adjunto, 0% en
 * Valencia) y daría un indicador permanentemente rojo que mide hábitos de
 * carga en el ERP, no cumplimiento real. Ver comentario del issue #8. Se
 * reporta como KPI "sin_datos", igual que el resto de indicadores sin fuente.
 */

export interface ResultadoOperacionesFueraPolitica {
  total: number;
}

export interface ResultadoIncidenciasVencidas {
  totalAbiertas: number;
  vencidas: number;
  pctVencidas: number | null;
}

export interface ResultadoAuditoriaInterna {
  totalHallazgos: number;
  cerrados: number;
  pctCerrados: number | null;
  reincidencias: number;
}

/**
 * KPI "operaciones fuera de política". Cuenta las solicitudes de la
 * categoría "Excepción de Política" creadas en el período, sin importar su
 * estado: el solo hecho de que exista la solicitud ya es la excepción — se
 * cuenta se apruebe o no.
 */
export async function fetchOperacionesFueraPolitica(
  refs: RefsAdminKpis,
  desde: string,
  hasta: string,
): Promise<ResultadoOperacionesFueraPolitica | null> {
  if (refs.categoriaOperacionesFueraPolitica === null) return null;

  const total = await searchReadTodo(
    "approval.request",
    [
      ["category_id", "=", refs.categoriaOperacionesFueraPolitica],
      ["create_date", ">=", desde],
      ["create_date", "<=", hasta],
    ],
    ["id"],
  );
  return { total: total.length };
}

/**
 * KPI "incidencias abiertas vencidas". `sla_fail` lo calcula Odoo en vivo
 * (helpdesk.ticket.sla_fail, no almacenado): true si el ticket sigue sin
 * llegar al stage objetivo del SLA después de su deadline. "Abierta" se
 * filtra por `close_date = false` — helpdesk.stage no tiene un booleano de
 * "es cierre" (`is_close` no existe en este modelo); `close_date` es el
 * campo real que Odoo pone al llegar a un stage de cierre (Solved/Cancelled)
 * y vacía si el ticket se reabre.
 */
export async function fetchIncidenciasVencidas(
  refs: RefsAdminKpis,
): Promise<ResultadoIncidenciasVencidas | null> {
  if (refs.equipoIncidenciasAdministrativas === null) return null;

  const abiertas = await searchReadTodo(
    "helpdesk.ticket",
    [
      ["team_id", "=", refs.equipoIncidenciasAdministrativas],
      ["close_date", "=", false],
    ],
    ["id", "sla_fail"],
  );
  const vencidas = abiertas.filter((t) => t.sla_fail);
  return {
    totalAbiertas: abiertas.length,
    vencidas: vencidas.length,
    pctVencidas:
      abiertas.length > 0
        ? Math.round((vencidas.length / abiertas.length) * 1000) / 10
        : null,
  };
}

/**
 * KPIs "pendientes de auditoría (cerrados)" + "reincidencias". Ambos salen
 * del proyecto "Auditoría Interna": un hallazgo es una project.task, y
 * reincidencia es una task marcada con la etiqueta "Reincidencia" — que hoy
 * hay que aplicar a mano al crear el hallazgo (no hay detección automática de
 * "este problema ya se reportó antes"; eso requeriría comparar texto entre
 * hallazgos, que no es confiable sin una taxonomía de causas).
 */
export async function fetchAuditoriaInterna(
  refs: RefsAdminKpis,
  desde: string,
  hasta: string,
): Promise<ResultadoAuditoriaInterna | null> {
  if (refs.proyectoAuditoriaInterna === null) return null;

  const hallazgos = await searchReadTodo(
    "project.task",
    [
      ["project_id", "=", refs.proyectoAuditoriaInterna],
      ["create_date", ">=", desde],
      ["create_date", "<=", hasta],
    ],
    ["id", "stage_id", "tag_ids"],
  );

  const cerrados = hallazgos.filter(
    (h) => refs.stageAuditoriaCerrado !== null && h.stage_id?.[0] === refs.stageAuditoriaCerrado,
  );
  const reincidencias =
    refs.tagReincidencia !== null
      ? hallazgos.filter((h) => (h.tag_ids || []).includes(refs.tagReincidencia)).length
      : 0;

  return {
    totalHallazgos: hallazgos.length,
    cerrados: cerrados.length,
    pctCerrados:
      hallazgos.length > 0
        ? Math.round((cerrados.length / hallazgos.length) * 1000) / 10
        : null,
    reincidencias,
  };
}
