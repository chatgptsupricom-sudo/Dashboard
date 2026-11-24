"use client";

import { VistaTutorial } from "@/components/manuales/VistaTutorial";
import type { Manual, ResumenManual } from "@/lib/manuales/datos";
import type { TipoManual } from "@/lib/manuales/permisos";
import { BookOpen, ChevronRight, Download, GraduationCap, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Semilla = { codigo: string; titulo: string; tipo: TipoManual; roles: string[]; cargado: boolean };
type Respuesta = { manuales: ResumenManual[]; editor: boolean; roles?: { rol: string; nombre: string }[]; semillas?: Semilla[] };

const ENCABEZADO: Record<TipoManual, { titulo: string; sub: string; vacio: string }> = {
  manual: {
    titulo: "Manual",
    sub: "Los procedimientos de tu rol: qué te toca hacer, cuándo y con qué reglas",
    vacio: "Todavía no hay manuales publicados para tu rol.",
  },
  tutorial: {
    titulo: "Tutorial",
    sub: "Cómo se usa el panel en tu rol, pantalla por pantalla",
    vacio: "Todavía no hay un tutorial publicado para tu rol.",
  },
};

const json = (r: Response) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error"))));

/**
 * Lista de Manuales. Procesos ve todo (borradores incluidos), con filtro por
 * tipo y el contenido base por rol para cargar. Los demás roles ven lo
 * publicado para su rol del `tipo` de la página; si en Tutorial hay uno solo,
 * se abre directo.
 */
export function ListaManuales({ tipo }: { tipo: TipoManual }) {
  const { locale } = useParams<{ locale: string }>();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [unico, setUnico] = useState<Manual | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<TipoManual | "todos">(tipo === "tutorial" ? "tutorial" : "todos");
  const [cargandoSemilla, setCargandoSemilla] = useState<string | null>(null);

  const cargar = () =>
    fetch("/api/manuales")
      .then(json)
      .then(async (j: Respuesta) => {
        setDatos(j);
        const propios = j.manuales.filter((m) => m.tipo === tipo);
        if (!j.editor && tipo === "tutorial" && propios.length === 1) {
          const { manual } = await fetch(`/api/manuales/${propios[0].id}`).then(json);
          setUnico(manual);
        }
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const editor = Boolean(datos?.editor);
  const nombreRol = useMemo(() => new Map((datos?.roles || []).map((r) => [r.rol, r.nombre])), [datos]);

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<string, ResumenManual[]>();
    for (const m of datos?.manuales || []) {
      if (editor ? filtro !== "todos" && m.tipo !== filtro : m.tipo !== tipo) continue;
      if (q && ![m.titulo, m.codigo, m.area].some((t) => t.toLowerCase().includes(q))) continue;
      const area = m.area || "General";
      mapa.set(area, [...(mapa.get(area) || []), m]);
    }
    return [...mapa.entries()];
  }, [datos, busqueda, filtro, editor, tipo]);

  const cargarSemilla = async (codigo: string) => {
    setCargandoSemilla(codigo);
    try {
      await fetch("/api/manuales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semilla: codigo }),
      }).then(json);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargandoSemilla(null);
    }
  };

  if (unico) return <div className="p-4 sm:p-8"><VistaTutorial manual={unico} /></div>;

  const enc = editor
    ? { titulo: "Manuales", sub: "Manuales y tutoriales de cada rol", vacio: "Todavía no hay manuales." }
    : ENCABEZADO[tipo];
  const Icono = !editor && tipo === "tutorial" ? GraduationCap : BookOpen;
  const pendientes = (datos?.semillas || []).filter((s) => !s.cargado);

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${Icono === GraduationCap ? "bg-violet-600" : "bg-blue-600"}`}>
            <Icono className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">{enc.titulo}</h1>
            <p className="text-sm text-slate-500">{enc.sub}</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-56"
          />
          {editor && (
            <>
              <Link
                href={`/${locale}/manuales/nuevo`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Nuevo manual
              </Link>
              <Link
                href={`/${locale}/manuales/nuevo?tipo=tutorial`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                <Plus className="h-4 w-4" /> Nuevo tutorial
              </Link>
            </>
          )}
        </div>
      </div>

      {editor && (
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold sm:w-fit">
          {(["todos", "manual", "tutorial"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`flex-1 rounded-lg px-3 py-1.5 sm:flex-none ${filtro === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {f === "todos" ? "Todos" : f === "manual" ? "Manuales" : "Tutoriales"}
            </button>
          ))}
        </div>
      )}

      {editor && pendientes.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 p-4">
          <div>
            <h2 className="font-bold text-slate-900">Contenido base por rol</h2>
            <p className="text-xs text-slate-500">
              Manuales y tutoriales ya escritos para cada rol. Se cargan como borrador: revísalos, ajústalos y publícalos para
              que el rol los vea en su menú.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pendientes.map((s) => (
              <div key={s.codigo} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                {s.tipo === "tutorial" ? (
                  <GraduationCap className="h-5 w-5 shrink-0 text-violet-600" />
                ) : (
                  <BookOpen className="h-5 w-5 shrink-0 text-blue-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{s.titulo}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{s.codigo}</span> · {s.roles.map((r) => nombreRol.get(r) || r).join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => cargarSemilla(s.codigo)}
                  disabled={cargandoSemilla !== null}
                  className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {cargandoSemilla === s.codigo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Cargar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!datos && !error && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {datos && grupos.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          {busqueda ? "Nada coincide con la búsqueda." : enc.vacio}
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
                    {m.tipo === "tutorial" && (
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">Tutorial</span>
                    )}
                    {m.codigo && <span className="font-mono">{m.codigo}</span>}
                    <span>v{m.version}</span>
                    {!m.publicado && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Borrador</span>
                    )}
                  </div>
                  <p className="mt-1 font-bold text-slate-900">{m.titulo}</p>
                  {editor && (
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {m.roles.length ? `Para: ${m.roles.map((r) => nombreRol.get(r) || r).join(", ")}` : "Sin roles asignados"}
                    </p>
                  )}
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
