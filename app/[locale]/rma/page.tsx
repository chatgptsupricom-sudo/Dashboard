"use client";

import { colorEstado, etiquetaEstado } from "@/components/rma/estados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileClock,
  FileText,
  Hourglass,
  Loader2,
  Plus,
  Trophy,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Metricas = {
  total: number;
  delMes: number;
  completadosMes: number;
  pendientesMes: number;
  pendientes: number;
  noProcede: number;
  ncSolicitadas: number;
  notaCredito: number;
};

type Filtro = { status?: string; grupo?: string; mes?: "1" };

interface KpiCardProps {
  label: string;
  metrica: keyof Metricas;
  datos: { stats: Metricas; porProcedencia: { supricom: Metricas; externo: Metricas } };
  color: string;
  icon: React.ReactNode;
  /** Qué casos lista el popover y los enlaces a los inventarios. Sin él, no hay popover. */
  filtro?: Filtro;
  /** Solo aplica a equipos de Supricom (notas de crédito). */
  soloSupricom?: boolean;
  /** A dónde lleva el desglose en vez del inventario. */
  enlace?: string;
  locale: string;
  t: (key: string, values?: any) => string;
}

function KpiCard({ label, metrica, datos, color, icon, filtro, soloSupricom, enlace: destino, locale, t }: KpiCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [cases, setCases] = useState<any[] | null>(null);
  const [loadingCases, setLoadingCases] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const value = datos.stats[metrica] || 0;
  const supricom = datos.porProcedencia.supricom[metrica] || 0;
  const externo = datos.porProcedencia.externo[metrica] || 0;
  const q = new URLSearchParams(filtro as Record<string, string>).toString();

  const fetchCases = useCallback(async () => {
    if (!filtro) return;
    try {
      setLoadingCases(true);
      const res = await fetch(`/api/rma?${q}&limit=10`);
      const data = await res.json();
      if (data.success) setCases(data.cases);
    } catch {
    } finally {
      setLoadingCases(false);
    }
  }, [filtro, q]);

  const abrir = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHovered(true);
    if (cases === null && filtro && value > 0) fetchCases();
  };
  const cerrar = (ms: number) => {
    timeoutRef.current = setTimeout(() => setHovered(false), ms);
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const enlace = (p: "supricom" | "externo") => destino || `/${locale}/rma/inventario/${p}${q ? `?${q}` : ""}`;

  return (
    <div className="relative" onMouseEnter={abrir} onMouseLeave={() => cerrar(150)}>
      <Card className="rounded-3xl border-none shadow-sm cursor-default h-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
            {icon}
          </div>
          {/* Desglose por procedencia: cada inventario es su propia sección. */}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <Link href={enlace("supricom")} className="hover:text-blue-600">
              {t("procedencia_supricom")}: <span className="font-semibold tabular-nums">{supricom}</span>
            </Link>
            {!soloSupricom && (
              <Link href={enlace("externo")} className="hover:text-amber-700">
                {t("procedencia_externo")}: <span className="font-semibold tabular-nums">{externo}</span>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {hovered && filtro && value > 0 && (
        <div
          className="absolute z-50 top-full mt-2 left-0 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
          onMouseEnter={() => timeoutRef.current && clearTimeout(timeoutRef.current)}
          onMouseLeave={() => cerrar(100)}
        >
          <div className="p-3 border-b bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">
              {label} <span className="text-slate-400 font-normal">({value})</span>
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loadingCases || cases === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : cases.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">{t("no_cases")}</div>
            ) : (
              cases.map((c: any) => (
                <div
                  key={c.id}
                  className="px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                  onClick={() => router.push(`/${locale}/rma/casos/${c.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-blue-600">
                      {c.case_number}
                      {Number(c.producto_externo) === 1 && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-700">{t("badge_externo")}</span>
                      )}
                    </span>
                    <Badge className={`${colorEstado[c.status] || ""} border text-[10px]`}>
                      {etiquetaEstado[c.status] || c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.client_name}</p>
                  <p className="text-xs text-slate-400 truncate">{c.model || c.product_code || "—"}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex border-t text-xs font-medium">
            <Link href={enlace("supricom")} className="flex-1 px-3 py-2 text-center text-blue-600 hover:bg-blue-50">
              {t("procedencia_supricom")} ({supricom}) →
            </Link>
            {!soloSupricom && (
              <Link href={enlace("externo")} className="flex-1 px-3 py-2 text-center text-amber-700 hover:bg-amber-50 border-l">
                {t("procedencia_externo")} ({externo}) →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const icono = (bg: string, Icon: any, fg: string) => (
  <div className={`p-3 rounded-2xl ${bg}`}>
    <Icon className={`w-5 h-5 ${fg}`} />
  </div>
);

export default function RmaDashboardPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [datos, setDatos] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rma/stats");
        const data = await res.json();
        if (data.success) setDatos(data);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!datos) {
    return <div className="p-8 text-center text-sm text-slate-500">{t("dashboard_error")}</div>;
  }

  const top: any[] = datos.topProductos || [];
  const maxTop = Math.max(1, ...top.map((p) => p.total));
  const comun = { datos, locale, t };

  return (
    <div className="p-4 sm:p-8 space-y-8 bg-slate-50/30 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Wrench className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("page_title")}</h1>
            <p className="text-sm text-slate-500">{t("dashboard_subtitle")}</p>
          </div>
        </div>
        <Link href={`/${locale}/rma/nuevo`}>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t("new_case")}
          </Button>
        </Link>
      </div>

      {/* Este mes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard {...comun} label={t("total_cases")} metrica="total" color="text-slate-900"
          icon={icono("bg-slate-100", Wrench, "text-slate-500")} filtro={{}} />
        <KpiCard {...comun} label={t("casos_del_mes")} metrica="delMes" color="text-blue-600"
          icon={icono("bg-blue-100", CalendarDays, "text-blue-500")} filtro={{ mes: "1" }} />
        <KpiCard {...comun} label={t("completados_mes")} metrica="completadosMes" color="text-green-600"
          icon={icono("bg-green-100", CheckCircle2, "text-green-500")} filtro={{ grupo: "completados_mes" }} />
        <KpiCard {...comun} label={t("pendientes_mes")} metrica="pendientesMes" color="text-amber-600"
          icon={icono("bg-amber-100", Clock, "text-amber-500")} filtro={{ grupo: "pendientes", mes: "1" }} />
      </div>

      {/* Estado del taller */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard {...comun} label={t("pendientes_total")} metrica="pendientes" color="text-amber-700"
          icon={icono("bg-amber-50", Hourglass, "text-amber-600")} filtro={{ grupo: "pendientes" }} />
        <KpiCard {...comun} label={t("no_procede")} metrica="noProcede" color="text-red-600"
          icon={icono("bg-red-100", Ban, "text-red-500")} filtro={{ status: "no_procesado" }} />
        {/* Solicitudes de nota de crédito: el caso no cambia de estado, así
            que no hay lista de casos que mostrar; se ven en su sección. */}
        <KpiCard {...comun} label={t("nc_solicitadas")} metrica="ncSolicitadas" color="text-orange-600" soloSupricom
          icon={icono("bg-orange-100", FileClock, "text-orange-500")} enlace={`/${locale}/rma/nota-credito`} />
        <KpiCard {...comun} label={t("status_nota_credito")} metrica="notaCredito" color="text-indigo-600" soloSupricom
          icon={icono("bg-indigo-100", FileText, "text-indigo-500")} filtro={{ status: "nota_credito" }} />
      </div>

      {/* Productos que más entran a RMA */}
      <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 px-6 pt-5">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{t("top_productos")}</h2>
        </div>
        <div className="px-2 pb-2 pt-1">
          {top.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">{t("no_cases")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-4 pb-2 pt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">#</th>
                    <th className="px-4 pb-2 pt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">{t("model")}</th>
                    <th className="px-4 pb-2 pt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">{t("brand")}</th>
                    <th className="px-4 pb-2 pt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 w-1/3">{t("ingresos_rma")}</th>
                    <th className="px-4 pb-2 pt-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate-400">{t("este_mes")}</th>
                    <th className="px-4 pb-2 pt-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate-400">{t("procedencia_externo")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {top.map((p, i) => (
                    <tr key={`${p.producto}-${i}`}>
                      <td className="px-4 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="max-w-[280px] truncate px-4 py-3 font-medium text-slate-700" title={p.producto}>{p.producto}</td>
                      <td className="px-4 py-3 text-slate-500">{p.marca || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(p.total / maxTop) * 100}%` }} />
                          </div>
                          <span className="w-8 text-right font-semibold tabular-nums text-slate-700">{p.total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.delMes}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.externos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
