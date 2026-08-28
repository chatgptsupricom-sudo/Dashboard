"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { fechaCorta } from "@/lib/fecha";

/**
 * Facturas de venta de Odoo que Almacen todavia no proceso como egreso.
 *
 * Antes de esto, para registrar un egreso habia que saber de memoria el
 * numero exacto de la factura y escribirlo en el buscador. Esta pantalla
 * existe para navegar en vez de adivinar.
 */

type Orden = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  contraparte: string;
  estado: string;
  origen: string | null;
  fecha: string | null;
};

export default function MercanciaOrdenes() {
  const to = useTranslations("seguridad.mercancia.ordenes");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/seguridad/mercancia/pendientes");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setOrdenes(json.ordenes || []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <h1 className="text-base sm:text-lg font-bold text-slate-900">{to("titulo")}</h1>
          <p className="text-xs text-slate-500">{to("subtitulo")}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {to("error")}
          </div>
        ) : ordenes.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
            {to("vacio")}
          </div>
        ) : (
          ordenes.map((o) => (
            <Link
              key={o.odoo_picking_id}
              href={`/${locale}/seguridad/mercancia/ordenes/${encodeURIComponent(o.odoo_picking_name)}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-violet-300 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {o.odoo_picking_name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {o.contraparte || "—"}
                  {o.fecha ? ` · ${fechaCorta(o.fecha)}` : ""}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
