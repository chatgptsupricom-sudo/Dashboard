// Lectura de un KPI para la vista Resumen del Stoplight (tarjetas): valor
// real de hoy, meta en las mismas unidades, barra con la marca de la meta y
// cuánto falta. Sin React; el texto lo arma la tarjeta con sus traducciones.

import { KPI_MAS_ES_MEJOR, KPI_MENOS_ES_MEJOR, nivelSemaforo, sinMeta, type Nivel } from "./scoring";
import type { ValorReal } from "./types";

export interface LecturaKpi {
  nivel: Nivel;
  /** % de la meta cumplida (el que usa el semáforo); null sin meta. */
  pct: number | null;
  /** Valor real en sus unidades; null = solo se conoce el % de la meta. */
  real: ValorReal | null;
  barra: {
    /** Relleno, 0–100 del ancho. */
    relleno: number;
    /** Dónde va la meta, 0–100 del ancho; null sin meta. */
    meta: number | null;
    /** Dónde debería ir hoy un KPI acumulado (meta prorrateada); null si no aplica. */
    esperado: number | null;
  };
  /** Distancia a la meta en unidades del KPI: >0 la pasó, <0 le falta. null sin meta. */
  brecha: number | null;
}

const num = (v: string | number | null | undefined) =>
  parseFloat(String(v ?? "").replace("%", "").replace(/d[ií]as/i, "").trim());

const tope = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Valor real de un KPI: el que manda la API en `reales`, o —para los KPIs
 * cuyo promedio ya es la métrica cruda (CxC, CxP, marketing, ciclo de
 * reposición)— el propio promedio contra la meta de la fila.
 */
export function valorReal(kpi: any, reales?: Record<string, ValorReal>): ValorReal | null {
  const r = reales?.[kpi.id];
  if (r && Number.isFinite(r.valor)) return r;
  const crudo = KPI_MAS_ES_MEJOR.includes(kpi.id) || KPI_MENOS_ES_MEJOR.includes(kpi.id);
  if (!crudo) return null;
  const valor = num(kpi.average);
  if (!Number.isFinite(valor)) return null;
  const meta = num(kpi.goalDefault);
  const texto = `${kpi.average ?? ""}${kpi.goalSuffix ?? ""}`;
  return {
    valor,
    meta: Number.isFinite(meta) && meta > 0 ? meta : null,
    unidad: /d[ií]as/i.test(texto) ? "dias" : String(kpi.average ?? "").includes("%") ? "%" : "",
    menosEsMejor: KPI_MENOS_ES_MEJOR.includes(kpi.id),
  };
}

/**
 * `avanceMes`: fracción del mes (días hábiles) ya corrida, para marcar en los
 * KPIs acumulados dónde se debería ir hoy.
 */
export function leerKpi(kpi: any, reales: Record<string, ValorReal> | undefined, avanceMes: number): LecturaKpi {
  const nivel = nivelSemaforo(kpi.id, kpi.average, kpi.goalDefault);
  const real = valorReal(kpi, reales);
  const kpiSinMeta = sinMeta(kpi.goalDefault);

  // % de la meta: el promedio, salvo en los KPIs crudos, donde se calcula.
  let pct: number | null = null;
  if (!kpiSinMeta) {
    const crudo = KPI_MAS_ES_MEJOR.includes(kpi.id) || KPI_MENOS_ES_MEJOR.includes(kpi.id);
    if (!crudo) {
      const p = num(kpi.average);
      pct = Number.isFinite(p) ? Math.round(p) : null;
    } else if (real?.meta) {
      pct = real.menosEsMejor
        ? real.valor <= 0 ? 100 : Math.round((real.meta / real.valor) * 100)
        : Math.round((real.valor / real.meta) * 100);
    }
  }

  // Sin valor real: la barra es el % de la meta (la meta queda en el 80% del ancho).
  if (!real) {
    return {
      nivel,
      pct,
      real: null,
      barra: { relleno: tope(((pct ?? 0) / 125) * 100), meta: pct == null ? null : 80, esperado: null },
      brecha: null,
    };
  }

  const meta = real.meta;
  if (!meta) {
    return { nivel, pct, real, barra: { relleno: 0, meta: null, esperado: null }, brecha: null };
  }

  if (real.acumulado) {
    // La barra es el mes: lleno = meta del mes; la marca de "hoy" es lo esperado a la fecha.
    return {
      nivel,
      pct,
      real,
      barra: {
        relleno: tope((real.valor / meta) * 100),
        meta: 100,
        esperado: avanceMes > 0 && avanceMes < 1 ? tope(avanceMes * 100) : null,
      },
      brecha: real.valor - meta,
    };
  }

  // Tasa: la meta va al 80% del ancho (o menos si el valor la pasa de largo).
  const escala = Math.max(meta / 0.8, real.valor * 1.05);
  return {
    nivel,
    pct,
    real,
    barra: { relleno: tope((real.valor / escala) * 100), meta: tope((meta / escala) * 100), esperado: null },
    brecha: real.menosEsMejor ? meta - real.valor : real.valor - meta,
  };
}

/** Formato corto de un valor del KPI en sus unidades ("$182k", "16,5%", "52 días"). */
export function formatoReal(valor: number, unidad: ValorReal["unidad"], locale: string, diasLabel: string): string {
  const abs = Math.abs(valor);
  if (unidad === "$") {
    const f = new Intl.NumberFormat(locale, {
      notation: abs >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: abs >= 1_000_000 ? 1 : 0,
    }).format(valor);
    return `$${f}`;
  }
  const decimales = unidad === "%" && abs < 100 && Math.round(abs) !== abs ? 1 : 0;
  const f = new Intl.NumberFormat(locale, { maximumFractionDigits: decimales }).format(valor);
  if (unidad === "%") return `${f}%`;
  if (unidad === "dias") return `${f} ${diasLabel}`;
  return f;
}
