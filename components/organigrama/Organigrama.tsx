"use client";

import { cn } from "@/lib/utils";
import { hijosPorPadre, type Nodo } from "@/lib/organigrama/tipos";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import s from "./organigrama.module.css";

export type EdicionRapida = { area: string; cargo: string; nota: string; personas: string[] };

type Props = {
  nodos: Nodo[];
  seleccionado: number | null;
  busqueda: string;
  onSeleccionar: (id: number) => void;
  onAgregarSubordinado: (padre: number) => void;
  /** Guarda lo editado en el mismo recuadro; devuelve false si no se pudo. */
  onEditar: (id: number, cambios: EdicionRapida) => Promise<boolean>;
};

const ESTILO_CAJA: Record<Nodo["tipo"], string> = {
  direccion: "border-[#1e3a5f] bg-[#1e3a5f] text-white shadow-md",
  area: "border-[#9fb0c8] bg-[#e9eef5] text-slate-900",
  cargo: "border-slate-200 bg-white text-slate-800",
};

const coincide = (n: Nodo, q: string) =>
  [n.cargo, n.area, n.nota, ...n.personas].some((t) => t.toLowerCase().includes(q));

const campo =
  "w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-500";

/**
 * Dibuja el organigrama completo. Un clic abre el panel del cargo; doble clic
 * (o el lápiz) edita área, cargo, nota y personas en el mismo recuadro.
 */
export function Organigrama({ nodos, seleccionado, busqueda, onSeleccionar, onAgregarSubordinado, onEditar }: Props) {
  const mapa = hijosPorPadre(nodos);
  const q = busqueda.trim().toLowerCase();
  const raices = mapa.get(null) || [];

  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState({ area: "", cargo: "", nota: "", personas: "" });
  const [guardando, setGuardando] = useState(false);
  // El clic simple espera un instante para no abrir el panel cuando es un doble clic.
  const clicPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empezarEdicion = (n: Nodo) => {
    if (clicPendiente.current) clearTimeout(clicPendiente.current);
    setBorrador({ area: n.area, cargo: n.cargo, nota: n.nota, personas: n.personas.join("\n") });
    setEditando(n.id);
  };

  const guardar = async () => {
    if (editando == null || !borrador.cargo.trim()) return;
    setGuardando(true);
    const ok = await onEditar(editando, {
      area: borrador.area.trim(),
      cargo: borrador.cargo.trim(),
      nota: borrador.nota.trim(),
      personas: borrador.personas.split("\n").map((p) => p.trim()).filter(Boolean),
    });
    setGuardando(false);
    if (ok) setEditando(null);
  };

  const teclas = (e: React.KeyboardEvent, multilinea = false) => {
    e.stopPropagation();
    if (e.key === "Escape") setEditando(null);
    if (e.key === "Enter" && (!multilinea || e.ctrlKey)) {
      e.preventDefault();
      guardar();
    }
  };

  const formulario = () => (
    <div
      className="space-y-1 text-left"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        value={borrador.area}
        onChange={(e) => setBorrador((b) => ({ ...b, area: e.target.value }))}
        onKeyDown={(e) => teclas(e)}
        placeholder="Área (opcional)"
        className={campo}
      />
      <input
        autoFocus
        value={borrador.cargo}
        onChange={(e) => setBorrador((b) => ({ ...b, cargo: e.target.value }))}
        onKeyDown={(e) => teclas(e)}
        placeholder="Cargo"
        className={cn(campo, "font-bold")}
      />
      <input
        value={borrador.nota}
        onChange={(e) => setBorrador((b) => ({ ...b, nota: e.target.value }))}
        onKeyDown={(e) => teclas(e)}
        placeholder="Nota (opcional)"
        className={campo}
      />
      <textarea
        value={borrador.personas}
        onChange={(e) => setBorrador((b) => ({ ...b, personas: e.target.value }))}
        onKeyDown={(e) => teclas(e, true)}
        rows={Math.min(7, Math.max(2, borrador.personas.split("\n").length + 1))}
        placeholder="Personas, una por línea"
        className={campo}
      />
      <div className="flex justify-end gap-1 pt-0.5">
        <button
          type="button"
          onClick={() => setEditando(null)}
          className="flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-200"
        >
          <X className="h-3 w-3" /> Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !borrador.cargo.trim()}
          className="flex items-center gap-0.5 rounded bg-blue-600 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Guardar
        </button>
      </div>
    </div>
  );

  const caja = (n: Nodo, ancho: string) => {
    const oscuro = n.tipo === "direccion";
    const atenuado = q !== "" && !coincide(n, q);
    const enEdicion = editando === n.id;
    return (
      <div
        role="button"
        tabIndex={0}
        data-nodo={n.id}
        onClick={(e) => {
          if (enEdicion) return;
          if (e.detail > 1) return;
          if (clicPendiente.current) clearTimeout(clicPendiente.current);
          clicPendiente.current = setTimeout(() => onSeleccionar(n.id), 220);
        }}
        onDoubleClick={() => !enEdicion && empezarEdicion(n)}
        onKeyDown={(e) => {
          if (enEdicion) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSeleccionar(n.id);
          }
          if (e.key === "F2") empezarEdicion(n);
        }}
        title={enEdicion ? undefined : "Clic: actividades · Doble clic: editar nombre y personas"}
        className={cn(
          "group relative rounded-lg border px-3 py-2.5 text-center transition",
          enEdicion
            ? "z-20 cursor-default border-blue-500 bg-white text-slate-900 shadow-lg ring-2 ring-blue-200"
            : cn(
                "cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                ESTILO_CAJA[n.tipo],
                n.staff && "border-slate-300 bg-white",
                seleccionado === n.id && "ring-2 ring-blue-500 ring-offset-2",
                q !== "" && !atenuado && "ring-2 ring-amber-400",
                atenuado && "opacity-30",
              ),
          ancho,
        )}
      >
        {enEdicion ? (
          formulario()
        ) : (
          <>
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
            <div
              data-exportar="no"
              className="absolute -bottom-3 left-1/2 z-10 hidden -translate-x-1/2 gap-1 group-hover:flex print:hidden"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  empezarEdicion(n);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="Editar nombre y personas"
                className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-blue-400 hover:text-blue-600"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAgregarSubordinado(n.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="Agregar subordinado"
                className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-blue-400 hover:text-blue-600"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
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
