"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";

/** "" = todos; supricom = vendido por Supricom; externo = no comprado en Supricom. */
export type ProcedenciaFiltro = "" | "supricom" | "externo";

export function leerProcedenciaFiltro(valor: string | null): ProcedenciaFiltro {
  return valor === "supricom" || valor === "externo" ? valor : "";
}

interface Props {
  value: ProcedenciaFiltro;
  onChange: (v: ProcedenciaFiltro) => void;
  /** Cuántos casos hay de cada lado; sin él las pestañas van sin número. */
  conteos?: { supricom: number; externo: number };
}

export function SelectorProcedencia({ value, onChange, conteos }: Props) {
  const t = useTranslations("rma");
  const numero = (n?: number) =>
    n === undefined ? null : (
      <span className="ml-1.5 rounded-full bg-slate-200/70 px-1.5 text-[11px] tabular-nums">{n}</span>
    );

  return (
    <Tabs value={value || "todos"} onValueChange={(v) => onChange(v === "todos" ? "" : leerProcedenciaFiltro(v))}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="supricom" className="px-3 py-1.5">
          {t("procedencia_supricom")}
          {numero(conteos?.supricom)}
        </TabsTrigger>
        <TabsTrigger value="externo" className="px-3 py-1.5">
          {t("procedencia_externo")}
          {numero(conteos?.externo)}
        </TabsTrigger>
        <TabsTrigger value="todos" className="px-3 py-1.5">
          {t("procedencia_todos")}
          {numero(conteos ? conteos.supricom + conteos.externo : undefined)}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
