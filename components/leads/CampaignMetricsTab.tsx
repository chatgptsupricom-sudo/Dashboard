"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  DollarSign,
  Eye,
  Loader2,
  MousePointerClick,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect, useState } from "react";

interface CampaignRow {
  campaign_name: string;
  pais: string;
  spend_usd: number;
  impressions: number;
  clicks: number;
  leads_from_ads: number;
  total_leads: number;
  ventas_cerradas: number;
  recaudo_usd: number;
  calificados: number;
  no_calificados: number;
  costo_por_lead: number;
  costo_por_lead_calificado: number;
  roi: number;
}

interface AiUsageDetail {
  model: string;
  calls: number;
  tokens: number;
  cost_usd: number;
}

interface ProjectUsageDetail {
  project_id: string;
  project_name: string;
  total_tokens: number;
  total_requests: number;
  total_cost_usd: number;
}

interface CampaignMetricsResponse {
  campaigns: CampaignRow[];
  summary: {
    total_spend: number;
    total_leads: number;
    total_calificados: number;
    total_no_calificados: number;
    total_ventas: number;
    recaudo_total: number;
    costo_por_lead_calificado: number;
    roi_global: number;
  };
  aiUsage: {
    panel: { calls: number; cost_usd: number };
    n8n_bot: { calls: number; cost_usd: number };
    total_usd: number;
    by_model: AiUsageDetail[];
  };
  openaiUsage: {
    total: { cost_usd: number; tokens: number; requests: number };
    by_project: ProjectUsageDetail[];
    by_model: AiUsageDetail[];
  };
}

interface Props {
  sede: string;
  fechaInicio: string;
  fechaFin: string;
}

