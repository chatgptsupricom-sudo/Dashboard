"use client";

import { cn } from "@/lib/utils";
import { ALTO_MIN, ANCHO, recorrido, type Conexion, type Paso } from "@/lib/flujogramas/tipos";
import { useLayoutEffect, useRef, useState } from "react";

export type Seleccion = { tipo: "paso" | "conexion"; id: string } | null;

type Props = {
  pasos: Paso[];
  conexiones: Conexion[];
  editable: boolean;
  seleccion: Seleccion;
  /** Paso de donde sale la flecha que se está trazando (modo Conectar). */
  conectandoDesde: string | null;
  onSeleccionar: (s: Seleccion) => void;
  /** Mientras se arrastra un paso (x, y en px del lienzo). */
  onMover: (id: string, x: number, y: number) => void;
  onTexto: (id: string, texto: string) => void;
};

const MARGEN = 40;

const ESTILO: Record<Paso["tipo"], string> = {
  terminal:
    "rounded-full border border-slate-400 bg-gradient-to-b from-slate-100 to-slate-300 px-4 py-3 shadow-[2px_3px_0_rgba(100,116,139,0.45)]",
  actividad: "rounded-2xl border-2 border-slate-800 bg-white px-3 py-3",
  decision: "px-9 py-7",
};

/**
 * Lienzo del flujograma: cada paso es una figura posicionada en px y las
 * flechas se dibujan en SVG en ángulo recto (recorrido() de lib/flujogramas/tipos).
 * En edición los pasos se arrastran, doble clic edita el texto y un clic en
 * una flecha la selecciona.
 */
export function Lienzo({ pasos, conexiones, editable, seleccion, conectandoDesde, onSeleccionar, onMover, onTexto }: Props) {
  // Alto real de cada figura (depende del texto): las flechas se enganchan con eso.
  const [altos, setAltos] = useState<Map<string, number>>(new Map());
  const refs = useRef(new Map<string, HTMLDivElement>());
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

  const [editandoTexto, setEditandoTexto] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const recienMovido = useRef(false);

  const rect = (p: Paso) => ({ x: p.x, y: p.y, w: ANCHO[p.tipo], h: altos.get(p.id) ?? ALTO_MIN[p.tipo] });
  const porId = new Map(pasos.map((p) => [p.id, p]));
  const ancho = Math.max(700, ...pasos.map((p) => p.x + ANCHO[p.tipo] + 60)) + MARGEN;
  const alto = Math.max(400, ...pasos.map((p) => p.y + (altos.get(p.id) ?? ALTO_MIN[p.tipo]))) + MARGEN;

  const empezarArrastre = (e: React.PointerEvent, p: Paso) => {
    if (!editable || e.button !== 0 || editandoTexto === p.id || conectandoDesde) return;
    if ((e.target as HTMLElement).closest("textarea, button")) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let movio = false;
    const alMover = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!movio && Math.hypot(dx, dy) < 4) return;
      movio = true;
      onMover(p.id, Math.max(0, Math.round(p.x + dx)), Math.max(0, Math.round(p.y + dy)));
    };
    const soltar = () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", soltar);
      if (movio) {
        recienMovido.current = true; // que el clic de soltar no cuente
        setTimeout(() => (recienMovido.current = false), 0);
      }
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", soltar);
  };

  const guardarTexto = () => {
    if (editandoTexto) onTexto(editandoTexto, borrador.trim());
    setEditandoTexto(null);
  };

  return (
    <div
      className="relative bg-white"
      style={{ width: ancho, height: alto }}
      onClick={() => editable && onSeleccionar(null)}
    >
      <svg className="absolute inset-0" width={ancho} height={alto}>
        <defs>
          <marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#1e293b" />
          </marker>
          <marker id="flecha-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#2563eb" />
          </marker>
        </defs>
        {conexiones.map((c) => {
          const a = porId.get(c.desde);
          const b = porId.get(c.hasta);
          if (!a || !b) return null;
          const r = recorrido(rect(a), rect(b));
          const sel = seleccion?.tipo === "conexion" && seleccion.id === c.id;
          return (
            <g key={c.id}>
              <path
                d={r.d}
                fill="none"
                stroke={sel ? "#2563eb" : "#1e293b"}
                strokeWidth={sel ? 3 : 2.5}
                markerEnd={`url(#${sel ? "flecha-sel" : "flecha"})`}
              />
              {editable && (
                // Trazo ancho e invisible para que la flecha sea fácil de seleccionar.
                <path
                  d={r.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className="cursor-pointer"
                  style={{ pointerEvents: "stroke" }}
                  data-exportar="no"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeleccionar({ tipo: "conexion", id: c.id });
                  }}
                />
              )}
              {c.etiqueta && (
                <text x={r.lx} y={r.ly} fontSize={11} fontWeight={600} fill={sel ? "#2563eb" : "#1e293b"}>
                  {c.etiqueta}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {pasos.map((p) => {
        const sel = seleccion?.tipo === "paso" && seleccion.id === p.id;
        const origen = conectandoDesde === p.id;
        const enTexto = editable && editandoTexto === p.id;
        return (
          <div
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            onPointerDown={(e) => empezarArrastre(e, p)}
            onClick={(e) => {
              e.stopPropagation();
              if (!editable || recienMovido.current || enTexto) return;
              onSeleccionar({ tipo: "paso", id: p.id });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!editable || conectandoDesde) return;
              setBorrador(p.texto);
              setEditandoTexto(p.id);
            }}
            title={editable ? (conectandoDesde ? "Clic: la flecha llega aquí" : "Arrastra para mover · Doble clic: editar el texto") : undefined}
            className={cn(
              "absolute flex items-center justify-center text-center text-[11px] font-bold uppercase leading-snug text-slate-900",
              ESTILO[p.tipo],
              editable && !enTexto && (conectandoDesde ? "cursor-crosshair" : "cursor-move select-none touch-none"),
              (sel || origen) && "outline outline-2 outline-offset-4 outline-blue-500",
            )}
            style={{ left: p.x, top: p.y, width: ANCHO[p.tipo], minHeight: ALTO_MIN[p.tipo] }}
          >
            {p.tipo === "decision" && (
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                <polygon points="50,1 99,50 50,99 1,50" fill="#fff" stroke="#1e293b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {enTexto ? (
              <textarea
                autoFocus
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                onBlur={guardarTexto}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setEditandoTexto(null);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    guardarTexto();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                rows={3}
                className="relative w-full resize-none rounded border border-blue-400 bg-white p-1 text-center text-[11px] font-bold uppercase outline-none"
              />
            ) : (
              <span className="relative whitespace-pre-line">{p.texto || "…"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
