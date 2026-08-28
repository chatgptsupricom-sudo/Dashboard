"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  ClipboardList,
  Loader2,
  Star,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";

/**
 * KPIs del egreso de mercancia para Almacen: cuanto salio hoy, cuanto falta
 * por verificar, si hubo descuadres, y quien esta mejor calificado.
 *
 * Deliberadamente solo egresos — Almacen no ve ingreso, ese sigue siendo el
 * dashboard de Seguridad en /seguridad.
 */

type Dashboard = {
  kpis: {
    egresos_hoy: number;
    egresos_hoy_delta: number;
    pendientes_verificar: number;
    descuadres_30d: number;
    promedio_calificacion: number | null;
    total_calificaciones_mes: number;
  };
  egresos_recientes: Array<{
    id: number;
    fecha: string;
    odoo_picking_name: string | null;
    contraparte: string | null;
    almacenista_nombre: string;
    almacenistas_json: string | null;
    estado: "pendiente" | "conforme" | "descuadre";
  }>;
  top_almacenistas: Array<{
    nombre: string;
    egresos: number;
    promedio: number;
    calificaciones: number;
  }>;
};

export default function MercanciaDashboard() {
  const tm = useTranslations("seguridad.mercancia");
  const td = useTranslations("seguridad.mercancia.dashboard");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const base = `/${locale}/seguridad/mercancia/egreso`;

  const [data, setData] = useState<Dashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/seguridad/mercancia/dashboard");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "fetch failed");
      setData(json);
    } catch (e: any) {
      // El backend ya trae el error real (ej. una columna que la migracion
      // todavia no agrego) — mostrarlo en vez de un generico ayuda a
      // diagnosticar sin acceso a los logs del servidor.
      setError(e?.message || td("error"));
    } finally {
      setCargando(false);
    }
  }, [td]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <h1 className="text-base sm:text-lg font-bold text-slate-900">
            {td("titulo")}
          </h1>
          <p className="text-xs text-slate-500">
            {td("subtitulo")} · {user?.name}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${base}/nuevo`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {tm("nuevo")}
          </Link>
          <Link
            href={`/${locale}/seguridad/mercancia/ordenes`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ClipboardList className="w-4 h-4" />
            {td("ver_ordenes")}
          </Link>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="break-words">{error || td("error")}</span>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI label={td("kpi_egresos_hoy")} value={data.kpis.egresos_hoy} delta={data.kpis.egresos_hoy_delta} />
              <KPI
                label={td("kpi_pendientes")}
                value={data.kpis.pendientes_verificar}
                warning={data.kpis.pendientes_verificar > 0}
              />
              <KPI
                label={td("kpi_descuadres")}
                value={data.kpis.descuadres_30d}
                warning={data.kpis.descuadres_30d > 0}
                danger={data.kpis.descuadres_30d > 0}
              />
              <KPI
                label={td("kpi_promedio")}
                value={
                  data.kpis.promedio_calificacion !== null
                    ? data.kpis.promedio_calificacion.toFixed(1)
                    : "—"
                }
                subtitle={td("kpi_total_calif", { count: data.kpis.total_calificaciones_mes })}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  {td("recientes")}
                </h2>
                <Link href={base} className="text-xs font-semibold text-violet-700 hover:text-violet-900">
                  {td("ver_todos")} →
                </Link>
              </div>
              {data.egresos_recientes.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400">{td("vacio")}</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.egresos_recientes.map((e) => (
                    <Link
                      key={e.id}
                      href={`${base}/${e.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <EstadoBadge estado={e.estado} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {e.odoo_picking_name || tm("sin_factura")}
                          {e.contraparte ? ` · ${e.contraparte}` : ""}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {fechaCorta(e.fecha)} · {e.almacenista_nombre}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {data.top_almacenistas.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    {td("top_almacenistas")}
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.top_almacenistas.map((a) => (
                    <div key={a.nombre} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{a.nombre}</p>
                        <p className="text-xs text-slate-500">{a.egresos} egresos</p>
                      </div>
                      <Star className="w-4 h-4 text-violet-600 fill-violet-600" />
                      <span className="font-bold text-violet-700 tabular-nums">
                        {a.promedio.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400 w-10 text-right tabular-nums">
                        ({a.calificaciones})
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function KPI({
  label,
  value,
  delta,
  subtitle,
  warning,
  danger,
}: {
  label: string;
  value: number | string;
  delta?: number;
  subtitle?: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 ${
        danger
          ? "from-red-50 to-red-100/50 border-red-200"
          : warning
            ? "from-amber-50 to-amber-100/50 border-amber-200"
            : "from-violet-50 to-violet-100/50 border-violet-100"
      }`}
    >
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <p className="text-3xl sm:text-4xl font-black text-slate-900 tabular-nums mt-2">
        {value}
      </p>
      {typeof delta === "number" && (
        <p className="text-xs mt-1 text-slate-500">
          {delta > 0 ? "+" : ""}
          {delta} vs ayer
        </p>
      )}
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: "pendiente" | "conforme" | "descuadre" }) {
  const conf = {
    conforme: { icon: <Star className="w-4 h-4" />, clase: "bg-emerald-100 text-emerald-700" },
    descuadre: { icon: <AlertTriangle className="w-4 h-4" />, clase: "bg-red-100 text-red-700" },
    pendiente: { icon: <Clock className="w-4 h-4" />, clase: "bg-amber-100 text-amber-700" },
  }[estado];
  return (
    <span className={`inline-flex items-center p-1.5 rounded-lg shrink-0 ${conf.clase}`}>
      {conf.icon}
    </span>
  );
}