export default function CampaignMetricsTab({ sede, fechaInicio, fechaFin }: Props) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === "superAdmin";
  const [data, setData] = useState<CampaignMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sede) params.set("sede", sede);
    if (fechaInicio) params.set("fecha_inicio", fechaInicio);
    if (fechaFin) params.set("fecha_fin", fechaFin);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    fetch(`/api/adminleads/meta-campaigns?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((res) => {
        if (res.error) throw new Error(res.error);
        setData(res);
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          setError("Tiempo de espera agotado. Intenta con un rango de fechas menor.");
        } else {
          console.error("Error cargando métricas:", err);
          setError(err.message || "Error al cargar datos");
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    return () => { controller.abort(); clearTimeout(timeout); };
  }, [sede, fechaInicio, fechaFin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        <span className="text-sm">Cargando métricas de campañas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <Target className="w-10 h-10 opacity-20 mb-3" />
        <p className="text-sm font-medium text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { campaigns, summary, aiUsage } = data;

  return (
    <div className="space-y-8">
      {/* KPI Cards - Campañas Meta */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
          Resumen Campañas Meta
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Inversión Total"
            value={summary.total_spend > 0 ? `$${summary.total_spend.toLocaleString()}` : null}
            emptyText="Sin inversión"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            title="Leads Calificados"
            value={summary.total_calificados > 0 ? summary.total_calificados.toLocaleString() : null}
            emptyText="Sin calificados"
            icon={<Users className="w-4 h-4" />}
          />
          <MetricCard
            title="Leads No Calificados"
            value={summary.total_no_calificados > 0 ? summary.total_no_calificados.toLocaleString() : null}
            emptyText="Sin datos"
            icon={<Users className="w-4 h-4" />}
          />
          <MetricCard
            title="Tasa Calificación"
            value={
              summary.total_calificados + summary.total_no_calificados > 0
                ? `${((summary.total_calificados / (summary.total_calificados + summary.total_no_calificados)) * 100).toFixed(1)}%`
                : null
            }
            emptyText="Sin datos"
            icon={<Target className="w-4 h-4" />}
          />
          <MetricCard
            title="Costo / Lead Cal."
            value={summary.costo_por_lead_calificado > 0 ? `$${summary.costo_por_lead_calificado.toFixed(2)}` : null}
            emptyText="Sin datos"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            title="ROI"
            value={summary.roi_global !== 0 ? `${summary.roi_global.toFixed(1)}%` : null}
            emptyText="Sin ROI"
            icon={<TrendingUp className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* KPI Cards - OpenAI por API */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
          Consumo OpenAI API
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.openaiUsage?.by_project || []).map((proj) => (
            <Card key={proj.project_id} className="rounded-2xl border-zinc-200 shadow-none hover:border-blue-200 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  {proj.project_name}
                </CardTitle>
                <DollarSign className="w-4 h-4 text-zinc-400" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tracking-tight text-zinc-900 mb-3">
                  ${proj.total_cost_usd > 0 ? proj.total_cost_usd.toFixed(2) : "0.00"}
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {proj.total_tokens > 0 ? `${(proj.total_tokens / 1000000).toFixed(1)}M` : "0"} tokens
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {(proj.total_requests || 0).toLocaleString()} llamadas
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {/* Tarjeta Total */}
          <Card className="rounded-2xl border-blue-200 bg-blue-50/30 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                Total OpenAI
              </CardTitle>
              <DollarSign className="w-4 h-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tracking-tight text-blue-700 mb-3">
                ${data?.openaiUsage?.total?.cost_usd > 0 ? data.openaiUsage.total.cost_usd.toFixed(2) : "0.00"}
              </div>
              <div className="flex items-center gap-4 text-xs text-blue-500">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {data?.openaiUsage?.total?.tokens > 0 ? `${(data.openaiUsage.total.tokens / 1000000).toFixed(1)}M` : "0"} tokens
                </span>
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {(data?.openaiUsage?.total?.requests || 0).toLocaleString()} llamadas
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabla de Campañas Meta */}
      <Card className="shadow-none border-zinc-200 rounded-2xl">
        <CardHeader className="pb-3 border-b border-zinc-50">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Detalle por Campaña
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 overflow-x-auto">
          {campaigns.length > 0 ? (
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-zinc-50/50 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Campaña</th>
                  {isSuperAdmin && <th className="px-4 py-3 text-center">País</th>}
                  <th className="px-4 py-3 text-right">Inversión</th>
                  <th className="px-4 py-3 text-center">Impresiones</th>
                  <th className="px-4 py-3 text-center">Clics</th>
                  <th className="px-4 py-3 text-center">Leads Ads</th>
                  <th className="px-4 py-3 text-center">Calificados</th>
                  <th className="px-4 py-3 text-center">No Cal.</th>
                  <th className="px-4 py-3 text-center">Ventas</th>
                  <th className="px-4 py-3 text-right">Recaudo</th>
                  <th className="px-4 py-3 text-right">Costo/Lead Cal.</th>
                  <th className="px-4 py-3 text-right">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {campaigns.map((c) => (
                  <tr key={c.campaign_name} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap">
                      {c.campaign_name}
                    </td>
                    {isSuperAdmin && (
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.pais === "Panama"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-amber-50 text-amber-600"
                      }`}>
                        {c.pais}
                      </span>
                    </td>
                    )}
                    <td className="px-4 py-3 text-right font-semibold">
                      ${c.spend_usd.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600">
                      {c.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600">
                      {c.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {c.leads_from_ads}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-600">
                      {c.calificados}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-red-500">
                      {c.no_calificados}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-blue-600">
                      {c.ventas_cerradas}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      ${c.recaudo_usd.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {c.costo_por_lead_calificado > 0 ? `$${c.costo_por_lead_calificado.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${
                        c.roi > 0 ? "text-emerald-600" : c.roi < 0 ? "text-red-500" : "text-zinc-400"
                      }`}>
                        {c.roi.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Eye className="w-10 h-10 opacity-20 mb-3" />
              <p className="text-xs italic">Sin campañas registradas en este período.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla de OpenAI por Modelo */}
      {data?.openaiUsage?.by_model && Array.isArray(data.openaiUsage.by_model) && data.openaiUsage.by_model.length > 0 && (
        <Card className="shadow-none border-zinc-200 rounded-2xl">
          <CardHeader className="pb-3 border-b border-zinc-50">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Bot className="w-3.5 h-3.5" /> Consumo OpenAI por Modelo
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50/50 text-zinc-500">
                <tr>
                  <th className="px-6 py-3 text-left">Modelo</th>
                  <th className="px-6 py-3 text-center">Llamadas</th>
                  <th className="px-6 py-3 text-center">Tokens</th>
                  <th className="px-6 py-3 text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(data.openaiUsage.by_model || []).filter((m: any) => m && m.model).map((m: any) => (
                  <tr key={m.model} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-zinc-900">{m.model}</td>
                    <td className="px-6 py-4 text-center">{(m.requests || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">{(m.tokens || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-semibold">${(m.cost_usd || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, emptyText = "Sin datos" }: any) {
  const isEmpty = value === null || value === undefined;
  return (
    <Card className="rounded-2xl border-zinc-200 shadow-none hover:border-blue-200 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className={isEmpty ? "text-zinc-300" : "text-zinc-400"}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="text-sm font-medium text-zinc-300 italic">
            {emptyText}
          </div>
        ) : (
          <div className="text-xl font-bold tracking-tight text-zinc-900">
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
