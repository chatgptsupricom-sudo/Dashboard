"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle,
  Circle,
  DollarSign,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Target,
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
  currency: string;
  total_transactions: number;
  transaction_count: number;
  payment_date: string | null;
  is_paid: number;
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

  const [showAddTx, setShowAddTx] = useState<string | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txNotes, setTxNotes] = useState("");
  const [savingTx, setSavingTx] = useState(false);

  const [editingCampaign, setEditingCampaign] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [guardandoCierre, setGuardandoCierre] = useState(false);
  const [cierreMsg, setCierreMsg] = useState<string | null>(null);

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

  const handleTogglePaid = async (svc: ServiceItem) => {
    const makePaid = !svc.is_paid;
    setServices((prev) =>
      prev.map((s) => (s.id === svc.id ? { ...s, is_paid: makePaid ? 1 : 0 } : s))
    );
    await fetch("/api/adminleads/service-costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: svc.id, toggle_paid: makePaid }),
    });
    fetchServices();
  };

  const startEditCampaign = (c: any) => {
    setEditingCampaign(c.campaign_name);
    setEditValues({
      impressions: String(c.impressions),
      clicks: String(c.clicks),
      leads_from_ads: String(c.leads_from_ads),
      calificados: String(c.calificados),
      no_calificados: String(c.no_calificados),
      ventas_cerradas: String(c.ventas_cerradas),
      recaudo_usd: String(c.recaudo_usd),
    });
  };

  const saveCampaign = async () => {
    if (!editingCampaign) return;
    setSavingCampaign(true);
    await fetch("/api/adminleads/meta-campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_name: editingCampaign,
        impressions: parseInt(editValues.impressions) || 0,
        clicks: parseInt(editValues.clicks) || 0,
        leads_from_ads: parseInt(editValues.leads_from_ads) || 0,
        calificados: parseInt(editValues.calificados) || 0,
        no_calificados: parseInt(editValues.no_calificados) || 0,
        ventas_cerradas: parseInt(editValues.ventas_cerradas) || 0,
        recaudo_usd: parseFloat(editValues.recaudo_usd) || 0,
      }),
    });
    setEditingCampaign(null);
    setSavingCampaign(false);
    setLoading(true);
    const params = new URLSearchParams();
    if (sede) params.set("sede", sede);
    if (fechaInicio) params.set("fecha_inicio", fechaInicio);
    if (fechaFin) params.set("fecha_fin", fechaFin);
    fetch(`/api/adminleads/meta-campaigns?${params.toString()}`)
      .then((r) => r.json())
      .then((r) => { if (!r.error) setData(r); })
      .finally(() => setLoading(false));
  };

  const getPaymentStatus = (svc: ServiceItem) => {
    if (svc.is_paid) return "paid";
    if (!svc.payment_date) return "unpaid";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const payDate = new Date(svc.payment_date + "T00:00:00");
    const diffDays = Math.ceil((payDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "overdue";
    if (diffDays <= 5) return "soon";
    return "unpaid";
  };

  const paymentBorderClass: Record<string, string> = {
    paid: "border-emerald-300 bg-emerald-50/30",
    unpaid: "border-red-200",
    overdue: "border-red-300 bg-red-50/30",
    soon: "border-amber-300 bg-amber-50/30",
  };

  const paymentLabel: Record<string, string> = {
    paid: "Pagado",
    unpaid: "Pendiente",
    overdue: "Vencido",
    soon: "Por vencer",
  };

  const paymentBadgeClass: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-600",
    unpaid: "bg-red-100 text-red-500",
    overdue: "bg-red-100 text-red-600",
    soon: "bg-amber-100 text-amber-600",
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

  // El periodo del snapshot sale del rango elegido; si no hay rango, el mes en
  // curso. Solo se guarda el mes completo (YYYY-MM), que es la granularidad de
  // instagram_insights_monthly.
  const periodoSnapshot = (fechaInicio || new Date().toISOString()).slice(0, 7);

  const guardarCierre = async () => {
    setGuardandoCierre(true);
    setCierreMsg(null);
    try {
      const res = await fetch("/api/adminleads/informe-mensual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: periodoSnapshot }),
      });
      const r = await res.json();
      setCierreMsg(
        res.ok && r.ok
          ? `Cierre de ${periodoSnapshot} guardado (origen: ${r.origen}).`
          : r.error || "No se pudo guardar el cierre.",
      );
    } catch (e: any) {
      setCierreMsg(e?.message || "No se pudo guardar el cierre.");
    } finally {
      setGuardandoCierre(false);
    }
  };

  const abrirInforme = () => {
    const p = new URLSearchParams();
    if (sede) p.set("sede", sede);
    if (fechaInicio) p.set("fecha_inicio", fechaInicio);
    if (fechaFin) p.set("fecha_fin", fechaFin);
    // La pagina vive en /<locale>/adminleads/informe: se construye desde el
    // pathname actual porque una URL relativa reemplazaria el segmento del tab.
    const base = window.location.pathname.replace(/\/+$/, "");
    window.open(`${base}/informe?${p.toString()}`, "_blank", "noopener");
  };

  return (
    <div className="space-y-8">
      {/* KPI Cards - Campanas Meta */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Resumen Campanas Meta
          </h3>
          <div className="flex items-center gap-2">
          <button
            onClick={abrirInforme}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
            title="Genera el informe KPI mensual de redes sociales del periodo seleccionado"
          >
            <FileText className="w-3.5 h-3.5" />
            Generar informe
          </button>
          <button
            onClick={guardarCierre}
            disabled={guardandoCierre}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            title={`Guarda las metricas de Instagram de ${periodoSnapshot} para poder compararlas en informes futuros`}
          >
            {guardandoCierre ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar cierre de {periodoSnapshot}
          </button>
          </div>
        </div>
        {cierreMsg && (
          <p className="text-[11px] text-zinc-500 mb-3 -mt-2">{cierreMsg}</p>
        )}
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
                {campaigns.map((c) => {
                  const isEditing = editingCampaign === c.campaign_name;
                  const inp = (field: string, align = "center") => (
                    <input
                      type="number"
                      value={editValues[field] || ""}
                      onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                      className={`w-20 px-1.5 py-1 text-[11px] border border-blue-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50/50`}
                    />
                  );
                  return (
                    <tr key={c.campaign_name} className="hover:bg-zinc-50/80 transition-colors group">
                      <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap max-w-[200px] truncate">
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
                        {isEditing ? inp("impressions") : c.impressions.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-600">
                        {isEditing ? inp("clicks") : c.clicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {isEditing ? inp("leads_from_ads") : c.leads_from_ads}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600">
                        {isEditing ? inp("calificados") : c.calificados}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-red-500">
                        {isEditing ? inp("no_calificados") : c.no_calificados}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-blue-600">
                        {isEditing ? inp("ventas_cerradas") : c.ventas_cerradas}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {isEditing ? inp("recaudo_usd") : `$${c.recaudo_usd.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-600">
                        {c.costo_por_lead_calificado > 0 ? `$${c.costo_por_lead_calificado.toFixed(2)}` : "---"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={saveCampaign}
                                disabled={savingCampaign}
                                className="p-1 text-emerald-500 hover:text-emerald-600 transition-colors"
                                title="Guardar"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingCampaign(null)}
                                className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className={`font-bold ${
                                c.roi > 0 ? "text-emerald-600" : c.roi < 0 ? "text-red-500" : "text-zinc-400"
                              }`}>
                                {c.roi.toFixed(1)}%
                              </span>
                              <button
                                onClick={() => startEditCampaign(c)}
                                className="p-1 text-zinc-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                                title="Editar campana"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Gastos Servicios */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
          Gastos Servicios
        </h3>

        {loadingServices ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Cargando servicios...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {services.map((svc) => {
              const displayCost =
                svc.cost_type === "subscription"
                  ? parseFloat(String(svc.monthly_cost)) || 0
                  : parseFloat(String(svc.total_transactions)) || 0;

              const status = getPaymentStatus(svc);
              const borderClass = paymentBorderClass[status] || "border-zinc-200";
              const isTopup = svc.cost_type === "topup";

              return (
                <Card key={svc.id} className={`rounded-xl shadow-none transition-colors relative group ${borderClass}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider truncate max-w-[60%]">
                        {svc.service_name}
                      </span>
                      <div className="flex items-center gap-1">
                        {!isTopup && (
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${paymentBadgeClass[status]}`}>
                            {paymentLabel[status]}
                          </span>
                        )}
                        {!isTopup ? (
                          <button
                            onClick={() => handleTogglePaid(svc)}
                            className="transition-colors"
                            title={svc.is_paid ? "Marcar como no pagado" : "Marcar como pagado"}
                          >
                            {svc.is_paid ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-zinc-300 hover:text-emerald-400" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => setShowAddTx(showAddTx === svc.service_name ? null : svc.service_name)}
                            className="text-blue-500 hover:text-blue-600 transition-colors"
                            title="Registrar recarga"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-lg font-bold tracking-tight text-zinc-900">
                      {svc.currency === "EUR" ? "\u20AC" : "$"}{displayCost > 0 ? displayCost.toFixed(2) : "0.00"}
                      <span className="text-[9px] font-normal text-zinc-400 ml-0.5">{svc.currency || "USD"}</span>
                    </div>
                    <div className="text-[9px] text-zinc-400 mt-0.5">
                      {isTopup ? `${svc.transaction_count || 0} recargas` : "Mensual"}
                      {svc.payment_date && ` | Vence: ${new Date(svc.payment_date + "T00:00:00").toLocaleDateString("es-VE")}`}
                    </div>

                    {isTopup && showAddTx === svc.service_name && (
                      <div className="mt-2 pt-2 border-t border-zinc-100 space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="number"
                            placeholder="Monto $"
                            value={txAmount}
                            onChange={(e) => setTxAmount(e.target.value)}
                            className="px-2 py-1 text-[10px] border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <input
                            type="date"
                            value={txDate}
                            onChange={(e) => setTxDate(e.target.value)}
                            className="px-2 py-1 text-[10px] border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Notas"
                          value={txNotes}
                          onChange={(e) => setTxNotes(e.target.value)}
                          className="w-full px-2 py-1 text-[10px] border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => handleAddTx(svc.service_name)}
                          disabled={savingTx || !txAmount || parseFloat(txAmount) <= 0}
                          className="w-full px-2 py-1 text-[10px] font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {savingTx ? "..." : "Registrar"}
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Tarjeta Total */}
            <Card className="rounded-xl border-blue-200 bg-blue-50/30 shadow-none">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total</span>
                  <DollarSign className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-lg font-bold tracking-tight text-blue-700">
                  ${totalMonthly > 0 ? totalMonthly.toFixed(2) : "0.00"}
                </div>
                <div className="text-[9px] text-blue-400 mt-0.5">Costo total del mes</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
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
