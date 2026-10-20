"use client";

// Encabezado común de los modales de detalle del Stoplight: la misma lectura
// de la tarjeta del Resumen (hoy vs meta, barra, cuánto falta), la meta y el
// peso del mes (editables por el SuperAdmin, se guardan al salir del campo,
// igual que en la pestaña Semanal) y las semanas contra la meta.
//
// Lo arma StoplightReport (`resumenDe`) y cada modal lo pinta arriba de su
// contenido solo cuando muestra el mismo mes del Stoplight.

import { useTranslations } from "next-intl";
import { getKpiCellColor, KPI_MAS_ES_MEJOR, KPI_MENOS_ES_MEJOR, nivelSemaforo, NIVEL_UI } from "@/lib/stoplight/scoring";
import type { LecturaKpi } from "@/lib/stoplight/lectura";
import { BarraLectura, ChipNivel, TEXTO_NIVEL, useTextosLectura } from "./lecturaUI";

export interface ResumenKpiProps {
  kpi: any;
  lectura: LecturaKpi;
  weekHeaders: string[];
  locale: string;
  /** Mes (YYYY-MM) al que corresponde la lectura: el del Stoplight. */
  mes: string;
  editable: boolean;
  meta: string;
  peso: string;
  onMetaChange: (v: string) => void;
  onMetaBlur: (v: string) => void;
  onPesoChange: (v: string) => void;
  onPesoBlur: (v: string) => void;
}

const num = (v: string | null | undefined) =>
  parseFloat(String(v ?? "").replace("%", "").replace(/d[ií]as/i, "").trim());

/** Barras por semana contra la línea de la meta. */
function SemanasVsMeta({ kpi, weekHeaders, locale }: { kpi: any; weekHeaders: string[]; locale: string }) {
  const t = useTranslations("stoplight");
  // En los KPIs crudos (CxC, CxP, marketing) la semana es el valor y la
  // línea es la meta; en el resto la semana ya es "% de la meta" y la
  // línea es 100%.
  const crudo = KPI_MAS_ES_MEJOR.includes(kpi.id) || KPI_MENOS_ES_MEJOR.includes(kpi.id);
  const linea = crudo ? num(kpi.goalDefault) : 100;
  const hayLinea = Number.isFinite(linea) && linea > 0;
  const semanas: (string | null)[] = kpi.weeks || [];
  const valores = semanas.map((v) => (v ? num(v) : NaN));
  const max = Math.max(hayLinea ? linea * 1.25 : 0, ...valores.filter(Number.isFinite), 1);
  const alto = 96;
  const etiquetaLinea = crudo
    ? t("resumen_linea_meta", { meta: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(linea)}${String(kpi.average ?? "").includes("%") ? "%" : ""}` })
    : t("resumen_linea_100");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-slate-700">{t("resumen_semana_a_semana")}</p>
        {!crudo && <p className="text-[11px] text-slate-400">{t("resumen_en_pct_meta")}</p>}
      </div>
      <div className="relative flex items-end gap-3 border-b border-slate-200 px-1" style={{ height: alto + 18 }}>
        {hayLinea && (
          <>
            <div className="absolute inset-x-0 border-t-[1.5px] border-dashed border-slate-700" style={{ bottom: (linea / max) * alto }} />
            <span className="absolute right-0 text-[10px] text-slate-500" style={{ bottom: (linea / max) * alto + 2 }}>
              {etiquetaLinea}
            </span>
          </>
        )}
        {semanas.map((v, i) => {
          const n = valores[i];
          const nivel = v ? nivelSemaforo(kpi.id, v, kpi.goalDefault) : "sin";
          const color = v && getKpiCellColor(kpi.id, v, kpi.goalDefault) && nivel !== "sin" ? NIVEL_UI[nivel].barra : "bg-slate-300";
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end">
              <span className="relative z-10 mb-0.5 rounded bg-white px-1 text-[10px] tabular-nums text-slate-600">{v ?? "–"}</span>
              {Number.isFinite(n) ? (
                <div className={`w-full max-w-[56px] rounded-t ${color}`} style={{ height: Math.max(2, (n / max) * alto) }} />
              ) : (
                <div className="h-0.5 w-full max-w-[56px] bg-slate-200" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-3 px-1">
        {semanas.map((_, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-slate-400">{weekHeaders[i] ?? `S${i + 1}`}</span>
        ))}
      </div>
    </div>
  );
}

export default function ResumenKpi(props: ResumenKpiProps) {
  const { kpi, lectura, weekHeaders, locale, editable, meta, peso } = props;
  const t = useTranslations("stoplight");
  const { valor, meta: metaTexto, brechaTexto, ritmo } = useTextosLectura(lectura, locale);
  const metaEditable = editable && !kpi.metaFija;
  const sufijo = String(kpi.goalSuffix ?? "").trim();
  const input = "w-20 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-medium tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300";

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{valor}</span>
            {metaTexto && <span className="text-sm text-slate-400 tabular-nums">{metaTexto}</span>}
            <ChipNivel nivel={lectura.nivel} pct={lectura.pct} />
          </div>
          <div className="mt-3">
            <BarraLectura lectura={lectura} alto="h-2.5" />
          </div>
          <p className={`mt-2 text-sm font-medium ${TEXTO_NIVEL[lectura.nivel]}`}>{brechaTexto}</p>
          {(ritmo || kpi.hint || kpi.subtitle) && (
            <p className="mt-0.5 text-xs text-slate-400">{ritmo || kpi.hint || kpi.subtitle}</p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="mb-2 text-xs font-medium text-slate-500">{t("resumen_config")}</p>
          <label className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-700">
            {t("meta")}
            {metaEditable ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  value={meta}
                  onChange={(e) => props.onMetaChange(e.target.value)}
                  onBlur={(e) => props.onMetaBlur(e.target.value)}
                  className={`${input} ${sufijo ? "" : "w-24"}`}
                />
                {sufijo && <span className="text-xs text-slate-400">{sufijo}</span>}
              </span>
            ) : (
              <span className="font-medium tabular-nums text-slate-800">{meta}{kpi.goalSuffix}</span>
            )}
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
            {t("peso")}
            {editable ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  value={peso}
                  onChange={(e) => props.onPesoChange(e.target.value)}
                  onBlur={(e) => props.onPesoBlur(e.target.value)}
                  className={input}
                />
                <span className="text-xs text-slate-400">%</span>
              </span>
            ) : (
              <span className="font-medium tabular-nums text-slate-800">{kpi.peso}</span>
            )}
          </label>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            {!editable ? t("resumen_solo_superadmin") : kpi.metaFija ? t("resumen_meta_fija") : t("resumen_se_guarda")}
          </p>
        </div>
      </div>

      {!kpi.sinSemana && (kpi.weeks || []).length > 0 && (
        <div className="border-t border-slate-100 p-4">
          <SemanasVsMeta kpi={kpi} weekHeaders={weekHeaders} locale={locale} />
        </div>
      )}
    </section>
  );
}
