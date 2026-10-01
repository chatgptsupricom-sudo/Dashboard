import { idsParaEmpresas, searchReadTodo, RefsAdminKpis } from "./odooRefs";

/**
 * Gestión Administrativa (issue #8, 10 pts).
 *
 * Las cuatro áreas del documento ("documentos procesados a tiempo", "anticipos
 * y viáticos pendientes de legalización", "tiempo promedio de procesamiento",
 * "cumplimiento de cierre mensual") se resuelven contra Odoo: las tres
 * primeras usan Approvals/Project configurados por `supricom_admin_kpis` (ver
 * ese módulo para el detalle de categorías/equipo/proyectos que crea);
 * "anticipos y viáticos" NO usa ese módulo, se lee directo de Contabilidad
 * (ver comentario en `fetchLegalizacionPendiente`).
 *
 * "Anticipos" y "viáticos" se tratan como UNA sola fuente y NO usan
 * hr.expense.sheet (ver `fetchLegalizacionPendiente` para el porqué):
 * Administración confirmó que esto se lleva por asiento contable directo
 * contra una cuenta de activo por sede, no por el módulo de Gastos.
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
  // Cada sede tiene su propia categoria "Solicitud Administrativa"
  // (approval.category exige una compañía, no admite "todas") — se filtra
  // por esos ids en vez de por un id global unico, y ya no hace falta ademas
  // filtrar por company_id: el id de categoria ya es especifico de la sede.
  const categoriaIds = idsParaEmpresas(
    refs.categoriaSolicitudAdministrativaPorEmpresa,
    companyIds,
  );
  if (categoriaIds.length === 0) return null;

  const [procesadas, pendientes] = await Promise.all([
    searchReadTodo(
      "approval.request",
      [
        ["category_id", "in", categoriaIds],
        ["request_status", "in", ["approved", "refused"]],
        ["create_date", ">=", desde],
        ["create_date", "<=", hasta],
      ],
      ["id", "create_date", "write_date"],
    ),
    searchReadTodo(
      "approval.request",
      [
        ["category_id", "in", categoriaIds],
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
 * Cuenta de activo donde cada sede registra anticipos/préstamos a empleados,
 * una por `company_id` (ver COMPANY_MAP en empresas.ts — son las únicas 3
 * sedes que existen en este panel). Se investigó a fondo antes de asumir
 * hr.expense.sheet como fuente (que fue el diseño original): Administración
 * aclaró que "anticipos y viáticos" NO pasan por el módulo de Gastos, se
 * registran como asiento contable directo contra esta cuenta.
 *
 * Se identifica por `code`, no por id interno de Odoo: el id puede diferir
 * entre bases (QA y producción son bases de datos distintas), el código
 * contable es el identificador estable real.
 *
 * Ninguna de las 3 tiene `reconcile=True` salvo Valencia — verificado en
 * producción real (no es dato viejo). Pero eso no bloquea el KPI: no hace
 * falta el matching formal de Odoo, alcanza con el SALDO de la cuenta
 * (débito - crédito), que es justo lo que Administración sigue a ojo hoy
 * (confirmado con movimientos reales: anticipo se debita, cada cuota pagada
 * se acredita, el saldo baja a cero solo).
 */
const CUENTA_ANTICIPOS_EMPLEADOS_POR_EMPRESA: Record<number, string> = {
  9: "1.01.05.008", // Valencia - Prestamos Empleados
  10: "1.01.05.103", // Caracas - Prestamos a Empleados
  7: "1.01.04.001", // Panama - CxC Empleados
};

