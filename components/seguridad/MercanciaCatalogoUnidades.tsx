"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Truck, XCircle } from "lucide-react";
import { PageHeader, Card, EmptyState, BotonPrimario, inputClases, labelClases } from "./mercancia-ui";

/**
 * Catalogo de unidades (vehiculos): placa + descripcion opcional. Alimenta
 * el select de "Placa del vehiculo" en el formulario de mercancia.
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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
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

        <Card padded={false}>
          {cargando ? (
            <div className="flex items-center justify-center py-14 text-slate-300">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Truck} texto={tu("vacio")} />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4" />
                  </span>
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
        </Card>
      </main>
    </div>
  );
}
