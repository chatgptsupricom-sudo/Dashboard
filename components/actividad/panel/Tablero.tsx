"use client";

import { ListChecks, MessageSquare, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { type Actividad, type Estado, DIAS_CULMINADAS, compararActividades } from "@/lib/actividades/tipos";
import { BotonCulminar, ChipPrioridad, ChipVence, progresoChecklist } from "./comunes";

const COLUMNAS: { id: Estado; etiqueta: string; punto: string }[] = [
  { id: "pending", etiqueta: "Pendientes", punto: "bg-amber-500" },
  { id: "in-progress", etiqueta: "En curso", punto: "bg-blue-600" },
  { id: "culminated", etiqueta: "Culminadas", punto: "bg-emerald-600" },
];

function Tarjeta({
  act,
  hoy,
  mostrarPersona,
  onAbrir,
  onCambiar,
}: {
  act: Actividad;
  hoy: string;
  mostrarPersona: boolean;
  onAbrir: (a: Actividad) => void;
  onCambiar: (id: number, cambios: Partial<Actividad>) => void;
}) {
  const culminada = act.status === "culminated";
  const { hechos, total } = progresoChecklist(act.checklist);
  return (
    <div
      draggable={act.puede_editar}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(act.id))}
      onClick={() => onAbrir(act)}
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white p-3 shadow-sm transition-colors hover:border-slate-300 ${
        act.puede_editar ? "active:cursor-grabbing" : ""
      } ${!culminada && act.due_date && act.due_date < hoy ? "border-red-200" : "border-slate-200"}`}
    >
      <BotonCulminar
        culminada={culminada}
        deshabilitado={!act.puede_editar}
        onClick={() => onCambiar(act.id, { status: culminada ? "pending" : "culminated" })}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug break-words ${culminada ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {act.title}
        </p>
        {act.description && !culminada && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{act.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ChipVence fecha={act.due_date} hoy={hoy} culminada={culminada} culminadaEl={act.completed_at} />
          <ChipPrioridad prioridad={act.priority} />
          {total > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <ListChecks size={11} /> {hechos}/{total}
            </span>
          )}
          {act.observacion && <MessageSquare size={12} className="text-slate-400" />}
        </div>
        {(mostrarPersona || act.assigned_by) && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            <UserRound size={11} />
            {mostrarPersona ? act.user_name : `Asignada por ${act.assigned_by}`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Tablero({
  actividades,
  hoy,
  mostrarPersona,
  onAbrir,
  onCambiar,
}: {
  actividades: Actividad[];
  hoy: string;
  mostrarPersona: boolean;
  onAbrir: (a: Actividad) => void;
  onCambiar: (id: number, cambios: Partial<Actividad>) => void;
}) {
  const [encima, setEncima] = useState<Estado | null>(null);

  const porEstado = useMemo(() => {
    const m: Record<Estado, Actividad[]> = { pending: [], "in-progress": [], culminated: [] };
    for (const a of actividades) m[a.status].push(a);
    // En el tablero manda la fecha (lo vencido arriba); a igual fecha, la prioridad.
    const porFecha = (a: Actividad, b: Actividad) =>
      a.due_date === b.due_date ? compararActividades(a, b) : !a.due_date ? 1 : !b.due_date ? -1 : a.due_date < b.due_date ? -1 : 1;
    m.pending.sort(porFecha);
    m["in-progress"].sort(porFecha);
    m.culminated.sort((a, b) => String(b.completed_at ?? b.created_at).localeCompare(String(a.completed_at ?? a.created_at)));
    return m;
  }, [actividades]);

  const soltar = (e: React.DragEvent, destino: Estado) => {
    e.preventDefault();
    setEncima(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const act = actividades.find((a) => a.id === id);
    if (!act || act.status === destino || !act.puede_editar) return;
    onCambiar(id, { status: destino });
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNAS.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(col.id);
          }}
          onDragLeave={() => setEncima((v) => (v === col.id ? null : v))}
          onDrop={(e) => soltar(e, col.id)}
          className={`flex min-h-[420px] flex-col rounded-2xl border p-3 transition-colors ${
            encima === col.id ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className={`h-2.5 w-2.5 rounded-full ${col.punto}`} />
              {col.etiqueta}
            </h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
              {porEstado[col.id].length}
            </span>
          </div>
          <div className="flex-1 space-y-2">
            {porEstado[col.id].map((a) => (
              <Tarjeta key={a.id} act={a} hoy={hoy} mostrarPersona={mostrarPersona} onAbrir={onAbrir} onCambiar={onCambiar} />
            ))}
            {porEstado[col.id].length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-slate-400">Arrastra aquí</p>
            )}
          </div>
          {col.id === "culminated" && (
            <p className="mt-2 px-1 text-[11px] text-slate-400">Últimos {DIAS_CULMINADAS} días</p>
          )}
        </div>
      ))}
    </div>
  );
}
