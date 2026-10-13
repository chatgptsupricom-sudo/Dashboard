"use client";

import { PLAZOS, type Nivel, type Plazo } from "@/lib/rma/plazos";
import { colorNivel, fechaPlazo, IconoNivel } from "@/components/rma/PlazoBadge";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const barra: Record<Nivel, string> = {
  ok: "bg-emerald-500",
  aviso: "bg-amber-500",
  vencido: "bg-red-500",
};

function Tramo({
  titulo,
  nivel,
  valor,
  limite,
  detalle,
  pie,
}: {
  titulo: string;
  nivel: Nivel;
  valor: number;
  limite: number;
  detalle: string;
  pie: string;
}) {
  const t = useTranslations("rma");
  const pct = Math.min(100, Math.round((valor / limite) * 100));
  return (
    <div className={`flex-1 min-w-[220px] rounded-2xl border p-4 ${colorNivel[nivel]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider">{titulo}</p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold">
          <IconoNivel nivel={nivel} className="w-3.5 h-3.5" />
          {t(`plazo_nivel_${nivel}`)}
        </span>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{detalle}</p>
      <div className="mt-2 h-1.5 rounded-full bg-white/70">
        <div className={`h-1.5 rounded-full ${barra[nivel]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs opacity-80">{pie}</p>
    </div>
  );
}

/**
 * Plazos del caso en su detalle: diagnóstico (48 h hábiles) y días hábiles en
 * las instalaciones (sale antes del 7.º), o cuánto lleva esperando el equipo.
 * `version` cambia cuando cambia el estado, para volver a pedirlos.
 */
export function PlazoCaso({ caseId, version }: { caseId: number; version: string }) {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const [plazo, setPlazo] = useState<Plazo | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/rma/plazos?id=${caseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vigente) setPlazo(j?.casos?.[0]?.plazo ?? null);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [caseId, version]);

  if (!plazo) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {plazo.porLlegar && (
        <Tramo
          titulo={t("plazo_titulo_por_llegar")}
          nivel={plazo.porLlegar.nivel}
          valor={plazo.porLlegar.dias}
          limite={PLAZOS.porLlegar.limite}
          detalle={t("plazo_esperando", { dias: plazo.porLlegar.dias })}
          pie={t("plazo_por_llegar_pie", { fecha: fechaPlazo(plazo.porLlegar.desde, locale, false), limite: PLAZOS.porLlegar.limite })}
        />
      )}
      {plazo.diagnostico && (
        <Tramo
          titulo={t("plazo_titulo_diagnostico")}
          nivel={plazo.diagnostico.nivel}
          valor={plazo.diagnostico.horas}
          limite={PLAZOS.diagnostico.limite}
          detalle={t("plazo_diagnostico", { horas: plazo.diagnostico.horas, limite: PLAZOS.diagnostico.limite })}
          pie={t("plazo_diagnostico_vence", { fecha: fechaPlazo(plazo.diagnostico.vence, locale) })}
        />
      )}
      {plazo.taller && (
        <Tramo
          titulo={t("plazo_titulo_taller")}
          nivel={plazo.taller.nivel}
          valor={plazo.taller.dia}
          limite={PLAZOS.taller.limite}
          detalle={t("plazo_dia_taller", { dia: plazo.taller.dia, limite: PLAZOS.taller.limite })}
          pie={t("plazo_sale_antes", {
            desde: fechaPlazo(plazo.taller.desde, locale, false),
            fecha: fechaPlazo(plazo.taller.saleAntesDe, locale, false),
          })}
        />
      )}
    </div>
  );
}
