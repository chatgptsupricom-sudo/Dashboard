"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { ALERTAS } from "@/lib/auditoria-nc/analisis";
import { ChipsAlertas } from "./Comunes";
import { SEV_UI, peorSeveridad, type Alerta, type Severidad } from "./formato";

export interface Columna<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (x: T) => React.ReactNode;
  orden?: (x: T) => string | number | null;
}

interface Props<T extends { id: number; numero: string; alertas: Alerta[] }> {
  filas: T[];
  columnas: Columna<T>[];
  buscar: (x: T) => string;
  onAbrir: (x: T) => void;
  /** Filtro inicial por código de alerta (desde el resumen). */
  codigo: string | null;
  setCodigo: (c: string | null) => void;
  vacio: string;
  pie?: React.ReactNode;
}

const ORDEN_SEV: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };

export function TablaDocs<T extends { id: number; numero: string; alertas: Alerta[] }>({ filas, columnas, buscar, onAbrir, codigo, setCodigo, vacio, pie }: Props<T>) {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<Severidad | "todas" | "sin">("todas");
  const [orden, setOrden] = useState<string>("_sev");
  const [asc, setAsc] = useState(true);
  const [limite, setLimite] = useState(200);

  const codigos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) for (const a of f.alertas) m.set(a.codigo, (m.get(a.codigo) || 0) + 1);
    return [...m.entries()].sort((a, b) => ORDEN_SEV[ALERTAS[a[0]]?.severidad ?? "baja"] - ORDEN_SEV[ALERTAS[b[0]]?.severidad ?? "baja"] || b[1] - a[1]);
  }, [filas]);
  const conteoSev = useMemo(() => {
    const c = { alta: 0, media: 0, baja: 0, sin: 0 };
    for (const f of filas) { const p = peorSeveridad(f.alertas); if (p) c[p]++; else c.sin++; }
    return c;
  }, [filas]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    let xs = filas;
    if (codigo) xs = xs.filter((f) => f.alertas.some((a) => a.codigo === codigo));
    if (sev === "sin") xs = xs.filter((f) => !f.alertas.length);
    else if (sev !== "todas") xs = xs.filter((f) => peorSeveridad(f.alertas) === sev);
    if (t) xs = xs.filter((f) => buscar(f).toLowerCase().includes(t));
    const col = columnas.find((c) => c.key === orden);
    const val = (f: T): string | number => {
      if (orden === "_sev") { const p = peorSeveridad(f.alertas); return p ? ORDEN_SEV[p] * 100 - f.alertas.length : 999; }
      return col?.orden?.(f) ?? "";
    };
    return [...xs].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return asc ? c : -c;
    });
  }, [filas, q, sev, codigo, orden, asc, columnas, buscar]);

  const th = (c: Columna<T>) => (
    <th key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
      {c.orden ? (
        <button onClick={() => { if (orden === c.key) setAsc(!asc); else { setOrden(c.key); setAsc(false); } }}
          className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${orden === c.key ? "text-slate-800" : ""}`}>
          {c.label}{orden === c.key && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      ) : <span className="uppercase">{c.label}</span>}
    </th>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["todas", "alta", "media", "baja", "sin"] as const).map((s) => (
            <button key={s} onClick={() => setSev(s)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${sev === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {s === "todas" ? `Todas ${filas.length}` : s === "sin" ? `Sin alertas ${conteoSev.sin}` : `${SEV_UI[s].label} ${conteoSev[s]}`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={codigo ?? ""} onChange={(e) => setCodigo(e.target.value || null)} aria-label="Filtrar por alerta"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Todas las alertas</option>
            {codigos.map(([c, n]) => <option key={c} value={c}>{ALERTAS[c]?.titulo ?? c} ({n})</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, cliente, usuario…"
              className="h-8 w-56 pl-8 pr-3 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold tracking-wide text-slate-500">
              {columnas.map(th)}
              <th className="px-3 py-2.5 text-left">
                <button onClick={() => { setOrden("_sev"); setAsc(orden === "_sev" ? !asc : true); }} className="inline-flex items-center gap-1 uppercase hover:text-slate-800">
                  Alertas{orden === "_sev" && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </button>
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.slice(0, limite).map((f) => {
              const p = peorSeveridad(f.alertas);
              return (
                <tr key={f.id} onClick={() => onAbrir(f)} className="cursor-pointer hover:bg-slate-50/80">
                  {columnas.map((c, i) => (
                    <td key={c.key} className={`px-3 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""} ${i === 0 ? "relative" : ""}`}>
                      {i === 0 && p && <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${SEV_UI[p].punto}`} />}
                      {i === 0 ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(f); }}
                          className="text-left font-semibold text-slate-800 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
                          {c.render(f)}
                        </button>
                      ) : c.render(f)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5"><ChipsAlertas alertas={f.alertas} /></td>
                  <td className="pr-3 text-slate-300"><ChevronRight size={16} /></td>
                </tr>
              );
            })}
            {visibles.length === 0 && <tr><td colSpan={columnas.length + 2} className="py-12 text-center text-sm text-slate-400">{vacio}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">
        <span>
          {visibles.length > limite ? `Mostrando ${limite} de ${visibles.length}. ` : `${visibles.length} documentos. `}
          {pie}
        </span>
        {visibles.length > limite && (
          <button onClick={() => setLimite((l) => l + 300)} className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50">Ver más</button>
        )}
      </div>
    </div>
  );
}
