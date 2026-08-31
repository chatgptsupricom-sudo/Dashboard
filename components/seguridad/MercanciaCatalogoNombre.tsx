"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, User, Users, XCircle } from "lucide-react";
import { PageHeader, Card, EmptyState, BotonPrimario, inputClases, labelClases } from "./mercancia-ui";

/**
 * Catalogo simple de un solo campo (nombre): sirve tanto para Almacenistas
 * como para Choferes, que son la misma forma con distinto endpoint y texto.
 * Registrar aca es lo que alimenta el select del formulario de mercancia —
 * antes esos campos eran texto libre.
 *
 * El formulario de alta queda angosto y centrado (es un solo campo, no
 * necesita ancho); la lista de abajo se abre en grid porque puede llegar a
 * tener decenas de nombres y se ve en pantallas de todos los tamaños.
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
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={Users} titulo={titulo} subtitulo={subtitulo} volverA={volverA} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        <div className="max-w-xl">
          <Card>
            <label className={labelClases}>{campoLabel}</label>
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
                className={inputClases}
              />
              <BotonPrimario
                onClick={() => void agregar()}
                disabled={guardando || !nombre.trim()}
                icon={guardando ? undefined : Plus}
                className="w-11 px-0 shrink-0"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              </BotonPrimario>
            </div>
            {error && (
              <p className="mt-2.5 text-sm text-red-600 flex items-center gap-1.5">
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
            <EmptyState icon={User} texto={vacioTexto} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </span>
                <span className="text-sm text-slate-800 font-medium truncate">{it.nombre}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
