"use client";

import { ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Margen con el borde de la ventana y separación con el botón.
const MARGEN = 12;
const SEPARACION = 8;
const ALTO_MAXIMO = 400;
// Por debajo de esto conviene abrir hacia arriba si allá hay más lugar.
const ALTO_MINIMO = 220;

type Posicion = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

export function CustomSelect({
  label,
  value,
  placeholder,
  options,
  onSelect,
  searchable = false,
}: any) {
  const t = useTranslations("ui");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Posicion | null>(null);

  // La lista va en un portal con `position: fixed`, así que se ubica con
  // coordenadas de la ventana (sin sumar el scroll). Se abre hacia donde haya
  // más lugar y nunca más alta que ese lugar: con muchas opciones (los roles)
  // antes se salía por debajo de la pantalla.
  const ubicar = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const abajo = window.innerHeight - rect.bottom - SEPARACION - MARGEN;
    const arriba = rect.top - SEPARACION - MARGEN;
    const haciaArriba = abajo < ALTO_MINIMO && arriba > abajo;
    const espacio = haciaArriba ? arriba : abajo;
    setPos({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(ALTO_MAXIMO, espacio)),
      ...(haciaArriba
        ? { bottom: window.innerHeight - rect.top + SEPARACION }
        : { top: rect.bottom + SEPARACION }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    ubicar();
    // El modal puede moverse (scroll de la página, cambio de tamaño): la lista
    // lo sigue en vez de quedar flotando donde se abrió.
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [isOpen, ubicar]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [isOpen]);

  const filtered = searchable
    ? options.filter(
        (o: any) =>
          String(o.label ?? "").toLowerCase().includes(query.toLowerCase()) ||
          o.subLabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  return (
    <div className="w-full space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
        {label}
      </label>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200/60 p-4 rounded-2xl cursor-pointer flex justify-between items-center hover:bg-slate-100/50 transition-all"
      >
        <span className="text-xs font-black text-slate-800 uppercase truncate">
          {value ? value.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="fixed z-[9999] bg-white border border-slate-200 rounded-3xl shadow-2xl p-2 flex flex-col overflow-hidden"
              style={{
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
              }}
            >
              {searchable && (
                <div className="relative flex items-center bg-slate-50 rounded-2xl px-3 py-2 mb-2 shrink-0">
                  <Search size={14} className="text-slate-400 mr-2" />
                  <input
                    autoFocus
                    className="w-full bg-transparent text-xs font-bold outline-none"
                    placeholder={t("searchPlaceholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
              {/* Solo la lista hace scroll; el buscador queda fijo arriba. */}
              <div className="divide-y divide-slate-50 overflow-y-auto overscroll-contain min-h-0">
                {filtered.map((opt: any) => {
                  const elegida = value?.key === opt.key;
                  return (
                    <div
                      key={opt.key}
                      onClick={() => {
                        onSelect(opt);
                        setIsOpen(false);
                      }}
                      className={`px-3 py-2.5 rounded-xl cursor-pointer flex flex-col gap-0.5 ${elegida ? "bg-blue-50" : "hover:bg-blue-50"}`}
                    >
                      <span className={`text-xs font-black uppercase leading-tight ${elegida ? "text-blue-700" : "text-slate-800"}`}>
                        {opt.label}
                      </span>
                      {opt.subLabel && (
                        <span className="text-[10px] font-mono text-slate-400 font-bold tracking-tight">
                          {opt.subLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-3 py-4 text-center text-[11px] font-bold text-slate-400">
                    {t("noResults")}
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
