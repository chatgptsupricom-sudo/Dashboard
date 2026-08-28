"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText, Loader2, Package, Send } from "lucide-react";
import { PageHeader, Card, SectionTitle, BotonPrimario } from "./mercancia-ui";

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
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={FileText}
        titulo={nombre}
        volverA={`/${locale}/seguridad/mercancia/ordenes`}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-28">
        {cargando ? (
          <div className="flex items-center justify-center py-20 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error || !picking ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {to("error")}
          </div>
        ) : (
          <>
            <Card>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                {tm("cliente")}
              </p>
              <p className="text-[15px] font-semibold text-slate-900 mt-0.5">
                {picking.contraparte || "—"}
              </p>
              {picking.origen && (
                <p className="text-xs text-slate-400 mt-1">{picking.origen}</p>
              )}
            </Card>

            <Card>
              <SectionTitle>
                {tm("items")} ({picking.lineas.length})
              </SectionTitle>
              <div className="divide-y divide-slate-100 -mx-5">
                {picking.lineas.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{l.producto}</p>
                      {l.codigo && (
                        <p className="text-[11px] font-mono text-slate-400">{l.codigo}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-slate-700">
                      {l.cantidad_cargada}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>

      {picking && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200/70 bg-white/90 backdrop-blur">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
            <BotonPrimario
              href={`/${locale}/seguridad/mercancia/egreso/nuevo?factura=${encodeURIComponent(nombre)}`}
              icon={Send}
              className="w-full h-12"
            >
              {to("registrar_egreso")}
            </BotonPrimario>
          </div>
        </div>
      )}
    </div>
  );
}
