"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Clock,
  Users,
  BarChart3,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  Filter,
  Eye,
  Building2,
  Calendar,
} from "lucide-react";

function getCompanyOptions(t: ReturnType<typeof useTranslations<"cxc">>) {
  return [
    { value: "", label: t("todas_sedes") },
    { value: "caracas", label: "Caracas" },
    { value: "valencia", label: "Valencia" },
    { value: "panama", label: "Panamá" },
  ];
}

interface KPIs {
  efectividad: { value: number; meta: number; cobradoMes: number; exigibleMes: number; pendiente: number };
  carteraVencida: { value: number; meta: number; saldoVencido: number; carteraTotal: number };
  recuperacion: { value: number; meta: number; vencidoInicial: number; vencidoRestante: number };
  dso: { value: number; meta: number; carteraAbierta: number; ventasCredito90d: number };
}

interface CompanyData {
  companyId: number;
  companyName: string;
  totalReceivable: number;
  totalOverdue: number;
  overduePct: number;
  openInvoices: number;
  overdueInvoices: number;
  monthInvoiced: number;
  monthPaid: number;
  efectividad: number;
}

interface Debtor {
  partnerId: number;
  name: string;
  total: number;
  overdue: number;
  oldest: number;
  count: number;
}

interface Salesperson {
  userId: number;
  name: string;
  total: number;
  overdue: number;
  count: number;
}

interface CxCData {
  kpis: KPIs;
  agingDistribution: Record<string, number>;
  byCompany: CompanyData[];
  topDebtors: Debtor[];
  bySalesperson: Salesperson[];
  summary: {
    totalReceivable: number;
    totalOverdue: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
  };
  updatedAt: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function getTrafficLight(value: number, thresholds: { green: number; yellow: number }, invert = false): string {
  if (invert) {
    if (value <= thresholds.green) return "bg-emerald-100 text-emerald-700 border-emerald-300";
    if (value <= thresholds.yellow) return "bg-amber-100 text-amber-700 border-amber-300";
    return "bg-red-100 text-red-700 border-red-300";
  }
  if (value >= thresholds.green) return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (value >= thresholds.yellow) return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-red-100 text-red-700 border-red-300";
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

function AgingBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const colors: Record<string, string> = {
    "corriente": "bg-emerald-400",
    "1-30": "bg-amber-400",
    "31-60": "bg-orange-400",
    "61-90": "bg-red-500",
    "91+": "bg-red-700",
  };
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-slate-500 text-right">{label}</span>
      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colors[label] || "bg-slate-300"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="w-24 text-xs text-slate-600 text-right">{formatCurrency(value)}</span>
      <span className="w-12 text-xs text-slate-400 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export default function CxCReport() {
  const t = useTranslations("cxc");
  const [data, setData] = useState<CxCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedCompany, setExpandedCompany] = useState<number | null>(null);

