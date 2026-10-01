"use client";

import { useTranslations } from "next-intl";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

/**
 * Garantía del equipo tal cual quedó congelada en el ticket de RMA al
 * reportarlo (#48): Seguridad no la evalúa, solo la ve. Un equipo que no se
 * compró en Supricom no tiene garantía nuestra ("no aplica").
 */
export function GarantiaBadge({ estado }: { estado: string | null | undefined }) {
  const td = useTranslations("seguridad.ingreso.detail");
  const key = estado || "indeterminada";
  const clase =
    key === "en_garantia"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : key === "vida_util"
        ? "bg-violet-100 text-violet-700 border-violet-200"
        : key === "vencida"
          ? "bg-amber-100 text-amber-800 border-amber-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${clase}`}>
      {td(`warranty_${key}`)}
    </span>
  );
}

/** Tarjeta grande del mostrador: ¿el equipo entra por garantía o no? */
export function GarantiaIngreso({
  estado,
  externo,
  marca,
  meses,
  vence,
}: {
  estado: string | null | undefined;
  externo?: boolean;
  marca?: string | null;
  meses?: number | null;
  vence?: string | null;
}) {
  const tf = useTranslations("seguridad.ingreso.form");
  const td = useTranslations("seguridad.ingreso.detail");
  const key = externo ? "no_aplica" : estado || "indeterminada";
  const enGarantia = key === "en_garantia" || key === "vida_util";

  const estilo = enGarantia
    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
    : key === "vencida" || key === "no_aplica"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-700";
  const Icono = enGarantia ? ShieldCheck : key === "indeterminada" ? ShieldQuestion : ShieldAlert;

  return (
    <div className={`rounded-[10px] border-2 p-4 flex items-start gap-3 ${estilo}`}>
      <Icono className="w-7 h-7 shrink-0" />
      <div className="min-w-0">
        <p className="text-base font-bold">
          {externo
            ? tf("garantia_externo")
            : enGarantia
              ? tf("garantia_si")
              : key === "indeterminada"
                ? tf("garantia_sin_dato")
                : tf("garantia_no")}
        </p>
        {/* Externo: no se compró en Supricom, así que no hay garantía que
            mirar; es un servicio aparte, presupuestado. */}
        {externo ? (
          <p className="text-sm">{tf("garantia_externo_desc")}</p>
        ) : (
        <p className="text-sm">
          {td(`warranty_${key}`)}
          {marca ? ` · ${marca}` : ""}
          {meses ? ` · ${meses} ${tf("garantia_meses")}` : ""}
          {vence ? ` · ${td("garantia_vence")} ${String(vence).slice(0, 10)}` : ""}
        </p>
        )}
      </div>
    </div>
  );
}
