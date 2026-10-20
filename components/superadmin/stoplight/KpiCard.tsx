"use client";

// Tarjeta de un KPI en la vista Resumen del Stoplight: valor real de hoy en
// grande, la meta al lado, una barra con la marca de la meta y cuánto falta.
// La lectura (números) sale de lib/stoplight/lectura.ts.

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { getKpiCellColor, nivelSemaforo, NIVEL_UI, type Nivel } from "@/lib/stoplight/scoring";
import { formatoReal, type LecturaKpi } from "@/lib/stoplight/lectura";

const CHIP: Record<Nivel, string> = {
  verde: "bg-emerald-50 text-emerald-700",
  amarillo: "bg-amber-50 text-amber-700",
  rojo: "bg-rose-50 text-rose-700",
  sin: "bg-slate-100 text-slate-500",
};

const TEXTO: Record<Nivel, string> = {
  verde: "text-emerald-700",
  amarillo: "text-amber-700",
  rojo: "text-rose-700",
  sin: "text-slate-500",
};

export default function KpiCard({
  kpi,
  lectura,
  weekHeaders,
  locale,
  onAbrir,
  onInfo,
}: {
  kpi: any;
  lectura: LecturaKpi;
  weekHeaders: string[];
  locale: string;
  onAbrir?: () => void;
  onInfo: () => void;
}) {
  const t = useTranslations("stoplight");
  const { nivel, pct, real, barra, brecha } = lectura;
  const fmt = (n: number) => (real ? formatoReal(n, real.unidad, locale, t("dias")) : String(n));

  // Valor grande y meta al lado.
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

  // Cuánto falta (o cuánto sobra), en las unidades del KPI.
  let brechaTexto: string | null = null;
  if (real && real.meta && brecha != null) {
    const n = Math.abs(brecha);
    const cantidad = real.unidad === "%"
      ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n)} ${t("card_pts")}`
      : fmt(n);
    const cero = Math.abs(brecha) < (real.unidad === "%" ? 0.05 : 0.5);
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

  const ritmo = real?.acumulado && barra.esperado != null && pct != null ? t("card_ritmo", { pct }) : null;
  const relleno = nivel === "sin" ? "bg-slate-300" : NIVEL_UI[nivel].barra;

  return (
    <div
      role={onAbrir ? "button" : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onClick={onAbrir}
      onKeyDown={onAbrir ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } } : undefined}
      className={`group flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors ${
        onAbrir ? "cursor-pointer hover:border-slate-300 hover:bg-slate-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[13px] font-medium leading-snug text-slate-600">
          {kpi.title}
          <button
            type="button"
            aria-label="Info"
            onClick={(e) => { e.stopPropagation(); onInfo(); }}
            className="ml-1 inline-flex align-[-2px] text-slate-300 hover:text-slate-500"
          >
            <HelpCircle size={13} />
          </button>
        </p>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${CHIP[nivel]}`}>
          {pct != null ? `${pct}%` : t("sin_meta")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{valor}</span>
        {meta && <span className="text-sm text-slate-400 tabular-nums">{meta}</span>}
      </div>

      <div className="relative mt-3 h-2 rounded-full bg-slate-100">
        <div className={`absolute inset-y-0 left-0 rounded-full ${relleno} transition-[width] duration-500`} style={{ width: `${barra.relleno}%` }} />
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

      <p className={`mt-2 text-xs font-medium ${TEXTO[nivel]}`}>{brechaTexto ?? (real && !real.meta ? t("sin_meta") : t("card_sin_valor"))}</p>
      {(ritmo || kpi.hint || kpi.subtitle) && (
        <p className="mt-0.5 text-[11px] text-slate-400">{ritmo || kpi.hint || kpi.subtitle}</p>
      )}

      <div className="min-h-3 flex-1" />
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        {kpi.sinSemana ? (
          <span className="text-[11px] text-slate-400">{t("metrica_mensual")}</span>
        ) : (
          <span className="flex items-center gap-1.5">
            {(kpi.weeks || []).map((v: string | null, i: number) => {
              const n = v ? nivelSemaforo(kpi.id, v, kpi.goalDefault) : "sin";
              return (
                <span
                  key={i}
                  title={`${weekHeaders[i] ?? `S${i + 1}`}: ${v ?? "–"}`}
                  className={`h-2 w-2 rounded-full ${v && getKpiCellColor(kpi.id, v, kpi.goalDefault) ? (n === "sin" ? "bg-slate-300" : NIVEL_UI[n].punto) : "bg-slate-200"}`}
                />
              );
            })}
          </span>
        )}
        <span className="text-[11px] text-slate-400 tabular-nums">
          {t("peso")} {kpi.peso}
        </span>
      </div>
    </div>
  );
}
