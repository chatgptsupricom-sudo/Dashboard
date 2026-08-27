"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
} from "lucide-react";
import { fechaCorta } from "@/lib/fecha";

/**
 * Listado de movimientos de mercancia, compartido por ingresos y egresos.
 *
 * Los dos muestran lo mismo y cambian el titulo y el filtro; duplicar la
 * pantalla seria mantener dos veces la misma tabla.
 */

type Movimiento = {
  id: number;
  tipo: "ingreso" | "egreso";
  fecha: string;
  odoo_picking_name: string | null;
  cliente_nombre: string | null;
  almacenista_nombre: string;
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
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1 pl-12 lg:pl-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {tm(tipo === "ingreso" ? "ingreso_titulo" : "egreso_titulo")}
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {tm(tipo === "ingreso" ? "ingreso_sub" : "egreso_sub")}
            </p>
          </div>
          <Link
            href={`${base}/nuevo`}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-[10px] text-sm font-semibold text-white shrink-0"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{tm("nuevo")}</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
            {tm("vacio")}
          </div>
        ) : (
          items.map((m) => (
            <Link
              key={m.id}
              href={`${base}/${m.id}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-violet-300 transition-colors"
            >
              <EstadoBadge estado={m.estado} tm={tm} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {m.odoo_picking_name || tm("sin_orden")}
                  {m.cliente_nombre ? ` · ${m.cliente_nombre}` : ""}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {fechaCorta(m.fecha)} · {m.almacenista_nombre}
                  {m.placa_vehiculo ? ` · ${m.placa_vehiculo}` : ""}
                </p>
              </div>
              <span className="text-xs text-slate-400 tabular-nums shrink-0">
                {m.total_items}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </Link>
          ))
        )}
      </main>
    </div>
  );
}

function EstadoBadge({
  estado,
  tm,
}: {
  estado: "pendiente" | "conforme" | "descuadre";
  tm: any;
}) {
  const conf = {
    conforme: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      clase: "bg-emerald-100 text-emerald-700",
    },
    descuadre: {
      icon: <AlertTriangle className="w-4 h-4" />,
      clase: "bg-red-100 text-red-700",
    },
    pendiente: {
      icon: <Clock className="w-4 h-4" />,
      clase: "bg-amber-100 text-amber-700",
    },
  }[estado];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0 ${conf.clase}`}
      title={tm(estado)}
    >
      {conf.icon}
      <span className="hidden sm:inline">{tm(estado)}</span>
    </span>
  );
}
