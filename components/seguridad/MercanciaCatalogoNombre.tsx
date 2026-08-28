"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, User, Users, XCircle } from "lucide-react";
import { PageHeader, Card, EmptyState, BotonPrimario, inputClases, labelClases } from "./mercancia-ui";

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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
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

        <Card padded={false}>
          {cargando ? (
            <div className="flex items-center justify-center py-14 text-slate-300">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={User} texto={vacioTexto} />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </span>
                  <span className="text-sm text-slate-800 font-medium">{it.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
