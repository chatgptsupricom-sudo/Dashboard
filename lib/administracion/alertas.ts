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
}

/**
 * Severidad sugerida a partir del semaforo del KPI que la origina, ajustada
 * por que tan lejos esta de la meta. Mantener el calculo en un solo lugar
 * evita que cada area invente su propia escala y el Top 10 quede sesgado.
 */
export function severidadDesdeDesvio(
  semaforo: "verde" | "amarillo" | "rojo" | "sin_datos",
  desvioRelativo: number,
): number {
  if (semaforo === "verde" || semaforo === "sin_datos") return 0;
  const base = semaforo === "rojo" ? 60 : 30;
  // El desvio aporta hasta 40 puntos extra; se satura para que un outlier
  // enorme no desplace a todo lo demas del Top 10.
  const extra = Math.min(40, Math.abs(desvioRelativo));
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
