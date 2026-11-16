// KPIs por departamento del Stoplight (propuesta de la Dirección General,
// "Propuesta de KPIs por Departamento", oct-2026). Puro: lo usan la API
// (`/api/superadmin/stoplight/departamentos`) y la pantalla.
//
// Desde ESTRUCTURA_NUEVA_DESDE el Stoplight cambia:
//  - Cuentas por Cobrar y Cuentas por Pagar se juntan en Administración
//    (los KPIs que la propuesta no trae quedan con peso 0, informativos) y
//    se le suman dos controles contables que se cargan a mano.
//  - Marketing pasa a medir leads B2B; lo de la web (GA4, Search Console,
//    correo) queda con peso 0.
//  - Bloques nuevos: Logística, Auditoría, RRHH, Servicios Generales e
//    Inteligencia de Negocios y Expansión.
// Los meses anteriores se ven como antes, para no cambiar el puntaje de
// meses cerrados.
//
// Cada KPI sale solo (`auto`), se carga a mano (`manual`) o las dos cosas
// (`mixto`: el panel lo calcula y una carga a mano lo reemplaza, para lo que
// el panel no ve). Las cargas a mano las hace el SuperAdmin en el detalle
// del KPI, por sede y mes (tabla `stoplight_valores_manuales`).

export const ESTRUCTURA_NUEVA_DESDE = "2026-11";

/** true si el mes (YYYY-MM) ya usa la estructura por departamento. */
export const usaEstructuraNueva = (mes: string) => mes >= ESTRUCTURA_NUEVA_DESDE;

/**
 * - `mas`: más alto es mejor (la meta es un piso).
 * - `menos`: más bajo es mejor (la meta es un tope).
 * - `cero`: la meta es 0 casos; cualquier caso lo pone en rojo.
 */
export type Sentido = "mas" | "menos" | "cero";
export type Fuente = "auto" | "manual" | "mixto";
/** Período en que se va sumando una cuenta (informes, estudios…). */
export type Periodo = "mes" | "trimestre" | "semestre" | "anio";
export type Unidad = "%" | "$" | "dias" | "horas" | "dia_habil" | "";

export interface DefKpi {
  key: string;
  titulo: string;
  meta: number;
  unidad: Unidad;
  sentido: Sentido;
  peso: number;
  fuente: Fuente;
  /**
   * Cuenta que se va sumando en el período (mes, trimestre…): se compara con
   * la meta del período prorrateada a lo que ya pasó de él, y la fila muestra
   * "% de lo esperado a la fecha". Sin `acumula` el valor es una tasa del mes.
   */
  acumula?: Periodo;
  /** Qué mide y de dónde sale (o qué hay que cargar). */
  descripcion: string;
}

export interface DefBloque {
  id: string;
  titulo: string;
  /**
   * - `sede`: por sede.
   * - `pais`: Valencia y Caracas comparten el de Venezuela (se guarda con
   *   company_id 9) y Panamá tiene el suyo (7). Los leads no tienen sede
   *   propia: Venezuela es un solo pozo.
   * - `global`: uno para todo el grupo (se guarda con company_id 0).
   */
  alcance: "sede" | "pais" | "global";
  kpis: DefKpi[];
}

/** company_id con el que se guardan metas, pesos y cargas de un bloque global. */
export const COMPANY_GLOBAL = 0;

