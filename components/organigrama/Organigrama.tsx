"use client";

import { cn } from "@/lib/utils";
import { descendientes, type Nodo } from "@/lib/organigrama/tipos";
import { armarLienzo, yRelativaMax } from "@/lib/organigrama/lienzo";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

export type EdicionRapida = { area: string; cargo: string; nota: string; personas: string[] };

type Props = {
  nodos: Nodo[];
  seleccionado: number | null;
  busqueda: string;
  onSeleccionar: (id: number) => void;
  onAgregarSubordinado: (padre: number) => void;
  /** Guarda lo editado en el mismo recuadro; devuelve false si no se pudo. */
  onEditar: (id: number, cambios: EdicionRapida) => Promise<boolean>;
  /** Solo lectura: el clic abre el cargo, pero no se edita ni se agregan subordinados. */
  soloLectura?: boolean;
  /** Se pueden arrastrar los recuadros (modo Editar y sin la manito). */
  arrastrable?: boolean;
  /** Zoom del lienzo: el arrastre se mide en px de pantalla. */
  zoom?: number;
  /** Guarda dónde quedaron los recuadros movidos (x absoluta, y dentro de su franja). */
  onMover?: (posiciones: { id: number; x: number; y: number }[]) => Promise<void>;
};

type Arrastre = {
  puntero: number;
  x0: number;
  y0: number;
  movio: boolean;
  piezas: { id: number; x: number; y: number; max: number }[];
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
 * Dibuja el organigrama en un lienzo (lib/organigrama/lienzo.ts): una franja por
 * nivel de la jerarquía, cada cargo un recuadro y las líneas en SVG. Un clic
 * abre el panel del cargo; doble clic (o el lápiz) edita área, cargo, nota y
 * personas en el mismo recuadro. En modo Editar los recuadros se arrastran: a lo
 * ancho libres, a lo alto solo dentro de su franja (Mayús arrastra también a sus
 * subordinados). Para cambiar de nivel hay que cambiar a quién reporta.
 */
export function Organigrama({
  nodos,
  seleccionado,
  busqueda,
  onSeleccionar,
  onAgregarSubordinado,
  onEditar,
  soloLectura = false,
  arrastrable = false,
  zoom = 1,
  onMover,
}: Props) {
  const q = busqueda.trim().toLowerCase();

  // Alto real de cada recuadro (depende del texto y de las personas): las franjas se arman con eso.
  const [altos, setAltos] = useState<Map<number, number>>(new Map());
  const refs = useRef(new Map<number, HTMLDivElement>());
  useLayoutEffect(() => {
    let cambio = false;
    const nuevos = new Map(altos);
    for (const [id, el] of refs.current) {
      const h = el.offsetHeight;
      if (h && Math.abs((altos.get(id) ?? 0) - h) > 1) {
        nuevos.set(id, h);
        cambio = true;
      }
    }
    if (cambio) setAltos(nuevos);
  });

  // Posiciones mientras se arrastra (todavía sin guardar).
  const [mover, setMover] = useState<Map<number, { x: number; y: number }> | null>(null);
  const recienArrastrado = useRef(false);
  const lienzo = useMemo(() => armarLienzo(nodos, altos, mover ?? undefined), [nodos, altos, mover]);

  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState({ area: "", cargo: "", nota: "", personas: "" });
  const [guardando, setGuardando] = useState(false);
  // El clic simple espera un instante para no abrir el panel cuando es un doble clic.
  const clicPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empezarEdicion = (n: Nodo) => {
    if (soloLectura) return;
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
    const enEdicion = !soloLectura && editando === n.id;
    return (
      <div
        role="button"
        tabIndex={0}
        data-nodo={n.id}
        onClick={(e) => {
          if (enEdicion || recienArrastrado.current) return;
          if (e.detail > 1 && !soloLectura) return;
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
        title={enEdicion ? undefined : soloLectura ? "Clic: ver actividades del cargo" : "Clic: actividades · Doble clic: editar nombre y personas"}
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
            {!soloLectura && (
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
            )}
          </>
        )}
      </div>
    );
  };

  // ---- Arrastrar recuadros (modo Editar) ----
  // El arrastre sigue al puntero en toda la ventana: si se mueve rápido y sale
  // del recuadro, igual lo lleva (escuchar solo en el recuadro lo perdía).
  const empezarArrastre = (e: React.PointerEvent<HTMLDivElement>, n: Nodo) => {
    if (!arrastrable || soloLectura || e.button !== 0 || e.ctrlKey || editando === n.id) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;
    const ids = e.shiftKey ? [...descendientes(nodos, n.id)] : [n.id];
    const piezas = ids.flatMap((id) => {
      const c = lienzo.cajas.get(id);
      if (!c) return [];
      const f = lienzo.franjas[c.nivel];
      return [{ id, x: c.x, y: c.y - f.top, max: yRelativaMax(f, c.h) }];
    });
    const a: Arrastre = { puntero: e.pointerId, x0: e.clientX, y0: e.clientY, movio: false, piezas };
    let movido: Map<number, { x: number; y: number }> | null = null;
    e.stopPropagation(); // que el lienzo no lo tome como desplazamiento
    e.preventDefault(); // sin esto el arrastre selecciona el texto de los recuadros (el clic igual llega)

    const alMover = (ev: PointerEvent) => {
      if (ev.pointerId !== a.puntero) return;
      const dx = (ev.clientX - a.x0) / zoom;
      const dy = (ev.clientY - a.y0) / zoom;
      if (!a.movio && Math.hypot(dx, dy) < 4) return;
      a.movio = true;
      movido = new Map(
        a.piezas.map((p) => [p.id, { x: Math.max(0, p.x + dx), y: Math.min(p.max, Math.max(0, p.y + dy)) }]),
      );
      setMover(movido);
    };
    const soltar = async (ev: PointerEvent) => {
      if (ev.pointerId !== a.puntero) return;
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      if (ev.type === "pointercancel" || !a.movio || !movido) {
        setMover(null);
        return;
      }
      recienArrastrado.current = true; // que el clic de soltar no abra el panel
      setTimeout(() => (recienArrastrado.current = false), 0);
      const posiciones = [...movido].map(([id, p]) => ({ id, x: Math.round(p.x), y: Math.round(p.y) }));
      try {
        await onMover?.(posiciones);
      } finally {
        setMover(null);
      }
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  };

  return (
    <div className="relative" style={{ width: lienzo.ancho, height: lienzo.alto }}>
      {arrastrable &&
        lienzo.franjas.map((f) => (
          <div
            key={f.nivel}
            data-exportar="no"
            className="absolute inset-x-0 border-y border-dashed border-slate-200 bg-slate-100/50"
            style={{ top: f.top - 8, height: f.alto + 16 }}
          >
            <span className="absolute left-2 top-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Nivel {f.nivel + 1}
            </span>
          </div>
        ))}
      <svg className="pointer-events-none absolute inset-0" width={lienzo.ancho} height={lienzo.alto} aria-hidden>
        {lienzo.lineas.map((l, i) => (
          <path
            key={i}
            d={l.d}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray={l.staff ? "5 4" : undefined}
          />
        ))}
      </svg>
      {nodos.map((n) => {
        const c = lienzo.cajas.get(n.id);
        if (!c) return null;
        return (
          <div
            key={n.id}
            ref={(el) => {
              if (el) refs.current.set(n.id, el);
              else refs.current.delete(n.id);
            }}
            onPointerDown={(e) => empezarArrastre(e, n)}
            className={cn("absolute", arrastrable && editando !== n.id && "cursor-move touch-none select-none")}
            style={{ left: c.x, top: c.y, width: c.w, zIndex: editando === n.id || mover?.has(n.id) ? 30 : undefined }}
            title={arrastrable ? "Arrastra para moverlo dentro de su nivel · Mayús + arrastrar: con sus subordinados" : undefined}
          >
            {caja(n, "w-full")}
          </div>
        );
      })}
    </div>
  );
}
