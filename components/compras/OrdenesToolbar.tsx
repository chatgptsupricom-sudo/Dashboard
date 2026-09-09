"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

export function OrdenesToolbar({
  options,
  value,
  onValue,
  q,
  onQ,
  extra,
}: {
  options: ChipOption[];
  value: string;
  onValue: (v: string) => void;
  q: string;
  onQ: (v: string) => void;
  /** Control extra (p. ej. selector de sede) mostrado junto a la búsqueda. */
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onValue(o.value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              value === o.value
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  value === o.value
                    ? "bg-white/20"
                    : "bg-slate-200 dark:bg-slate-700",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
        {extra}
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Buscar por nº o proveedor"
            className="w-full pl-9"
          />
        </div>
      </div>
    </div>
  );
}