export const BLOQUES: DefBloque[] = [
  {
    id: "administracion",
    titulo: "Administración",
    alcance: "sede",
    // Los KPIs de Odoo de Administración (efectividad, cartera, DSO, pagos a
    // tiempo, DPO) son los de CxC y CxP de siempre: aquí solo van los
    // controles contables nuevos.
    kpis: [
      {
        key: "adm_cierre_contable",
        titulo: "Cierre contable mensual a tiempo",
        meta: 5,
        unidad: "dia_habil",
        sentido: "menos",
        peso: 10,
        fuente: "manual",
        descripcion:
          "Día hábil del mes siguiente en que quedó cerrado el mes (fecha de bloqueo puesta en Odoo y checklist de cierre completo). Meta: a más tardar el día 5 hábil. Se carga a mano.",
      },
      {
        key: "adm_conciliaciones",
        titulo: "Conciliaciones bancarias al día",
        meta: 100,
        unidad: "%",
        sentido: "mas",
        peso: 10,
        fuente: "manual",
        descripcion:
          "Cuentas de banco con la conciliación del mes terminada ÷ cuentas de banco de la sede. En Valencia y Caracas los extractos no se cargan en Odoo, por eso se carga a mano.",
      },
    ],
  },
  {
    id: "logistica",
    titulo: "Logística",
    alcance: "sede",
    kpis: [
      {
        key: "log_pedidos_otif",
        titulo: "Pedidos entregados completos y a tiempo",
        meta: 96,
        unidad: "%",
        sentido: "mas",
        peso: 25,
        fuente: "manual",
        descripcion:
          "Pedidos entregados en el mes completos y en la fecha comprometida ÷ pedidos entregados. Se carga a mano: en Odoo la fecha prevista de la entrega es la del pedido y las entregas parciales (cuando el cliente retira por partes) no distinguen un pendiente de un retraso.",
      },
      {
        key: "log_exactitud_inventario",
        titulo: "Exactitud de inventario (sistema vs. físico)",
        meta: 99,
        unidad: "%",
        sentido: "mas",
        peso: 20,
        fuente: "manual",
        descripcion: "Ubicaciones o SKU contados que coinciden con el sistema ÷ contados, según los conteos del mes. Se carga a mano.",
      },
      {
        key: "log_tiempo_despacho",
        titulo: "Tiempo de despacho (facturado → despachado)",
        meta: 48,
        unidad: "horas",
        sentido: "menos",
        peso: 20,
        fuente: "mixto",
        descripcion:
          "Horas promedio, por pedido facturado en el mes, entre la creación de su primera factura y la primera entrega validada en Odoo (0 si salió antes de facturar). Los pedidos todavía sin despachar cuentan hasta hoy. Sin intercompañía. Una carga a mano reemplaza el cálculo.",
      },
      {
        key: "log_errores_despacho",
        titulo: "Errores de despacho",
        meta: 0.3,
        unidad: "%",
        sentido: "menos",
        peso: 15,
        fuente: "manual",
        descripcion: "Despachos con error (producto, cantidad o cliente equivocado) ÷ despachos del mes. Se carga a mano.",
      },
      {
        key: "log_ciclo_rma",
        titulo: "Ciclo de RMA",
        meta: 5,
        unidad: "dias",
        sentido: "menos",
        peso: 20,
        fuente: "mixto",
        descripcion:
          "Días hábiles promedio desde que el equipo llegó (ingreso) hasta que salió, de los casos de RMA de la sede que salieron en el mes. Ideal 3 días, máximo 5, nunca más de 10: el detalle cuenta los que pasaron de 10.",
      },
    ],
  },
  {
    id: "auditoria",
    titulo: "Auditoría",
    alcance: "sede",
    kpis: [
      {
        key: "aud_conteos_ciclicos",
        titulo: "Conteos cíclicos ejecutados vs. plan",
        meta: 100,
        unidad: "%",
        sentido: "mas",
        peso: 25,
        fuente: "manual",
        descripcion: "Conteos cíclicos hechos ÷ conteos planificados para el mes. Se carga a mano.",
      },
      {
        key: "aud_diferencias_inventario",
        titulo: "Diferencias de inventario valorizadas",
        meta: 0.3,
        unidad: "%",
        sentido: "menos",
        peso: 25,
        fuente: "manual",
        descripcion: "Valor absoluto de las diferencias encontradas en los conteos ÷ valor del inventario, a costo. Se carga a mano.",
      },
      {
        key: "aud_hallazgos_cerrados",
        titulo: "Hallazgos cerrados a tiempo",
        meta: 90,
        unidad: "%",
        sentido: "mas",
        peso: 20,
        fuente: "manual",
        descripcion: "Hallazgos de auditoría que vencían en el mes y se cerraron a tiempo ÷ hallazgos que vencían. Se carga a mano.",
      },
      {
        key: "aud_nc_validadas",
        titulo: "Notas de crédito y devoluciones validadas",
        meta: 100,
        unidad: "%",
        sentido: "mas",
        peso: 15,
        fuente: "mixto",
        descripcion:
          "Notas de crédito de cliente publicadas en Odoo en el mes que salieron del flujo de aprobación del panel (preaprobada y aprobada) ÷ notas de crédito publicadas. Una carga a mano reemplaza el cálculo.",
      },
      {
        key: "aud_fuera_politica",
        titulo: "Descuentos o precios fuera de política",
        meta: 0,
        unidad: "",
        sentido: "cero",
        peso: 15,
        fuente: "manual",
        descripcion: "Casos encontrados en el mes de descuentos o precios fuera de la política comercial. Meta: ninguno. Se carga a mano.",
      },
    ],
  },
  {
    id: "rrhh",
    titulo: "Recursos Humanos",
    alcance: "sede",
    kpis: [
      {
        key: "rrhh_rotacion",
        titulo: "Rotación de personal mensual",
        meta: 2,
        unidad: "%",
        sentido: "menos",
        peso: 25,
        fuente: "manual",
        descripcion: "Egresos del mes ÷ plantilla promedio del mes. Se carga a mano.",
      },
      {
        key: "rrhh_ausentismo",
        titulo: "Ausentismo",
        meta: 3,
        unidad: "%",
        sentido: "menos",
        peso: 20,
        fuente: "mixto",
        descripcion:
          "Días de ausencia ÷ días laborables evaluados en el mes, del biométrico de la sede (Asistencia). El biométrico no distingue vacaciones, reposos ni permisos: cuentan como ausencia. Sin marcas cargadas del mes queda sin dato; una carga a mano reemplaza el cálculo.",
      },
      {
        key: "rrhh_dias_vacante",
        titulo: "Días para cubrir una vacante",
        meta: 30,
        unidad: "dias",
        sentido: "menos",
        peso: 20,
        fuente: "mixto",
        descripcion:
          "Días promedio entre la recepción de la requisición y el ingreso del último contratado, de las requisiciones de la sede que quedaron cubiertas en el mes (Selección de personal). Una carga a mano reemplaza el cálculo.",
      },
      {
        key: "rrhh_capacitacion",
        titulo: "Cumplimiento del plan de capacitación",
        meta: 90,
        unidad: "%",
        sentido: "mas",
        peso: 20,
        fuente: "manual",
        descripcion: "Actividades de capacitación hechas ÷ planificadas para el mes. Se carga a mano.",
      },
      {
        key: "rrhh_nomina_sin_errores",
        titulo: "Nómina procesada sin errores",
        meta: 100,
        unidad: "%",
        sentido: "mas",
        peso: 15,
        fuente: "manual",
        descripcion: "Recibos de nómina del mes sin correcciones ÷ recibos procesados. Se carga a mano.",
      },
    ],
  },
  {
    id: "servicios_generales",
    titulo: "Servicios Generales",
    alcance: "sede",
    kpis: [
      {
        key: "sg_solicitudes_48h",
        titulo: "Solicitudes atendidas en ≤ 48 horas",
        meta: 90,
        unidad: "%",
        sentido: "mas",
        peso: 30,
        fuente: "manual",
        descripcion: "Solicitudes internas atendidas en 48 horas o menos ÷ solicitudes del mes. Se carga a mano.",
      },
      {
        key: "sg_mantenimiento_preventivo",
        titulo: "Mantenimiento preventivo cumplido",
        meta: 100,
        unidad: "%",
        sentido: "mas",
        peso: 25,
        fuente: "mixto",
        descripcion:
          "Servicios del plan de mantenimiento de las unidades (camiones y montacargas, Mantenimiento de unidades) que hoy están al día ÷ servicios del plan. Es una foto de hoy, no del mes. Una carga a mano (que puede incluir planta eléctrica, A/A, etc.) reemplaza el cálculo.",
      },
      {
        key: "sg_equipos_criticos",
        titulo: "Equipos críticos operativos (planta eléctrica, A/A, montacargas)",
        meta: 98,
        unidad: "%",
        sentido: "mas",
        peso: 20,
        fuente: "manual",
        descripcion: "Tiempo operativo de los equipos críticos ÷ tiempo total del mes. Se carga a mano.",
      },
      {
        key: "sg_gasto_presupuesto",
        titulo: "Gasto vs. presupuesto",
        meta: 100,
        unidad: "%",
        sentido: "menos",
        peso: 15,
        fuente: "mixto",
        descripcion:
          "Gasto ejecutado ÷ presupuesto del mes de toda la sede (Gastos y Presupuesto de Administración: gasto de Odoo contra el presupuesto cargado en el panel); en el mes en curso, contra el presupuesto prorrateado a los días que van. Para medir solo lo de Servicios Generales, se carga a mano y reemplaza el cálculo.",
      },
      {
        key: "sg_incidentes_seguridad",
        titulo: "Incidentes de seguridad",
        meta: 0,
        unidad: "",
        sentido: "cero",
        peso: 10,
        fuente: "manual",
        descripcion: "Incidentes de seguridad del mes. Meta: ninguno. Se carga a mano.",
      },
    ],
  },
  {
    id: "marketing",
    titulo: "Marketing",
    alcance: "pais",
    kpis: [
      {
        key: "mkt_ventas_leads",
        titulo: "Ventas originadas por leads de marketing",
        meta: 60000,
        unidad: "$",
        sentido: "mas",
        peso: 25,
        fuente: "mixto",
        acumula: "mes",
        descripcion:
          "Monto de los leads cerrados como venta en el mes, del Dashboard de Leads (Venezuela o Panamá). Se compara con la meta del mes prorrateada a los días que van.",
      },
      {
        key: "mkt_leads_calificados",
        titulo: "Leads calificados B2B generados",
        meta: 180,
        unidad: "",
        sentido: "mas",
        peso: 15,
        fuente: "mixto",
        acumula: "mes",
        descripcion:
          "Conversaciones de campañas de Meta calificadas en el mes (empresa con RIF y actividad comercial: revendedor, tienda, retail o corporativo; los consumidores finales no cuentan), del resumen de campañas del panel. Se compara con la meta del mes prorrateada a los días que van.",
      },
      {
        key: "mkt_conversion",
        titulo: "Conversión de lead a venta",
        meta: 15,
        unidad: "%",
        sentido: "mas",
        peso: 15,
        fuente: "mixto",
        descripcion: "De los leads que entraron en el mes, los que ya se cerraron como venta (la tasa de efectividad del Dashboard de Leads).",
      },
      {
        key: "mkt_reactivacion",
        titulo: "Reactivación de clientes inactivos",
        meta: 10,
        unidad: "%",
        sentido: "mas",
        peso: 15,
        fuente: "manual",
        descripcion:
          "Clientes inactivos contactados por campañas a la cartera (WhatsApp, correo, listas de precios, ofertas por marca) que volvieron a comprar en el mes ÷ inactivos contactados. Se carga a mano.",
      },
      {
        key: "mkt_tasa_calificacion",
        titulo: "Tasa de calificación de leads",
        meta: 65,
        unidad: "%",
        sentido: "mas",
        peso: 10,
        fuente: "mixto",
        descripcion: "Conversaciones calificadas ÷ conversaciones con calificación (calificadas + no calificadas) del mes, del resumen de campañas de Meta.",
      },
      {
        key: "mkt_costo_lead_calificado",
        titulo: "Costo por lead calificado",
        meta: 2.5,
        unidad: "$",
        sentido: "menos",
        peso: 10,
        fuente: "mixto",
        descripcion: "Inversión del mes en Meta Ads ÷ leads calificados del mes (resumen de campañas de Meta del panel).",
      },
      {
        key: "mkt_atribucion",
        titulo: "Ventas de leads con campaña asignada (atribución)",
        meta: 90,
        unidad: "%",
        sentido: "mas",
        peso: 10,
        fuente: "mixto",
        descripcion:
          "Leads de canales de Meta (Facebook Ads, Instagram, Meta Ads) cerrados como venta en el mes que tienen la campaña que los generó ÷ los cerrados como venta. Hasta que no esté, no se puede medir el retorno de la inversión.",
      },
    ],
  },
  {
    id: "expansion",
    titulo: "Inteligencia de Negocios y Expansión",
    alcance: "global",
    kpis: [
      {
        key: "bi_factibilidad_sedes",
        titulo: "Estudios de factibilidad de nuevas sedes completados",
        meta: 3,
        unidad: "",
        sentido: "mas",
        peso: 20,
        fuente: "manual",
        acumula: "anio",
        descripcion:
          "Estudios completos (mercado, clientes potenciales, competencia, poder adquisitivo, logística, costos, inversión, punto de equilibrio y recomendación). Se carga cada mes cuántos se terminaron; la fila suma el año y lo compara con 3 al año prorrateado.",
      },
      {
        key: "bi_mapa_mercado",
        titulo: "Mapa de mercado por estado actualizado",
        meta: 24,
        unidad: "",
        sentido: "mas",
        peso: 15,
        fuente: "manual",
        acumula: "trimestre",
        descripcion:
          "Estados con el mapa actualizado (demanda, poder adquisitivo, competencia, penetración). Se carga cada mes cuántos se actualizaron; la fila suma el trimestre contra 24 prorrateado.",
      },
      {
        key: "bi_inteligencia_competitiva",
        titulo: "Informe de inteligencia competitiva",
        meta: 1,
        unidad: "",
        sentido: "mas",
        peso: 15,
        fuente: "manual",
        acumula: "mes",
        descripcion: "Informes del mes con al menos 10 competidores (precios, marcas, crédito, aperturas, movimientos). Se carga a mano.",
      },
      {
        key: "bi_empresas_nuevas",
        titulo: "Empresas y marcas nuevas en Venezuela identificadas y calificadas",
        meta: 10,
        unidad: "",
        sentido: "mas",
        peso: 15,
        fuente: "manual",
        acumula: "mes",
        descripcion: "Empresas, marcas o cadenas que llegan al país, calificadas como cliente potencial, marca a representar o socio. Se carga a mano.",
      },
      {
        key: "bi_oportunidades_caso",
        titulo: "Oportunidades de negocio presentadas con caso de negocio",
        meta: 4,
        unidad: "",
        sentido: "mas",
        peso: 15,
        fuente: "manual",
        acumula: "trimestre",
        descripcion: "Oportunidades presentadas con mercado, inversión, retorno, riesgos y plan. Se carga cada mes; la fila suma el trimestre contra 4 prorrateado.",
      },
      {
        key: "bi_oportunidades_piloto",
        titulo: "Oportunidades aprobadas por la Dirección para piloto",
        meta: 1,
        unidad: "",
        sentido: "mas",
        peso: 10,
        fuente: "manual",
        acumula: "semestre",
        descripcion: "Oportunidades que la Dirección aprobó para piloto. Se carga cada mes; la fila suma el semestre contra 1 prorrateado.",
      },
      {
        key: "bi_crecimiento_estados_sin_sede",
        titulo: "Crecimiento de ventas en estados sin sede",
        meta: 15,
        unidad: "%",
        sentido: "mas",
        peso: 10,
        fuente: "mixto",
        descripcion:
          "Ventas (USD sin IVA, sin intercompañía) de Valencia y Caracas a clientes de estados sin sede, en lo que va del trimestre contra los mismos meses del trimestre anterior. Estados con sede: Carabobo, Distrito Capital y Miranda.",
      },
    ],
  },
];

