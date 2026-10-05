"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { esRangoMesActual, rangoMesActual, type RangoCuota } from "@/lib/cuota/rango";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

export function FiltroFechaCuota({
  rango,
  onChange,
}: {
  rango: RangoCuota;
  onChange: (rango: RangoCuota) => void;
}) {
  const t = useTranslations("cuotaFiltro");
  const hoy = rangoMesActual().hasta;

  return (
    <div className="flex flex-wrap items-end gap-3 bg-white border border-zinc-100 rounded-2xl shadow-sm p-3">
      <div className="p-2 bg-zinc-50 rounded-xl self-center">
        <CalendarDays size={18} className="text-zinc-500" />
      </div>
      <label className="space-y-1">
        <span className="block text-[10px] text-zinc-400 font-bold uppercase">
          {t("desde")}
        </span>
        <Input
          type="date"
          value={rango.desde}
          max={rango.hasta}
          onChange={(e) =>
            e.target.value && onChange({ ...rango, desde: e.target.value })
          }
          className="h-9 w-40"
        />
      </label>
      <label className="space-y-1">
        <span className="block text-[10px] text-zinc-400 font-bold uppercase">
          {t("hasta")}
        </span>
        <Input
          type="date"
          value={rango.hasta}
          min={rango.desde}
          max={hoy}
          onChange={(e) =>
            e.target.value && onChange({ ...rango, hasta: e.target.value })
          }
          className="h-9 w-40"
        />
      </label>
      {!esRangoMesActual(rango) && (
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => onChange(rangoMesActual())}
        >
          {t("mes_actual")}
        </Button>
      )}
    </div>
  );
}
