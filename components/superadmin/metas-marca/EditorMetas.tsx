"use client";

import { useMemo, useState } from "react";
import { Copy, Loader2, Plus, Save, Search, Sparkles, Undo2 } from "lucide-react";
import { dinero, nombreMes, porcentaje, type DatosMetas } from "./formato";

interface Fila {
  clave: string;
  marca: string;
  meta: number | null;
  promedio3m: number;
  mesAnterior: number;
  vendido: number;
  generica: boolean;
}

/**
 * Carga de metas por marca de una sede y mes. Los cambios se acumulan y se
 * guardan juntos; "Sugerir" rellena las marcas vacías con el promedio de los
 * 3 meses anteriores más un % de crecimiento, para revisar antes de guardar.
 */
export function EditorMetas({ data, companyId, onGuardado }: { data: DatosMetas; companyId: number | null; onGuardado: () => void }) {
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const [agregadas, setAgregadas] = useState<{ clave: string; marca: string }[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [buscaCatalogo, setBuscaCatalogo] = useState("");
  const [crecimiento, setCrecimiento] = useState("10");
  const [guardando, setGuardando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const filas: Fila[] = useMemo(() => {
    const porClave = new Map<string, Fila>();
    for (const m of data.marcas) {
      if (m.meta == null && m.vendido === 0 && m.promedio3m === 0) continue;
      porClave.set(m.clave, {
        clave: m.clave, marca: m.marca, meta: m.meta, promedio3m: m.promedio3m,
        mesAnterior: m.historial[m.historial.length - 1] ?? 0, vendido: m.vendido, generica: m.generica,
      });
    }
    for (const a of agregadas) {
      if (!porClave.has(a.clave)) porClave.set(a.clave, { ...a, meta: null, promedio3m: 0, mesAnterior: 0, vendido: 0, generica: false });
    }
    return [...porClave.values()].sort((a, b) => (b.meta ?? 0) - (a.meta ?? 0) || b.promedio3m - a.promedio3m);
  }, [data.marcas, agregadas]);

  if (!data.editable || companyId == null) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="font-semibold text-slate-700">Elige una sede para asignar metas</p>
        <p className="text-sm text-slate-500">Las metas son por sede. En la vista de todas las sedes se suman y solo se pueden consultar.</p>
      </div>
    );
  }

  const valorDe = (f: Fila) => (cambios[f.clave] ?? (f.meta != null ? String(f.meta) : ""));
  const numero = (s: string) => {
    const n = parseFloat(String(s).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const pendientes = filas.filter((f) => cambios[f.clave] !== undefined && numero(cambios[f.clave]) !== (f.meta ?? 0));
  const totalMeta = filas.reduce((s, f) => s + numero(valorDe(f)), 0);

  const q = busqueda.trim().toLowerCase();
  const visibles = filas.filter((f) => (!q || f.marca.toLowerCase().includes(q)) && (mostrarTodas || !f.generica || f.meta != null));
  const enTabla = new Set(filas.map((f) => f.clave));
  const qc = buscaCatalogo.trim().toLowerCase();
  const catalogo = qc ? data.catalogo.filter((c) => !enTabla.has(c.clave) && c.marca.toLowerCase().includes(qc)).slice(0, 8) : [];

  const sugerir = () => {
    const factor = 1 + (parseFloat(crecimiento) || 0) / 100;
    const nuevos: Record<string, string> = { ...cambios };
    for (const f of visibles) {
      if (f.generica || numero(valorDe(f)) > 0 || f.promedio3m <= 0) continue;
      nuevos[f.clave] = String(Math.round((f.promedio3m * factor) / 100) * 100);
    }
    setCambios(nuevos);
  };

  const guardar = async () => {
    if (!pendientes.length) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/superadmin/metas-marca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "guardar", company_id: companyId, mes: data.mes,
          metas: pendientes.map((f) => ({ marca: f.marca, meta: numero(cambios[f.clave]) })),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      setMensaje({ tipo: "ok", texto: `${j.guardadas} metas guardadas.` });
      setCambios({});
      setAgregadas([]);
      onGuardado();
    } catch (e: any) {
      setMensaje({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const copiar = async () => {
    setCopiando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/superadmin/metas-marca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "copiar", company_id: companyId, mes: data.mes }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "No se pudo copiar");
      setMensaje({ tipo: "ok", texto: j.copiadas ? `${j.copiadas} metas copiadas del mes anterior.` : "Todas las marcas del mes anterior ya tenían meta." });
      onGuardado();
    } catch (e: any) {
      setMensaje({ tipo: "error", texto: e.message });
    } finally {
      setCopiando(false);
    }
  };

  const mesAnt = data.historialMeses[data.historialMeses.length - 1];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Sugerir metas</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Promedio 3 meses +</span>
              <input
                type="number"
                value={crecimiento}
                onChange={(e) => setCrecimiento(e.target.value)}
                className="w-16 h-9 text-right text-sm border border-slate-200 rounded-lg px-2 outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <span className="text-sm text-slate-600">%</span>
              <button onClick={sugerir} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Sparkles size={14} /> Rellenar vacías
              </button>
            </div>
          </div>
          {data.metasMesAnterior > 0 && (
            <button onClick={copiar} disabled={copiando} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {copiando ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Copiar metas de {nombreMes(mesAnt)} ({data.metasMesAnterior})
            </button>
          )}
        </div>
        <div className="relative w-full max-w-xs">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Agregar marca de Odoo</p>
          <Plus size={14} className="absolute left-3 bottom-2.5 text-slate-400" />
          <input
            value={buscaCatalogo}
            onChange={(e) => setBuscaCatalogo(e.target.value)}
            placeholder="Marca sin venta reciente…"
            className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {catalogo.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1">
              {catalogo.map((c) => (
                <button
                  key={c.clave}
                  onClick={() => { setAgregadas((xs) => [...xs, c]); setBuscaCatalogo(""); }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  {c.marca}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {mensaje && (
        <div className={`rounded-xl px-4 py-2.5 text-sm border ${mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <p className="text-sm text-slate-600">
            <b className="text-slate-900">{nombreMes(data.mes)}</b> · {data.sedes[0]?.nombre} · Meta total: <b className="text-slate-900 tabular-nums">{dinero(totalMeta)}</b>
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={mostrarTodas} onChange={(e) => setMostrarTodas(e.target.checked)} className="rounded border-slate-300" />
              Incluir marcas genéricas / sin marca
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar marca…"
                className="h-8 w-48 pl-8 pr-3 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left">Marca</th>
                <th className="px-3 py-2.5 text-right">Prom. 3 meses</th>
                <th className="px-3 py-2.5 text-right">{mesAnt ? nombreMes(mesAnt, true) : "Mes anterior"}</th>
                <th className="px-3 py-2.5 text-right">Vendido este mes</th>
                <th className="px-3 py-2.5 text-right">Meta del mes</th>
                <th className="px-3 py-2.5 text-right">vs promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((f) => {
                const v = valorDe(f);
                const n = numero(v);
                const cambiado = cambios[f.clave] !== undefined && n !== (f.meta ?? 0);
                const vsProm = n > 0 && f.promedio3m > 0 ? ((n - f.promedio3m) / f.promedio3m) * 100 : null;
                return (
                  <tr key={f.clave} className={cambiado ? "bg-amber-50/40" : undefined}>
                    <td className="px-3 py-2 font-medium text-slate-800">{f.marca}{f.generica && <span className="ml-2 text-[11px] text-slate-400">genérica</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{dinero(f.promedio3m)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{dinero(f.mesAnterior)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{dinero(f.vendido)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={v}
                          placeholder="0"
                          onChange={(e) => setCambios((x) => ({ ...x, [f.clave]: e.target.value }))}
                          className={`w-32 text-right text-sm tabular-nums border rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/30 ${cambiado ? "border-amber-400 bg-white" : "border-slate-200 bg-slate-50"}`}
                        />
                      </div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs ${vsProm == null ? "text-slate-300" : vsProm >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {vsProm == null ? "–" : `${vsProm >= 0 ? "+" : ""}${porcentaje(vsProm)}`}
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">No hay marcas con venta en los últimos meses.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400">
          Montos en dólares sin IVA. Deja la meta vacía o en 0 para quitarla. Estas metas son propias de esta sección: no cambian el KPI Cobertura de marcas del Stoplight.
        </p>
      </div>

      {pendientes.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-xl">
          <span className="text-sm">{pendientes.length} {pendientes.length === 1 ? "cambio" : "cambios"} sin guardar · meta total {dinero(totalMeta)}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => { setCambios({}); setAgregadas([]); }} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold text-slate-300 hover:text-white">
              <Undo2 size={14} /> Descartar
            </button>
            <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 text-sm font-bold hover:bg-blue-500 disabled:opacity-60">
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar metas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
