"use client";

// Detalle básico de los KPIs que no tienen un modal propio (ciclo de
// reposición, propuestas, marketing): la lectura hoy vs meta, la meta y el
// peso del mes, las semanas contra la meta y cómo se calcula.

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import ResumenKpi, { type ResumenKpiProps } from "./ResumenKpi";
import { KpiInfoContenido } from "./KpiInfoModal";

export default function KpiDetalleModal({
  resumen,
  subtitulo,
  onClose,
}: {
  resumen: ResumenKpiProps | null;
  subtitulo: string;
  onClose: () => void;
}) {
  const t = useTranslations("stoplight");
  if (!resumen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-detalle-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 id="kpi-detalle-title" className="text-lg font-semibold text-slate-900 tracking-tight">{resumen.kpi.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>
          </div>
          <button onClick={onClose} aria-label={t("cerrar")} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-5">
          <ResumenKpi {...resumen} />
          <section className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 text-[13px] font-medium text-slate-700">{t("resumen_como_se_calcula")}</p>
            <KpiInfoContenido kpiId={resumen.kpi.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
