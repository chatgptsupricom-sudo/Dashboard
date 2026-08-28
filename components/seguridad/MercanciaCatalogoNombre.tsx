"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, User, XCircle } from "lucide-react";

/**
 * Catalogo simple de un solo campo (nombre): sirve tanto para Almacenistas
 * como para Choferes, que son la misma forma con distinto endpoint y texto.
 * Registrar aca es lo que alimenta el select del formulario de mercancia —
 * antes esos campos eran texto libre.
 */

type Item = { id: number; nombre: string };

export default function MercanciaCatalogoNombre({
  endpoint,
  listKey,
  titulo,
  subtitulo,
  campoLabel,
  campoPlaceholder,
  vacioTexto,
  errorTexto,
  volverA,
}: {
  endpoint: string;
  listKey: string;
  titulo: string;
  subtitulo: string;
  campoLabel: string;
  campoPlaceholder: string;
  vacioTexto: string;
  errorTexto: string;
  volverA: string;
}) {
  const t = useTranslations("seguridad");

  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const json = await res.json();
      setItems(json[listKey] || []);
    } finally {
      setCargando(false);
    }
  }, [endpoint, listKey]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async () => {
    const v = nombre.trim();
    if (!v) return;
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: v }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "error");
      setNombre("");
      void cargar();
    } catch {
      setError(errorTexto);
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
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{titulo}</h1>
            <p className="text-xs text-slate-500">{subtitulo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            {campoLabel}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.slice(0, 200))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void agregar();
                }
              }}
              placeholder={campoPlaceholder}
              className="flex-1 h-12 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            />
            <button
              type="button"
              onClick={() => void agregar()}
              disabled={guardando || !nombre.trim()}
              className="h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-2">
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
            <p className="py-12 text-center text-sm text-slate-400">{vacioTexto}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-5 py-3">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-900">{it.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
