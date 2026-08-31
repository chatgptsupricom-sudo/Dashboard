"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Clock,
  Users,
  BarChart3,
  RefreshCw,
  Building2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Activity,
} from "lucide-react";

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function getTrafficDot(value: number, thresholds: { green: number; yellow: number }, invert = false): string {
  if (invert) {
    if (value <= thresholds.green) return "bg-emerald-500";
    if (value <= thresholds.yellow) return "bg-amber-500";
    return "bg-red-500";
  }
  if (value >= thresholds.green) return "bg-emerald-500";
  if (value >= thresholds.yellow) return "bg-amber-500";
  return "bg-red-500";
}

function getTrafficColor(value: number, thresholds: { green: number; yellow: number }, invert = false): string {
  if (invert) {
    if (value <= thresholds.green) return "text-emerald-600";
    if (value <= thresholds.yellow) return "text-amber-600";
    return "text-red-600";
  }
  if (value >= thresholds.green) return "text-emerald-600";
  if (value >= thresholds.yellow) return "text-amber-600";
  return "text-red-600";
}

function getTrafficBg(value: number, thresholds: { green: number; yellow: number }, invert = false): string {
  if (invert) {
    if (value <= thresholds.green) return "bg-emerald-50 border-emerald-200";
    if (value <= thresholds.yellow) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  }
  if (value >= thresholds.green) return "bg-emerald-50 border-emerald-200";
  if (value >= thresholds.yellow) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

interface AgingBarProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function AgingBar({ label, value, total, color }: AgingBarProps) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-slate-500 text-right">{label}</span>
      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-24 text-xs text-slate-600 text-right">{formatCurrency(value)}</span>
      <span className="w-12 text-xs text-slate-400 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export default function CxcDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      params.set("month", String(selectedMonth));
      params.set("year", String(selectedYear));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Error:", e);
    }
    setLoading(false);
  }, [empresa, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const agingTotal = data ? Object.values(data.agingDistribution).reduce((a: number, b: any) => a + b, 0) as number : 0;
  const agingColors: Record<string, string> = {
    " corriente": "bg-emerald-400",
    "1-15": "bg-amber-400",
    "16-30": "bg-orange-400",
    "31-60": "bg-red-400",
    "61-90": "bg-red-500",
    "90+": "bg-red-700",
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cuentas por Cobrar — Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Supricom — {MONTHS[selectedMonth - 1]} {selectedYear}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Building2 size={14} className="text-slate-400" />
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
              <option value="">Todas las sedes</option>
              <option value="caracas">Caracas</option>
              <option value="valencia">Valencia</option>
              <option value="panama">Panamá</option>
            </select>
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-400" />
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
              {MONTHS.map((m, i) => {
                const isFuture = selectedYear === now.getFullYear() && i > now.getMonth();
                return <option key={i} value={i + 1} disabled={isFuture}>{m}</option>;
              })}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700 ml-1">
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <button onClick={fetchData} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw size={32} className="animate-spin text-blue-500 mx-auto mb-2" />
            <p className="text-slate-500">Cargando datos de cuentas por cobrar...</p>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Efectividad */}
            <div className={`rounded-xl border p-5 ${getTrafficBg(data.kpis.efectividad.value ?? 0, { green: 95, yellow: 85 })}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getTrafficDot(data.kpis.efectividad.value ?? 0, { green: 95, yellow: 85 })}`} />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Efectividad Cobranza</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">35%</span>
              </div>
              <div className="text-3xl font-bold text-slate-800">
                {data.kpis.efectividad.value !== null ? `${data.kpis.efectividad.value}%` : "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">Meta: {data.kpis.efectividad.meta}%</div>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
                <span>Corriente: {formatCurrency(data.kpis.efectividad.corrienteMes)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">Exigible: {formatCurrency(data.kpis.efectividad.exigibleMes)}</div>
            </div>

            {/* Cartera Vencida */}
            <div className={`rounded-xl border p-5 ${getTrafficBg(data.kpis.carteraVencida.value ?? 0, { green: 10, yellow: 20 }, true)}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getTrafficDot(data.kpis.carteraVencida.value ?? 0, { green: 10, yellow: 20 }, true)}`} />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cartera Vencida</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">30%</span>
              </div>
              <div className="text-3xl font-bold text-slate-800">
                {data.kpis.carteraVencida.value !== null ? `${data.kpis.carteraVencida.value}%` : "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">Meta: ≤{data.kpis.carteraVencida.meta}%</div>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
                <span>Vencido: {formatCurrency(data.kpis.carteraVencida.saldoVencido)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">Total: {formatCurrency(data.kpis.carteraVencida.carteraTotal)}</div>
            </div>

            {/* Recuperación */}
            <div className={`rounded-xl border p-5 ${getTrafficBg(data.kpis.recuperacion.value ?? 0, { green: 60, yellow: 30 })}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getTrafficDot(data.kpis.recuperacion.value ?? 0, { green: 60, yellow: 30 })}`} />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Recuperación Vencidos</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">25%</span>
              </div>
              <div className="text-3xl font-bold text-slate-800">
                {data.kpis.recuperacion.value !== null ? `${data.kpis.recuperacion.value}%` : "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">Meta: {data.kpis.recuperacion.meta}%</div>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
                <span>Inicial: {formatCurrency(data.kpis.recuperacion.vencidoInicial)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">Restante: {formatCurrency(data.kpis.recuperacion.vencidoRestante)}</div>
            </div>

            {/* DSO */}
            <div className={`rounded-xl border p-5 ${getTrafficBg(data.kpis.dso.value ?? 0, { green: 45, yellow: 60 }, true)}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getTrafficDot(data.kpis.dso.value ?? 0, { green: 45, yellow: 60 }, true)}`} />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">DSO (Días Cobro)</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">10%</span>
              </div>
              <div className="text-3xl font-bold text-slate-800">
                {data.kpis.dso.value !== null ? `${data.kpis.dso.value} días` : "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">Meta: ≤{data.kpis.dso.meta} días</div>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
                <span>Cartera: {formatCurrency(data.kpis.dso.carteraAbierta)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">Crédito 90d: {formatCurrency(data.kpis.dso.ventasCredito90d)}</div>
            </div>
          </div>

          {/* Summary + Aging */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">Resumen Cartera</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Cartera total abierta</span>
                  <span className="font-bold text-slate-800">{formatCurrency(data.summary.totalReceivable)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Cartera vencida</span>
                  <span className="font-bold text-red-600">{formatCurrency(data.summary.totalOverdue)}</span>
                </div>
                <div className="h-px bg-slate-200" />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Facturas abiertas</span>
                  <span className="font-bold text-slate-800">{data.summary.openInvoiceCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Facturas vencidas</span>
                  <span className="font-bold text-red-600">{data.summary.overdueInvoiceCount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">Antigüedad de Cartera</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(data.agingDistribution).map(([band, value]) => (
                  <AgingBar key={band} label={band} value={value as number} total={agingTotal} color={agingColors[band] || "bg-slate-300"} />
                ))}
              </div>
            </div>
          </div>

          {/* By Company + Top Debtors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">Por Sede</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-500 font-medium">Sede</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Cartera</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Vencida</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Efectiv.</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Fact.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCompany.map((co: any) => (
                      <tr key={co.companyId} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 font-medium text-slate-700">{co.companyName}</td>
                        <td className="py-2.5 text-right text-slate-600">{formatCurrency(co.totalReceivable)}</td>
                        <td className="py-2.5 text-right">
                          <span className={`font-medium ${co.overduePct > 20 ? "text-red-600" : co.overduePct > 10 ? "text-amber-600" : "text-emerald-600"}`}>
                            {formatCurrency(co.totalOverdue)} ({co.overduePct}%)
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`font-medium ${co.efectividad >= 95 ? "text-emerald-600" : co.efectividad >= 85 ? "text-amber-600" : "text-red-600"}`}>
                            {co.efectividad !== null ? `${co.efectividad}%` : "N/A"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-slate-500">{co.openInvoices}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">Top 10 Deudores</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-500 font-medium">Cliente</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Total</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Vencido</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Días</th>
                      <th className="text-right py-2 text-slate-500 font-medium">Fact.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topDebtors.map((d: any) => (
                      <tr key={d.partnerId} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 font-medium text-slate-700 max-w-[200px] truncate">{d.name}</td>
                        <td className="py-2.5 text-right text-slate-600">{formatCurrency(d.total)}</td>
                        <td className="py-2.5 text-right">
                          {d.overdue > 0 ? <span className="text-red-600 font-medium">{formatCurrency(d.overdue)}</span> : <span className="text-emerald-600">—</span>}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={d.oldest > 60 ? "text-red-600 font-medium" : d.oldest > 30 ? "text-amber-600" : "text-slate-500"}>{d.oldest}</span>
                        </td>
                        <td className="py-2.5 text-right text-slate-500">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* By Salesperson */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-blue-600" />
              <h3 className="font-semibold text-slate-700 text-sm">Cartera por Responsable de Cobranza</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 text-slate-500 font-medium">Responsable</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Cartera total</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Vencida</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Facturas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySalesperson.map((sp: any) => (
                    <tr key={sp.userId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 font-medium text-slate-700">{sp.name}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(sp.total)}</td>
                      <td className="py-2.5 text-right">
                        {sp.overdue > 0 ? <span className="text-red-600 font-medium">{formatCurrency(sp.overdue)}</span> : <span className="text-emerald-600">—</span>}
                      </td>
                      <td className="py-2.5 text-right text-slate-500">{sp.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
