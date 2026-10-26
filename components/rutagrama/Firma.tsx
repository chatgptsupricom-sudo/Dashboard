"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Recuadro para firmar con el dedo o el mouse. Devuelve la firma como PNG
 * (data URL) al soltar, o null si se borra.
 */
export function Firma({ onChange }: { onChange: (png: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const trazando = useRef(false);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * escala);
    c.height = Math.round(height * escala);
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10101a";
  }, []);

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    trazando.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = posicion(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!trazando.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = posicion(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const terminar = () => {
    if (!trazando.current) return;
    trazando.current = false;
    setVacia(false);
    onChange(lienzo.current!.toDataURL("image/png"));
  };

  const borrar = () => {
    const c = lienzo.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVacia(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-black/20 bg-white">
        <canvas
          ref={lienzo}
          aria-label="Recuadro para firmar"
          className="block h-44 w-full touch-none"
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
        />
        {vacia && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-black/35">
            Firma aquí con el dedo
          </span>
        )}
        <span className="pointer-events-none absolute bottom-9 left-6 right-6 border-b border-black/25" />
      </div>
      <button type="button" onClick={borrar} className="pt-back mt-2" disabled={vacia}>
        <Eraser className="h-4 w-4" aria-hidden />
        Borrar firma
      </button>
    </div>
  );
}
