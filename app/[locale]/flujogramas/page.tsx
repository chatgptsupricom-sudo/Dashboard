"use client";

import { ChevronRight, FileText, Loader2, Plus, Workflow } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Resumen = { id: number; proceso: string; subproceso: string; nPasos: number; meta: { codigo: string; version: string } };

export default function FlujogramasPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const [lista, setLista] = useState<Resumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch("/api/flujogramas")
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => setLista(j.flujogramas || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const crear = async (cuerpo: object) => {
    setCreando(true);
    setError(null);
    try {
      const r = await fetch("/api/flujogramas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo crear");
      router.push(`/${locale}/flujogramas/${j.id}?editar=1`);
    } catch (e: any) {
      setError(e.message);
      setCreando(false);
    }
  };

  // Agrupados por proceso, filtrados por la búsqueda.
  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<string, Resumen[]>();
    for (const f of lista) {
      if (q && ![f.proceso, f.subproceso, f.meta?.codigo || ""].some((t) => t.toLowerCase().includes(q))) continue;
      const k = f.proceso || "Sin proceso";
      mapa.set(k, [...(mapa.get(k) || []), f]);
    }
    return [...mapa.entries()];
  }, [lista, busqueda]);

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <Workflow className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Flujogramas</h1>
            <p className="text-sm text-slate-500">Diagramas de los procesos y subprocesos de la empresa</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar flujograma…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-64"
          />
          <button
            onClick={() => crear({})}
            disabled={creando}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nuevo flujograma
          </button>
        </div>
      </div>

      {cargando && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {!cargando && !error && lista.length === 0 && (
        <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Workflow className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-bold text-slate-800">Todavía no hay flujogramas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Puedes empezar con el de Recursos Humanos (captación, reclutamiento y selección de personal) y usarlo de
            modelo, o crear uno desde cero.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => crear({ ejemplo: true })}
              disabled={creando}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" /> Cargar el de Recursos Humanos
            </button>
            <button
              onClick={() => crear({})}
              disabled={creando}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50"
            >
              Empezar desde cero
            </button>
          </div>
        </div>
      )}

      {!cargando && lista.length > 0 && grupos.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          Ningún flujograma coincide con la búsqueda.
        </p>
      )}

      {grupos.map(([proceso, fs]) => (
        <section key={proceso} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{proceso}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fs.map((f) => (
              <Link
                key={f.id}
                href={`/${locale}/flujogramas/${f.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {f.meta?.codigo && <span className="font-mono">{f.meta.codigo}</span>}
                    {f.meta?.version && <span>v{f.meta.version}</span>}
                    <span>{f.nPasos} pasos</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-900">{f.subproceso || f.proceso}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
