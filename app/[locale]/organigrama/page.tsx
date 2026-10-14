"use client";

import { Organigrama } from "@/components/organigrama/Organigrama";
import { PanelCargo } from "@/components/organigrama/PanelCargo";
import { ETIQUETA_FRECUENCIA, cadenaDeMando, hijosPorPadre, type Nodo } from "@/lib/organigrama/tipos";
import { Download, Loader2, Maximize2, Minus, Network, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;

export default function OrganigramaPage() {
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<{ id: number; tab?: "actividades" | "datos" } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [zoom, setZoom] = useState(1);
  const [creando, setCreando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const ajustado = useRef(false);

  const recargar = useCallback(async () => {
    const r = await fetch("/api/organigrama");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "No se pudo cargar el organigrama");
    setNodos(j.nodos || []);
  }, []);

  useEffect(() => {
    recargar()
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [recargar]);

  /** Zoom para que el organigrama entero quepa a lo ancho. */
  const ajustar = useCallback(() => {
    const c = contenedor.current;
    const l = lienzo.current;
    if (!c || !l) return;
    const natural = l.getBoundingClientRect().width / zoom;
    if (!natural) return;
    setZoom(Math.max(ZOOM_MIN, Math.min(1, (c.clientWidth - 8) / natural)));
  }, [zoom]);

  // La primera vez que hay organigrama, se ajusta al ancho de la pantalla.
  useLayoutEffect(() => {
    if (!ajustado.current && nodos.length) {
      ajustado.current = true;
      ajustar();
    }
  }, [nodos, ajustar]);

  const crear = async (body: Record<string, unknown>, tab: "actividades" | "datos" = "datos") => {
    setCreando(true);
    setError(null);
    try {
      const r = await fetch("/api/organigrama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo crear");
      await recargar();
      if (j.id) setSeleccion({ id: j.id, tab });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  };

  /** Todas las actividades en un CSV (abre en Excel), en el orden del organigrama. */
  const exportar = () => {
    const mapa = hijosPorPadre(nodos);
    const filas: string[][] = [["Área", "Cargo", "Reporta a", "Personas", "Propósito", "N.º", "Actividad", "Frecuencia", "Detalle"]];
    const recorrer = (padre: number | null) => {
      for (const n of mapa.get(padre) || []) {
        const sup = cadenaDeMando(nodos, n.id).at(-2)?.cargo || "";
        const base = [n.area, n.cargo, sup, n.personas.join(", "), n.proposito];
        if (!n.actividades.length) filas.push([...base, "", "", "", ""]);
        n.actividades.forEach((a, i) =>
          filas.push([...base, String(i + 1), a.texto, ETIQUETA_FRECUENCIA[a.frecuencia] || "", a.detalle]),
        );
        recorrer(n.id);
      }
    };
    recorrer(null);
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `organigrama-actividades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nodoSeleccionado = seleccion ? nodos.find((n) => n.id === seleccion.id) || null : null;
  const conActividades = nodos.filter((n) => n.actividades.length).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1e3a5f]">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Organigrama</h1>
            <p className="text-sm text-slate-500">
              Haz clic en un cargo para anotar sus actividades o cambiar su lugar
              {nodos.length > 0 && (
                <span className="text-slate-400">
                  {" "}
                  · {conActividades} de {nodos.length} cargos con actividades
                </span>
              )}
            </p>
          </div>
        </div>
        {nodos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cargo o persona…"
                className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
              />
            </div>
            <div className="flex items-center rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)))}
                className="p-2 text-slate-600 hover:text-slate-900"
                title="Alejar"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="w-12 text-center text-xs font-semibold text-slate-600"
                title="Tamaño real"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)))}
                className="p-2 text-slate-600 hover:text-slate-900"
                title="Acercar"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={ajustar} className="border-l border-slate-200 p-2 text-slate-600 hover:text-slate-900" title="Ajustar al ancho">
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={exportar}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300"
              title="Descargar todas las actividades (Excel/CSV)"
            >
              <Download className="h-4 w-4" /> Actividades
            </button>
            <button
              onClick={() => crear({ parentId: null, cargo: "Nuevo cargo", tipo: "direccion", disposicion: "fila" })}
              disabled={creando}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              title="Un cargo que no reporta a nadie (ej. Junta Directiva). Para ponerlo encima del Gerente General, en el panel de este usa «Agregar superior»."
            >
              <Plus className="h-4 w-4" /> Cargo sin superior
            </button>
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {cargando && <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />}

      {!cargando && !error && nodos.length === 0 && (
        <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Network className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-bold text-slate-800">El organigrama está vacío</h2>
          <p className="mt-1 text-sm text-slate-500">
            Puedes cargar el organigrama actual de SUPRICOM (octubre 2026) y ajustarlo, o empezar desde cero.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => crear({ inicial: true })}
              disabled={creando}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creando && <Loader2 className="h-4 w-4 animate-spin" />}
              Cargar organigrama actual
            </button>
            <button
              onClick={() =>
                crear({ parentId: null, area: "Gerencia General", cargo: "Gerente General", tipo: "direccion", disposicion: "fila" })
              }
              disabled={creando}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50"
            >
              Empezar en blanco
            </button>
          </div>
        </div>
      )}

      {nodos.length > 0 && (
        <div
          ref={contenedor}
          className="min-h-[60vh] flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50/70"
        >
          <div ref={lienzo} style={{ zoom }} className="w-max min-w-full">
            <Organigrama
              nodos={nodos}
              seleccionado={seleccion?.id ?? null}
              busqueda={busqueda}
              onSeleccionar={(id) => setSeleccion({ id })}
              onAgregarSubordinado={(padre) => crear({ parentId: padre, cargo: "Nuevo cargo" })}
            />
          </div>
        </div>
      )}

      <PanelCargo
        nodo={nodoSeleccionado}
        nodos={nodos}
        tabInicial={seleccion?.tab}
        onCerrar={() => setSeleccion(null)}
        onSeleccionar={(id, tab) => setSeleccion({ id, tab })}
        onRecargar={recargar}
      />
    </div>
  );
}
