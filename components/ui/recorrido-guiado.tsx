"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Recorrido guiado: oscurece la pantalla, resalta un elemento por paso
 * (`selector`, el primero que coincida; sin selector o si no está, la tarjeta
 * va centrada) y explica qué hace.
 *
 * Se abre solo la primera vez por sesión (sessionStorage) salvo que el usuario
 * marque "No volver a mostrar" (localStorage). `abrir` lo reabre a mano.
 * Ambos almacenamientos pueden fallar (modo privado): sin ellos, se muestra.
 */

export type PasoRecorrido = { selector?: string; titulo: string; texto: string };

const leer = (s: Storage | undefined, k: string) => {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const guardar = (s: Storage | undefined, k: string, v: string) => {
  try {
    s?.setItem(k, v);
  } catch {}
};

export function useRecorrido(clave: string, listo: boolean) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!listo || typeof window === "undefined") return;
    if (leer(window.localStorage, clave) === "nunca" || leer(window.sessionStorage, clave) === "visto") return;
    guardar(window.sessionStorage, clave, "visto");
    setAbierto(true);
  }, [clave, listo]);
  const cerrar = useCallback(
    (nuncaMas: boolean) => {
      if (nuncaMas) guardar(window.localStorage, clave, "nunca");
      setAbierto(false);
    },
    [clave],
  );
  return { abierto, abrir: () => setAbierto(true), cerrar };
}

const MARGEN = 8;
const ANCHO = 340;

export function RecorridoGuiado({
  pasos,
  abierto,
  onCerrar,
}: {
  pasos: PasoRecorrido[];
  abierto: boolean;
  onCerrar: (nuncaMas: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const [nuncaMas, setNuncaMas] = useState(false);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const paso = pasos[i];

  useEffect(() => {
    if (abierto) setI(0);
  }, [abierto]);

  // Ubica el elemento del paso (y lo trae a la vista) cada vez que cambia el
  // paso, se desplaza la página o cambia el tamaño de la ventana.
  const medir = useCallback(() => {
    const el = paso?.selector ? document.querySelector(paso.selector) : null;
    setCaja(el ? el.getBoundingClientRect() : null);
  }, [paso]);
  useLayoutEffect(() => {
    if (!abierto) return;
    const el = paso?.selector ? document.querySelector(paso.selector) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    medir();
    const t = setTimeout(medir, 350);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [abierto, paso, medir]);

  useEffect(() => {
    if (!abierto) return;
    tarjeta.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar(nuncaMas);
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, pasos.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, i, nuncaMas, onCerrar, pasos.length]);

  if (!abierto || !paso) return null;

  const ultimo = i === pasos.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const ancho = Math.min(ANCHO, vw - 32);
  // Debajo del elemento si cabe; si no, encima; sin elemento, al centro.
  let estilo: React.CSSProperties = { left: (vw - ancho) / 2, top: vh / 2, transform: "translateY(-50%)" };
  if (caja) {
    const left = Math.min(Math.max(16, caja.left + caja.width / 2 - ancho / 2), vw - ancho - 16);
    estilo = caja.bottom + 220 < vh ? { left, top: caja.bottom + 14 } : { left, top: Math.max(16, caja.top - 14), transform: "translateY(-100%)" };
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="recorrido-titulo">
      {caja ? (
        <div
          className="absolute rounded-xl ring-2 ring-white/80 transition-all duration-300 pointer-events-none"
          style={{
            left: caja.left - MARGEN,
            top: caja.top - MARGEN,
            width: caja.width + MARGEN * 2,
            height: caja.height + MARGEN * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/60" />
      )}
      <div
        ref={tarjeta}
        tabIndex={-1}
        className="absolute bg-white rounded-2xl shadow-2xl p-5 outline-none transition-all duration-300"
        style={{ ...estilo, width: ancho }}
      >
        <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
          Paso {i + 1} de {pasos.length}
        </p>
        <h3 id="recorrido-titulo" className="mt-1 text-base font-bold text-zinc-900">
          {paso.titulo}
        </h3>
        <p className="mt-1.5 text-sm text-zinc-600 leading-relaxed">{paso.texto}</p>
        <label className="mt-4 flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={nuncaMas}
            onChange={(e) => setNuncaMas(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
          />
          No volver a mostrar
        </label>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCerrar(nuncaMas)}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
          >
            Saltar
          </button>
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="h-8 px-3 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={() => (ultimo ? onCerrar(nuncaMas) : setI(i + 1))}
              className="h-8 px-4 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {ultimo ? "Entendido" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