export const KPIS_DEPARTAMENTOS: DefKpi[] = BLOQUES.flatMap((b) => b.kpis);

export const defKpi = (key: string): DefKpi | undefined => KPIS_DEPARTAMENTOS.find((k) => k.key === key);

export const bloqueDeKpi = (key: string): DefBloque | undefined => BLOQUES.find((b) => b.kpis.some((k) => k.key === key));

/** company_id con que se guarda un bloque (metas, pesos, cargas) para una sede. */
export function companyDeBloque(alcance: DefBloque["alcance"], companyId: number): number {
  if (alcance === "global") return COMPANY_GLOBAL;
  if (alcance === "pais") return companyId === 7 ? 7 : 9;
  return companyId;
}

/** company_id con que se guarda (meta, peso, carga) un KPI de departamento. */
export function companyDeKpi(key: string, companyId: number): number {
  const b = bloqueDeKpi(key);
  return b ? companyDeBloque(b.alcance, companyId) : companyId;
}

/** KPIs que muestran su valor crudo (no "% de la meta"), para el semáforo. */
export const KPIS_DEPTO_MAS = KPIS_DEPARTAMENTOS.filter((k) => !k.acumula && k.sentido === "mas").map((k) => k.key);
export const KPIS_DEPTO_MENOS = KPIS_DEPARTAMENTOS.filter((k) => !k.acumula && k.sentido === "menos").map((k) => k.key);
export const KPIS_DEPTO_CERO = KPIS_DEPARTAMENTOS.filter((k) => k.sentido === "cero").map((k) => k.key);

