"use client";
import { usePresentationMode } from "@/components/presentacion/presentation-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, DollarSign, Medal, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

export default function VendedoresPage() {
  const { isPresentationMode } = usePresentationMode();
  const [data, setData] = useState<any>(null);
  const [cuota, setCuota] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("total");
  const [showCuotaDetail, setShowCuotaDetail] = useState(false);

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
          topClients: json.topClients || [],
          topProducts: json.topProducts || [],
          crecimiento: json.crecimiento || 0,
        });
      })
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
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black text-slate-900">
          Dashboard de Ventas
        </h1>
        <select
          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium shadow-sm"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          <option value="total">Histórico Total</option>
          <option value="mes">Este Mes</option>
          <option value="mes_pasado">Mes Pasado</option>
          <option value="dia">Hoy</option>
        </select>
      </div>

      {/* KPIs Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Ranking Ventas"
          value={isPresentationMode ? "#N" : `#${data.rankingVentas || "-"}`}
          icon={Medal}
          color="blue"
        />
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
        <MetricCard
          title="Monto Facturado (Leads)"
          value={
            isPresentationMode
              ? "$ XX,XXX"
              : `$${(data.montoLeads || 0).toLocaleString()}`
          }
          icon={DollarSign}
          color="green"
        />
        <Card className="rounded-3xl border-none shadow-sm p-6 bg-white flex flex-col justify-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Crecimiento Mensual
          </p>
          <h4
            className={`text-xl font-black ${data.crecimiento >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {isPresentationMode ? "XX.X%" : `${data.crecimiento.toFixed(1)}%`}
          </h4>
        </Card>
      </div>

      {/* Tarjeta de Cuota / Meta (ancha, entre KPIs y gráfico) */}
      <Card
        className="rounded-3xl border-none shadow-sm p-6 bg-white cursor-pointer hover:shadow-lg transition-all"
        onClick={() => setShowCuotaDetail(true)}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Cuota del Mes
          </p>
          {cuota && (
            <span className="text-xs text-slate-400">Click para detalle →</span>
          )}
        </div>
        {cuota ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-slate-900">
                  ${(cuota.facturado || 0).toLocaleString()}
                </span>
                <span className="text-sm text-slate-400 ml-2">
                  de ${(cuota.meta || 0).toLocaleString()}
                </span>
              </div>
              <span
                className={`text-lg font-black ${cuota.porcentaje >= 100 ? "text-emerald-600" : "text-amber-600"}`}
              >
                {cuota.porcentaje}%
              </span>
            </div>
            <Progress value={Math.min(cuota.porcentaje, 100)} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              {cuota.falta > 0 && (
                <span className="text-red-500 font-semibold">
                  Faltan ${cuota.falta.toLocaleString()}
                </span>
              )}
              {cuota.porcentaje >= 100 && (
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <TrendingUp size={16} /> ¡Meta cumplida!
                </span>
              )}
              <span className="text-slate-400">
                {new Date()
                  .toLocaleString("default", { month: "long" })
                  .toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 py-6 text-center">
            <p className="text-sm text-slate-400">
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
            className="bg-white rounded-2xl w-full max-w-md space-y-4 shadow-2xl p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCuotaDetail(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X size={20} />
            </button>
            <h2 className="font-bold text-lg text-zinc-800">
              Detalle de Cuota Mensual
            </h2>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
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
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Progreso</span>
                  <span className="font-bold text-slate-700">
                    {cuota.porcentaje}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cuota.porcentaje >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(cuota.porcentaje, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-slate-400">$0</span>
                  <span className="text-slate-400">
                    ${(cuota.meta || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {cuota.falta > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-sm font-bold text-red-700">
                    Faltan ${cuota.falta.toLocaleString()} para alcanzar la
                    cuota mensual
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Te sugerimos enfocarte en tus mejores productos y contactar
                    clientes recurrentes
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                  <p className="text-sm font-bold text-emerald-700">
                    ¡Has superado tu cuota mensual!
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Sigue así para maximizar tus comisiones
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Layout: 2/3 Gráfico, 1/3 Rankings */}
      <div className="lg:col-span-2 space-y-6">
        {/* CONTENEDOR 1: EVOLUCIÓN */}
        <Card className="rounded-3xl border-none shadow-sm bg-white p-6">
          <CardHeader className="p-0 mb-6">
            <CardTitle className="text-slate-700 font-bold">
              Evolución de Ventas
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] p-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: number) =>
                    isPresentationMode
                      ? "$ XX,XXX"
                      : `$${value.toLocaleString()}`
                  }
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* CONTENEDOR 2: KPIs DE EFICIENCIA Y RENDIMIENTO */}
        <div className="grid grid-cols-2 gap-6">
          <Card className="rounded-3xl border-none shadow-sm bg-white p-6 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">
              Eficiencia (Leads/Venta)
            </p>
            <h4 className="text-2xl font-black text-slate-900 mt-2">
              {isPresentationMode ? "XX" : data.closedLeadsDB || 0}{" "}
              <span className="text-sm text-slate-400 font-medium">
                Leads Cerrados
              </span>
            </h4>
            <p className="text-[10px] text-emerald-600 font-bold mt-2">
              {isPresentationMode
                ? "Total: $ XX,XXX USD"
                : `Total: $${(data.montoLeads || 0).toLocaleString()} USD`}
            </p>
          </Card>

          <Card className="rounded-3xl border-none shadow-sm bg-white p-6 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">
              Impacto Mensual (Leads)
            </p>
            <h4
              className={`text-2xl font-black ${(data.crecimientoLeads ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"} mt-2`}
            >
              {isPresentationMode
                ? "XX.X%"
                : `${(data.crecimientoLeads ?? 0).toFixed(1)}%`}
            </h4>
            <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">
              vs mes anterior
            </p>
          </Card>
        </div>

        {/* Rankings Laterales */}
        <div className="lg:col-span-3 grid grid-cols-2 gap-6">
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
    </div>
  );
}

function RankList({ title, data, isPresentationMode }: any) {
  return (
    <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="text-slate-900 text-sm font-black uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col">
          {data.map((item: string, i: number) => (
            <div
              key={i}
              className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-all border-b border-slate-50 last:border-none group"
            >
              <span className="text-[10px] font-black text-slate-300 w-4 group-hover:text-blue-500 transition-colors">
                0{i + 1}
              </span>
              <span className="text-xs font-semibold text-slate-600 truncate uppercase tracking-tight">
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
  const colors: any = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <Card className="border-none shadow-sm rounded-3xl p-6 bg-white">
      <div className="flex items-center gap-4">
        <div className={`p-4 rounded-2xl ${colors[color]}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {title}
          </p>
          <h4 className="text-lg font-black text-slate-900 truncate">
            {value}
          </h4>
        </div>
      </div>
    </Card>
  );
}
