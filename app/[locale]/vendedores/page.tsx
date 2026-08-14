"use client";
import { usePresentationMode } from "@/components/presentacion/presentation-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/lib/stores/auth.store";
import { BarChart3, DollarSign, Medal, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function getMonthOptions(count: number = 6) {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    options.push({ value: key, label: `${MONTH_NAMES[d.getMonth()]} ${y}` });
  }
  return options;
}

export default function VendedoresPage() {
  const { isPresentationMode } = usePresentationMode();
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [cuota, setCuota] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCuotaDetail, setShowCuotaDetail] = useState(false);

  const now = new Date();
  const defaultPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [periodo, setPeriodo] = useState(defaultPeriodo);

  const sellerActivo = (user as any)?.activo;
  const showLeads = sellerActivo !== 0;

  const monthOptions = useMemo(() => getMonthOptions(6), []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/vendedores/stats?periodo=${periodo}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        setData({
          ...json,
          chartData: json.chartData || [],
          topClients: (json.topClients || []).filter((c: any) => !c.name?.toLowerCase().includes("supricom")).slice(0, 5),
          topProducts: json.topProducts || [],
          crecimiento: json.crecimiento || 0,
          rankingVentas: json.rankingVentas || null,
        });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [periodo]);

  useEffect(() => {
    fetch("/api/vendedores/cuota", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => setCuota(json))
      .catch(() => {});
  }, []);

  if (loading)
    return (
      <div className="p-10 text-center font-bold text-slate-400">
        Cargando Dashboard...
      </div>
    );

  return (
    <div className="space-y-4 sm:space-y-6 bg-slate-50/50 p-4 sm:p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
          Dashboard de Ventas
        </h1>
        <select
          className="px-3 sm:px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium shadow-sm w-full sm:w-auto"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          <option value="total">Histórico Total</option>
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs Superiores */}
      <div className={`grid gap-2 sm:gap-4 ${showLeads ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"}`}>
        <MetricCard
          title="Ranking Ventas"
          value={isPresentationMode ? "#N" : `#${data?.rankingVentas || "-"}`}
          icon={Medal}
          color="blue"
        />
        {showLeads && (
          <MetricCard
            title="Ranking Leads"
            value={
              isPresentationMode
                ? "#N"
                : `#${data.rankingLeads?.ranking || data.rankingLeads || "-"}`
            }
            icon={BarChart3}
            color="purple"
          />
        )}
        <MetricCard
          title="Total Facturado"
          value={
            isPresentationMode
              ? "$ XX,XXX"
              : `$${(data.totalFacturado || 0).toLocaleString()}`
          }
          icon={DollarSign}
          color="green"
        />
        {showLeads && (
          <MetricCard
            title="Monto Leads"
            value={
              isPresentationMode
                ? "$ XX,XXX"
                : `$${(data.montoLeads || 0).toLocaleString()}`
            }
            icon={DollarSign}
            color="green"
          />
        )}
        <Card className={`rounded-2xl sm:rounded-3xl border-none shadow-md p-4 sm:p-5 bg-gradient-to-br from-emerald-50 to-teal-50 flex flex-col justify-center relative overflow-hidden ${showLeads ? "col-span-2 sm:col-span-1 lg:col-span-1 xl:col-span-1" : "col-span-2 sm:col-span-1"}`}>
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-100/50 rounded-bl-[40px]" />
          <p className="text-[9px] sm:text-[10px] font-bold text-emerald-500 uppercase tracking-wider relative z-10">
            Crecimiento Mensual
          </p>
          <h4
            className={`text-xl sm:text-2xl font-black relative z-10 ${data.crecimiento >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {isPresentationMode ? "XX.X%" : `${data.crecimiento.toFixed(1)}%`}
          </h4>
        </Card>
      </div>

      {/* Cuota del Mes */}
      <Card
        className="rounded-2xl sm:rounded-3xl border-none shadow-sm p-4 sm:p-6 bg-white cursor-pointer hover:shadow-lg transition-all"
        onClick={() => setShowCuotaDetail(true)}
      >
        <div className="flex items-center justify-between">
          <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Cuota del Mes
          </p>
          {cuota && (
            <span className="text-[10px] sm:text-xs text-slate-400">Click para detalle →</span>
          )}
        </div>
        {cuota ? (
          <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <span className="text-xl sm:text-3xl font-black text-slate-900">
                  ${(cuota.facturado || 0).toLocaleString()}
                </span>
                <span className="text-[10px] sm:text-sm text-slate-400 ml-1 sm:ml-2 block sm:inline">
                  de ${(cuota.meta || 0).toLocaleString()}
                </span>
              </div>
              <span
                className={`text-lg sm:text-lg font-black flex-shrink-0 ${cuota.porcentaje >= 100 ? "text-emerald-600" : "text-amber-600"}`}
              >
                {cuota.porcentaje}%
              </span>
            </div>
            <Progress value={Math.min(cuota.porcentaje, 100)} className="h-2 sm:h-3" />
            <div className="flex items-center justify-between text-[10px] sm:text-sm gap-2">
              {cuota.falta > 0 && (
                <span className="text-red-500 font-semibold truncate">
                  Faltan ${cuota.falta.toLocaleString()}
                </span>
              )}
              {cuota.porcentaje >= 100 && (
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <TrendingUp size={14} /> ¡Meta cumplida!
                </span>
              )}
              <span className="text-slate-400 flex-shrink-0">
                {new Date()
                  .toLocaleString("default", { month: "long" })
                  .toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 sm:mt-4 py-4 sm:py-6 text-center">
            <p className="text-xs sm:text-sm text-slate-400">
              Sin cuota asignada este mes
            </p>
          </div>
        )}
      </Card>

      {/* Modal de detalle de Cuota */}
      {showCuotaDetail && cuota && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowCuotaDetail(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md space-y-4 shadow-2xl p-5 sm:p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCuotaDetail(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X size={20} />
            </button>
            <h2 className="font-bold text-base sm:text-lg text-zinc-800">
              Detalle de Cuota Mensual
            </h2>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100 space-y-3">
              <div className="grid grid-cols-2 gap-y-2 text-xs sm:text-sm">
                <span className="text-slate-500">Cuota mensual:</span>
                <span className="font-mono font-bold text-right">
                  ${(cuota.meta || 0).toLocaleString()}
                </span>
                <span className="text-slate-500">
                  Facturado al {new Date().toLocaleDateString()}:
                </span>
                <span className="font-mono font-bold text-right">
                  ${(cuota.facturado || 0).toLocaleString()}
                </span>
                {cuota.falta > 0 ? (
                  <>
                    <span className="text-slate-500">Déficit:</span>
                    <span className="font-mono font-bold text-red-600 text-right">
                      -${cuota.falta.toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">Excedente:</span>
                    <span className="font-mono font-bold text-emerald-600 text-right">
                      +${Math.abs(cuota.falta).toLocaleString()}
                    </span>
                  </>
                )}
              </div>
              <div className="pt-2">
                <div className="flex justify-between text-[10px] sm:text-xs text-slate-400 mb-1">
                  <span>Progreso</span>
                  <span className="font-bold text-slate-700">
                    {cuota.porcentaje}%
                  </span>
                </div>
                <div className="w-full h-2.5 sm:h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cuota.porcentaje >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(cuota.porcentaje, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs mt-1">
                  <span className="text-slate-400">$0</span>
                  <span className="text-slate-400">
                    ${(cuota.meta || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {cuota.falta > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 sm:p-3 text-center">
                  <p className="text-xs sm:text-sm font-bold text-red-700">
                    Faltan ${cuota.falta.toLocaleString()} para alcanzar la
                    cuota mensual
                  </p>
                  <p className="text-[10px] sm:text-xs text-red-600 mt-0.5">
                    Te sugerimos enfocarte en tus mejores productos y contactar
                    clientes recurrentes
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 sm:p-3 text-center">
                  <p className="text-xs sm:text-sm font-bold text-emerald-700">
                    ¡Has superado tu cuota mensual!
                  </p>
                  <p className="text-[10px] sm:text-xs text-emerald-600 mt-0.5">
                    Sigue así para maximizar tus comisiones
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evolución de Ventas */}
      <Card className="rounded-2xl sm:rounded-3xl border-none shadow-md bg-white overflow-hidden">
        <div className="p-4 sm:p-6 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-slate-800 font-bold text-sm sm:text-base">
                Evolución de Ventas
              </CardTitle>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium mt-0.5">
                {/^\d{4}-\d{2}$/.test(periodo)
                  ? `Ventas por día — ${monthOptions.find((o) => o.value === periodo)?.label || periodo}`
                  : "Ventas mensuales acumuladas"}
              </p>
            </div>
          </div>
        </div>
        <CardContent className="h-[220px] sm:h-[280px] p-4 sm:p-6 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                dy={8}
              />
              <Tooltip
                formatter={(value: number) => [
                  isPresentationMode ? "$ XX,XXX" : `$${value.toLocaleString()}`,
                  "Facturado",
                ]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                  fontSize: "12px",
                }}
                cursor={{ fill: "rgba(59,130,246,0.06)" }}
              />
              <Bar
                dataKey="total"
                fill="url(#barGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={/^\d{4}-\d{2}$/.test(periodo) ? 20 : 40}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* KPIs de Eficiencia - Solo para vendedores activos */}
      {showLeads && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
          <Card className="rounded-2xl sm:rounded-3xl border-none shadow-sm bg-white p-4 sm:p-6 flex flex-col justify-center">
            <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase">
              Eficiencia (Leads/Venta)
            </p>
            <h4 className="text-lg sm:text-2xl font-black text-slate-900 mt-1 sm:mt-2">
              {isPresentationMode ? "XX" : data.closedLeadsDB || 0}{" "}
              <span className="text-[10px] sm:text-sm text-slate-400 font-medium">
                Leads Cerrados
              </span>
            </h4>
            <p className="text-[8px] sm:text-[10px] text-emerald-600 font-bold mt-1 sm:mt-2">
              {isPresentationMode
                ? "Total: $ XX,XXX USD"
                : `Total: $${(data.montoLeads || 0).toLocaleString()} USD`}
            </p>
          </Card>

          <Card className="rounded-2xl sm:rounded-3xl border-none shadow-sm bg-white p-4 sm:p-6 flex flex-col justify-center">
            <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase">
              Impacto Mensual (Leads)
            </p>
            <h4
              className={`text-lg sm:text-2xl font-black ${(data.crecimientoLeads ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"} mt-1 sm:mt-2`}
            >
              {isPresentationMode
                ? "XX.X%"
                : `${(data.crecimientoLeads ?? 0).toFixed(1)}%`}
            </h4>
            <p className="text-[8px] sm:text-[10px] text-slate-400 font-bold mt-1 sm:mt-2 uppercase">
              vs mes anterior
            </p>
          </Card>
        </div>
      )}

      {/* Rankings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
        <RankList
          title="Top 5 Mejores Clientes"
          data={data.topClients}
          isPresentationMode={isPresentationMode}
        />
        <RankList
          title="Top 5 Productos"
          data={data.topProducts}
          isPresentationMode={isPresentationMode}
        />
      </div>
    </div>
  );
}

function RankList({ title, data, isPresentationMode }: any) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl border-none shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-slate-900 text-xs sm:text-sm font-black uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col">
          {data.map((item: string, i: number) => (
            <div
              key={i}
              className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-4 hover:bg-slate-50/50 transition-all border-b border-slate-50 last:border-none group"
            >
              <span className="text-[9px] sm:text-[10px] font-black text-slate-300 w-4 group-hover:text-blue-500 transition-colors">
                0{i + 1}
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-600 truncate uppercase tracking-tight">
                {isPresentationMode
                  ? `${title === "Top 5 Mejores Clientes" ? "Cliente" : "Producto"} #${i + 1}`
                  : item}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon: Icon, color }: any) {
  const styles: any = {
    blue: {
      bg: "bg-gradient-to-br from-blue-50 to-indigo-50",
      icon: "bg-blue-500 text-white shadow-lg shadow-blue-200",
      title: "text-blue-500",
      value: "text-blue-900",
      deco: "bg-blue-100/60",
    },
    green: {
      bg: "bg-gradient-to-br from-green-50 to-emerald-50",
      icon: "bg-green-500 text-white shadow-lg shadow-green-200",
      title: "text-green-500",
      value: "text-green-900",
      deco: "bg-green-100/60",
    },
    purple: {
      bg: "bg-gradient-to-br from-purple-50 to-violet-50",
      icon: "bg-purple-500 text-white shadow-lg shadow-purple-200",
      title: "text-purple-500",
      value: "text-purple-900",
      deco: "bg-purple-100/60",
    },
    orange: {
      bg: "bg-gradient-to-br from-orange-50 to-amber-50",
      icon: "bg-orange-500 text-white shadow-lg shadow-orange-200",
      title: "text-orange-500",
      value: "text-orange-900",
      deco: "bg-orange-100/60",
    },
  };
  const s = styles[color] || styles.blue;
  return (
    <Card className={`border-none shadow-md rounded-2xl sm:rounded-3xl p-4 sm:p-5 ${s.bg} relative overflow-hidden`}>
      <div className={`absolute -top-2 -right-2 w-14 h-14 rounded-full ${s.deco}`} />
      <div className="relative z-10">
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center mb-2 sm:mb-3 ${s.icon}`}>
          <Icon size={16} strokeWidth={2.5} />
        </div>
        <p className={`text-[9px] sm:text-[10px] font-bold ${s.title} uppercase tracking-wider leading-tight`}>
          {title}
        </p>
        <h4 className={`text-base sm:text-xl font-black ${s.value} truncate mt-0.5`}>
          {value}
        </h4>
      </div>
    </Card>
  );
}
