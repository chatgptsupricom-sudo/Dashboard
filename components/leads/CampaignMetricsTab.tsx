"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  Eye,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useCallback, useEffect, useState } from "react";

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
}

interface ServiceItem {
  id: number;
  service_name: string;
  cost_type: "subscription" | "topup";
  monthly_cost: number;
  total_transactions: number;
  transaction_count: number;
  created_at: string;
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

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [loadingServices, setLoadingServices] = useState(true);

  const [showAddService, setShowAddService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceType, setNewServiceType] = useState<"subscription" | "topup">("subscription");
  const [newServiceCost, setNewServiceCost] = useState("");
  const [savingService, setSavingService] = useState(false);

  const [showAddTx, setShowAddTx] = useState<string | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txNotes, setTxNotes] = useState("");
  const [savingTx, setSavingTx] = useState(false);

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

  const fetchServices = useCallback(() => {
    setLoadingServices(true);
    fetch("/api/adminleads/service-costs")
      .then((r) => r.json())
      .then((r) => {
        setServices(r.services || []);
        setTotalMonthly(r.total_monthly || 0);
      })
      .catch((e) => console.error("Error loading services:", e))
      .finally(() => setLoadingServices(false));
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleAddService = async () => {
    if (!newServiceName.trim()) return;
    setSavingService(true);
    try {
      await fetch("/api/adminleads/service-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_name: newServiceName.trim(),
          cost_type: newServiceType,
          monthly_cost: parseFloat(newServiceCost) || 0,
        }),
      });
      setNewServiceName("");
      setNewServiceType("subscription");
      setNewServiceCost("");
      setShowAddService(false);
      fetchServices();
    } finally {
      setSavingService(false);
    }
  };

  const handleDeleteService = async (id: number) => {
    if (!confirm("Eliminar este servicio?")) return;
    await fetch(`/api/adminleads/service-costs?id=${id}`, { method: "DELETE" });
    fetchServices();
  };

  const handleAddTx = async (serviceName: string) => {
    if (!txAmount || parseFloat(txAmount) <= 0) return;
    setSavingTx(true);
    try {
      await fetch("/api/adminleads/service-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_name: serviceName,
          amount_usd: parseFloat(txAmount),
          transaction_date: txDate,
          notes: txNotes || null,
        }),
      });
      setTxAmount("");
      setTxNotes("");
      setShowAddTx(null);
      fetchServices();
    } finally {
      setSavingTx(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        <span className="text-sm">Cargando metricas de campanas...</span>
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

  const { campaigns, summary } = data;

  return (
    <div className="space-y-8">
      {/* KPI Cards - Campanas Meta */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
          Resumen Campanas Meta
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Inversion Total"
            value={summary.total_spend > 0 ? `$${summary.total_spend.toLocaleString()}` : null}
            emptyText="Sin inversion"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            title="Leads Calificados"
            value={summary.total_calificados > 0 ? summary.total_calificados.toLocaleString() : null}
            emptyText="Sin calificados"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            title="Leads No Calificados"
            value={summary.total_no_calificados > 0 ? summary.total_no_calificados.toLocaleString() : null}
            emptyText="Sin datos"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            title="Tasa Calificacion"
            value={
              summary.total_calificados + summary.total_no_calificados > 0
                ? `${((summary.total_calificados / (summary.total_calificados + summary.total_no_calificados)) * 100).toFixed(1)}%`
                : null
            }
            emptyText="Sin datos"
            icon={<DollarSign className="w-4 h-4" />}
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
            icon={<DollarSign className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Gastos Servicios */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Gastos Servicios
          </h3>
          <button
            onClick={() => setShowAddService(!showAddService)}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 transition-colors"
          >
            {showAddService ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showAddService ? "Cancelar" : "Agregar Servicio"}
          </button>
        </div>

        {showAddService && (
          <Card className="mb-4 shadow-none border-blue-200 bg-blue-50/30 rounded-2xl">
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Nombre del servicio"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <select
                  value={newServiceType}
                  onChange={(e) => setNewServiceType(e.target.value as "subscription" | "topup")}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="subscription">Mensual Fijo</option>
                  <option value="topup">Recarga / Prepago</option>
                </select>
                <input
                  type="number"
                  placeholder={newServiceType === "subscription" ? "Costo mensual $" : "Monto recarga $"}
                  value={newServiceCost}
                  onChange={(e) => setNewServiceCost(e.target.value)}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleAddService}
                  disabled={savingService || !newServiceName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingService ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingServices ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Cargando servicios...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((svc) => {
              const displayCost =
                svc.cost_type === "subscription"
                  ? parseFloat(String(svc.monthly_cost)) || 0
                  : parseFloat(String(svc.total_transactions)) || 0;

              return (
                <Card key={svc.id} className="rounded-2xl border-zinc-200 shadow-none hover:border-blue-200 transition-colors relative group">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      {svc.service_name}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {svc.cost_type === "topup" && (
                        <button
                          onClick={() => setShowAddTx(showAddTx === svc.service_name ? null : svc.service_name)}
                          className="text-blue-500 hover:text-blue-600 transition-colors"
                          title="Registrar recarga"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteService(svc.id)}
                        className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Eliminar servicio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold tracking-tight text-zinc-900 mb-1">
                      ${displayCost > 0 ? displayCost.toFixed(2) : "0.00"}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {svc.cost_type === "subscription" ? "Mensual fijo" : `${svc.transaction_count || 0} recargas este mes`}
                    </div>

                    {svc.cost_type === "topup" && showAddTx === svc.service_name && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            placeholder="Monto $"
                            value={txAmount}
                            onChange={(e) => setTxAmount(e.target.value)}
                            className="px-2 py-1.5 text-[11px] border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <input
                            type="date"
                            value={txDate}
                            onChange={(e) => setTxDate(e.target.value)}
                            className="px-2 py-1.5 text-[11px] border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Notas (opcional)"
                          value={txNotes}
                          onChange={(e) => setTxNotes(e.target.value)}
                          className="w-full px-2 py-1.5 text-[11px] border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => handleAddTx(svc.service_name)}
                          disabled={savingTx || !txAmount || parseFloat(txAmount) <= 0}
                          className="w-full px-3 py-1.5 text-[11px] font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {savingTx ? "Guardando..." : "Registrar Recarga"}
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Tarjeta Total */}
            <Card className="rounded-2xl border-blue-200 bg-blue-50/30 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                  Total Servicios
                </CardTitle>
                <DollarSign className="w-4 h-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tracking-tight text-blue-700">
                  ${totalMonthly > 0 ? totalMonthly.toFixed(2) : "0.00"}
                </div>
                <div className="text-[10px] text-blue-400 mt-1">Costo total del mes</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Tabla de Campanas Meta */}
      <Card className="shadow-none border-zinc-200 rounded-2xl">
        <CardHeader className="pb-3 border-b border-zinc-50">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Detalle por Campana
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 overflow-x-auto">
          {campaigns.length > 0 ? (
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-zinc-50/50 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Campana</th>
                  {isSuperAdmin && <th className="px-4 py-3 text-center">Pais</th>}
                  <th className="px-4 py-3 text-right">Inversion</th>
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
                      {c.costo_por_lead_calificado > 0 ? `$${c.costo_por_lead_calificado.toFixed(2)}` : "---"}
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
              <p className="text-xs italic">Sin campanas registradas en este periodo.</p>
            </div>
          )}
        </CardContent>
      </Card>
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
