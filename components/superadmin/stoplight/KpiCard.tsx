"use client";

// Tarjeta de un KPI en la vista Resumen del Stoplight: valor real de hoy en
// grande, la meta al lado, una barra con la marca de la meta y cuánto falta.
// La lectura (números) sale de lib/stoplight/lectura.ts y los textos de
// lecturaUI.tsx, los mismos que el encabezado de los modales.

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { getKpiCellColor, nivelSemaforo, NIVEL_UI } from "@/lib/stoplight/scoring";
import type { LecturaKpi } from "@/lib/stoplight/lectura";
import { BarraLectura, ChipNivel, TEXTO_NIVEL, useTextosLectura } from "./lecturaUI";

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
  const { nivel, pct } = lectura;
  const { valor, meta, brechaTexto, ritmo } = useTextosLectura(lectura, locale);

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
        <ChipNivel nivel={nivel} pct={pct} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{valor}</span>
        {meta && <span className="text-sm text-slate-400 tabular-nums">{meta}</span>}
      </div>

      <div className="mt-3">
        <BarraLectura lectura={lectura} />
      </div>

      <p className={`mt-2 text-xs font-medium ${TEXTO_NIVEL[nivel]}`}>{brechaTexto}</p>
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
