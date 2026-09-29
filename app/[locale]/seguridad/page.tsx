"use client";

import Link from "next/link";
import { fechaCorta, promedioTexto } from "@/lib/seguridad/formato";
import { type Origen, type ResumenOrigen } from "@/lib/seguridad/origenes";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ClipboardList,
  Send,
  ShieldCheck,
  Star,
  Truck,
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
    /** Por origen: RMA, picking y despacho del egreso (no se mezclan). */
    calificaciones_por_origen?: Record<Origen, ResumenOrigen>;
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
    por_origen?: Record<Origen, ResumenOrigen>;
  }>;
  /** Dashboard de Seguridad: métricas del mes (lib/seguridad/dashboardMes.ts). */
  mes: Mes | null;
  alertas: Array<{
    tipo: string;
    cantidad: number;
    dias?: number;
    severidad: "warning" | "info" | "error";
    mensaje: string;
  }>;
};

type ItemRma = {
  id: number;
  fecha_entrega: string;
  cliente_nombre: string;
  hardware: string;
  serial: string;
  dias_en_taller: number;
  case_number: string | null;
  rma_status: string | null;
};

type Mes = {
  egresos_mes: number;
  rma_ingresos_mes: number;
  rma_despachos_mes: number;
  calificacion: {
    promedio: number | null;
    total: number;
    picking: { promedio: number | null; total: number };
    despacho: { promedio: number | null; total: number };
  };
  ranking_mercancia: Array<{
    nombre: string;
    promedio: number | null;
    calificaciones: number;
    egresos: number;
    picking: number | null;
    despacho: number | null;
  }>;
  rma_mas_7d: { total: number; items: ItemRma[] };
  rma_por_despachar: { total: number; items: ItemRma[] };
  rma_por_llegar: {
    total: number;
    items: Array<{
      id: number;
      case_number: string;
      client_name: string;
      model: string | null;
      hardware: string | null;
      created_at: string;
      dias: number;
    }>;
  };
};

const ESTADO_RMA: Record<string, string> = {
  reparado: "Reparado",
  nota_credito: "Nota de crédito",
  no_procesado: "No procesado",
};

