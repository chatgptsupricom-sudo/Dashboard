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
  /**
   * Cuanto se pasa el valor del umbral verde, en % relativo a la meta. Lo
   * calcula construirKpi() y lo consume el motor de alertas para priorizar:
   * sin esto no hay forma de distinguir un KPI que roza la meta de uno que la
   * multiplica, porque el valor crudo no dice nada sin su meta al lado.
   */
  desvio: number | null;
}

/**
 * Desvio del valor respecto al umbral verde, en porcentaje de la meta.
 * Devuelve 0 si el valor esta dentro de verde y null si no hay con que
 * compararlo.
 *
 * Se mide contra el borde del verde y no contra el "objetivo ideal" porque es
 * el unico numero que el documento define para todos los KPIs.
 */
export function desvioContraUmbral(
  valor: number | null,
  u: UmbralKpi,
): number | null {
  if (valor === null || !Number.isFinite(valor)) return null;

  // Una meta de 0 no admite desvio relativo (dividiria por cero), asi que se
  // cae a la diferencia absoluta. OJO: eso devuelve el numero en la unidad del
  // KPI, no en %, y hoy hay dos casos con meta 0 que no son comparables entre
  // si: variacion_mensual_gasto (ya es un %) y flujo_proyectado_30d (dolares,
  // asi que un flujo de -$1,4MM entra como desvio 1441844 y satura la escala
  // de severidad). El orden que sale es razonable —un flujo proyectado muy
  // negativo es critico— pero es una coincidencia de magnitudes, no una
  // medida comparable. Si se le quiere dar una meta real al flujo (p.ej. un
  // saldo minimo operativo), este caso desaparece.
  const relativo = (exceso: number, meta: number) =>
    meta === 0
      ? Math.abs(exceso)
      : Math.round((Math.abs(exceso) / Math.abs(meta)) * 1000) / 10;

  if (u.modo === "band") {
    const { verdeMin, verdeMax } = u;
    if (verdeMax !== undefined && valor > verdeMax) {
      return relativo(valor - verdeMax, verdeMax);
    }
    if (verdeMin !== undefined && valor < verdeMin) {
      return relativo(verdeMin - valor, verdeMin);
    }
    return 0;
  }

  if (u.modo === "lower_better") {
    if (u.verde === undefined) return null;
    return valor <= u.verde ? 0 : relativo(valor - u.verde, u.verde);
  }

  if (u.verde === undefined) return null;
  return valor >= u.verde ? 0 : relativo(u.verde - valor, u.verde);
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
  base: Omit<KpiAdmin, "semaforo" | "puntos" | "puntosMax" | "desvio">,
  umbral: UmbralKpi,
): KpiAdmin {
  const semaforo = evaluarSemaforo(base.valor, umbral);
  return {
    ...base,
    semaforo,
    puntos: puntosDeSemaforo(semaforo, base.peso),
    puntosMax: base.peso,
    desvio: desvioContraUmbral(base.valor, umbral),
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
