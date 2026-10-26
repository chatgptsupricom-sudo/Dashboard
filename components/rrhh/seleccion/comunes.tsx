"use client";

import type { Tono } from "@/lib/seleccion/tipos";
import { useEffect, useState } from "react";

export const TONO: Record<Tono, string> = {
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rojo: "bg-red-50 text-red-700 border-red-200",
  ambar: "bg-amber-50 text-amber-800 border-amber-200",
  azul: "bg-blue-50 text-blue-700 border-blue-200",
  gris: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Puntos del semáforo de tiempos, siempre con su texto al lado (no solo color). */
export const PUNTO: Record<Tono, string> = {
  verde: "bg-emerald-500",
  rojo: "bg-red-500",
  ambar: "bg-amber-500",
  azul: "bg-blue-500",
  gris: "bg-slate-300",
};

export function Pastilla({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONO[tono]}`}>
      {children}
    </span>
  );
}

/** "12 d" con el semáforo contra la meta de la requisición. */
export function Dias({ dias, tono, meta }: { dias: number | null; tono: Tono; meta?: number }) {
  if (dias == null) return <span className="text-slate-400">—</span>;
  const texto = tono === "rojo" ? "fuera de meta" : tono === "ambar" ? "cerca de la meta" : "en meta";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={meta ? `Meta: ${meta} días · ${texto}` : texto}>
      <span className={`h-2 w-2 rounded-full ${PUNTO[tono]}`} />
      <span className="font-semibold tabular-nums text-slate-800">{dias} d</span>
    </span>
  );
}

export function fechaCorta(f: string | null | undefined): string {
  if (!f) return "—";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
}

/** Fecha que se guarda al salir del campo (el input dispara cambios a medio escribir el año). */
export function CampoFecha({
  valor,
  onGuardar,
  className = "",
}: {
  valor: string | null;
  onGuardar: (v: string | null) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(valor ?? "");
  useEffect(() => setLocal(valor ?? ""), [valor]);
  return (
    <input
      type="date"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if ((local || null) !== (valor || null)) onGuardar(local || null);
      }}
      className={`rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 ${className}`}
    />
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
