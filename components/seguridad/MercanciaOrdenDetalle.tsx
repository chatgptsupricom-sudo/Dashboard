"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Send } from "lucide-react";

/**
 * Detalle de una factura de venta, leido directo de Odoo.
 *
 * Reusa el mismo endpoint que ya usaba el buscador de MercanciaNueva
 * (/api/seguridad/mercancia/odoo/[nombre]?tipo=egreso) — el detalle
 * "completo" de una factura es exactamente lo que ese endpoint ya trae.
 */

type Linea = {
  producto: string;
  codigo: string | null;
  cantidad_cargada: number;
};

type Picking = {
  odoo_picking_name: string;
  contraparte: string;
  estado: string;
  origen: string | null;
  lineas: Linea[];
};

export default function MercanciaOrdenDetalle({ nombre }: { nombre: string }) {
  const to = useTranslations("seguridad.mercancia.ordenes");
  const tm = useTranslations("seguridad.mercancia");
  const t = useTranslations("seguridad");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [picking, setPicking] = useState<Picking | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/seguridad/mercancia/odoo/${encodeURIComponent(nombre)}?tipo=egreso`,
      );
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setPicking(json.picking);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [nombre]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={`/${locale}/seguridad/mercancia/ordenes`}
            className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{nombre}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">
        {cargando ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error || !picking ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {to("error")}
          </div>
        ) : (
          <>
            <section className="bg-white border border-slate-200 rounded-[10px] p-5">
              <p className="text-xs text-slate-500">{tm("cliente")}</p>
              <p className="text-sm font-semibold text-slate-900">{picking.contraparte || "—"}</p>
              {picking.origen && (
                <p className="text-xs text-slate-400 mt-1">{picking.origen}</p>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-[10px] p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3">
                {tm("items")} ({picking.lineas.length})
              </h2>
              <div className="divide-y divide-slate-100">
                {picking.lineas.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 truncate">{l.producto}</p>
                      {l.codigo && (
                        <p className="text-[11px] font-mono text-slate-400">{l.codigo}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-700">
                      {l.cantidad_cargada}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {picking && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
            <Link
              href={`/${locale}/seguridad/mercancia/egreso/nuevo?factura=${encodeURIComponent(nombre)}`}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
            >
              <Send className="w-4 h-4" />
              {to("registrar_egreso")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
