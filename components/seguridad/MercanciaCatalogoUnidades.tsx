"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Truck, XCircle } from "lucide-react";

/**
 * Catalogo de unidades (vehiculos): placa + descripcion opcional. Alimenta
 * el select de "Placa del vehiculo" en el formulario de mercancia.
 */

type Unidad = { id: number; placa: string; descripcion: string | null };

export default function MercanciaCatalogoUnidades({ volverA }: { volverA: string }) {
  const t = useTranslations("seguridad");
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
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={volverA}
            className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{tu("titulo")}</h1>
            <p className="text-xs text-slate-500">{tu("subtitulo")}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {tu("placa")} *
            </label>
            <input
              type="text"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase().slice(0, 50))}
              placeholder={tu("placa_ph")}
              className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm uppercase focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {tu("descripcion")}{" "}
              <span className="text-slate-400 font-normal">({tu("opcional")})</span>
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value.slice(0, 200))}
              placeholder={tu("descripcion_ph")}
              className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void agregar()}
            disabled={guardando || !placa.trim()}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {tu("agregar")}
          </button>
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {error}
            </p>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-[10px]">
          {cargando ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{tu("vacio")}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-5 py-3">
                  <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{it.placa}</p>
                    {it.descripcion && (
                      <p className="text-xs text-slate-500 truncate">{it.descripcion}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