// --- Pesos y metas de los bloques que ya existían -------------------------

/**
 * Administración desde ESTRUCTURA_NUEVA_DESDE: pesos de los KPIs de CxC y CxP
 * (0 = informativo, no está en la propuesta). Sus metas por defecto (85 %,
 * 10 %, 45 días, 95 %, 30 días) ya eran las de la propuesta y siguen en las
 * rutas de CxC y CxP.
 */
export const PESOS_ADMINISTRACION: Record<string, number> = {
  efectividad_cobranza: 20,
  cartera_vencida: 20,
  dso: 10,
  recuperacion_vencidos: 0,
  pagos_a_tiempo: 20,
  dpo: 10,
  cuentas_pagar_vencidas: 0,
  procesamiento_oportuno: 0,
};

/**
 * Metas de Compras de la propuesta (los pesos ya eran esos). Desde la
 * estructura nueva, para no cambiar el puntaje de octubre, ya cerrado.
 */
export const METAS_COMPRAS_DESDE = ESTRUCTURA_NUEVA_DESDE;
export const METAS_COMPRAS: Record<string, number> = {
  variacion_costo_compra: 2,
  rotacion_saludable: 80,
  quiebre_inventario: 5,
  inventario_90_dias: 10,
  forecast_semanal: 100,
  propuestas_calificadas: 3,
};

