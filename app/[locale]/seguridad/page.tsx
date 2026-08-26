"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ClipboardList,
  LogOut,
  Package,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";

type DashboardData = {
  kpis: {
    ingresos_hoy: number;
    ingresos_hoy_delta: number;
    despachos_hoy: number;
    despachos_hoy_delta: number;
    en_taller_mas_7d: number;
    // null mientras no haya ninguna calificacion en 30 dias: el AVG de MySQL
    // devuelve NULL y el endpoint lo pasa tal cual.
    promedio_calificacion: number | null;
    total_calificaciones_mes: number;
    ingresos_pendientes_despacho: number;
  };
  ingresos_recientes: Array<{
    id: number;
    fecha_entrega: string;
    cliente_nombre: string;
    hardware: string;
    serial: string;
    recibido_por: string;
    accesorios_integros: number;
    sin_manipulacion: number;
    dentro_de_fecha: number;
    falla_cubierta_garantia: number;
    despacho_id: number | null;
  }>;
  despachos_recientes: Array<{
    id: number;
    fecha_despacho: string;
    almacenista_nombre: string;
    cliente_retira: string;
    facturas_json: string | null;
  }>;
  ingresos_pendientes: Array<{
    id: number;
    fecha_entrega: string;
    cliente_nombre: string;
    hardware: string;
    serial: string;
    dias_en_taller: number;
  }>;
  top_almacenistas: Array<{
    nombre: string;
    ingresos_mes: number;
    despachos_mes: number;
    promedio: number;
    calificaciones: number;
  }>;
  alertas: Array<{
    tipo: string;
    cantidad: number;
    dias?: number;
    severidad: "warning" | "info" | "error";
    mensaje: string;
  }>;
};

