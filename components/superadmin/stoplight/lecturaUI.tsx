"use client";

// Piezas de UI compartidas por la tarjeta del Resumen (KpiCard) y el
// encabezado de los modales de detalle (ResumenKpi): los textos de la
// lectura de un KPI, la barra con la meta y el chip del semáforo.

import { useTranslations } from "next-intl";
import { NIVEL_UI, type Nivel } from "@/lib/stoplight/scoring";
import { formatoReal, type LecturaKpi } from "@/lib/stoplight/lectura";

export const CHIP_NIVEL: Record<Nivel, string> = {
  verde: "bg-emerald-50 text-emerald-700",
  amarillo: "bg-amber-50 text-amber-700",
  rojo: "bg-rose-50 text-rose-700",
  sin: "bg-slate-100 text-slate-500",
};

export const TEXTO_NIVEL: Record<Nivel, string> = {
  verde: "text-emerald-700",
  amarillo: "text-amber-700",
  rojo: "text-rose-700",
  sin: "text-slate-500",
};

const rellenoNivel = (n: Nivel) => (n === "sin" ? "bg-slate-300" : NIVEL_UI[n].barra);

/** Nivel del semáforo para un % de la meta ya calculado (verde ≥100, amarillo ≥70). */
export const nivelDePct = (pct: number | null | undefined): Nivel =>
  pct == null || !Number.isFinite(pct) ? "sin" : pct >= 100 ? "verde" : pct >= 70 ? "amarillo" : "rojo";

/** Textos de la lectura: valor grande, meta al lado, cuánto falta y ritmo. */
export function useTextosLectura(lectura: LecturaKpi, locale: string) {
  const t = useTranslations("stoplight");
  const { pct, real, barra, brecha } = lectura;
  const fmt = (n: number) => (real ? formatoReal(n, real.unidad, locale, t("dias")) : String(n));

  let valor: string;
  let meta: string | null = null;
  if (real) {
    valor = fmt(real.valor);
    if (real.meta) {
      const m = fmt(real.meta);
      meta = real.menosEsMejor ? t("card_max", { meta: m }) : real.acumulado ? t("card_de", { meta: m }) : t("card_meta", { meta: m });
    }
  } else {
    valor = pct != null ? `${pct}%` : "–";
    meta = pct != null ? t("card_de_la_meta") : null;
  }

  let brechaTexto: string | null = null;
  if (real && real.meta && brecha != null) {
    const n = Math.abs(brecha);
    const cantidad = real.unidad === "%"
      ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n)} ${t("card_pts")}`
      : fmt(n);
    const cero = n < (real.unidad === "%" ? 0.05 : 0.5);
    if (real.menosEsMejor) {
      brechaTexto = cero ? t("card_en_meta") : brecha > 0 ? t("card_bajo_tope", { n: cantidad }) : t("card_sobre_tope", { n: cantidad });
    } else if (real.acumulado) {
      brechaTexto = brecha >= 0 ? t("card_mes_cumplido") : t("card_faltan_mes", { n: cantidad });
    } else {
      brechaTexto = cero ? t("card_en_meta") : brecha > 0 ? t("card_sobre", { n: cantidad }) : t("card_faltan", { n: cantidad });
    }
  } else if (!real && pct != null) {
    brechaTexto = pct >= 100 ? t("card_en_meta") : t("card_faltan", { n: `${100 - pct}%` });
  }
  if (!brechaTexto) brechaTexto = real && !real.meta ? t("sin_meta") : t("card_sin_valor");

  const ritmo = real?.acumulado && barra.esperado != null && pct != null ? t("card_ritmo", { pct }) : null;
  return { valor, meta, brechaTexto, ritmo };
}

export function ChipNivel({ nivel, pct }: { nivel: Nivel; pct: number | null }) {
  const t = useTranslations("stoplight");
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${CHIP_NIVEL[nivel]}`}>
      {pct != null ? `${pct}%` : t("sin_meta")}
    </span>
  );
}

/** Barra de la lectura: relleno, marca de la meta y (acumulados) lo esperado a hoy. */
export function BarraLectura({ lectura, alto = "h-2" }: { lectura: LecturaKpi; alto?: string }) {
  const { barra, nivel } = lectura;
  return (
    <div className={`relative ${alto} rounded-full bg-slate-100`}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${rellenoNivel(nivel)} transition-[width] duration-500`} style={{ width: `${barra.relleno}%` }} />
      {barra.esperado != null && (
        <div className="absolute -top-1.5 -bottom-1.5 border-l-2 border-dotted border-slate-500" style={{ left: `${barra.esperado}%` }} />
      )}
      {barra.meta != null && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-slate-800"
          style={{ left: barra.meta >= 100 ? undefined : `${barra.meta}%`, right: barra.meta >= 100 ? 0 : undefined }}
        />
      )}
    </div>
  );
}

/**
 * Barra corta para filas de una lista (vendedor, marca…): `pct` = % de la
 * meta cumplida. La meta queda al 80% del ancho para que se vea lo que sobra.
 */
export function BarraMeta({ pct, className = "w-24" }: { pct: number | null | undefined; className?: string }) {
  const nivel = nivelDePct(pct);
  const relleno = pct == null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(100, (pct / 125) * 100));
  return (
    <div className={`relative h-1.5 rounded-full bg-slate-100 ${className}`} title={pct != null ? `${Math.round(pct)}%` : undefined}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${rellenoNivel(nivel)}`} style={{ width: `${relleno}%` }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-slate-700" style={{ left: "80%" }} />
    </div>
  );
}
