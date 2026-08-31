"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Loader2, Package, Plus } from "lucide-react";
import { fechaCorta } from "@/lib/fecha";
import { PageHeader, EmptyState, BotonPrimario } from "./mercancia-ui";

/**
 * Listado de movimientos de mercancia, compartido por ingresos y egresos.
 *
 * Los dos muestran lo mismo y cambian el titulo y el filtro; duplicar la
 * pantalla seria mantener dos veces la misma tabla.
 *
 * Grid y no lista: se ve en telefono, tablet, monitor y hasta television de
 * sala — una sola columna angosta desperdicia el ancho en cualquier pantalla
 * que no sea un telefono.
 */

type Movimiento = {
  id: number;
  tipo: "ingreso" | "egreso";
  fecha: string;
  odoo_picking_name: string | null;
  contraparte: string | null;
  almacenista_nombre: string;
  almacenistas: string[];
  chofer_nombre: string | null;
  placa_vehiculo: string | null;
  estado: "pendiente" | "conforme" | "descuadre";
  total_items: number;
  items_con_diferencia: number;
};

export default function MercanciaLista({ tipo }: { tipo: "ingreso" | "egreso" }) {
  const tm = useTranslations("seguridad.mercancia");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad/mercancia/${tipo}`;

  const [items, setItems] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/seguridad/mercancia?tipo=${tipo}`);
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.movimientos || []);
    } catch {
      // Se deja lo que haya en pantalla.
    } finally {
      setCargando(false);
    }
  }, [tipo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Package}
        titulo={tm(tipo === "ingreso" ? "ingreso_titulo" : "egreso_titulo")}
        subtitulo={tm(tipo === "ingreso" ? "ingreso_sub" : "egreso_sub")}
        accion={
          <BotonPrimario href={`${base}/nuevo`} icon={Plus}>
            <span className="hidden sm:inline">{tm("nuevo")}</span>
          </BotonPrimario>
        }
      />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {cargando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Package} texto={tm("vacio")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {items.map((m) => (
              <Link
                key={m.id}
                href={`${base}/${m.id}`}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.1)] hover:-translate-y-0.5 transition-all"
              >
                <EstadoBadge estado={m.estado} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {m.odoo_picking_name || tm("sin_factura")}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {m.contraparte || "—"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 truncate">
                    {fechaCorta(m.fecha)} ·{" "}
                    {(m.almacenistas?.length ? m.almacenistas : [m.almacenista_nombre]).join(
                      ", ",
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {m.placa_vehiculo && (
                      <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">
                        {m.placa_vehiculo}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                      {m.total_items}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 shrink-0 transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: "pendiente" | "conforme" | "descuadre" }) {
  const conf = {
    conforme: { icon: CheckCircle2, clase: "bg-emerald-50 text-emerald-600" },
    descuadre: { icon: AlertTriangle, clase: "bg-red-50 text-red-600" },
    pendiente: { icon: Clock, clase: "bg-amber-50 text-amber-600" },
  }[estado];
  const Icon = conf.icon;
  return (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.clase}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}
