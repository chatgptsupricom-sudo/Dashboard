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
  X,
  Search,
  ChevronRight,
  FileText,
  Package,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
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

function AgingBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
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

function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col ${wide ? "w-full max-w-6xl" : "w-full max-w-3xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export default function CxcDashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [salespersonFilter, setSalespersonFilter] = useState("");

  const userCids = user?.cids;

  // Modal state - Flow: salesperson → invoices → invoice detail → client invoices
  const [invoicesModal, setInvoicesModal] = useState<{ open: boolean; userId: number; userName: string }>({ open: false, userId: 0, userName: "" });
  const [invoiceDetailModal, setInvoiceDetailModal] = useState<{ open: boolean; invoiceId: number }>({ open: false, invoiceId: 0 });
  const [clientInvoicesModal, setClientInvoicesModal] = useState<{ open: boolean; partnerId: number; partnerName: string; userId: number; userName: string }>({ open: false, partnerId: 0, partnerName: "", userId: 0, userName: "" });

  // Detail data
  const [invoicesData, setInvoicesData] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [clientInvoicesData, setClientInvoicesData] = useState<any[]>([]);
  const [clientInvoicesLoading, setClientInvoicesLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      params.set("month", String(selectedMonth));
      params.set("year", String(selectedYear));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Error:", e);
    }
    setLoading(false);
  }, [empresa, userCids, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // STEP 1: Click salesperson → show ALL invoices for that salesperson
  const fetchSalespersonInvoices = useCallback(async (userId: number, userName: string) => {
    setInvoicesModal({ open: true, userId, userName });
    setInvoicesLoading(true);
    setInvoicesData([]);
    try {
      const params = new URLSearchParams({ user_id: String(userId) });
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/detail?${params}`);
      const json = await res.json();
      if (json.success) setInvoicesData(json.data.invoices || []);
    } catch (e) {
      console.error(e);
    }
    setInvoicesLoading(false);
  }, [empresa, userCids]);

  // STEP 2: Click invoice → show invoice detail
  const fetchInvoiceDetail = useCallback(async (invoiceId: number) => {
    setInvoiceDetailModal({ open: true, invoiceId });
    setInvoicesModal((prev) => ({ ...prev, open: false }));
    setInvoiceDetailLoading(true);
    setInvoiceDetail(null);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/invoice/${invoiceId}`);
      const json = await res.json();
      if (json.success) setInvoiceDetail(json.data);
    } catch (e) {
      console.error(e);
    }
    setInvoiceDetailLoading(false);
  }, []);

  // STEP 3: Click client name in invoice detail → show all invoices for that client
  const fetchClientInvoices = useCallback(async (partnerId: number, partnerName: string, userId: number, userName: string) => {
    setClientInvoicesModal({ open: true, partnerId, partnerName, userId, userName });
    setInvoiceDetailModal((prev) => ({ ...prev, open: false }));
    setClientInvoicesLoading(true);
    setClientInvoicesData([]);
    try {
      const params = new URLSearchParams({ user_id: String(userId), partner_id: String(partnerId) });
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/detail?${params}`);
      const json = await res.json();
      if (json.success) setClientInvoicesData(json.data.invoices || []);
    } catch (e) {
      console.error(e);
    }
    setClientInvoicesLoading(false);
  }, [empresa, userCids]);

  // Close handlers - navigate back through the chain
  const closeClientInvoicesModal = () => {
    setClientInvoicesModal({ open: false, partnerId: 0, partnerName: "", userId: 0, userName: "" });
    setInvoiceDetailModal((prev) => ({ ...prev, open: true }));
  };
  const closeInvoiceDetail = () => {
    setInvoiceDetailModal({ open: false, invoiceId: 0 });
    setInvoicesModal((prev) => ({ ...prev, open: true }));
  };
  const closeInvoicesModal = () => {
    setInvoicesModal({ open: false, userId: 0, userName: "" });
  };

  const agingTotal = data ? Object.values(data.agingDistribution).reduce((a: number, b: any) => a + b, 0) as number : 0;
  const agingColors: Record<string, string> = {
    "corriente": "bg-emerald-400",
    "1-30": "bg-amber-400",
    "31-60": "bg-orange-400",
    "61-90": "bg-red-500",
    "91+": "bg-red-700",
  };

  const filteredSalespersons = data?.bySalesperson
    ? data.bySalesperson.filter((sp: any) =>
        sp.name.toLowerCase().includes(salespersonFilter.toLowerCase())
      )
    : [];

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cuentas por Cobrar</h1>
          <p className="text-sm text-slate-500 mt-1">
            Supricom — {MONTHS[selectedMonth - 1]} {selectedYear}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          )}
          {userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
                <span>Cobrado: {formatCurrency(data.kpis.efectividad.cobradoMes)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">Exigible: {formatCurrency(data.kpis.efectividad.exigibleMes)}</div>
            </div>

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

          {/* Cartera por Responsable de Cobranza */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">Cartera por Responsable de Cobranza</h3>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar vendedor..."
                  value={salespersonFilter}
                  onChange={(e) => setSalespersonFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 w-48"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 text-slate-500 font-medium">Responsable</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Cartera total</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Vencida</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Facturas</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalespersons.map((sp: any) => (
                    <tr
                      key={sp.userId}
                      onClick={() => fetchSalespersonInvoices(sp.userId, sp.name)}
                      className="border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer transition"
                    >
                      <td className="py-2.5 font-medium text-slate-700">{sp.name}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(sp.total)}</td>
                      <td className="py-2.5 text-right">
                        {sp.overdue > 0 ? <span className="text-red-600 font-medium">{formatCurrency(sp.overdue)}</span> : <span className="text-emerald-600">—</span>}
                      </td>
                      <td className="py-2.5 text-right text-slate-500">{sp.count}</td>
                      <td className="py-2.5 text-right"><ChevronRight size={14} className="text-slate-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL 1: Invoices for a salesperson (click salesperson → see all their invoices) */}
      <Modal open={invoicesModal.open} onClose={closeInvoicesModal} title={`Facturas — ${invoicesModal.userName}`} wide>
        {invoicesLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-blue-500 mr-2" />
            <span className="text-slate-500 text-sm">Cargando facturas...</span>
          </div>
        ) : invoicesData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Sin facturas abiertas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-500 font-medium">Factura</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Cliente</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Tipo</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Fecha</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Vencimiento</th>
                  <th className="text-center py-2 text-slate-500 font-medium">Estado</th>
                  <th className="text-right py-2 text-slate-500 font-medium">Total</th>
                  <th className="text-right py-2 text-slate-500 font-medium">Pendiente</th>
                  <th className="text-center py-2 text-slate-500 font-medium">Días</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {invoicesData.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => fetchInvoiceDetail(inv.id)}
                    className="border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer transition"
                  >
                    <td className="py-2.5 font-medium text-slate-700">{inv.name}</td>
                    <td className="py-2.5 text-slate-600 text-xs max-w-[180px] truncate">{inv.partnerName}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{inv.moveType === "out_refund" ? "NC" : "Factura"}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{formatDate(inv.invoiceDate)}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{formatDate(inv.invoiceDateDue)}</td>
                    <td className="py-2.5 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inv.paymentState === "paid" ? "bg-emerald-50 text-emerald-600" : inv.paymentState === "partial" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                        {inv.paymentState === "paid" ? "Pagada" : inv.paymentState === "partial" ? "Parcial" : "Pendiente"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{formatCurrency(inv.amountTotal)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-800">{formatCurrency(inv.amountResidual)}</td>
                    <td className="py-2.5 text-center">
                      <span className={inv.agingDays > 60 ? "text-red-600 font-bold text-xs" : inv.agingDays > 30 ? "text-amber-600 font-medium text-xs" : "text-slate-500 text-xs"}>
                        {inv.agingDays > 0 ? `${inv.agingDays}d` : "Al día"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right"><ChevronRight size={14} className="text-slate-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* MODAL 2: Invoice detail — full modern design */}
      <Modal open={invoiceDetailModal.open} onClose={closeInvoiceDetail} title={`Factura ${invoiceDetail?.name || ""}`} wide>
        {invoiceDetailLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <RefreshCw size={28} className="animate-spin text-blue-500 mx-auto mb-3" />
              <span className="text-slate-400 text-sm">Cargando documento...</span>
            </div>
          </div>
        ) : !invoiceDetail ? (
          <div className="text-center py-16 text-slate-400">Error al cargar</div>
        ) : (
          <div className="space-y-5">
            {/* ── STATUS BANNER ── */}
            <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${
              invoiceDetail.paymentState === "paid"
                ? "bg-emerald-50 border-emerald-200"
                : invoiceDetail.paymentState === "partial"
                  ? "bg-amber-50 border-amber-200"
                  : invoiceDetail.amountResidual > 0 && invoiceDetail.invoiceDateDue && new Date(invoiceDetail.invoiceDateDue) < new Date()
                    ? "bg-red-50 border-red-200"
                    : "bg-blue-50 border-blue-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  invoiceDetail.paymentState === "paid" ? "bg-emerald-500" : invoiceDetail.paymentState === "partial" ? "bg-amber-500" : "bg-red-500"
                }`} />
                <span className="text-sm font-bold text-slate-800">
                  {invoiceDetail.paymentState === "paid" ? "Factura Pagada" : invoiceDetail.paymentState === "partial" ? "Pago Parcial" : "Pendiente de Pago"}
                </span>
              </div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                {invoiceDetail.moveType === "out_refund" ? "Nota de Crédito" : "Factura de Venta"}
              </span>
            </div>

            {/* ── PAYMENT PROGRESS ── */}
            {invoiceDetail.amountTotal > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progreso de Pago</span>
                  <span className="text-xs font-bold text-slate-700">
                    {Math.round((invoiceDetail.amountPaid / invoiceDetail.amountTotal) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${invoiceDetail.paymentState === "paid" ? "bg-emerald-500" : invoiceDetail.paymentState === "partial" ? "bg-amber-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min((invoiceDetail.amountPaid / invoiceDetail.amountTotal) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium">
                  <span>Pagado: {formatCurrency(invoiceDetail.amountPaid)}</span>
                  <span>Pendiente: {formatCurrency(invoiceDetail.amountResidual)}</span>
                </div>
              </div>
            )}

            {/* ── INFO GRID ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cliente</span>
                <button
                  onClick={() => fetchClientInvoices(invoiceDetail.partnerId, invoiceDetail.partnerName, invoiceDetail.invoiceUserId, invoiceDetail.invoiceUserName)}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left leading-tight"
                >
                  {invoiceDetail.partnerName}
                </button>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sede</span>
                <p className="text-sm font-bold text-slate-800">{invoiceDetail.companyName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vendedor</span>
                <p className="text-sm font-medium text-slate-700">{invoiceDetail.invoiceUserName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Moneda</span>
                <p className="text-sm font-medium text-slate-700">{invoiceDetail.currencyName || "USD"}</p>
              </div>
            </div>

            {/* ── DATES ROW ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar size={14} className="text-blue-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Emisión</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(invoiceDetail.invoiceDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  invoiceDetail.invoiceDateDue && new Date(invoiceDetail.invoiceDateDue) < new Date() && invoiceDetail.amountResidual > 0 ? "bg-red-50" : "bg-amber-50"
                }`}>
                  <Clock size={14} className={invoiceDetail.invoiceDateDue && new Date(invoiceDetail.invoiceDateDue) < new Date() && invoiceDetail.amountResidual > 0 ? "text-red-600" : "text-amber-600"} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Vencimiento</span>
                  <p className={`text-xs font-bold ${invoiceDetail.invoiceDateDue && new Date(invoiceDetail.invoiceDateDue) < new Date() && invoiceDetail.amountResidual > 0 ? "text-red-600" : "text-slate-800"}`}>
                    {formatDate(invoiceDetail.invoiceDateDue)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-purple-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Diario</span>
                  <p className="text-xs font-medium text-slate-700">{invoiceDetail.journalName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <Target size={14} className="text-slate-500" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Ref. Pago</span>
                  <p className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{invoiceDetail.paymentReference || "—"}</p>
                </div>
              </div>
            </div>

            {/* ── TOTALS CARDS ── */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Subtotal", value: invoiceDetail.totals.subtotal, bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-100" },
                { label: "Impuesto", value: invoiceDetail.totals.tax, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100" },
                { label: "Total", value: invoiceDetail.totals.total, bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-100" },
                { label: "Pagado", value: invoiceDetail.totals.paid, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
                { label: "Pendiente", value: invoiceDetail.totals.residual, bg: "bg-red-50", text: "text-red-700", border: "border-red-100" },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl p-3 text-center`}>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{item.label}</span>
                  <span className={`text-sm font-bold ${item.text}`}>{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>

            {/* ── LINE ITEMS ── */}
            {invoiceDetail.lines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={14} className="text-slate-400" />
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle de Productos</h4>
                  <span className="text-[10px] text-slate-400 font-medium ml-auto">{invoiceDetail.lines.length} ítems</span>
                </div>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">#</th>
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cant.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Precio Unit.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Desc.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceDetail.lines.map((line: any, idx: number) => (
                        <tr key={line.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                          <td className="py-2.5 px-4 text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-slate-800 text-xs">{line.productName || line.name}</p>
                            {line.productName && line.name !== line.productName && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{line.name}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-700">{line.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceUnit)}</td>
                          <td className="py-2.5 px-4 text-right">
                            {line.discount > 0 ? (
                              <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded">{line.discount}%</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceSubtotal)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(line.priceTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/80 border-t border-slate-200">
                        <td colSpan={5} className="py-2.5 px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</td>
                        <td colSpan={2} className="py-2.5 px-4 text-right font-bold text-slate-800 text-xs">{formatCurrency(invoiceDetail.totals.subtotal)}</td>
                      </tr>
                      <tr className="bg-slate-50/80">
                        <td colSpan={5} className="py-2 px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest">Impuesto</td>
                        <td colSpan={2} className="py-2 px-4 text-right font-medium text-slate-600 text-xs">{formatCurrency(invoiceDetail.totals.tax)}</td>
                      </tr>
                      <tr className="bg-blue-50/60 border-t border-blue-100">
                        <td colSpan={5} className="py-3 px-4 text-right text-[10px] font-bold text-blue-700 uppercase tracking-widest">Total</td>
                        <td colSpan={2} className="py-3 px-4 text-right font-black text-blue-900 text-sm">{formatCurrency(invoiceDetail.totals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── PAYMENT HISTORY ── */}
            {invoiceDetail.payments && invoiceDetail.payments.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign size={14} className="text-emerald-500" />
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historial de Pagos</h4>
                  <span className="text-[10px] text-slate-400 font-medium ml-auto">{invoiceDetail.payments.length} movimientos</span>
                </div>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Referencia</th>
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Débito</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Crédito</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo</th>
                        <th className="text-center py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Conciliado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceDetail.payments.map((p: any) => (
                        <tr key={p.id} className="border-t border-slate-50 hover:bg-emerald-50/20 transition-colors">
                          <td className="py-2.5 px-4 font-medium text-slate-700">{p.name}</td>
                          <td className="py-2.5 px-4 text-slate-500">{formatDate(p.date)}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{p.debit > 0 ? formatCurrency(p.debit) : "—"}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">{p.credit > 0 ? formatCurrency(p.credit) : "—"}</td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-800">{formatCurrency(Math.abs(p.amount_residual || 0))}</td>
                          <td className="py-2.5 px-4 text-center">
                            {p.reconciled ? (
                              <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold leading-5 text-center">✓</span>
                            ) : (
                              <span className="inline-block w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold leading-5 text-center">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── NOTES / ORIGIN ── */}
            {(invoiceDetail.invoiceOrigin || invoiceDetail.narration) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {invoiceDetail.invoiceOrigin && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Origen</span>
                    <p className="text-xs text-slate-700 leading-relaxed">{invoiceDetail.invoiceOrigin}</p>
                  </div>
                )}
                {invoiceDetail.narration && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Notas Internas</span>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{invoiceDetail.narration.replace(/<[^>]*>/g, "")}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL 3: Client invoices (click client name in invoice detail → see all invoices of that client) */}
      <Modal open={clientInvoicesModal.open} onClose={closeClientInvoicesModal} title={`${clientInvoicesModal.partnerName} — Historial de Facturas`} wide>
        {clientInvoicesLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-blue-500 mr-2" />
            <span className="text-slate-500 text-sm">Cargando historial...</span>
          </div>
        ) : clientInvoicesData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Sin facturas abiertas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-500 font-medium">Factura</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Tipo</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Fecha</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Vencimiento</th>
                  <th className="text-center py-2 text-slate-500 font-medium">Estado</th>
                  <th className="text-right py-2 text-slate-500 font-medium">Total</th>
                  <th className="text-right py-2 text-slate-500 font-medium">Pendiente</th>
                  <th className="text-center py-2 text-slate-500 font-medium">Días</th>
                </tr>
              </thead>
              <tbody>
                {clientInvoicesData.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="py-2.5 font-medium text-slate-700">{inv.name}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{inv.moveType === "out_refund" ? "NC" : "Factura"}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{formatDate(inv.invoiceDate)}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{formatDate(inv.invoiceDateDue)}</td>
                    <td className="py-2.5 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inv.paymentState === "paid" ? "bg-emerald-50 text-emerald-600" : inv.paymentState === "partial" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                        {inv.paymentState === "paid" ? "Pagada" : inv.paymentState === "partial" ? "Parcial" : "Pendiente"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{formatCurrency(inv.amountTotal)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-800">{formatCurrency(inv.amountResidual)}</td>
                    <td className="py-2.5 text-center">
                      <span className={inv.agingDays > 60 ? "text-red-600 font-bold text-xs" : inv.agingDays > 30 ? "text-amber-600 font-medium text-xs" : "text-slate-500 text-xs"}>
                        {inv.agingDays > 0 ? `${inv.agingDays}d` : "Al día"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
