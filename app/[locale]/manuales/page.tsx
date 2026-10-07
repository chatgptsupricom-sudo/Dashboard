"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { BookOpen, ChevronRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Resumen = {
  id: number;
  codigo: string;
  titulo: string;
  area: string;
  version: string;
  publicado: boolean;
  updatedAt: string | null;
};

export default function ManualesPage() {
  const { locale } = useParams<{ locale: string }>();
  const { user } = useAuthStore();
  const esSuper = String(user?.role || "").toLowerCase().trim() === "superadmin";
  const [manuales, setManuales] = useState<Resumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch("/api/manuales")
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => setManuales(j.manuales || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  // Agrupados por área, filtrados por la búsqueda.
  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<string, Resumen[]>();
    for (const m of manuales) {
      if (q && ![m.titulo, m.codigo, m.area].some((t) => t.toLowerCase().includes(q))) continue;
      const area = m.area || "General";
      mapa.set(area, [...(mapa.get(area) || []), m]);
    }
    return [...mapa.entries()];
  }, [manuales, busqueda]);

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Manuales</h1>
            <p className="text-sm text-slate-500">Procedimientos paso a paso de cada proceso</p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar manual…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-64"
          />
          {esSuper && (
            <Link
              href={`/${locale}/manuales/nuevo`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Nuevo manual
            </Link>
          )}
        </div>
      </div>

      {cargando && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!cargando && !error && grupos.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          {manuales.length ? "Ningún manual coincide con la búsqueda." : "Todavía no hay manuales para tu rol."}
        </p>
      )}

      {grupos.map(([area, lista]) => (
        <section key={area} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{area}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((m) => (
              <Link
                key={m.id}
                href={`/${locale}/manuales/${m.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {m.codigo && <span className="font-mono">{m.codigo}</span>}
                    <span>v{m.version}</span>
                    {!m.publicado && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Borrador</span>
                    )}
                  </div>
                  <p className="mt-1 font-bold text-slate-900">{m.titulo}</p>
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
