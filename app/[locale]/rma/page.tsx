"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-teal-100 text-teal-700 border-teal-200",
};

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
};

interface KpiCardProps {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  status?: string;
  locale: string;
  t: (key: string) => string;
}

function KpiCard({ label, value, color, icon, status, locale, t }: KpiCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCases = useCallback(async () => {
    if (!status) return;
    try {
      setLoadingCases(true);
      const params = new URLSearchParams({ status, limit: "10" });
      const res = await fetch(`/api/rma?${params}`);
      const data = await res.json();
      if (data.success) setCases(data.cases);
    } catch {
    } finally {
      setLoadingCases(false);
    }
  }, [status]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHovered(true);
    if (cases.length === 0 && status) fetchCases();
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovered(false), 150);
  };

  const handlePopoverMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handlePopoverMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovered(false), 100);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const showPopover = hovered && status;

  return (
    <div ref={containerRef} className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Card className="rounded-3xl border-none shadow-sm cursor-default">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
            {icon}
          </div>
        </CardContent>
      </Card>

      {/* Hover Popover */}
      {showPopover && (
        <div
          className="absolute z-50 top-full mt-2 left-0 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        >
          <div className="p-3 border-b bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">
              {label} <span className="text-slate-400 font-normal">({value})</span>
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loadingCases ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : cases.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {t("no_cases")}
              </div>
            ) : (
              <div>
                {cases.map((c: any) => (
                  <div
                    key={c.id}
                    className="px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                    onClick={() => router.push(`/${locale}/rma/casos/${c.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-600">{c.case_number}</span>
                      <Badge className={`${statusColors[c.status]} border text-[10px]`}>
                        {statusLabels[c.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{c.client_name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.model || c.product_code || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {value > 10 && (
            <Link href={`/${locale}/rma/casos${status ? `?status=${status}` : ""}`}>
              <div className="px-3 py-2 text-center text-xs text-blue-600 hover:bg-blue-50 border-t font-medium">
                {t("view_all")} →
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function RmaDashboardPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/rma/stats");
      const data = await res.json();
      if (data.success) setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const s = stats?.stats;
  const recent = stats?.recent || [];

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
            <p className="text-sm text-slate-500">{t("page_subtitle")}</p>
          </div>
        </div>
        <Link href={`/${locale}/rma/nuevo`}>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t("new_case")}
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("total_cases")}
          value={s?.total || 0}
          color="text-slate-900"
          icon={<div className="p-3 bg-slate-100 rounded-2xl"><Wrench className="w-5 h-5 text-slate-500" /></div>}
          locale={locale}
          t={t}
        />
        <KpiCard
          label={t("pending")}
          value={s?.pending || 0}
          color="text-amber-600"
          icon={<div className="p-3 bg-amber-100 rounded-2xl"><Loader2 className="w-5 h-5 text-amber-500" /></div>}
          status="recibido"
          locale={locale}
          t={t}
        />
        <KpiCard
          label={t("completed_month")}
          value={s?.completedThisMonth || 0}
          color="text-green-600"
          icon={<div className="p-3 bg-green-100 rounded-2xl"><Loader2 className="w-5 h-5 text-green-500" /></div>}
          status="reparado"
          locale={locale}
          t={t}
        />
      </div>

      {/* Second row: specific statuses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label={t("status_nota_credito")}
          value={s?.notaCredito || 0}
          color="text-indigo-600"
          icon={<div className="p-3 bg-indigo-100 rounded-2xl"><Loader2 className="w-5 h-5 text-indigo-500" /></div>}
          status="nota_credito"
          locale={locale}
          t={t}
        />
        <KpiCard
          label={t("status_no_procesado")}
          value={s?.noProcesado || 0}
          color="text-red-600"
          icon={<div className="p-3 bg-red-100 rounded-2xl"><Loader2 className="w-5 h-5 text-red-500" /></div>}
          status="no_procesado"
          locale={locale}
          t={t}
        />
        <KpiCard
          label={t("status_reingresado")}
          value={s?.reingresado || 0}
          color="text-teal-600"
          icon={<div className="p-3 bg-teal-100 rounded-2xl"><Loader2 className="w-5 h-5 text-teal-500" /></div>}
          status="reingresado"
          locale={locale}
          t={t}
        />
      </div>

      {/* Recent Cases */}
      <Card className="rounded-3xl border-none shadow-sm">
        <div className="flex flex-row items-center justify-between px-6 pt-6">
          <p className="text-lg font-semibold text-slate-900">{t("recent_cases")}</p>
          <Link href={`/${locale}/rma/casos`}>
            <Button variant="outline" size="sm">{t("view_all")}</Button>
          </Link>
        </div>
        <div className="p-6 pt-3">
          {recent.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>{t("no_cases")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-3 font-medium">{t("case_number")}</th>
                    <th className="pb-3 font-medium">{t("client")}</th>
                    <th className="pb-3 font-medium">{t("model")}</th>
                    <th className="pb-3 font-medium">{t("status_label")}</th>
                    <th className="pb-3 font-medium">{t("date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c: any) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-3">
                        <Link href={`/${locale}/rma/casos/${c.id}`} className="text-blue-600 hover:underline font-medium">
                          {c.case_number}
                        </Link>
                      </td>
                      <td className="py-3 text-slate-700">{c.client_name}</td>
                      <td className="py-3 text-slate-700">{c.model || c.product_code || "—"}</td>
                      <td className="py-3">
                        <Badge className={`${statusColors[c.status]} border text-[11px]`}>
                          {statusLabels[c.status]}
                        </Badge>
                      </td>
                      <td className="py-3 text-slate-500">
                        {new Date(c.created_at).toLocaleDateString("es-VE")}
                      </td>
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
