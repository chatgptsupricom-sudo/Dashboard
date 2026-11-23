"use client";

import { ChevronDown, CornerDownLeft, PartyPopper, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type Actividad,
  type Grupo,
  type Prioridad,
  GRUPOS,
  compararActividades,
  grupoDe,
  sumarDias,
} from "@/lib/actividades/tipos";
import { ESTILO_PRIORIDAD, FilaActividad } from "./comunes";

const COLOR_GRUPO: Record<Grupo, string> = {
  vencidas: "text-red-700",
  hoy: "text-amber-700",
  proximas: "text-slate-800",
  despues: "text-slate-600",
  sin_fecha: "text-slate-600",
  hechas: "text-emerald-700",
};

type Cuando = "hoy" | "manana" | "sin";

/** Escribir y Enter: la forma más rápida de anotar algo del día. */
function AltaRapida({
  hoy,
  placeholder,
  onCrear,
}: {
  hoy: string;
  placeholder: string;
  onCrear: (d: { title: string; due_date: string | null; priority: Prioridad }) => Promise<boolean>;
}) {
  const [titulo, setTitulo] = useState("");
  const [cuando, setCuando] = useState<Cuando>("hoy");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const enviar = async () => {
    const t = titulo.trim();
    if (!t || guardando) return;
    setGuardando(true);
    const ok = await onCrear({
      title: t,
      due_date: cuando === "hoy" ? hoy : cuando === "manana" ? sumarDias(hoy, 1) : null,
      priority: prioridad,
    });
    setGuardando(false);
    if (ok) {
      setTitulo("");
      ref.current?.focus();
    }
  };

  const chip = (activo: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
    }`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Plus size={18} className="shrink-0 text-slate-400" />
        <input
          ref={ref}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void enviar();
            }
          }}
          maxLength={255}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          aria-label="Nueva actividad"
        />
        <Button size="sm" onClick={() => void enviar()} disabled={!titulo.trim() || guardando} className="shrink-0" aria-label="Agregar">
          <CornerDownLeft size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Agregar</span>
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
        <button type="button" className={chip(cuando === "hoy")} onClick={() => setCuando("hoy")}>
          Hoy
        </button>
        <button type="button" className={chip(cuando === "manana")} onClick={() => setCuando("manana")}>
          Mañana
        </button>
        <button type="button" className={chip(cuando === "sin")} onClick={() => setCuando("sin")}>
          Sin fecha
        </button>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {(["alta", "media", "baja"] as Prioridad[]).map((p) => (
          <button key={p} type="button" className={chip(prioridad === p)} onClick={() => setPrioridad(p)}>
            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${ESTILO_PRIORIDAD[p].punto}`} />
            {ESTILO_PRIORIDAD[p].etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MiDia({
  actividades,
  hoy,
  mostrarPersona,
  altaRapida,
  onAbrir,
  onCambiar,
  onCrear,
}: {
  actividades: Actividad[];
  hoy: string;
  mostrarPersona: boolean;
  /** Texto de la caja de alta rápida; null = no se muestra. */
  altaRapida: string | null;
  onAbrir: (a: Actividad) => void;
  onCambiar: (id: number, cambios: Partial<Actividad>) => void;
  onCrear: (d: { title: string; due_date: string | null; priority: Prioridad }) => Promise<boolean>;
}) {
  const [cerrados, setCerrados] = useState<Set<Grupo>>(() => new Set<Grupo>(["despues"]));

  const grupos = useMemo(() => {
    const m = new Map<Grupo, Actividad[]>();
    for (const a of actividades) {
      const g = grupoDe(a, hoy);
      if (!g) continue;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(a);
    }
    for (const lista of m.values()) lista.sort(compararActividades);
    return m;
  }, [actividades, hoy]);

  const abiertas = ["vencidas", "hoy", "proximas", "despues", "sin_fecha"].reduce(
    (n, g) => n + (grupos.get(g as Grupo)?.length ?? 0),
    0,
  );
  const nadaParaHoy = !grupos.get("vencidas")?.length && !grupos.get("hoy")?.length;

  const alternar = (g: Grupo) =>
    setCerrados((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <div className="space-y-5">
      {altaRapida && <AltaRapida hoy={hoy} placeholder={altaRapida} onCrear={onCrear} />}

      {nadaParaHoy && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <PartyPopper size={18} className="shrink-0" />
          {abiertas === 0
            ? "No hay actividades pendientes."
            : "Nada vencido ni para hoy. Lo que sigue está más abajo."}
        </div>
      )}

      {GRUPOS.map(({ id, etiqueta, ayuda }) => {
        const lista = grupos.get(id);
        if (!lista?.length) return null;
        const cerrado = cerrados.has(id);
        return (
          <section key={id} aria-label={etiqueta}>
            <button
              type="button"
              onClick={() => alternar(id)}
              className="mb-2 flex w-full items-center gap-2 text-left"
              aria-expanded={!cerrado}
              title={ayuda}
            >
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${cerrado ? "-rotate-90" : ""}`} />
              <h3 className={`text-sm font-semibold ${COLOR_GRUPO[id]}`}>{etiqueta}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {lista.length}
              </span>
            </button>
            {!cerrado && (
              <ul className="space-y-2">
                {lista.map((a) => (
                  <FilaActividad
                    key={a.id}
                    act={a}
                    hoy={hoy}
                    mostrarPersona={mostrarPersona}
                    onAbrir={onAbrir}
                    onCambiar={onCambiar}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
