"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";

// Selector de mes (‹ mmm aa ›) que usan los modales de detalle del Stoplight.
// Extraído de StoplightReport.tsx (audit #23), donde estaba declarado dentro
// del render del componente padre.
export default function ModalMonthPicker({ value, onChange }: { value: string; onChange: (mes: string) => void }) {
  const locale = useLocale();

  const mesLabel = (mes: string) => {
    const [y, m] = mes.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short", year: "2-digit" });
  };

  const goMonth = (delta: number) => {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
      <button onClick={() => goMonth(-1)} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
        <ChevronLeft size={14} />
      </button>
      <span className="text-xs font-medium min-w-[80px] text-center capitalize">
        {mesLabel(value)}
      </span>
      <button onClick={() => goMonth(1)} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