/**
 * KPI "anticipos y viáticos pendientes de legalización". "Pendiente" = saldo
 * (débito - crédito) todavía positivo en la cuenta de anticipos de esa sede,
 * agrupado por contacto (`partner_id`) para poder contar cuántos empleados
 * tienen algo pendiente. `umbralDias` mide la antigüedad desde el anticipo
 * más viejo que todavía compone ese saldo (aproximado: no hace FIFO exacto
 * entre varios anticipos de un mismo empleado, es la misma clase de proxy
 * que ya se documenta en el resto de este archivo).
 *
 * Caveat real, solo en Panamá: sus 3 movimientos actuales no tienen
 * `partner_id` asignado (el nombre del empleado solo está en el texto de la
 * descripción) — todos caen en un único grupo agregado por sede en vez de
 * uno por empleado. No es un bug: es fiel al dato tal como Panamá lo está
 * cargando hoy. El día que empiecen a asignar el contacto, este mismo código
 * ya los separa solo, sin tocar nada.
 */
export async function fetchLegalizacionPendiente(
  companyIds: number[],
  umbralDias: number,
): Promise<ResultadoLegalizacion | null> {
  const codigosBuscados = companyIds
    .map((id) => CUENTA_ANTICIPOS_EMPLEADOS_POR_EMPRESA[id])
    .filter((c): c is string => c !== undefined);
  if (codigosBuscados.length === 0) return null;

  const cuentas = await searchReadTodo(
    "account.account",
    [
      ["company_id", "in", companyIds],
      ["code", "in", codigosBuscados],
    ],
    ["id"],
  );
  if (cuentas.length === 0) return null;

  const lineas = await searchReadTodo(
    "account.move.line",
    [
      ["account_id", "in", cuentas.map((c) => c.id)],
      ["parent_state", "=", "posted"],
    ],
    ["account_id", "partner_id", "debit", "credit", "date"],
  );

  // Agrupar por (cuenta, contacto). Sin contacto asignado (caso de Panamá
  // hoy, ver comentario arriba) todas las líneas de esa cuenta caen juntas
  // en un solo grupo agregado.
  interface Grupo {
    debito: number;
    credito: number;
    fechaOrigen: string | null; // fecha del anticipo (débito) mas viejo
  }
  const grupos = new Map<string, Grupo>();
  for (const l of lineas) {
    const partnerId = Array.isArray(l.partner_id) ? l.partner_id[0] : "sin_identificar";
    const clave = `${l.account_id[0]}:${partnerId}`;
    const g = grupos.get(clave) || { debito: 0, credito: 0, fechaOrigen: null };
    g.debito += Number(l.debit) || 0;
    g.credito += Number(l.credit) || 0;
    if (Number(l.debit) > 0 && (g.fechaOrigen === null || l.date < g.fechaOrigen)) {
      g.fechaOrigen = l.date;
    }
    grupos.set(clave, g);
  }

  const pendientes = Array.from(grupos.values())
    .map((g) => ({
      saldo: Math.round((g.debito - g.credito) * 100) / 100,
      fechaOrigen: g.fechaOrigen,
    }))
    // Saldo <= 0: ya se terminó de pagar, no es "pendiente". El margen evita
    // que redondeos de centavos lo cuenten como pendiente residual.
    .filter((g) => g.saldo > 0.01);

  const hoyMs = Date.now();
  const vencidos = pendientes.filter((p) => {
    if (p.fechaOrigen === null) return false; // no debería pasar si saldo>0
    const origen = new Date(p.fechaOrigen.replace(" ", "T") + "Z").getTime();
    return (hoyMs - origen) / 86400000 > umbralDias;
  });

  return {
    totalPendientes: pendientes.length,
    montoPendiente: Math.round(pendientes.reduce((s, p) => s + p.saldo, 0) * 100) / 100,
    pendientesVencidos: vencidos.length,
    pctVencidos:
      pendientes.length > 0
        ? Math.round((vencidos.length / pendientes.length) * 1000) / 10
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
    // date_deadline es un campo de solo-fecha en Odoo, pero el RPC lo entrega
    // como "YYYY-MM-DD 00:00:00" (medianoche). Comparar contra eso literal
    // marca como "vencida" una tarea el mismo dia en que vence, apenas pasa
    // la medianoche — el plazo real es hasta el FIN de ese dia, no el inicio.
    const fechaDeadline = t.date_deadline.slice(0, 10);
    const deadlineMs = new Date(fechaDeadline + "T23:59:59Z").getTime();
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
