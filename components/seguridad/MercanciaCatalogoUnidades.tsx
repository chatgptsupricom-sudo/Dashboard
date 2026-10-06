"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Truck, XCircle } from "lucide-react";
import {
  PageHeader,
  Card,
  EmptyState,
  BotonPrimario,
  Buscador,
  inputClases,
  labelClases,
  normalizar,
} from "./mercancia-ui";

/**
 * Catalogo de unidades (vehiculos): placa + descripcion opcional. Alimenta
 * el select de "Placa del vehiculo" en el formulario de mercancia.
 *
 * Dos columnas en pantallas anchas: el alta fija a la izquierda, con la placa
 * dibujada mientras se escribe (para verla como va a quedar), y la flota a la
 * derecha, con buscador cuando ya son varias. La recien agregada queda
 * resaltada unos segundos.
 */

type Unidad = { id: number; placa: string; descripcion: string | null };

// Con pocas unidades el buscador estorba mas de lo que ayuda.
const BUSCADOR_DESDE = 7;

/** La placa como se ve en el vehiculo. */
function Placa({ texto, tenue = false, className = "" }: { texto: string; tenue?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border-2 bg-white px-2.5 py-1 font-mono font-bold tracking-[0.18em] ${
        tenue ? "border-slate-200 text-slate-300" : "border-slate-800 text-slate-900"
      } ${className}`}
    >
      {texto}
    </span>
  );
}

export default function MercanciaCatalogoUnidades({ volverA }: { volverA: string }) {
  const tu = useTranslations("seguridad.mercancia.unidades");
  const tui = useTranslations("seguridad.mercancia.catalogo_ui");

  const [items, setItems] = useState<Unidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [placa, setPlaca] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // La recien agregada, resaltada unos segundos.
  const [nueva, setNueva] = useState<string | null>(null);
  const campoPlaca = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/seguridad/mercancia/catalogo/unidades");
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.unidades || []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!nueva) return;
    const timer = setTimeout(() => setNueva(null), 4000);
    return () => clearTimeout(timer);
  }, [nueva]);

  // Ya registrada: se avisa antes de enviar, en vez de esperar el rechazo.
  const repetida = !!placa.trim() && items.some((it) => it.placa.toUpperCase() === placa.trim().toUpperCase());

  const agregar = async () => {
    const p = placa.trim();
    if (!p || repetida) return;
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/seguridad/mercancia/catalogo/unidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placa: p, descripcion: descripcion.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "error");
      setPlaca("");
      setDescripcion("");
      setBusqueda("");
      setNueva(p.toUpperCase());
      await cargar();
    } catch {
      setError(tu("error"));
    } finally {
      setGuardando(false);
      campoPlaca.current?.focus();
    }
  };

  const alEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void agregar();
  };

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return q ? items.filter((it) => normalizar(`${it.placa} ${it.descripcion || ""}`).includes(q)) : items;
  }, [items, busqueda]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={Truck} titulo={tu("titulo")} subtitulo={tu("subtitulo")} volverA={volverA} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
          <div className="lg:sticky lg:top-24">
            <Card padded={false} className="overflow-hidden">
              {/* La placa, como va a quedar. */}
              <div className="flex flex-col items-center gap-2 px-5 py-6 border-b border-slate-100 bg-gradient-to-br from-violet-50/70 to-white">
                <Placa
                  texto={placa.trim() || tu("placa_ph").replace(/^.*?:\s*/, "")}
                  tenue={!placa.trim()}
                  className="text-xl min-w-[9rem] h-12 transition-colors"
                />
                <p className="text-xs text-slate-500 text-center min-h-4 truncate max-w-full">
                  {descripcion.trim() || tui("nueva_unidad")}
                </p>
              </div>
              <div className="p-5 space-y-3.5">
                <div>
                  <label className={labelClases}>{tu("placa")} *</label>
                  <input
                    ref={campoPlaca}
                    type="text"
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value.toUpperCase().slice(0, 50))}
                    onKeyDown={alEnter}
                    placeholder={tu("placa_ph")}
                    className={`${inputClases} uppercase font-mono tracking-wider ${repetida ? "border-amber-300 bg-amber-50" : ""}`}
                  />
                  {repetida && <p className="mt-1.5 text-xs text-amber-700">{tui("placa_repetida")}</p>}
                </div>
                <div>
                  <label className={labelClases}>
                    {tu("descripcion")}{" "}
                    <span className="text-slate-400 font-normal normal-case">({tu("opcional")})</span>
                  </label>
                  <input
                    type="text"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value.slice(0, 200))}
                    onKeyDown={alEnter}
                    placeholder={tu("descripcion_ph")}
                    className={inputClases}
                  />
                </div>
                <BotonPrimario
                  onClick={() => void agregar()}
                  disabled={guardando || !placa.trim() || repetida}
                  icon={guardando ? undefined : Plus}
                  className="w-full"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {tu("agregar")}
                </BotonPrimario>
                {error && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </p>
                )}
              </div>
            </Card>
          </div>

          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-5 border-b border-slate-100">
              <span className="w-10 h-10 rounded-xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center shrink-0">
                <Truck className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{tui("flota")}</h2>
                {!cargando && (
                  <p className="text-xs text-slate-500 tabular-nums">{tu("contador", { count: items.length })}</p>
                )}
              </div>
              {items.length >= BUSCADOR_DESDE && (
                <Buscador
                  valor={busqueda}
                  onChange={setBusqueda}
                  placeholder={tui("buscar")}
                  limpiar={tui("limpiar")}
                  className="w-full sm:w-64"
                />
              )}
            </div>

            <div className="p-5">
              {cargando ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[72px] rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState icon={Truck} texto={tu("vacio")} className="py-10" />
              ) : visibles.length === 0 ? (
                <EmptyState icon={Search} texto={tui("sin_resultados")} className="py-10" />
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibles.map((it) => {
                    const esNueva = nueva !== null && it.placa.toUpperCase() === nueva;
                    return (
                      <li
                        key={it.id}
                        className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.08)] ${
                          esNueva ? "border-violet-300 ring-2 ring-violet-100 animate-in fade-in zoom-in-95" : "border-slate-200/80"
                        }`}
                      >
                        <Placa texto={it.placa} className="text-sm shrink-0" />
                        <p className="min-w-0 flex-1 text-sm text-slate-600 truncate" title={it.descripcion || undefined}>
                          {it.descripcion || <span className="text-slate-300">{tui("sin_descripcion")}</span>}
                        </p>
                        {esNueva && (
                          <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--portal-primary,#741DFE)]">
                            {tui("nuevo")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
