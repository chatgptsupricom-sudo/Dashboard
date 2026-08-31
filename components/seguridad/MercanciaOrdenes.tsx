"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, FileText, Loader2 } from "lucide-react";
import { fechaCorta } from "@/lib/fecha";
import { PageHeader, EmptyState } from "./mercancia-ui";

/**
 * Facturas de venta de Odoo que Almacen todavia no proceso como egreso.
 *
 * Antes de esto, para registrar un egreso habia que saber de memoria el
 * numero exacto de la factura y escribirlo en el buscador. Esta pantalla
 * existe para navegar en vez de adivinar.
 *
 * Grid y no lista: esta pantalla puede traer decenas de facturas, y se ve en
 * todo — telefono, tablet, monitor, hasta un televisor de sala. Una lista de
 * una sola columna se ve razonable en un telefono y ridicula (una tira
 * angosta en medio de una pantalla enorme) en una pantalla grande.
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
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/seguridad/mercancia/pendientes");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "fetch failed");
      setOrdenes(json.ordenes || []);
    } catch (e: any) {
      // El backend ya trae la causa concreta ([odoo]/[mysql] + el mensaje
      // real) — mostrarla en vez de un generico ayuda a diagnosticar sin
      // acceso a los logs del servidor.
      setError(e?.message || to("error"));
    } finally {
      setCargando(false);
    }
  }, [to]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={FileText} titulo={to("titulo")} subtitulo={to("subtitulo")} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {cargando ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        ) : ordenes.length === 0 ? (
          <EmptyState icon={FileText} texto={to("vacio")} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {ordenes.map((o) => (
              <Link
                key={o.odoo_picking_id}
                href={`/${locale}/seguridad/mercancia/ordenes/${encodeURIComponent(o.odoo_picking_name)}`}
                className="group relative flex flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.1)] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between">
                  <span className="w-10 h-10 rounded-xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center shrink-0">
                    <FileText className="w-[18px] h-[18px]" />
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-400 shrink-0 transition-colors" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {o.odoo_picking_name}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {o.contraparte || "—"}
                  </p>
                  {o.fecha && (
                    <p className="text-[11px] text-slate-400 mt-1.5">{fechaCorta(o.fecha)}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
