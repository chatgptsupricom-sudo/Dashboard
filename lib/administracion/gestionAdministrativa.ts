import { searchReadTodo, RefsAdminKpis } from "./odooRefs";

/**
 * Gestión Administrativa (issue #8, 10 pts).
 *
 * Las tres áreas del documento ("documentos procesados a tiempo", "anticipos
 * y viáticos pendientes de legalización", "tiempo promedio de procesamiento",
 * "cumplimiento de cierre mensual") se resuelven contra módulos estándar de
 * Odoo que ya estaban instalados o son gratuitos (Approvals, hr.expense,
 * Project), configurados por `supricom_admin_kpis` — ver ese módulo para el
 * detalle de categorías/equipo/proyectos que crea.
 *
 * "Anticipos" y "viáticos" se tratan como UNA sola fuente: ambos son
 * hr.expense.sheet pendiente de aprobar/legalizar, y Odoo no distingue esos
 * dos conceptos como estados distintos. El documento los lista como dos
 * líneas separadas; aquí se reportan juntos y se etiqueta así en la UI.
 *
 * Caveat que aplica a "tiempo de procesamiento" en todo este archivo:
 * approval.request no guarda una fecha explícita de "cuándo se resolvió", así
 * que se usa `write_date - create_date` sobre el registro ya en estado
 * terminal (approved/refused). Una edición no relacionada con la decisión
 * (ej. renombrar la solicitud después de aprobada) infla ese tiempo. Es una
 * limitación conocida, no un bug: si hace falta precisión, la vía correcta es
 * leer `mail.tracking.value` sobre los cambios de `request_status`, que exige
 * una consulta más pesada y se deja para una segunda vuelta.
 */

export interface ResultadoDocumentosATiempo {
  totalProcesados: number;
  aTiempo: number | null;
  pctATiempo: number | null;
  tiempoPromedioDias: number | null;
  pendientes: number;
  pendientesVencidos: number;
}

export interface ResultadoLegalizacion {
  totalPendientes: number;
  montoPendiente: number;
  pendientesVencidos: number;
  pctVencidos: number | null;
}

export interface ResultadoCierreMensual {
  totalConDeadline: number;
  cerradasATiempo: number;
  pctATiempo: number | null;
  vencidasSinCerrar: number;
}

function diasEntre(a: string, b: string): number {
  // Odoo devuelve fechas "YYYY-MM-DD HH:MM:SS" en UTC sin sufijo; el espacio
  // en vez de "T" no lo interpreta Date() de forma confiable en todos los
  // motores, así que se normaliza antes de parsear.
  const fa = new Date(a.replace(" ", "T") + "Z").getTime();
  const fb = new Date(b.replace(" ", "T") + "Z").getTime();
  return (fb - fa) / 86400000;
}

/**
 * KPI "documentos procesados a tiempo" + "tiempo promedio de procesamiento".
 * `plazoInternoDias` es la meta que define "a tiempo"; si es null (todavía no
 * la definió Administración) se reporta el tiempo promedio pero no el % a
 * tiempo, igual que el resto del dashboard hace con metas sin definir.
 */
export async function fetchDocumentosATiempo(
  refs: RefsAdminKpis,
  companyIds: number[],
  desde: string,
  hasta: string,
  plazoInternoDias: number | null,
): Promise<ResultadoDocumentosATiempo | null> {
  if (refs.categoriaSolicitudAdministrativa === null) return null;

  const [procesadas, pendientes] = await Promise.all([
    searchReadTodo(
      "approval.request",
      [
        ["category_id", "=", refs.categoriaSolicitudAdministrativa],
        ["company_id", "in", companyIds],
        ["request_status", "in", ["approved", "refused"]],
        ["create_date", ">=", desde],
        ["create_date", "<=", hasta],
      ],
      ["id", "create_date", "write_date"],
    ),
    searchReadTodo(
      "approval.request",
      [
        ["category_id", "=", refs.categoriaSolicitudAdministrativa],
        ["company_id", "in", companyIds],
        ["request_status", "in", ["new", "pending"]],
      ],
      ["id", "create_date"],
    ),
  ]);

  const duraciones = procesadas.map((r) => diasEntre(r.create_date, r.write_date));
  const tiempoPromedioDias =
    duraciones.length > 0
      ? Math.round((duraciones.reduce((s, d) => s + d, 0) / duraciones.length) * 10) / 10
      : null;

  const aTiempo =
    plazoInternoDias !== null
      ? duraciones.filter((d) => d <= plazoInternoDias).length
      : null;
  const pctATiempo =
    plazoInternoDias !== null && procesadas.length > 0
      ? Math.round((aTiempo! / procesadas.length) * 1000) / 10
      : null;

  const hoyMs = Date.now();
  const pendientesVencidos =
    plazoInternoDias !== null
      ? pendientes.filter((r) => {
          const creado = new Date(r.create_date.replace(" ", "T") + "Z").getTime();
          return (hoyMs - creado) / 86400000 > plazoInternoDias;
        }).length
      : 0;

  return {
    totalProcesados: procesadas.length,
    aTiempo,
    pctATiempo,
    tiempoPromedioDias,
    pendientes: pendientes.length,
    pendientesVencidos,
  };
}

