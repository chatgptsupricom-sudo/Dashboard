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
  FileText,
  LayoutDashboard,
  Plus,
  Star,
  TrendingUp,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";
import {
  PageHeader,
  Card,
  EmptyState,
  BotonPrimario,
  BotonSecundario,
} from "./mercancia-ui";

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
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={LayoutDashboard}
        titulo={td("titulo")}
        subtitulo={`${td("subtitulo")} · ${user?.name || ""}`}
        accion={
          <div className="hidden sm:flex items-center gap-2">
            <BotonSecundario href={`/${locale}/seguridad/mercancia/ordenes`} icon={FileText}>
              {td("ver_ordenes")}
            </BotonSecundario>
            <BotonPrimario href={`${base}/nuevo`} icon={Plus}>
              {tm("nuevo")}
            </BotonPrimario>
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex sm:hidden items-center gap-2">
          <BotonSecundario href={`/${locale}/seguridad/mercancia/ordenes`} icon={FileText} className="flex-1">
            {td("ver_ordenes")}
          </BotonSecundario>
          <BotonPrimario href={`${base}/nuevo`} icon={Plus} className="flex-1">
            {tm("nuevo")}
          </BotonPrimario>
        </div>

        {cargando ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : error || !data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="break-words">{error || td("error")}</span>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI
                icon={TrendingUp}
                label={td("kpi_egresos_hoy")}
                value={data.kpis.egresos_hoy}
                delta={data.kpis.egresos_hoy_delta}
              />
              <KPI
                icon={Clock}
                label={td("kpi_pendientes")}
                value={data.kpis.pendientes_verificar}
                tono={data.kpis.pendientes_verificar > 0 ? "amber" : "neutral"}
              />
              <KPI
                icon={AlertTriangle}
                label={td("kpi_descuadres")}
                value={data.kpis.descuadres_30d}
                tono={data.kpis.descuadres_30d > 0 ? "red" : "neutral"}
              />
              <KPI
                icon={Star}
                label={td("kpi_promedio")}
                value={
                  data.kpis.promedio_calificacion !== null
                    ? data.kpis.promedio_calificacion.toFixed(1)
                    : "—"
                }
                subtitle={td("kpi_total_calif", { count: data.kpis.total_calificaciones_mes })}
              />
            </section>

            <Card padded={false}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-[13px] font-semibold text-slate-900">{td("recientes")}</h2>
                <Link
                  href={base}
                  className="text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75 flex items-center gap-0.5"
                >
                  {td("ver_todos")}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {data.egresos_recientes.length === 0 ? (
                <EmptyState icon={FileText} texto={td("vacio")} />
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.egresos_recientes.map((e) => (
                    <Link
                      key={e.id}
                      href={`${base}/${e.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 transition-colors"
                    >
                      <EstadoIcono estado={e.estado} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {e.odoo_picking_name || tm("sin_factura")}
                          {e.contraparte ? ` · ${e.contraparte}` : ""}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {fechaCorta(e.fecha)} · {e.almacenista_nombre}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            {data.top_almacenistas.length > 0 && (
              <Card padded={false}>
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-[13px] font-semibold text-slate-900">
                    {td("top_almacenistas")}
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.top_almacenistas.map((a) => (
                    <div key={a.nombre} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{a.nombre}</p>
                        <p className="text-xs text-slate-500">{a.egresos} egresos</p>
                      </div>
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">
                        {a.promedio.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400 w-10 text-right tabular-nums">
                        ({a.calificaciones})
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  delta,
  subtitle,
  tono = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  delta?: number;
  subtitle?: string;
  tono?: "neutral" | "amber" | "red";
}) {
  const iconClases =
    tono === "red"
      ? "bg-red-50 text-red-600"
      : tono === "amber"
        ? "bg-amber-50 text-amber-600"
        : "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]";
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconClases}`}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-2xl sm:text-3xl font-semibold text-slate-900 tabular-nums mt-3 tracking-tight">
        {value}
      </p>
      <p className="text-[11px] font-medium text-slate-500 mt-1">{label}</p>
      {typeof delta === "number" && (
        <p className="text-[11px] text-slate-400 mt-0.5">
          {delta > 0 ? "+" : ""}
          {delta} vs ayer
        </p>
      )}
      {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EstadoIcono({ estado }: { estado: "pendiente" | "conforme" | "descuadre" }) {
  const conf = {
    conforme: { icon: CheckCircle2, clase: "bg-emerald-50 text-emerald-600" },
    descuadre: { icon: AlertTriangle, clase: "bg-red-50 text-red-600" },
    pendiente: { icon: Clock, clase: "bg-amber-50 text-amber-600" },
  }[estado];
  const Icon = conf.icon;
  return (
    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${conf.clase}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}
