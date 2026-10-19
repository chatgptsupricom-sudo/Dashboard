"use client";

/**
 * Calidad de datos de Odoo (SuperAdmin > Auditoría): todo lo que está mal
 * cargado, a medias o desordenado en Odoo, con el paso a paso para
 * corregirlo y el enlace a cada registro. Pensado para el auditor.
 *
 * El panel SOLO LEE: no cambia nada en Odoo. Datos: /api/superadmin/calidad-odoo.
 * Lógica de los chequeos en lib/calidad-odoo/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Eye, Loader2, MapPin, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { Chequeo } from "@/lib/calidad-odoo/tipos";
import { SEDES, SEV_UI, haceCuanto, numero, type Area, type DatosResumen, type Severidad } from "./formato";
import { TarjetaChequeo, TarjetaLimpia } from "./TarjetaChequeo";
import { exportarTodo } from "./excel";

const SEVERIDADES: Severidad[] = ["error", "atencion", "mejora"];

export function CalidadOdoo() {
  const [sede, setSede] = useState("todas");
  const [data, setData] = useState<DatosResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const forzar = useRef(false);
  const [exportando, setExportando] = useState(false);
  const [area, setArea] = useState<Area | "todas">("todas");
  const [severidad, setSeveridad] = useState<Severidad | "todas">("todas");
  const [busca, setBusca] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const refrescar = forzar.current;
    forzar.current = false;
    fetch(`/api/superadmin/calidad-odoo?company_id=${sede}${refrescar ? "&refrescar=1" : ""}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setData(j.data);
        else setError(j?.error || "No se pudo leer Odoo");
      })
      .catch(() => { if (!cancelado) setError("No se pudo leer Odoo"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [sede, recarga]);

  const recargar = useCallback(() => { forzar.current = true; setRecarga((n) => n + 1); }, []);

  const nombreArea = useCallback((id: Area) => data?.areas.find((a) => a.id === id)?.nombre ?? id, [data]);

  const visibles = useMemo(() => {
    if (!data) return { con: [], sin: [] };
    const q = busca.trim().toLowerCase();
    const lista = data.chequeos.filter((c) =>
      (area === "todas" || c.area === area) &&
      (severidad === "todas" || c.severidad === severidad) &&
      (!q || `${c.titulo} ${c.descripcion}`.toLowerCase().includes(q)));
    return { con: lista.filter((c) => c.total > 0), sin: lista.filter((c) => c.total === 0) };
  }, [data, area, severidad, busca]);

  const exportar = async () => {
    if (!data) return;
    setExportando(true);
    try {
      const r = await fetch(`/api/superadmin/calidad-odoo?company_id=${sede}&todo=1`);
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error || "Error");
      const nombre = SEDES.find((s) => s.id === sede)?.nombre ?? sede;
      exportarTodo(`calidad-odoo-${nombre}-${new Date().toISOString().slice(0, 10)}`, data.chequeos.filter((c) => c.total > 0), j.data.chequeos as Chequeo[]);
    } catch {
      setError("No se pudo generar el Excel");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl"><ShieldCheck className="text-blue-600" size={24} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Calidad de datos de Odoo</h1>
            <p className="text-sm text-slate-500">Qué está mal cargado o a medias en Odoo y cómo corregirlo, registro por registro</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-white border rounded-xl p-1.5 flex items-center gap-1 shadow-sm">
            <MapPin size={16} className="text-slate-400 ml-2" />
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              aria-label="Sede"
              className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer outline-none pr-2"
            >
              {SEDES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <button onClick={recargar} disabled={cargando} className="h-10 w-10 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Volver a leer Odoo" title="Volver a leer Odoo">
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportar}
            disabled={!data || cargando || exportando}
            className="flex items-center gap-2 px-4 h-10 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Excel
          </button>
        </div>
      </div>

      {/* Solo lectura */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
        <Eye size={18} className="mt-0.5 shrink-0 text-blue-600" />
        <p>
          <b>Este panel solo lee Odoo: no cambia nada.</b> Cada revisión explica qué pasa, por qué importa y cómo corregirlo; el botón
          «Abrir en Odoo» lleva al registro para hacer la corrección allá. Al volver a leer (<RefreshCw size={12} className="inline -mt-0.5" />), lo corregido desaparece de la lista.
          {data && <span className="text-slate-500"> Leído {haceCuanto(data.generado)}.</span>}
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
          <button onClick={() => setRecarga((n) => n + 1)} className="font-semibold underline">Reintentar</button>
        </div>
      )}

      {cargando && !data ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Revisando contactos, productos, precios y documentos en Odoo… (tarda unos segundos)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : data ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          {/* Resumen por prioridad */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SEVERIDADES.map((s) => {
              const ui = SEV_UI[s];
              const Icono = ui.icono;
              const t = data.totales[s];
              const activa = severidad === s;
              return (
                <button
                  key={s}
                  onClick={() => setSeveridad(activa ? "todas" : s)}
                  aria-pressed={activa}
                  className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition ${activa ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${ui.texto}`}><Icono size={14} /> {ui.plural}</span>
                    <span className="text-[11px] text-slate-400">{t.chequeos} revisiones</span>
                  </div>
                  <p className={`mt-2 text-3xl font-black tabular-nums ${ui.texto}`}>{numero(t.registros)}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-snug">{ui.ayuda}</p>
                </button>
              );
            })}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setArea("todas")}
              className={`h-8 px-3 rounded-lg text-xs font-bold transition ${area === "todas" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              Todo
            </button>
            {data.areas.map((a) => (
              <button
                key={a.id}
                onClick={() => setArea(area === a.id ? "todas" : a.id)}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 ${area === a.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {a.nombre}
                <span className={`rounded px-1.5 py-px text-[10px] tabular-nums ${area === a.id ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{numero(a.hallazgos)}</span>
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-9 w-full sm:w-64">
              <Search size={14} className="text-slate-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar revisión…" className="w-full bg-transparent text-sm outline-none" />
            </label>
          </div>

          {/* Revisiones con hallazgos */}
          <div className="space-y-3">
            {visibles.con.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No hay hallazgos con estos filtros.
              </div>
            )}
            {visibles.con.map((c) => (
              <TarjetaChequeo
                key={c.id}
                c={c}
                abierta={abierta === c.id}
                onToggle={() => setAbierta(abierta === c.id ? null : c.id)}
                sede={sede}
                version={recarga}
                areaNombre={nombreArea(c.area)}
              />
            ))}
          </div>

          {visibles.sin.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Revisado y en orden ({visibles.sin.length})</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {visibles.sin.map((c) => <TarjetaLimpia key={c.id} c={c} areaNombre={nombreArea(c.area)} />)}
              </div>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-400">
            Se revisan las 3 sedes (Valencia, Caracas y Panamá); marcas, categorías y etiquetas son compartidas y salen en todas. Los precios se comparan
            con la lista de precios principal de cada sede y el costo de esa sede. Las facturas se revisan desde abril 2026, cuando se empezó a facturar en Odoo.
            Revisados {data.totales.revisados} puntos; {data.totales.limpios} sin hallazgos.
          </p>
        </div>
      ) : null}
    </div>
  );
}
