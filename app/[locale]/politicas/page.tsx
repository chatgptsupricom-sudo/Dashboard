"use client";

import type { Politica } from "@/lib/politicas/datos";
import {
  pendienteDeLeer,
  puedeEditarPoliticas,
  SEDES_POLITICA,
  situacionPolitica,
  TIPOS_POLITICA,
  type TipoPolitica,
} from "@/lib/politicas/permisos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ChevronRight, Loader2, Paperclip, Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/** Sin acentos ni mayúsculas, para que "politica" encuentre "Política". */
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function PoliticasPage() {
  const { locale } = useParams<{ locale: string }>();
  const { user } = useAuthStore();
  const puedeEditar = puedeEditarPoliticas(user?.role);
  const [politicas, setPoliticas] = useState<Politica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState<TipoPolitica | "">("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  useEffect(() => {
    fetch("/api/politicas")
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => setPoliticas(j.politicas || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const pendientes = politicas.filter(pendienteDeLeer).length;

  // Agrupadas por categoría; la búsqueda mira también el texto completo.
  const grupos = useMemo(() => {
    const q = norm(busqueda.trim());
    const mapa = new Map<string, Politica[]>();
    for (const p of politicas) {
      if (tipo && p.tipo !== tipo) continue;
      if (soloPendientes && !pendienteDeLeer(p)) continue;
      if (q && !norm([p.titulo, p.categoria, p.resumen, p.contenido, p.responsable].join(" ")).includes(q)) continue;
      const cat = p.categoria || "General";
      mapa.set(cat, [...(mapa.get(cat) || []), p]);
    }
    return [...mapa.entries()];
  }, [politicas, busqueda, tipo, soloPendientes]);

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      activo ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <ScrollText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Políticas y Acuerdos</h1>
            <p className="text-sm text-slate-500">Reglas, acuerdos y formatos de la empresa para consultar cuando haya dudas</p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en títulos y en el texto…"
            aria-label="Buscar políticas"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-72"
          />
          {puedeEditar && (
            <Link
              href={`/${locale}/politicas/nuevo`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Nueva
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTipo("")} className={chip(!tipo)}>
          Todo
        </button>
        {(Object.keys(TIPOS_POLITICA) as TipoPolitica[]).map((t) => (
          <button key={t} onClick={() => setTipo(t)} className={chip(tipo === t)}>
            {TIPOS_POLITICA[t]}
          </button>
        ))}
        {pendientes > 0 && (
          <button onClick={() => setSoloPendientes((v) => !v)} className={chip(soloPendientes)}>
            Pendientes de leer ({pendientes})
          </button>
        )}
      </div>

      {cargando && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!cargando && !error && grupos.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          {politicas.length ? "Nada coincide con la búsqueda." : "Todavía no hay políticas publicadas."}
        </p>
      )}

      {grupos.map(([categoria, lista]) => (
        <section key={categoria} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{categoria}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((p) => {
              const s = situacionPolitica(p);
              return (
                <Link
                  key={p.id}
                  href={`/${locale}/politicas/${p.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{TIPOS_POLITICA[p.tipo]}</span>
                      <span>v{p.version}</span>
                      {p.sede !== 0 && <span>{SEDES_POLITICA[p.sede]}</span>}
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${s.clase}`}>{s.texto}</span>
                      {pendienteDeLeer(p) && (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-700">Por leer</span>
                      )}
                      {p.adjuntos.length > 0 && <Paperclip className="h-3.5 w-3.5" aria-label="Tiene adjuntos" />}
                    </div>
                    <p className="mt-1 font-bold text-slate-900">{p.titulo}</p>
                    {p.resumen && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.resumen}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
