"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Truck,
  Wrench,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  en_reparacion: "bg-amber-100 text-amber-700 border-amber-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
};

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  en_reparacion: "En Reparación",
  reparado: "Reparado",
};

export default function RmaDashboardPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/rma/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
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
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t("total_cases")}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{s?.total || 0}</p>
              </div>
              <div className="p-3 bg-slate-100 rounded-2xl">
                <Clock className="w-5 h-5 text-slate-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t("pending")}</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{s?.pending || 0}</p>
              </div>
              <div className="p-3 bg-amber-100 rounded-2xl">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t("in_repair")}</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{s?.inRepair || 0}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-2xl">
                <Wrench className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t("completed_month")}</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{s?.completedThisMonth || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-2xl">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Cases */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">{t("recent_cases")}</CardTitle>
          <Link href={`/${locale}/rma/casos`}>
            <Button variant="outline" size="sm">
              {t("view_all")}
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("no_cases")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-3 font-medium">{t("case_number")}</th>
                    <th className="pb-3 font-medium">{t("client")}</th>
                    <th className="pb-3 font-medium">{t("product")}</th>
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
                      <td className="py-3 text-slate-700">{c.product_name}</td>
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
        </CardContent>
      </Card>
    </div>
  );
}
