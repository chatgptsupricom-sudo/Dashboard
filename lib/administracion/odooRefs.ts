import { callOdooRPC } from "@/lib/odoo";

/**
 * Resuelve el id externo (XML id) de un registro GLOBAL (una sola instancia,
 * no una por compañía) que crea el módulo Odoo `supricom_admin_kpis` — los
 * proyectos de Cierre Mensual/Auditoría Interna, sus stages y la etiqueta de
 * reincidencia. `project.project` sí admite "todas las compañías"
 * (company_id vacío), así que estos no necesitan duplicarse por sede.
 *
 * Se usa el id externo y no `name` porque `name` es traducible (jsonb en
 * Postgres): un filtro por texto se rompe en cuanto alguien cambia el idioma
 * de la instancia o Administración renombra el registro en la UI.
 *
 * Se cachea por proceso: estos registros no cambian de id en caliente, y
 * resolverlos es una llamada RPC extra que no vale la pena repetir en cada
 * carga de la página. Solo se cachea un id YA resuelto — si el módulo
 * todavía no está instalado, `resId` sale null y NO se guarda: de lo
 * contrario, instalar el módulo en producción con el proceso de Next.js ya
 * corriendo dejaría los KPIs en "sin datos" para siempre hasta un reinicio
 * manual, sin ningún error que lo explique.
 */
const cache = new Map<string, number>();

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
  if (resId !== null) cache.set(nombreExterno, resId);
  return resId;
}

/**
 * Resuelve, para un registro que SÍ existe una vez por compañía
 * (approval.category, helpdesk.team, helpdesk.sla — todos con company_id
 * obligatorio, sin opción de "todas las compañías"), el mapa
 * `company_id -> res_id`.
 *
 * `supricom_admin_kpis` registra cada copia con el id externo
 * `<prefijoBase>_empresa_<company_id>` (ver hooks.py del módulo). La
 * compañía se lee directamente de ESE nombre con una expresión regular, en
 * vez de hacer un `read` de vuelta sobre el registro para sacar su
 * `company_id`: approval.category/helpdesk.team/helpdesk.sla tienen una
 * regla de registro multiempresa estricta (verificado por RPC: leerlos sin
 * `allowed_company_ids` de por medio da AccessError apenas la compañía no es
 * la activa por defecto del usuario), y `ir.model.data` no la tiene — así
 * que apoyarse en el nombre evita ese problema del todo, sin necesitar un
 * contexto especial. Tampoco hace falta que este código conozca de antemano
 * los ids de compañía de la instancia: funciona igual con 1 sede que con 10,
 * y una sede nueva que se agregue después solo necesita que alguien vuelva a
 * correr el hook — el caché de abajo simplemente no tendrá esa entrada hasta
 * entonces.
 */
const cachePorEmpresa = new Map<string, Record<number, number>>();

export async function resolverPorEmpresa(
  prefijoBase: string,
): Promise<Record<number, number>> {
  if (cachePorEmpresa.has(prefijoBase)) return cachePorEmpresa.get(prefijoBase)!;

  const filas = await callOdooRPC<any[]>(
    "ir.model.data",
    "search_read",
    [
      [
        ["module", "=", "supricom_admin_kpis"],
        ["name", "like", `${prefijoBase}_empresa_%`],
      ],
    ],
    { fields: ["name", "res_id"] },
  );

  const mapa: Record<number, number> = {};
  (filas || []).forEach((f) => {
    const m = /_empresa_(\d+)$/.exec(f.name);
    if (m) mapa[Number(m[1])] = Number(f.res_id);
  });
  if (Object.keys(mapa).length > 0) cachePorEmpresa.set(prefijoBase, mapa);
  return mapa;
}

/**
 * Ids de referencia que usan los KPIs de Gestión Administrativa y
 * Cumplimiento y Control. Si el módulo `supricom_admin_kpis` no está
 * instalado en esta instancia de Odoo, todos vienen vacíos/null — cada
 * fetcher debe tratar eso como "sin fuente todavía", no como error.
 */
export interface RefsAdminKpis {
  /** company_id -> id de la categoría "Solicitud Administrativa" de esa sede. */
  categoriaSolicitudAdministrativaPorEmpresa: Record<number, number>;
  /** company_id -> id de la categoría "Excepción de Política" de esa sede. */
  categoriaOperacionesFueraPoliticaPorEmpresa: Record<number, number>;
  /** company_id -> id del equipo "Incidencias Administrativas" de esa sede. */
  equipoIncidenciasAdministrativasPorEmpresa: Record<number, number>;
  proyectoCierreMensual: number | null;
  proyectoAuditoriaInterna: number | null;
  stageCierreCerrado: number | null;
  stageAuditoriaCerrado: number | null;
  tagReincidencia: number | null;
}

export async function cargarRefsAdminKpis(): Promise<RefsAdminKpis> {
  const [
    categoriaSolicitudAdministrativaPorEmpresa,
    categoriaOperacionesFueraPoliticaPorEmpresa,
    equipoIncidenciasAdministrativasPorEmpresa,
    proyectoCierreMensual,
    proyectoAuditoriaInterna,
    stageCierreCerrado,
    stageAuditoriaCerrado,
    tagReincidencia,
  ] = await Promise.all([
    resolverPorEmpresa("categoria_solicitud_administrativa"),
    resolverPorEmpresa("categoria_operaciones_fuera_politica"),
    resolverPorEmpresa("equipo_incidencias_administrativas"),
    resolverIdExterno("proyecto_cierre_mensual"),
    resolverIdExterno("proyecto_auditoria_interna"),
    resolverIdExterno("stage_cierre_cerrado"),
    resolverIdExterno("stage_auditoria_cerrado"),
    resolverIdExterno("tag_reincidencia"),
  ]);
  return {
    categoriaSolicitudAdministrativaPorEmpresa,
    categoriaOperacionesFueraPoliticaPorEmpresa,
    equipoIncidenciasAdministrativasPorEmpresa,
    proyectoCierreMensual,
    proyectoAuditoriaInterna,
    stageCierreCerrado,
    stageAuditoriaCerrado,
    tagReincidencia,
  };
}

/** ids de refPorEmpresa que corresponden a las sedes pedidas, o [] si ninguna
 *  de esas sedes tiene el registro (ej. el hook no corrió para una sede nueva). */
export function idsParaEmpresas(
  refPorEmpresa: Record<number, number>,
  companyIds: number[],
): number[] {
  return companyIds
    .map((id) => refPorEmpresa[id])
    .filter((id): id is number => id !== undefined);
}

/**
 * search_read con paginacion, para no truncar silenciosamente cuando un
 * dominio devuelve mas de una pagina. Los modelos que consumen los KPIs de
 * Gestion Administrativa y Cumplimiento (approval.request, hr.expense.sheet,
 * project.task, helpdesk.ticket) son ordenes de magnitud mas chicos que
 * account.move.line, pero paginar sale gratis y evita sorpresas si algun dia
 * dejan de serlo.
 *
 * No pasa `allowed_company_ids`: verificado por RPC que estos cuatro modelos
 * (transaccionales, no de configuracion) no tienen la regla de registro
 * multiempresa estricta que si tienen approval.category/helpdesk.team/
 * helpdesk.sla — filtrar por `company_id` en el dominio basta.
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
