"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { ESTADO_UI, colorPct, dinero, porcentaje, type DatosMetas, type EstadoMarca, type FilaMarca } from "./formato";

type Orden = "meta" | "vendido" | "cumplimiento" | "cumplimientoAlDia" | "proyeccionPct" | "falta" | "participacion" | "marca";

/** Barra de progreso contra la meta, con una marca donde se debería ir hoy. */
export function BarraProgreso({ fila, avance, enCurso }: { fila: FilaMarca; avance: number; enCurso: boolean }) {
  if (fila.meta == null) return <div className="h-2 rounded-full bg-slate-100" />;
  const p = Math.max(0, fila.cumplimiento ?? 0);
  return (
    <div className="relative h-2 rounded-full bg-slate-100" title={`${porcentaje(p, 1)} de la meta${enCurso ? ` · a hoy se esperaba ${porcentaje(avance)}` : ""}`}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${ESTADO_UI[fila.estado].barra}`} style={{ width: `${Math.min(p, 100)}%` }} />
      {enCurso && (
        <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-700/70" style={{ left: `calc(${Math.min(avance, 100)}% - 1px)` }} />
      )}
    </div>
  );
}

export function ChipEstado({ estado }: { estado: EstadoMarca }) {
  const ui = ESTADO_UI[estado];
  const Icono = ui.icono;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ui.chip}`}>
      <Icono size={12} /> {ui.label}
    </span>
  );
}

export function TablaMarcas({ data, filtroEstado, setFiltroEstado, onAbrir }: {
  data: DatosMetas;
  filtroEstado: EstadoMarca | "todas";
  setFiltroEstado: (e: EstadoMarca | "todas") => void;
  onAbrir: (f: FilaMarca) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("meta");
  const [asc, setAsc] = useState(false);
  const enCurso = data.periodo.estado === "en_curso";
  const hayMetas = data.totales.marcasConMeta > 0;
  const [soloConMeta, setSoloConMeta] = useState(true);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let xs = data.marcas.filter((m) => m.meta != null || m.vendido !== 0);
    if (hayMetas && soloConMeta && filtroEstado === "todas") xs = xs.filter((m) => m.meta != null);
    if (filtroEstado !== "todas") xs = xs.filter((m) => m.estado === filtroEstado);
    if (q) xs = xs.filter((m) => m.marca.toLowerCase().includes(q));
    const val = (m: FilaMarca) => (orden === "marca" ? m.marca : (m[orden] as number | null) ?? -Infinity);
    return [...xs].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? c : -c;
    });
  }, [data.marcas, busqueda, orden, asc, filtroEstado, soloConMeta, hayMetas]);

  const th = (key: Orden, label: string, align = "text-right") => (
    <th className={`px-3 py-2.5 ${align} whitespace-nowrap`}>
      <button
        onClick={() => { if (orden === key) setAsc(!asc); else { setOrden(key); setAsc(key === "marca"); } }}
        className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${orden === key ? "text-slate-800" : ""}`}
      >
        {label}
        {orden === key && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  const estados: (EstadoMarca | "todas")[] = ["todas", "cumplida", ...(enCurso ? ["en_ritmo" as const] : []), "atencion", "riesgo", "sin_meta"];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5">
          {estados.map((e) => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${filtroEstado === e ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {e === "todas" ? "Todas" : ESTADO_UI[e].label}
              {e !== "todas" && <span className="ml-1.5 opacity-70 tabular-nums">{data.totales.conteo[e]}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {hayMetas && filtroEstado === "todas" && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={!soloConMeta} onChange={(e) => setSoloConMeta(!e.target.checked)} className="rounded border-slate-300" />
              Ver también marcas sin meta
            </label>
          )}
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
        <table className="w-full text-sm min-w-[1080px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold tracking-wide text-slate-500">
              {th("marca", "Marca", "text-left")}
              {th("meta", "Meta")}
              {th("vendido", "Vendido")}
              <th className="px-3 py-2.5 text-left w-[180px] uppercase">Progreso</th>
              {th("cumplimiento", "% Meta")}
              {enCurso && th("cumplimientoAlDia", "% Al día")}
              {enCurso && th("proyeccionPct", "Proyección")}
              {th("falta", "Falta")}
              {enCurso && <th className="px-3 py-2.5 text-right uppercase whitespace-nowrap">Necesario/día</th>}
              {th("participacion", "% Venta")}
              <th className="px-3 py-2.5 text-left uppercase">Estado</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((m) => (
              <tr key={m.clave} onClick={() => onAbrir(m)} className="cursor-pointer hover:bg-slate-50/80 transition-colors">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-slate-800">{m.marca}</p>
                  <p className="text-[11px] text-slate-400">{m.facturas} facturas · {m.clientes} clientes{m.generica && " · genérica"}</p>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{dinero(m.meta)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{dinero(m.vendido)}</td>
                <td className="px-3 py-2.5"><BarraProgreso fila={m} avance={data.periodo.avance} enCurso={enCurso} /></td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${colorPct(m.cumplimiento)}`}>{porcentaje(m.cumplimiento, 1)}</td>
                {enCurso && <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${colorPct(m.cumplimientoAlDia)}`}>{porcentaje(m.cumplimientoAlDia)}</td>}
                {enCurso && (
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <p className="text-slate-700">{dinero(m.proyeccion)}</p>
                    {m.proyeccionPct != null && <p className={`text-[11px] font-semibold ${colorPct(m.proyeccionPct)}`}>{porcentaje(m.proyeccionPct)}</p>}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{m.falta ? dinero(m.falta) : m.meta != null ? "✓" : "–"}</td>
                {enCurso && <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{dinero(m.ritmoNecesario)}</td>}
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{porcentaje(m.participacion, 1)}</td>
                <td className="px-3 py-2.5"><ChipEstado estado={m.estado} /></td>
                <td className="pr-3 text-slate-300"><ChevronRight size={16} /></td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={12} className="py-12 text-center text-sm text-slate-400">No hay marcas para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {enCurso && hayMetas && (
        <p className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400">
          La línea oscura en la barra marca dónde debería ir cada marca hoy ({porcentaje(data.periodo.avance)} de los días hábiles del mes).
          % Al día = vendido ÷ meta prorrateada a hoy. Proyección = ritmo diario actual × días hábiles del mes.
        </p>
      )}
    </div>
  );
}
