"use client";

import { ExternalLink } from "lucide-react";
import { ESTADO_DOC, SEV_UI, urlOdoo, type Alerta, type Severidad } from "./formato";

export function ChipSeveridad({ severidad, texto }: { severidad: Severidad; texto?: string }) {
  const ui = SEV_UI[severidad];
  const Icono = ui.icono;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ui.chip}`}>
      <Icono size={11} /> {texto ?? ui.label}
    </span>
  );
}

/** Alertas de un documento: las 2 primeras con texto y un contador para el resto. */
export function ChipsAlertas({ alertas, max = 2 }: { alertas: Alerta[]; max?: number }) {
  if (!alertas.length) return <span className="text-xs text-slate-300">Sin alertas</span>;
  const resto = alertas.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {alertas.slice(0, max).map((a, i) => <ChipSeveridad key={i} severidad={a.severidad} texto={a.texto.length > 42 ? `${a.texto.slice(0, 40)}…` : a.texto} />)}
      {resto > 0 && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">+{resto}</span>}
    </div>
  );
}

export function ChipEstado({ estado }: { estado: string }) {
  const ui = ESTADO_DOC[estado] ?? { label: estado || "–", chip: "bg-slate-100 text-slate-600 ring-slate-500/20" };
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ui.chip}`}>{ui.label}</span>;
}

export function LinkOdoo({ id, texto = "Abrir en Odoo" }: { id: number; texto?: string }) {
  return (
    <a href={urlOdoo(id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
      {texto} <ExternalLink size={12} />
    </a>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{texto}</div>;
}