export default function SeguridadDashboard() {
  const t = useTranslations("seguridad");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user, logout } = useAuthStore();

  const base = `/${locale}/seguridad`;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/seguridad/dashboard");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (!cancelado) setData(json);
      } catch (e: any) {
        if (!cancelado) setError(e.message || "Error");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100">
              <ShieldCheck className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900">
                {t("module_title")}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {t("module_subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-slate-400">{t("logged_in_as")}</p>
              <p className="text-sm font-semibold text-slate-700">
                {user?.name || "Seguridad"}
              </p>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = `/${locale}/seguridad/login`;
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title={t("logout")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Saludo */}
        <section>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
            {t("welcome", { name: user?.name || "" })}
          </h2>
          <p className="text-sm text-slate-500 mt-1">{t("welcome_desc")}</p>
        </section>

        {/* Quick actions */}
        <section className="flex flex-wrap gap-2">
          <Link
            href={`${base}/ingreso/nuevo`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            <ClipboardList className="w-4 h-4" />
            {t("actions.ingreso.title")}
          </Link>
          <Link
            href={`${base}/despacho/nuevo`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Send className="w-4 h-4" />
            {t("actions.despacho.title")}
          </Link>
          {/* Entrada al mostrador (#39). Desde que Seguridad se llega por el
              sidebar del panel (#30) y no por su propio subdominio, esta es la
              puerta a la vista de telefono: se abre una vez desde el panel y se
              guarda en la pantalla de inicio. */}
          <Link
            href={`${base}/mostrador`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Smartphone className="w-4 h-4" />
            {t("mostrador.abrir")}
          </Link>
        </section>

        {loading ? (
          <div className="text-center text-slate-400 py-12">
            {t("dashboard.loading")}
          </div>
        ) : error || !data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <AlertTriangle className="w-5 h-5 inline mr-2" />
            {t("dashboard.error")}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI
                label={t("dashboard.kpi.ingresos_hoy")}
                value={data.kpis.ingresos_hoy}
                delta={data.kpis.ingresos_hoy_delta}
                icon={<ClipboardList className="w-4 h-4" />}
                accent="violet"
              />
              <KPI
                label={t("dashboard.kpi.despachos_hoy")}
                value={data.kpis.despachos_hoy}
                delta={data.kpis.despachos_hoy_delta}
                icon={<Send className="w-4 h-4" />}
                accent="emerald"
              />
              <KPI
                label={t("dashboard.kpi.en_taller")}
                value={data.kpis.en_taller_mas_7d}
                icon={<Package className="w-4 h-4" />}
                accent={data.kpis.en_taller_mas_7d > 0 ? "amber" : "slate"}
                warning={data.kpis.en_taller_mas_7d > 0}
              />
              <KPI
                label={t("dashboard.kpi.promedio")}
                value={
                  data.kpis.promedio_calificacion === null
                    ? "—"
                    : data.kpis.promedio_calificacion.toFixed(1)
                }
                icon={<Star className="w-4 h-4" />}
                accent="violet"
                subtitle={t("dashboard.kpi.total_calif", {
                  count: data.kpis.total_calificaciones_mes,
                })}
              />
            </section>

            {/* Alertas */}
            {data.alertas.length > 0 && (
              <section className="space-y-2">
                {data.alertas.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-2xl border p-4 ${
                      a.severidad === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-blue-200 bg-blue-50 text-blue-800"
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium flex-1">{a.mensaje}</p>
                  </div>
                ))}
              </section>
            )}

            {/* Ingresos pendientes (los más urgentes primero) */}
            {data.ingresos_pendientes.length > 0 && (
              <Card
                title={t("dashboard.ingresos_pendientes")}
                cta={t("dashboard.ver_todos")}
                href={`${base}/ingreso`}
              >
                <div className="divide-y divide-slate-100">
                  {data.ingresos_pendientes.slice(0, 5).map((i) => (
                    <Link
                      key={i.id}
                      href={`${base}/ingreso/${i.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="text-xs text-slate-500 w-16">
                        {i.fecha_entrega}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {i.cliente_nombre}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {i.hardware} {i.serial && `· ${i.serial}`}
                        </p>
                      </div>
                      <Badge tone="warning">
                        {t("dashboard.dias_en_taller", { count: i.dias_en_taller })}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Top almacenistas */}
            {data.top_almacenistas.length > 0 && (
              <Card
                title={t("dashboard.top_almacenistas")}
                cta={t("dashboard.ver_todos")}
                href={`${base}/almacenista`}
              >
                <div className="divide-y divide-slate-100">
                  {data.top_almacenistas.slice(0, 5).map((a) => (
                    <Link
                      key={a.nombre}
                      href={`${base}/almacenista/${encodeURIComponent(a.nombre)}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {a.nombre}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t("dashboard.almacenista_stats", {
                            ingresos: a.ingresos_mes,
                            despachos: a.despachos_mes,
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-violet-600 fill-violet-600" />
                        <span className="font-bold text-violet-700 tabular-nums">
                          {a.promedio.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 w-12 text-right tabular-nums">
                        ({a.calificaciones})
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Movimientos recientes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card
                title={t("dashboard.ingresos_recientes")}
                cta={t("dashboard.ver_todos")}
                href={`${base}/ingreso`}
                compact
              >
                {data.ingresos_recientes.length === 0 ? (
                  <Empty t={t} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.ingresos_recientes.slice(0, 5).map((i) => (
                      <Link
                        key={i.id}
                        href={`${base}/ingreso/${i.id}`}
                        className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate flex-1">
                            {i.cliente_nombre}
                          </p>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {i.fecha_entrega}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {i.hardware}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title={t("dashboard.despachos_recientes")}
                cta={t("dashboard.ver_todos")}
                href={`${base}/despacho`}
                compact
              >
                {data.despachos_recientes.length === 0 ? (
                  <Empty t={t} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.despachos_recientes.slice(0, 5).map((d) => (
                      <Link
                        key={d.id}
                        href={`${base}/despacho/${d.id}`}
                        className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate flex-1">
                            {d.almacenista_nombre}
                          </p>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {d.fecha_despacho}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {d.cliente_retira || "—"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
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
  icon,
  accent,
  subtitle,
  warning,
}: {
  label: string;
  value: number | string;
  delta?: number;
  icon: React.ReactNode;
  accent: "violet" | "emerald" | "amber" | "slate";
  subtitle?: string;
  warning?: boolean;
}) {
  const accents: Record<string, string> = {
    violet: "from-violet-50 to-violet-100/50 border-violet-100",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-100",
    amber: "from-amber-50 to-amber-100/50 border-amber-200",
    slate: "from-slate-50 to-slate-100/50 border-slate-200",
  };
  const iconBgs: Record<string, string> = {
    violet: "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 ${
        accents[accent]
      } ${warning ? "ring-1 ring-amber-300" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <span className={`p-1 rounded ${iconBgs[accent]}`}>{icon}</span>
      </div>
      <p className="text-3xl sm:text-4xl font-black text-slate-900 tabular-nums">
        {value}
      </p>
      {typeof delta === "number" && (
        <p
          className={`text-xs mt-1 flex items-center gap-1 ${
            delta > 0
              ? "text-emerald-600"
              : delta < 0
              ? "text-red-600"
              : "text-slate-500"
          }`}
        >
          {delta > 0 ? (
            <ArrowUp className="w-3 h-3" />
          ) : delta < 0 ? (
            <ArrowDown className="w-3 h-3" />
          ) : null}
          {delta > 0 ? "+" : ""}
          {delta} vs ayer
        </p>
      )}
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function Card({
  title,
  cta,
  href,
  children,
  compact,
}: {
  title: string;
  cta?: string;
  href?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          {title}
        </h2>
        {href && cta && (
          <Link
            href={href}
            className="text-xs font-semibold text-violet-700 hover:text-violet-900"
          >
            {cta} →
          </Link>
        )}
      </div>
      <div className={compact ? "py-1" : ""}>{children}</div>
    </section>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "warning" | "ok" | "neutral";
}) {
  const tones: Record<string, string> = {
    warning: "bg-amber-100 text-amber-700",
    ok: "bg-emerald-100 text-emerald-700",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Empty({ t }: { t: any }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-400">
      {t("dashboard.empty")}
    </div>
  );
}