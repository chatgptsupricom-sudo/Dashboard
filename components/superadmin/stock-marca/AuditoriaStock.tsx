"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Control } from "../metas-marca/AuditoriaPanel";
import type { AuditoriaSede, EstadoControl } from "@/lib/metas-marca/auditoria";
import { CONTROL_UI, textoPeriodo } from "./formato";

const ORDEN: EstadoControl[] = ["error", "aviso", "info", "ok"];

/** Auditoría de los datos de Odoo de Stock por marca (lib/stock-marca/auditoria). */
export function AuditoriaStock({ query }: { query: string }) {
  const [datos, setDatos] = useState<AuditoriaSede[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const ultima = useRef("");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    // Otra sede o período: lo anterior no aplica.
    if (ultima.current !== query) { setDatos(null); ultima.current = query; }
    fetch(`/api/superadmin/stock-marca/auditoria?${query}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setDatos(j.data.auditorias);
        else setError(j?.error || "No se pudo auditar");
      })
      .catch(() => { if (!cancelado) setError("No se pudo auditar"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [query, recarga]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={20} /></span>
          <div>
            <p className="font-bold text-slate-800">Auditoría de los datos de Odoo</p>
            <p className="text-sm text-slate-500 max-w-2xl">
              Cada control vuelve a leer Odoo sin caché y de otra forma (sumas en el servidor, el stock histórico nativo de Odoo contra la reconstrucción por movimientos)
              y lo compara con lo que muestra esta sección. También señala datos de Odoo que distorsionan el stock por marca.
            </p>
          </div>
        </div>
        <button onClick={() => setRecarga((n) => n + 1)} disabled={cargando} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Volver a auditar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && !datos && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Auditando contra Odoo (unos 15 segundos por sede)…</p>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      )}

      {datos?.map((a) => (
        <section key={a.companyId} className={`space-y-3 ${cargando ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-slate-900">{a.sede} <span className="text-sm font-normal text-slate-400">{textoPeriodo(a.desde, a.hasta)}</span></h3>
            <div className="flex items-center gap-1.5">
              {ORDEN.map((e) => (
                <span key={e} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${CONTROL_UI[e].chip}`}>
                  {CONTROL_UI[e].label} <b className="tabular-nums">{a.conteo[e]}</b>
                </span>
              ))}
            </div>
          </div>
          {[...a.controles].sort((x, y) => ORDEN.indexOf(x.estado) - ORDEN.indexOf(y.estado)).map((c) => <Control key={c.id} c={c} />)}
          <p className="text-[11px] text-slate-400">Generada {new Date(a.generado).toLocaleString("es-VE")}.</p>
        </section>
      ))}
    </div>
  );
}