  const COMPANY_OPTIONS = getCompanyOptions(t);
  const MONTHS = t.raw("meses") as string[];

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
    } catch (err) {
      console.error("Error fetching CxC data:", err);
    } finally {
      setLoading(false);
    }
  }, [empresa, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const agingTotal = data ? Object.values(data.agingDistribution).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("titulo")}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("supricom")} — {MONTHS[selectedMonth - 1]} {selectedYear}
            {data && <span className="ml-2 text-slate-400">| {t("actualizado")}: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Building2 size={14} className="text-slate-400" />
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="text-sm bg-transparent border-none outline-none text-slate-700"
            >
              {COMPANY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="text-sm bg-transparent border-none outline-none text-slate-700"
            >
              {MONTHS.map((m, i) => {
                const now = new Date();
                const isFuture = selectedYear === now.getFullYear() && i > now.getMonth();
                return (
                  <option key={i} value={i + 1} disabled={isFuture}>{m}</option>
                );
              })}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="text-sm bg-transparent border-none outline-none text-slate-700 ml-1"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("actualizar")}
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw size={32} className="animate-spin text-blue-500 mx-auto mb-2" />
            <p className="text-slate-500">{t("cargando_datos")}</p>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard
              title={t("efectividad_cobranza")}
              value={`${data.kpis.efectividad.value}%`}
              meta={`${t("meta")}: ${data.kpis.efectividad.meta}%`}
              subtitle={`${t("cobrado")}: ${formatCurrency(data.kpis.efectividad.cobradoMes)} / ${t("exigible")}: ${formatCurrency(data.kpis.efectividad.exigibleMes)}`}
              color={getTrafficLight(data.kpis.efectividad.value, { green: 95, yellow: 85 })}
              dot={getTrafficDot(data.kpis.efectividad.value, { green: 95, yellow: 85 })}
              icon={<TrendingUp size={20} />}
              weight="35%"
            />
            <KPICard
              title={t("cartera_vencida")}
              value={`${data.kpis.carteraVencida.value}%`}
              meta={`${t("meta")}: ≤${data.kpis.carteraVencida.meta}%`}
              subtitle={`${t("vencido")}: ${formatCurrency(data.kpis.carteraVencida.saldoVencido)} / ${t("total")}: ${formatCurrency(data.kpis.carteraVencida.carteraTotal)}`}
              color={getTrafficLight(data.kpis.carteraVencida.value, { green: 10, yellow: 20 }, true)}
              dot={getTrafficDot(data.kpis.carteraVencida.value, { green: 10, yellow: 20 }, true)}
              icon={<AlertTriangle size={20} />}
              weight="30%"
            />
            <KPICard
              title={t("recuperacion_vencidos")}
              value={`${data.kpis.recuperacion.value}%`}
              meta={`${t("meta")}: ${data.kpis.recuperacion.meta}%`}
              subtitle={`${t("inicial")}: ${formatCurrency(data.kpis.recuperacion.vencidoInicial)} / ${t("restante")}: ${formatCurrency(data.kpis.recuperacion.vencidoRestante)}`}
              color={getTrafficLight(data.kpis.recuperacion.value, { green: 60, yellow: 30 })}
              dot={getTrafficDot(data.kpis.recuperacion.value, { green: 60, yellow: 30 })}
              icon={<RefreshCw size={20} />}
              weight="25%"
            />
            <KPICard
              title={t("dso")}
              value={`${data.kpis.dso.value} ${t("dias")}`}
              meta={`${t("meta")}: ≤${data.kpis.dso.meta} ${t("dias")}`}
              subtitle={`${t("cartera")}: ${formatCurrency(data.kpis.dso.carteraAbierta)} / ${t("credito_90d")}: ${formatCurrency(data.kpis.dso.ventasCredito90d)}`}
              color={getTrafficLight(data.kpis.dso.value, { green: 45, yellow: 60 }, true)}
              dot={getTrafficDot(data.kpis.dso.value, { green: 45, yellow: 60 }, true)}
              icon={<Clock size={20} />}
              weight="10%"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={16} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">{t("resumen_cartera")}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t("cartera_total_abierta")}</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(data.summary.totalReceivable)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t("cartera_vencida_label")}</span>
                  <span className="font-semibold text-red-600">{formatCurrency(data.summary.totalOverdue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t("facturas_abiertas")}</span>
                  <span className="font-semibold text-slate-800">{formatNumber(data.summary.openInvoiceCount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t("facturas_vencidas")}</span>
                  <span className="font-semibold text-red-600">{formatNumber(data.summary.overdueInvoiceCount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">{t("antiguedad_cartera")}</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(data.agingDistribution).map(([band, value]) => (
                  <AgingBar key={band} label={band} value={value} total={agingTotal} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={16} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">{t("por_sede")}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-500 font-medium">{t("sede")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("cartera")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("vencido")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("efectividad")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("fact")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCompany.map((co) => (
                      <tr key={co.companyId} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="py-2 font-medium text-slate-700">{co.companyName}</td>
                        <td className="py-2 text-right text-slate-600">{formatCurrency(co.totalReceivable)}</td>
                        <td className="py-2 text-right">
                          <span className={`font-medium ${co.overduePct > 20 ? "text-red-600" : co.overduePct > 10 ? "text-amber-600" : "text-emerald-600"}`}>
                            {formatCurrency(co.totalOverdue)} ({co.overduePct}%)
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <span className={`font-medium ${co.efectividad >= 95 ? "text-emerald-600" : co.efectividad >= 85 ? "text-amber-600" : "text-red-600"}`}>
                            {co.efectividad}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-slate-500">{co.openInvoices}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700 text-sm">{t("top_10_deudores")}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-500 font-medium">{t("cliente")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("total")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("vencido")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("dias_col")}</th>
                      <th className="text-right py-2 text-slate-500 font-medium">{t("fact")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topDebtors.map((d) => (
                      <tr key={d.partnerId} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="py-2 font-medium text-slate-700 max-w-[200px] truncate">{d.name}</td>
                        <td className="py-2 text-right text-slate-600">{formatCurrency(d.total)}</td>
                        <td className="py-2 text-right">
                          {d.overdue > 0 ? (
                            <span className="text-red-600 font-medium">{formatCurrency(d.overdue)}</span>
                          ) : (
                            <span className="text-emerald-600">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <span className={d.oldest > 60 ? "text-red-600 font-medium" : d.oldest > 30 ? "text-amber-600" : "text-slate-500"}>
                            {d.oldest}
                          </span>
                        </td>
                        <td className="py-2 text-right text-slate-500">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-blue-600" />
              <h3 className="font-semibold text-slate-700 text-sm">{t("cartera_por_responsable")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 text-slate-500 font-medium">{t("responsable")}</th>
                    <th className="text-right py-2 text-slate-500 font-medium">{t("cartera_total_label")}</th>
                    <th className="text-right py-2 text-slate-500 font-medium">{t("vencido")}</th>
                    <th className="text-right py-2 text-slate-500 font-medium">{t("facturas")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySalesperson.map((sp) => (
                    <tr key={sp.userId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 font-medium text-slate-700">{sp.name}</td>
                      <td className="py-2 text-right text-slate-600">{formatCurrency(sp.total)}</td>
                      <td className="py-2 text-right">
                        {sp.overdue > 0 ? (
                          <span className="text-red-600 font-medium">{formatCurrency(sp.overdue)}</span>
                        ) : (
                          <span className="text-emerald-600">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-slate-500">{sp.count}</td>
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

function KPICard({
  title,
  value,
  meta,
  subtitle,
  color,
  dot,
  icon,
  weight,
}: {
  title: string;
  value: string;
  meta: string;
  subtitle: string;
  color: string;
  dot: string;
  icon: React.ReactNode;
  weight: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${color} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-xs font-medium opacity-70 uppercase tracking-wide">{title}</span>
        </div>
        <span className="text-[10px] font-medium opacity-50">{weight}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs opacity-70 mt-1">{meta}</div>
      <div className="text-[11px] opacity-60 mt-2 leading-tight">{subtitle}</div>
    </div>
  );
}