export default function SeguridadDashboard() {
  const t = useTranslations("seguridad");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  // superAdmin entra a mirar (sidebar > Seguridad): solo lectura, sin
  // saludo de "aqui registras" ni botones para registrar.
  const soloLectura = String(user?.role || "").toLowerCase().trim() === "superadmin";

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
          {/* Sin "Sesion iniciada como" ni boton de salir: eran de cuando el
              modulo iba a vivir en su propio subdominio. Dentro del panel ya
              los da el encabezado general, y repetidos parecian una segunda
              sesion encima de la otra. */}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Saludo */}
        <section>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
            {soloLectura ? t("superadmin_title") : t("welcome", { name: user?.name || "" })}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {soloLectura ? t("superadmin_desc") : t("welcome_desc")}
          </p>
        </section>

        {/* Quick actions: solo quien opera Seguridad */}
        {!soloLectura && (
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
        </section>
        )}

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
            {data.mes ? (
              <PanelDelMes mes={data.mes} base={base} t={t} soloLectura={soloLectura} />
            ) : (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
                <AlertTriangle className="w-5 h-5 inline mr-2" />
                {t("dashboard.error")}
              </div>
            )}

            {/* Otras alertas (la de más de 7 días ya tiene su lista arriba). */}
            {data.alertas.filter((a) => a.tipo !== "ingresos_sin_despacho").map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-800"
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium flex-1">{a.mensaje}</p>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Lo del mes: despachos de mercancía, RMA recibidos y devueltos, la nota de
 * los almacenistas en el despacho de mercancía, y los RMA que Seguridad tiene
 * que mover (más de 7 días, por despachar, por llegar).
 */
function PanelDelMes({ mes, base, t, soloLectura }: { mes: Mes; base: string; t: any; soloLectura: boolean }) {
  const listaRma = (items: ItemRma[], tono: "warning" | "ok") => (
    <div className="divide-y divide-slate-100">
      {items.map((i) => (
        <Link
          key={i.id}
          // En solo lectura se abre el ingreso, no el formulario de despacho.
          href={tono === "ok" && !soloLectura ? `${base}/despacho/nuevo?ingreso=${i.id}` : `${base}/ingreso/${i.id}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
        >
          <div className="text-xs text-slate-500 w-16">{fechaCorta(i.fecha_entrega)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{i.cliente_nombre}</p>
            <p className="text-xs text-slate-500 truncate">
              {i.case_number ? `RMA ${i.case_number} · ` : ""}
              {i.hardware} {i.serial && `· ${i.serial}`}
            </p>
          </div>
          {tono === "ok" && i.rma_status ? (
            <Badge tone="ok">{ESTADO_RMA[i.rma_status] || i.rma_status}</Badge>
          ) : (
            <Badge tone="warning">{t("dashboard.dias_en_taller", { count: i.dias_en_taller })}</Badge>
          )}
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </Link>
      ))}
    </div>
  );

  return (
    <>
      {/* Este mes */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          label={t("dashboard.mes.egresos")}
          value={mes.egresos_mes}
          icon={<Truck className="w-4 h-4" />}
          accent="violet"
          subtitle={t("dashboard.mes.egresos_desc")}
        />
        <KPI
          label={t("dashboard.mes.rma_ingresos")}
          value={mes.rma_ingresos_mes}
          icon={<ClipboardList className="w-4 h-4" />}
          accent="slate"
        />
        <KPI
          label={t("dashboard.mes.rma_despachos")}
          value={mes.rma_despachos_mes}
          icon={<Send className="w-4 h-4" />}
          accent="emerald"
        />
        <div className="rounded-2xl border bg-gradient-to-br p-4 from-amber-50 to-amber-100/50 border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t("dashboard.mes.calificacion")}
            </span>
            <span className="p-1 rounded bg-amber-100 text-amber-700">
              <Star className="w-4 h-4" />
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-slate-900 tabular-nums">
            {promedioTexto(mes.calificacion.promedio)}
          </p>
          <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
            {(["picking", "despacho"] as const).map((o) => (
              <div key={o} className="flex justify-between gap-2">
                <dt>{t(`dashboard.origen.${o}`)}</dt>
                <dd className="tabular-nums">
                  {promedioTexto(mes.calificacion[o].promedio)}{" "}
                  <span className="text-slate-400">({mes.calificacion[o].total})</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RMA con más de 7 días sin despachar */}
        <Card
          title={`${t("dashboard.mes.mas_7d")} (${mes.rma_mas_7d.total})`}
          cta={t("dashboard.ver_todos")}
          href={`${base}/ingreso`}
          alerta={mes.rma_mas_7d.total > 0}
        >
          {mes.rma_mas_7d.items.length === 0 ? (
            <Empty t={t} texto={t("dashboard.mes.mas_7d_vacio")} />
          ) : (
            listaRma(mes.rma_mas_7d.items, "warning")
          )}
        </Card>

        {/* RMA por despachar: el taller ya terminó */}
        <Card
          title={`${t("dashboard.mes.por_despachar")} (${mes.rma_por_despachar.total})`}
          cta={soloLectura ? t("dashboard.ver_todos") : t("actions.despacho.title")}
          href={soloLectura ? `${base}/despacho` : `${base}/despacho/nuevo`}
        >
          {mes.rma_por_despachar.items.length === 0 ? (
            <Empty t={t} texto={t("dashboard.mes.por_despachar_vacio")} />
          ) : (
            listaRma(mes.rma_por_despachar.items, "ok")
          )}
        </Card>

        {/* RMA por llegar: tickets del portal sin ingreso */}
        <Card
          title={`${t("dashboard.mes.por_llegar")} (${mes.rma_por_llegar.total})`}
          cta={t("dashboard.ver_todos")}
          href={`${base}/por-llegar`}
        >
          {mes.rma_por_llegar.items.length === 0 ? (
            <Empty t={t} texto={t("dashboard.mes.por_llegar_vacio")} />
          ) : (
            <div className="divide-y divide-slate-100">
              {mes.rma_por_llegar.items.map((c) => (
                <Link
                  key={c.id}
                  href={`${base}/por-llegar`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="text-xs text-slate-500 w-16">{fechaCorta(c.created_at)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.client_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      RMA {c.case_number} · {c.model || c.hardware || "—"}
                    </p>
                  </div>
                  <Badge tone="neutral">{t("dashboard.mes.hace_dias", { count: c.dias })}</Badge>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Calificación de almacenistas en el despacho de mercancía */}
        <Card title={t("dashboard.mes.ranking")} cta={t("dashboard.ver_todos")} href={`${base}/almacenista`}>
          {mes.ranking_mercancia.length === 0 ? (
            <Empty t={t} texto={t("dashboard.mes.ranking_vacio")} />
          ) : (
            <div className="divide-y divide-slate-100">
              {mes.ranking_mercancia.map((a) => (
                <Link
                  key={a.nombre}
                  href={`${base}/almacenista/${encodeURIComponent(a.nombre)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.nombre}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {t("dashboard.mes.ranking_detalle", {
                        egresos: a.egresos,
                        picking: promedioTexto(a.picking),
                        despacho: promedioTexto(a.despacho),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-violet-600 fill-violet-600" />
                    <span className="font-bold text-violet-700 tabular-nums">{promedioTexto(a.promedio)}</span>
                  </div>
                  <span className="text-xs text-slate-400 w-10 text-right tabular-nums">({a.calificaciones})</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
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
  alerta,
}: {
  title: string;
  cta?: string;
  href?: string;
  children: React.ReactNode;
  compact?: boolean;
  /** Borde ámbar: hay algo atrasado. */
  alerta?: boolean;
}) {
  return (
    <section className={`rounded-2xl border bg-white ${alerta ? "border-amber-300" : "border-slate-200"}`}>
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

function Empty({ t, texto }: { t: any; texto?: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-400">
      {texto || t("dashboard.empty")}
    </div>
  );
}