"use client";

import { Check, ListChecks, MessageSquare, Play, UserRound } from "lucide-react";
import { useState } from "react";
import {
  type Actividad,
  type ItemChecklist,
  type Prioridad,
  fechaCaracas,
  fechaCorta,
  textoVencimiento,
} from "@/lib/actividades/tipos";

export const ESTILO_PRIORIDAD: Record<Prioridad, { etiqueta: string; chip: string; punto: string }> = {
  alta: { etiqueta: "Alta", chip: "bg-red-50 text-red-700 border-red-200", punto: "bg-red-500" },
  media: { etiqueta: "Media", chip: "bg-slate-50 text-slate-600 border-slate-200", punto: "bg-amber-400" },
  baja: { etiqueta: "Baja", chip: "bg-slate-50 text-slate-500 border-slate-200", punto: "bg-slate-300" },
};

const TONO_VENCE = {
  rojo: "bg-red-50 text-red-700 border-red-200",
  ambar: "bg-amber-50 text-amber-800 border-amber-200",
  neutro: "bg-white text-slate-600 border-slate-200",
  gris: "bg-white text-slate-400 border-slate-200",
};

export function ChipPrioridad({ prioridad, siempre = false }: { prioridad: Prioridad; siempre?: boolean }) {
  // "Media" es lo normal: no se muestra en la lista para no llenarla de ruido.
  if (prioridad === "media" && !siempre) return null;
  const e = ESTILO_PRIORIDAD[prioridad];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${e.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${e.punto}`} />
      {e.etiqueta}
    </span>
  );
}

export function ChipVence({
  fecha,
  hoy,
  culminada,
  culminadaEl,
}: {
  fecha: string | null;
  hoy: string;
  culminada?: boolean;
  /** ISO de cuándo se culminó: en una culminada se muestra eso, no el vencimiento. */
  culminadaEl?: string | null;
}) {
  if (culminada) {
    if (!culminadaEl) return null;
    const dia = fechaCaracas(new Date(culminadaEl));
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONO_VENCE.gris}`}>
        {dia === hoy ? "Culminada hoy" : `Culminada el ${fechaCorta(dia, hoy)}`}
      </span>
    );
  }
  const v = textoVencimiento(fecha, hoy);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONO_VENCE[v.tono]}`}>
      {v.texto}
    </span>
  );
}

export function progresoChecklist(lista: ItemChecklist[]) {
  const hechos = lista.filter((i) => i.hecho).length;
  return { hechos, total: lista.length };
}

/** Círculo para culminar / reabrir con un clic. */
export function BotonCulminar({
  culminada,
  deshabilitado,
  onClick,
}: {
  culminada: boolean;
  deshabilitado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={culminada ? "Reabrir" : "Marcar como culminada"}
      aria-label={culminada ? "Reabrir actividad" : "Marcar como culminada"}
      className={`group mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        culminada
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500"
      }`}
    >
      <Check size={14} strokeWidth={3} />
    </button>
  );
}

/**
 * Una actividad en la lista de "Mi día". Clic en la fila = abrir el
 * formulario; el círculo culmina; "Empezar" la pasa a En curso; el contador
 * del checklist lo despliega para tildar pasos sin abrir el formulario.
 */
export function FilaActividad({
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
  const [abierto, setAbierto] = useState(false);
  const culminada = act.status === "culminated";
  const { hechos, total } = progresoChecklist(act.checklist);

  return (
    <li
      className={`group rounded-xl border bg-white transition-colors ${
        act.status === "in-progress" ? "border-blue-200" : "border-slate-200"
      } hover:border-slate-300`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAbrir(act)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAbrir(act);
        }}
        className="flex cursor-pointer items-start gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
      >
        <BotonCulminar
          culminada={culminada}
          deshabilitado={!act.puede_editar}
          onClick={() => onCambiar(act.id, { status: culminada ? "pending" : "culminated" })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={`min-w-0 flex-1 text-sm font-medium leading-snug break-words ${
                culminada ? "text-slate-400 line-through" : "text-slate-800"
              }`}
            >
              {act.title}
            </p>
            {act.status === "in-progress" ? (
              <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                En curso
              </span>
            ) : !culminada && act.puede_editar ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCambiar(act.id, { status: "in-progress" });
                }}
                className="hidden shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-700 group-hover:inline-flex focus-visible:inline-flex"
                title="Pasar a En curso"
              >
                <Play size={10} /> Empezar
              </button>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ChipVence fecha={act.due_date} hoy={hoy} culminada={culminada} culminadaEl={act.completed_at} />
            <ChipPrioridad prioridad={act.priority} />
            {total > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAbierto((v) => !v);
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  hechos === total
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
                title="Ver pasos"
              >
                <ListChecks size={11} /> {hechos}/{total}
              </button>
            )}
            {act.observacion && (
              <span className="inline-flex items-center text-slate-400" title={act.observacion}>
                <MessageSquare size={12} />
              </span>
            )}
            {mostrarPersona && act.user_name && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <UserRound size={11} /> {act.user_name}
              </span>
            )}
            {!mostrarPersona && act.assigned_by && (
              <span className="text-[11px] text-slate-400">Asignada por {act.assigned_by}</span>
            )}
          </div>
        </div>
      </div>
      {abierto && total > 0 && (
        <ul className="space-y-1 border-t border-slate-100 px-3 py-2 pl-12">
          {act.checklist.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                  checked={item.hecho}
                  disabled={!act.puede_editar}
                  onChange={() =>
                    onCambiar(act.id, {
                      checklist: act.checklist.map((i) => (i.id === item.id ? { ...i, hecho: !i.hecho } : i)),
                    })
                  }
                />
                <span className={item.hecho ? "text-slate-400 line-through" : ""}>{item.texto}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
