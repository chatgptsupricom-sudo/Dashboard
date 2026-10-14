"use client";

import { cn } from "@/lib/utils";
import { hijosPorPadre, type Nodo } from "@/lib/organigrama/tipos";
import { Plus } from "lucide-react";
import s from "./organigrama.module.css";

type Props = {
  nodos: Nodo[];
  seleccionado: number | null;
  busqueda: string;
  onSeleccionar: (id: number) => void;
  onAgregarSubordinado: (padre: number) => void;
};

const ESTILO_CAJA: Record<Nodo["tipo"], string> = {
  direccion: "border-[#1e3a5f] bg-[#1e3a5f] text-white shadow-md",
  area: "border-[#9fb0c8] bg-[#e9eef5] text-slate-900",
  cargo: "border-slate-200 bg-white text-slate-800",
};

const coincide = (n: Nodo, q: string) =>
  [n.cargo, n.area, n.nota, ...n.personas].some((t) => t.toLowerCase().includes(q));

/** Dibuja el organigrama completo. Cada recuadro abre su panel al hacer clic. */
export function Organigrama({ nodos, seleccionado, busqueda, onSeleccionar, onAgregarSubordinado }: Props) {
  const mapa = hijosPorPadre(nodos);
  const q = busqueda.trim().toLowerCase();
  const raices = mapa.get(null) || [];

  const caja = (n: Nodo, ancho: string) => {
    const oscuro = n.tipo === "direccion";
    const atenuado = q !== "" && !coincide(n, q);
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSeleccionar(n.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSeleccionar(n.id);
          }
        }}
        title="Ver actividades del cargo"
        className={cn(
          "group relative cursor-pointer rounded-lg border px-3 py-2.5 text-center transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          ESTILO_CAJA[n.tipo],
          n.staff && "border-slate-300 bg-white",
          seleccionado === n.id && "ring-2 ring-blue-500 ring-offset-2",
          q !== "" && !atenuado && "ring-2 ring-amber-400",
          atenuado && "opacity-30",
          ancho,
        )}
      >
        {n.area && (
          <p className={cn("text-[10px] uppercase tracking-[0.14em]", oscuro ? "text-blue-200" : "text-slate-500")}>
            {n.area}
          </p>
        )}
        <p
          className={cn(
            "text-[13px] leading-snug",
            n.tipo === "cargo" && !n.staff ? "font-medium" : "font-bold",
            oscuro && "text-[15px]",
          )}
        >
          {n.cargo}
        </p>
        {n.nota && <p className={cn("text-[11px]", oscuro ? "text-blue-200" : "text-slate-500")}>{n.nota}</p>}
        {n.personas.map((p, i) => (
          <p key={i} className={cn("text-[11px] leading-snug", oscuro ? "text-blue-100" : "text-blue-700")}>
            {p}
          </p>
        ))}
        {n.actividades.length > 0 && (
          <span
            className="absolute -right-2 -top-2 min-w-5 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold leading-5 text-white shadow"
            title={`${n.actividades.length} actividad(es) anotada(s)`}
          >
            {n.actividades.length}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAgregarSubordinado(n.id);
          }}
          title="Agregar subordinado"
          className="absolute -bottom-3 left-1/2 z-10 hidden h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-blue-400 hover:text-blue-600 group-hover:flex print:hidden"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  /** Un cargo con su staff al lado y sus subordinados debajo. */
  const rama = (n: Nodo, enColumna: boolean): React.ReactNode => {
    const todos = mapa.get(n.id) || [];
    const staff = todos.filter((h) => h.staff);
    const hijos = todos.filter((h) => !h.staff);
    const enFila = n.disposicion === "fila" && hijos.length > 0;
    const ancho = enColumna ? "w-full" : "w-[200px]";

    const cabeza = staff.length ? (
      <div className={s.conStaff}>
        <div />
        {caja(n, "w-[200px]")}
        <div className={s.staff}>
          {staff.map((h) => (
            <div key={h.id} className="w-[190px]">
              {rama(h, true)}
            </div>
          ))}
        </div>
      </div>
    ) : (
      caja(n, enFila && !enColumna ? "w-[200px]" : ancho)
    );

    return (
      <div className={cn(enFila ? "flex flex-col items-center" : ancho, enColumna && "w-full")}>
        {cabeza}
        {hijos.length > 0 &&
          (enFila ? (
            <div className={s.fila}>
              {hijos.map((h) => (
                <div key={h.id} className={s.itemFila}>
                  {rama(h, false)}
                </div>
              ))}
            </div>
          ) : (
            <div className={s.columna}>
              {hijos.map((h) => (
                <div key={h.id} className={s.itemColumna}>
                  {rama(h, true)}
                </div>
              ))}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className={cn(s.lienzo, "flex w-max min-w-full items-start justify-center gap-16 p-8 pb-16")}>
      {raices.map((r) => (
        <div key={r.id}>{rama(r, false)}</div>
      ))}
    </div>
  );
}