/** Marketing web (GA4, Search Console, correo): informativo desde la estructura nueva. */
export const KPIS_MARKETING_WEB = [
  "usuarios_totales",
  "sesiones",
  "paginas_vistas",
  "tasa_rebote",
  "clicks_sc",
  "impresiones_sc",
  "ctr_sc",
  "posicion_sc",
  "email_open_rate",
];

// --- Períodos ---------------------------------------------------------------

/** Meses (YYYY-MM) del período al que pertenece `mes`, hasta `mes` incluido. */
export function mesesDelPeriodo(mes: string, periodo: Periodo): string[] {
  const [y, m] = mes.split("-").map(Number);
  const largo = periodo === "mes" ? 1 : periodo === "trimestre" ? 3 : periodo === "semestre" ? 6 : 12;
  const inicio = Math.floor((m - 1) / largo) * largo + 1;
  const out: string[] = [];
  for (let i = inicio; i <= m; i++) out.push(`${y}-${String(i).padStart(2, "0")}`);
  return out;
}

/**
 * Parte del período ya corrida al día `hoy` (0–1], para prorratear la meta
 * de una cuenta. Un mes pasado cuenta entero. Los meses del período antes de
 * ESTRUCTURA_NUEVA_DESDE no cuentan (no se podían cargar): en noviembre de
 * 2026 una meta anual espera lo de noviembre, no lo de enero a noviembre.
 */
export function fraccionDelPeriodo(mes: string, periodo: Periodo, hoy: Date): number {
  const [y, m] = mes.split("-").map(Number);
  const largo = periodo === "mes" ? 1 : periodo === "trimestre" ? 3 : periodo === "semestre" ? 6 : 12;
  // Meses completos del período antes de `mes`, desde la estructura nueva.
  const mesesAntes = mesesDelPeriodo(mes, periodo).filter((x) => x < mes && x >= ESTRUCTURA_NUEVA_DESDE).length;
  const finMes = new Date(y, m, 0);
  const diasMes = finMes.getDate();
  let delMes = 1;
  if (hoy.getFullYear() === y && hoy.getMonth() + 1 === m) delMes = Math.max(1, hoy.getDate()) / diasMes;
  else if (hoy < new Date(y, m - 1, 1)) delMes = 0;
  return Math.max(0.01, Math.min(1, (mesesAntes + delMes) / largo));
}

export function sufijoUnidad(u: Unidad): string {
  switch (u) {
    case "%":
      return "%";
    case "dias":
      return " días";
    case "horas":
      return " h";
    case "dia_habil":
      return " día háb.";
    default:
      return "";
  }
}
