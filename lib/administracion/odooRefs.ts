import { callOdooRPC } from "@/lib/odoo";

/**
 * Resuelve el id externo (XML id) de un registro que crea el módulo Odoo
 * `supricom_admin_kpis` (categorías de Approvals, equipo de Helpdesk,
 * proyectos de Cierre Mensual y Auditoría Interna).
 *
 * Se usa esto y no filtrar por `name` porque `name` es traducible (jsonb en
 * Postgres): un filtro por texto se rompe en cuanto alguien cambia el idioma
 * de la instancia o Administración renombra la categoría en la UI. El id
 * externo es estable pase lo que pase con el nombre.
 *
 * Se cachea por proceso: estos registros no cambian de id en caliente, y
 * resolverlos es una llamada RPC extra que no vale la pena repetir en cada
 * carga de la página.
 */
const cache = new Map<string, number | null>();

export async function resolverIdExterno(
  nombreExterno: string,
): Promise<number | null> {
  if (cache.has(nombreExterno)) return cache.get(nombreExterno)!;

  const rows = await callOdooRPC<any[]>(
    "ir.model.data",
    "search_read",
    [
      [
        ["module", "=", "supricom_admin_kpis"],
        ["name", "=", nombreExterno],
      ],
    ],
    { fields: ["res_id"], limit: 1 },
  );
  const resId = rows && rows[0] ? Number(rows[0].res_id) : null;
  cache.set(nombreExterno, resId);
  return resId;
}

/**
 * Ids de referencia que usan los KPIs de Gestión Administrativa y
 * Cumplimiento y Control. Si el módulo `supricom_admin_kpis` no está
 * instalado en esta instancia de Odoo, todos vienen `null` — cada fetcher
 * debe tratar eso como "sin fuente todavía", no como error.
 */
export interface RefsAdminKpis {
  categoriaSolicitudAdministrativa: number | null;
  categoriaOperacionesFueraPolitica: number | null;
  equipoIncidenciasAdministrativas: number | null;
  proyectoCierreMensual: number | null;
  proyectoAuditoriaInterna: number | null;
  stageCierreCerrado: number | null;
  stageAuditoriaCerrado: number | null;
  tagReincidencia: number | null;
}

export async function cargarRefsAdminKpis(): Promise<RefsAdminKpis> {
  const [
    categoriaSolicitudAdministrativa,
    categoriaOperacionesFueraPolitica,
    equipoIncidenciasAdministrativas,
    proyectoCierreMensual,
    proyectoAuditoriaInterna,
    stageCierreCerrado,
    stageAuditoriaCerrado,
    tagReincidencia,
  ] = await Promise.all([
    resolverIdExterno("categoria_solicitud_administrativa"),
    resolverIdExterno("categoria_operaciones_fuera_politica"),
    resolverIdExterno("equipo_incidencias_administrativas"),
    resolverIdExterno("proyecto_cierre_mensual"),
    resolverIdExterno("proyecto_auditoria_interna"),
    resolverIdExterno("stage_cierre_cerrado"),
    resolverIdExterno("stage_auditoria_cerrado"),
    resolverIdExterno("tag_reincidencia"),
  ]);
  return {
    categoriaSolicitudAdministrativa,
    categoriaOperacionesFueraPolitica,
    equipoIncidenciasAdministrativas,
    proyectoCierreMensual,
    proyectoAuditoriaInterna,
    stageCierreCerrado,
    stageAuditoriaCerrado,
    tagReincidencia,
  };
}

/**
 * search_read con paginacion, para no truncar silenciosamente cuando un
 * dominio devuelve mas de una pagina. Los modelos que consumen los KPIs de
 * Gestion Administrativa y Cumplimiento (approval.request, hr.expense.sheet,
 * project.task, helpdesk.ticket) son ordenes de magnitud mas chicos que
 * account.move.line, pero paginar sale gratis y evita sorpresas si algun dia
 * dejan de serlo.
 */
export async function searchReadTodo(
  model: string,
  domain: any[],
  fields: string[],
): Promise<any[]> {
  let resultado: any[] = [];
  let offset = 0;
  const limit = 2000;
  while (true) {
    const pagina = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields,
      order: "id asc",
      limit,
      offset,
    });
    if (!pagina || pagina.length === 0) break;
    resultado = resultado.concat(pagina);
    if (pagina.length < limit) break;
    offset += limit;
  }
  return resultado;
}
