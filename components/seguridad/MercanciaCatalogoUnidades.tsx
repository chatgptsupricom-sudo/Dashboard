"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Truck, XCircle } from "lucide-react";
import { PageHeader, Card, EmptyState, BotonPrimario, inputClases, labelClases } from "./mercancia-ui";

/**
 * Catalogo de unidades (vehiculos): placa + descripcion opcional. Alimenta
 * el select de "Placa del vehiculo" en el formulario de mercancia.
 *
 * El formulario de alta queda angosto y centrado; la lista de abajo se abre
 * en grid porque puede tener muchas unidades y se ve en pantallas de todos
 * los tamaños.
 */

type Unidad = { id: number; placa: string; descripcion: string | null };

export default function MercanciaCatalogoUnidades({ volverA }: { volverA: string }) {
  const tu = useTranslations("seguridad.mercancia.unidades");

  const [items, setItems] = useState<Unidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [placa, setPlaca] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const agregar = async () => {
    const p = placa.trim();
    if (!p) return;
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
      void cargar();
    } catch {
      setError(tu("error"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={Truck} titulo={tu("titulo")} subtitulo={tu("subtitulo")} volverA={volverA} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        <div className="max-w-xl">
          <Card className="space-y-3.5">
            <div>
              <label className={labelClases}>{tu("placa")} *</label>
              <input
                type="text"
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase().slice(0, 50))}
                placeholder={tu("placa_ph")}
                className={`${inputClases} uppercase`}
              />
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
                placeholder={tu("descripcion_ph")}
                className={inputClases}
              />
            </div>
            <BotonPrimario
              onClick={() => void agregar()}
              disabled={guardando || !placa.trim()}
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
          </Card>
        </div>

        {cargando ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl">
            <EmptyState icon={Truck} texto={tu("vacio")} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{it.placa}</p>
                  {it.descripcion && (
                    <p className="text-xs text-slate-500 truncate">{it.descripcion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