/**
 * KPI "anticipos y viáticos pendientes de legalización". Pendiente = el
 * reporte de gastos no llegó a "approve"/"post"/"done" (sigue en
 * draft/submit). `umbralDias` es la antigüedad a partir de la cual un
 * pendiente se considera vencido — no lo definió Administración, se usa por
 * defecto el mismo criterio de "+30 días" que ya aplica Tesorería para
 * cartera vencida, y se etiqueta como proxy en la UI.
 */
export async function fetchLegalizacionPendiente(
  companyIds: number[],
  umbralDias: number,
): Promise<ResultadoLegalizacion> {
  const sheets = await searchReadTodo(
    "hr.expense.sheet",
    [
      ["state", "in", ["draft", "submit"]],
      ["company_id", "in", companyIds],
    ],
    ["id", "create_date", "total_amount"],
  );

  const hoyMs = Date.now();
  const vencidos = sheets.filter((s) => {
    const creado = new Date(s.create_date.replace(" ", "T") + "Z").getTime();
    return (hoyMs - creado) / 86400000 > umbralDias;
  });

  return {
    totalPendientes: sheets.length,
    montoPendiente:
      Math.round(sheets.reduce((s, x) => s + (Number(x.total_amount) || 0), 0) * 100) / 100,
    pendientesVencidos: vencidos.length,
    pctVencidos:
      sheets.length > 0
        ? Math.round((vencidos.length / sheets.length) * 1000) / 10
        : null,
  };
}

/**
 * KPI "cumplimiento de cierre mensual". Cerrada a tiempo = llegó al stage
 * "Cerrado" (mismo caveat de write_date-como-fecha-de-cierre que el resto de
 * este archivo) en o antes de su date_deadline. Las tareas de ejemplo que
 * trae `supricom_admin_kpis` son EJEMPLOS de relleno — este KPI no tiene
 * sentido real hasta que Administración cargue el checklist real de cierre.
 */
export async function fetchCierreMensual(
  refs: RefsAdminKpis,
  companyIds: number[],
  desde: string,
  hasta: string,
): Promise<ResultadoCierreMensual | null> {
  if (refs.proyectoCierreMensual === null) return null;

  const tareas = await searchReadTodo(
    "project.task",
    [
      ["project_id", "=", refs.proyectoCierreMensual],
      // project.task.company_id puede venir FALSE de verdad: el proyecto es
      // compartido entre sedes (project.project admite company_id vacio =
      // "todas las compañias") y sus tareas heredan ese false. Un filtro
      // llano `in companyIds` NUNCA matchea false y dejaria este KPI en cero
      // siempre — verificado que pasa exactamente eso sin el '|'. El OR habilita
      // tanto las tareas compartidas como las que sí tengan sede propia.
      "|",
      ["company_id", "=", false],
      ["company_id", "in", companyIds],
      ["date_deadline", ">=", desde],
      ["date_deadline", "<=", hasta],
    ],
    ["id", "name", "stage_id", "date_deadline", "write_date"],
  );

  const hoyMs = Date.now();
  let cerradasATiempo = 0;
  let vencidasSinCerrar = 0;
  tareas.forEach((t) => {
    const deadlineMs = new Date(t.date_deadline.replace(" ", "T") + "Z").getTime();
    const cerrada = refs.stageCierreCerrado !== null && t.stage_id?.[0] === refs.stageCierreCerrado;
    if (cerrada) {
      const cierreMs = new Date(t.write_date.replace(" ", "T") + "Z").getTime();
      if (cierreMs <= deadlineMs) cerradasATiempo++;
    } else if (hoyMs > deadlineMs) {
      vencidasSinCerrar++;
    }
  });

  return {
    totalConDeadline: tareas.length,
    cerradasATiempo,
    pctATiempo:
      tareas.length > 0
        ? Math.round((cerradasATiempo / tareas.length) * 1000) / 10
        : null,
    vencidasSinCerrar,
  };
}
