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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-2.5">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl">
            <EmptyState icon={FileText} texto={to("vacio")} />
          </div>
        ) : (
          ordenes.map((o) => (
            <Link
              key={o.odoo_picking_id}
              href={`/${locale}/seguridad/mercancia/ordenes/${encodeURIComponent(o.odoo_picking_name)}`}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:shadow-[0_2px_8px_rgba(116,29,254,0.08)] transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {o.odoo_picking_name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {o.contraparte || "—"}
                  {o.fecha ? ` · ${fechaCorta(o.fecha)}` : ""}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 shrink-0 transition-colors" />
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
