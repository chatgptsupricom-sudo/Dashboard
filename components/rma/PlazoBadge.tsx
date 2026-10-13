"use client";

import { PLAZOS, type Nivel, type Plazo } from "@/lib/rma/plazos";
import { AlarmClock, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

/** Colores del semáforo de plazos (lib/rma/plazos.ts). */
export const colorNivel: Record<Nivel, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  aviso: "bg-amber-50 text-amber-800 border-amber-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};

export const IconoNivel = ({ nivel, className }: { nivel: Nivel; className?: string }) => {
  const Icono = nivel === "vencido" ? AlarmClock : nivel === "aviso" ? Clock : CheckCircle2;
  return <Icono className={className} />;
};

/** Fecha y hora en Caracas, corta: "mié 15 oct, 3:00 p. m.". */
export function fechaPlazo(iso: string, locale: string, conHora = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale === "en" ? "en-US" : "es-VE", {
    timeZone: "America/Caracas",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(conHora ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/** Lo que más importa del plazo del caso, en una línea. */
export function usePlazoTexto() {
  const t = useTranslations("rma");
  return (p: Plazo): string => {
    if (p.porLlegar) return t("plazo_esperando", { dias: p.porLlegar.dias });
    // En diagnóstico, las horas; salvo que lo que apremie sea el día en el taller.
    if (p.diagnostico && p.diagnostico.nivel === p.nivel) {
      return t("plazo_diagnostico", { horas: p.diagnostico.horas, limite: PLAZOS.diagnostico.limite });
    }
    if (p.taller) return t("plazo_dia_taller", { dia: p.taller.dia, limite: PLAZOS.taller.limite });
    return "";
  };
}

/** Semáforo de plazo para las listas de casos. */
export function PlazoBadge({ plazo }: { plazo: Plazo | null | undefined }) {
  const texto = usePlazoTexto();
  if (!plazo) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${colorNivel[plazo.nivel]}`}
    >
      <IconoNivel nivel={plazo.nivel} className="w-3 h-3" />
      {texto(plazo)}
    </span>
  );
}
