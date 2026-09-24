"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, PackageCheck, Search, X } from "lucide-react";

/**
 * "Lo que llego": los productos que entraron al almacen de Valencia, por
 * fecha de llegada. Para el Diseñador y AdminLeads (Valencia): solo la fecha
 * y los productos, sin proveedor, contenedores, precintos ni fotos.
 */

type Producto = { codigo: string | null; producto: string; cantidad: number };
type Dia = { fecha: string; productos: Producto[] };

function fechaLarga(dia: string): string {
  // Mediodia para que el cambio de zona no corra el dia.
  const d = new Date(`${dia}T12:00:00`);
  const txt = new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export default function LlegadasProductos() {
  const t = useTranslations("llegadas");
  const [dias, setDias] = useState<Dia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/recepcion/llegadas");
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || t("error"));
        setDias(j.llegadas || []);
      } catch (e: any) {
        setError(e?.message || t("error"));
      } finally {
        setCargando(false);
      }
    })();
  }, [t]);

  // La busqueda filtra productos; un dia sin coincidencias no se muestra.
  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return dias;
    return dias
      .map((d) => ({
        ...d,
        productos: d.productos.filter((p) => `${p.producto} ${p.codigo || ""}`.toLowerCase().includes(q)),
      }))
      .filter((d) => d.productos.length > 0);
  }, [dias, busca]);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("titulo")}</h1>
            <p className="text-sm text-slate-500">{t("subtitulo")}</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("buscar")}
            aria-label={t("buscar")}
            className="w-full h-11 pl-9 pr-9 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label={t("limpiar")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {cargando ? (
          <div className="py-16 flex justify-center text-slate-300">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : visibles.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
            {busca ? t("sin_resultados") : t("vacio")}
          </div>
        ) : (
          visibles.map((d) => {
            const unidades = d.productos.reduce((n, p) => n + p.cantidad, 0);
            return (
              <section key={d.fecha} className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900">{fechaLarga(d.fecha)}</h2>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {t("resumen", { productos: d.productos.length, unidades })}
                  </p>
                </header>
                <ul className="divide-y divide-slate-50">
                  {d.productos.map((p) => (
                    <li key={`${p.codigo}-${p.producto}`} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate" title={p.producto}>
                          {p.producto}
                        </p>
                        {p.codigo && <p className="text-[11px] text-slate-400 font-mono">{p.codigo}</p>}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">{p.cantidad.toLocaleString("es-VE")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
