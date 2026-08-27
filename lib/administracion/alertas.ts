/**
 * Motor de "Top 10 Alertas" (seccion 8 de la propuesta).
 *
 * Cada area del Indice de Salud Administrativa expone sus alertas con esta
 * misma forma y el motor solo ordena y recorta. Asi el issue #7 (areas
 * financieras) y el #8 (areas operativas) pueden desarrollarse en paralelo:
 * quien agregue un area nueva solo tiene que devolver AlertaAdmin[] y
 * registrarla en la llamada a construirTopAlertas().
 */

export type EstatusAlerta = "abierta" | "en_proceso" | "cerrada";

export interface AlertaAdmin {
  id: string;
  area: string;
  titulo: string;
  /** Los 6 campos que la propuesta exige mostrar en cada alerta. */
  responsable: string;
  montoAfectado: number | null;
  fechaDeteccion: string;
  accion: string;
  fechaCompromiso: string | null;
  estatus: EstatusAlerta;
  /** 0-100. Se usa para priorizar; mas alto = mas critico. */
  severidad: number;
  /** Ruta opcional para el drill-down al origen del dato. */
  enlace?: string;
  /** Nota de seguimiento que escribio Administracion. */
  nota?: string | null;
  /** Quien actualizo el seguimiento por ultima vez, y cuando. */
  actualizadoPor?: string | null;
  actualizadoEn?: string | null;
}

/**
 * Seguimiento que Administracion le pone a una alerta (tabla
 * `alertas_admin_seguimiento`).
 *
 * Las alertas se recalculan en cada carga a partir de los KPIs, asi que la
 * fecha compromiso y el estatus no pueden vivir en el calculo: se guardan
 * aparte y se cruzan por `id` de alerta. Por eso los ids que genera cada area
 * tienen que ser estables entre ejecuciones (van derivados del id del KPI o
 * del codigo de cuenta, nunca de un indice o un timestamp).
 */
export interface SeguimientoAlerta {
  alertaId: string;
  estatus: EstatusAlerta;
  fechaCompromiso: string | null;
  responsable: string | null;
  nota: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

/**
 * Cruza las alertas recien calculadas con su seguimiento guardado.
 *
 * Se aplica ANTES de construirTopAlertas() a proposito: asi una alerta que
 * Administracion ya cerro sale del Top 10 y deja su lugar a la siguiente en
 * severidad, en vez de ocupar una fila que ya no acciona a nadie.
 */
export function aplicarSeguimiento(
  alertas: AlertaAdmin[],
  seguimientos: Record<string, SeguimientoAlerta>,
): AlertaAdmin[] {
  return alertas.map((a) => {
    const s = seguimientos[a.id];
    if (!s) return a;
    return {
      ...a,
      estatus: s.estatus,
      fechaCompromiso: s.fechaCompromiso,
      // El responsable calculado es el area dueña del KPI; si Administracion
      // asigno a una persona concreta, esa manda.
      responsable: s.responsable || a.responsable,
      nota: s.nota,
      actualizadoPor: s.actualizadoPor,
      actualizadoEn: s.actualizadoEn,
    };
  });
}

export const ESTATUS_VALIDOS: EstatusAlerta[] = [
  "abierta",
  "en_proceso",
  "cerrada",
];

export function esEstatusValido(v: unknown): v is EstatusAlerta {
  return typeof v === "string" && ESTATUS_VALIDOS.includes(v as EstatusAlerta);
}

/** Desvio (en % sobre la meta) al que la escala de severidad ya satura. */
const DESVIO_MAXIMO = 1000;

/**
 * Severidad sugerida a partir del semaforo del KPI que la origina, ajustada
 * por que tan lejos esta de la meta. Mantener el calculo en un solo lugar
 * evita que cada area invente su propia escala y el Top 10 quede sesgado.
 *
 * `desvioRelativo` es el % en que el valor se pasa del umbral verde
 * (KpiAdmin.desvio), NO el valor crudo del KPI: comparar "56%" contra "84
 * dias" no significa nada sin su meta al lado.
 *
 * La escala es logaritmica porque los desvios reales abarcan varios ordenes
 * de magnitud (una cartera vencida al 56% con meta 10% se pasa un 461%, y
 * unas obligaciones vencidas al 73% con meta 3% se pasan un 2300%). Con una
 * escala lineal cualquier desvio grande topaba el maximo y casi todas las
 * alertas empataban en 100, dejando el orden del Top 10 en manos del
 * desempate por monto.
 */
export function severidadDesdeDesvio(
  semaforo: "verde" | "amarillo" | "rojo" | "sin_datos",
  desvioRelativo: number,
): number {
  if (semaforo === "verde" || semaforo === "sin_datos") return 0;
  const base = semaforo === "rojo" ? 60 : 30;
  const d = Math.abs(desvioRelativo);
  // El desvio aporta hasta 40 puntos extra; satura en DESVIO_MAXIMO para que
  // un outlier enorme no desplace a todo lo demas del Top 10.
  const extra =
    d <= 0
      ? 0
      : Math.min(
          40,
          (40 * Math.log10(1 + d)) / Math.log10(1 + DESVIO_MAXIMO),
        );
  return Math.min(100, Math.round(base + extra));
}

export function construirTopAlertas(
  grupos: AlertaAdmin[][],
  limite = 10,
): AlertaAdmin[] {
  return grupos
    .flat()
    .filter((a) => a.estatus !== "cerrada" && a.severidad > 0)
    .sort((a, b) => {
      if (b.severidad !== a.severidad) return b.severidad - a.severidad;
      const ma = a.montoAfectado ?? 0;
      const mb = b.montoAfectado ?? 0;
      return mb - ma;
    })
    .slice(0, limite);
}
