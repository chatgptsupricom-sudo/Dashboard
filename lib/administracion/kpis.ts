export type Semaforo = "verde" | "amarillo" | "rojo" | "sin_datos";

/**
 * Como se evalua el valor contra la meta:
 * - lower_better: mejor mientras mas bajo (ej. desviacion de gastos <=3%)
 * - higher_better: mejor mientras mas alto (ej. descuentos aprovechados >=90%)
 * - band: hay un rango optimo y pasarse tambien es malo (ej. ejecucion
 *   presupuestaria: 95-100% es sano, >105% es sobregiro y <90% es subejecucion)
 */
export type ModoEvaluacion = "lower_better" | "higher_better" | "band";

export interface UmbralKpi {
  modo: ModoEvaluacion;
  // lower_better / higher_better: limite de verde y de amarillo
  verde?: number;
  amarillo?: number;
  // band: rango verde y rango amarillo
  verdeMin?: number;
  verdeMax?: number;
  amarilloMin?: number;
  amarilloMax?: number;
}

export interface KpiAdmin {
  id: string;
  numero: number;
  nombre: string;
  formula: string;
  peso: number;
  metaTexto: string;
  valor: number | null;
  unidad: "%" | "x" | "$" | "";
  semaforo: Semaforo;
  puntos: number;
  puntosMax: number;
  frecuencia: string;
  responsable: string;
  fuente: string;
  /** Explica de donde sale el numero, para no dar cifras sin contexto. */
  detalle?: string;
}

export function evaluarSemaforo(
  valor: number | null,
  u: UmbralKpi,
): Semaforo {
  if (valor === null || !Number.isFinite(valor)) return "sin_datos";

  if (u.modo === "band") {
    const { verdeMin, verdeMax, amarilloMin, amarilloMax } = u;
    if (
      verdeMin !== undefined &&
      verdeMax !== undefined &&
      valor >= verdeMin &&
      valor <= verdeMax
    ) {
      return "verde";
    }
    if (
      amarilloMin !== undefined &&
      amarilloMax !== undefined &&
      valor >= amarilloMin &&
      valor <= amarilloMax
    ) {
      return "amarillo";
    }
    return "rojo";
  }

  if (u.modo === "lower_better") {
    if (u.verde !== undefined && valor <= u.verde) return "verde";
    if (u.amarillo !== undefined && valor <= u.amarillo) return "amarillo";
    return "rojo";
  }

  // higher_better
  if (u.verde !== undefined && valor >= u.verde) return "verde";
  if (u.amarillo !== undefined && valor >= u.amarillo) return "amarillo";
  return "rojo";
}

/**
 * Puntuacion por cumplimiento segun la propuesta:
 * Verde = 100% del peso, Amarillo = 60%, Rojo = 0%.
 * "sin_datos" no suma puntos pero tampoco debe castigar como si fuera rojo,
 * asi que se reporta aparte (ver puntosMaxEvaluables).
 */
export function puntosDeSemaforo(semaforo: Semaforo, peso: number): number {
  if (semaforo === "verde") return peso;
  if (semaforo === "amarillo") return Math.round(peso * 0.6 * 100) / 100;
  return 0;
}

export function construirKpi(
  base: Omit<KpiAdmin, "semaforo" | "puntos" | "puntosMax">,
  umbral: UmbralKpi,
): KpiAdmin {
  const semaforo = evaluarSemaforo(base.valor, umbral);
  return {
    ...base,
    semaforo,
    puntos: puntosDeSemaforo(semaforo, base.peso),
    puntosMax: base.peso,
  };
}

export interface ResumenCategoria {
  categoria: string;
  puntos: number;
  /** Peso total de la categoria segun la propuesta (ej. 15 para Gastos). */
  puntosMax: number;
  /** Peso de los KPIs que si tuvieron datos; el indice honesto se calcula
   *  sobre esto para no castigar por informacion faltante. */
  puntosMaxEvaluables: number;
  kpis: KpiAdmin[];
}

export function resumirCategoria(
  categoria: string,
  kpis: KpiAdmin[],
  puntosMax: number,
): ResumenCategoria {
  const puntos = kpis.reduce((s, k) => s + k.puntos, 0);
  const puntosMaxEvaluables = kpis
    .filter((k) => k.semaforo !== "sin_datos")
    .reduce((s, k) => s + k.puntosMax, 0);
  return {
    categoria,
    puntos: Math.round(puntos * 100) / 100,
    puntosMax,
    puntosMaxEvaluables,
    kpis,
  };
}
