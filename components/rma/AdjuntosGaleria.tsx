"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Adjunto = {
  url: string;
  filename?: string;
  mime?: string;
};

/**
 * Galería de adjuntos de un caso de RMA (fotos y videos que sube el cliente
 * desde el portal).
 *
 * Antes las imágenes eran miniaturas recortadas (`object-cover`) sin forma de
 * verlas completas: para revisar la falla que reporta el cliente había que
 * abrir la URL a mano. Ahora cada foto abre un visor a pantalla completa con
 * navegación (flechas / teclado) y la imagen sin recortar.
 */
export default function AdjuntosGaleria({ adjuntos }: { adjuntos: Adjunto[] }) {
  const t = useTranslations("rma");
  const [abierto, setAbierto] = useState<number | null>(null);

  const imagenes = (adjuntos || []).filter(
    (a) => !a.mime?.startsWith("video/"),
  );

  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const cerrar = useCallback(() => setAbierto(null), []);
  const mover = useCallback(
    (delta: number) => {
      setAbierto((i) => {
        if (i === null || imagenes.length === 0) return i;
        return (i + delta + imagenes.length) % imagenes.length;
      });
    },
    [imagenes.length],
  );

  useEffect(() => {
    if (abierto === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", onKey);
    // Bloquea el scroll del fondo mientras el visor está abierto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [abierto, cerrar, mover]);

  if (!adjuntos || adjuntos.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-4">
        {t("sin_adjuntos")}
      </p>
    );
  }

  const actual = abierto !== null ? imagenes[abierto] : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {adjuntos.map((adj, idx) => {
          const esVideo = adj.mime?.startsWith("video/");
          if (esVideo) {
            return (
              <div key={idx} className="space-y-1">
                <video
                  src={adj.url}
                  controls
                  className="w-full max-h-48 object-cover rounded-lg border border-slate-200"
                />
                <p className="text-xs text-slate-500 truncate">
                  {adj.filename}
                </p>
              </div>
            );
          }
          const posImagen = imagenes.indexOf(adj);
          return (
            <div key={idx} className="space-y-1">
              <button
                type="button"
                onClick={() => setAbierto(posImagen)}
                className="group relative block w-full overflow-hidden rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                aria-label={`Ampliar ${adj.filename || "imagen"}`}
              >
                <img
                  src={adj.url}
                  alt={adj.filename || ""}
                  className="w-full max-h-48 object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                  <Maximize2 className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
              <p className="text-xs text-slate-500 truncate">{adj.filename}</p>
            </div>
          );
        })}
      </div>

      {actual && montado && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={cerrar}
        >
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {imagenes.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  mover(-1);
                }}
                aria-label="Anterior"
                className="absolute left-2 sm:left-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  mover(1);
                }}
                aria-label="Siguiente"
                className="absolute right-2 sm:right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <figure
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={actual.url}
              alt={actual.filename || ""}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <figcaption className="text-center text-xs text-white/70">
              {actual.filename}
              {imagenes.length > 1 && (
                <span className="ml-2 text-white/40">
                  {(abierto ?? 0) + 1} / {imagenes.length}
                </span>
              )}
            </figcaption>
          </figure>
        </div>,
        document.body,
      )}
    </>
  );
}
