"use client";

import { CheckCircle2, ChevronDown, ListChecks } from "lucide-react";
import { SEV_UI, numero, type ChequeoResumen } from "./formato";
import { TablaFilas } from "./TablaFilas";

export function ChipSeveridad({ severidad }: { severidad: ChequeoResumen["severidad"] }) {
  const ui = SEV_UI[severidad];
  const Icono = ui.icono;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ui.chip}`}>
      <Icono size={11} /> {ui.label}
    </span>
  );
}

export function TarjetaChequeo({
  c, abierta, onToggle, sede, version, areaNombre,
}: { c: ChequeoResumen; abierta: boolean; onToggle: () => void; sede: string; version: number; areaNombre: string }) {
  const ui = SEV_UI[c.severidad];
  const sedes = Object.entries(c.porSede).filter(([k]) => k !== "Compartido");

  return (
    <div id={`chequeo-${c.id}`} className={`rounded-2xl border border-slate-200 border-l-4 ${ui.borde} bg-white shadow-sm`}>
      <button onClick={onToggle} aria-expanded={abierta} className="w-full text-left px-4 py-4 sm:px-5 flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <ChipSeveridad severidad={c.severidad} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{areaNombre}</span>
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 leading-snug">{c.titulo}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{c.descripcion}</p>
          {sedes.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {sedes.map(([s, n]) => (
                <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{s}: {numero(n)}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className={`text-2xl font-black tabular-nums ${ui.texto}`}>{numero(c.total)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{c.agrupado ? "grupos" : "a corregir"}</p>
          </div>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`} />
        </div>
      </button>

      {abierta && (
        <div className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5 space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`rounded-xl ${ui.fondo} p-4`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${ui.texto}`}>Por qué importa</p>
              <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{c.porQue}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><ListChecks size={14} /> Cómo corregirlo en Odoo</p>
              <ol className="mt-2 space-y-1.5 text-sm text-slate-700">
                {c.pasos.map((p, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{i + 1}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <TablaFilas chequeoId={c.id} sede={sede} version={version} />
        </div>
      )}
    </div>
  );
}

export function TarjetaLimpia({ c, areaNombre }: { c: ChequeoResumen; areaNombre: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{c.titulo}</p>
        <p className="text-xs text-slate-500">{areaNombre} · sin hallazgos</p>
      </div>
    </div>
  );
}
