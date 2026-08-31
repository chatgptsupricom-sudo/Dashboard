"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, User, Users, XCircle } from "lucide-react";
import { PageHeader, Card, EmptyState, BotonPrimario, inputClases, labelClases } from "./mercancia-ui";

/**
 * Catalogo simple de un solo campo (nombre): sirve tanto para Almacenistas
 * como para Choferes, que son la misma forma con distinto endpoint y texto.
 * Registrar aca es lo que alimenta el select del formulario de mercancia —
 * antes esos campos eran texto libre.
 *
 * Layout de dos columnas en pantallas anchas: el formulario de alta (un
 * campo) fijo a la izquierda, la lista a la derecha. Apilar los dos y dejar
 * el formulario angosto y solo en medio de una pantalla ancha era lo que se
 * veia mal — media pantalla en blanco al lado de un input.
 */

type Item = { id: number; nombre: string };

export default function MercanciaCatalogoNombre({
  endpoint,
  listKey,
  namespace,
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
  /** Namespace de i18n (ej. "seguridad.mercancia.almacenistas_catalogo") —
   * solo para el contador plural, que necesita el `count` en el momento
   * de renderizar y no se puede precalcular en el server component padre. */
  namespace: string;
  titulo: string;
  subtitulo: string;
  campoLabel: string;
  campoPlaceholder: string;
  vacioTexto: string;
  errorTexto: string;
  volverA: string;
}) {
  const t = useTranslations(namespace);
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

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
          <div className="lg:sticky lg:top-24">
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

          <div>
            {!cargando && items.length > 0 && (
              <p className="text-xs font-medium text-slate-400 mb-3">
                {t("contador", { count: items.length })}
              </p>
            )}
            {cargando ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={User} texto={vacioTexto} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
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
          </div>
        </div>
      </main>
    </div>
  );
}
