"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, DollarSign, Package, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function SuperAdminView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/stats")
      .then((res) => res.json())
      .then((json) => {
        // Normalización de datos para evitar errores de undefined
        const sanitizedData = {
          ...json,
          topClients: (json.topClients || []).filter(
            (c: any) => c.name !== "SUPRICOM, LLC"
          ),
          topProducts: json.topProducts || [],
          monthlyGrowth: json.monthlyGrowth || [],
          brands: {
            mostSold: json.brands?.mostSold || [],
            leastSold: json.brands?.leastSold || [],
          },
          summary: {
            totalMonth: json.summary?.totalMonth || 0,
            topProductName: json.summary?.topProductName || "N/A",
            growthRate: json.summary?.growthRate || "0%", // Dato real de Odoo
          },
        };
        setData(sanitizedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching Odoo stats:", err);
        setLoading(false);
      });
  }, []);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center animate-pulse text-slate-500 font-medium">
        Sincronizando métricas en tiempo real con Odoo...
      </div>
    );

  if (!data)
    return (
      <div className="p-8 text-center text-red-500">
        Error al conectar con la pasarela de Odoo.
      </div>
    );

  return (
    <div className="space-y-6">
      {/* KPIs Superiores - DATOS PROVENIENTES DE ODOO */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Ventas del Mes"
          value={`$${data.summary.totalMonth.toLocaleString()}`}
          icon={DollarSign}
          trend="Actualizado"
        />
        <MetricCard
          title="Producto Estrella"
          value={data.summary.topProductName}
          icon={Package}
          trend="Líder de ventas"
        />
        <MetricCard
          title="Clientes Activos"
          value={data.topClients.length}
          icon={Users}
          trend="Cartera real"
        />
        <MetricCard
          title="Crecimiento"
          value={data.summary.growthRate}
          icon={TrendingUp}
          trend="vs Mes Anterior"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Crecimiento Mensual - ODOO DATA */}
        <Card className="rounded-3xl border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-slate-700 font-bold">
              Historial de Facturación
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlyGrowth}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  strokeWidth={4}
                  dot={{
                    r: 4,
                    fill: "#3b82f6",
                    strokeWidth: 2,
                    stroke: "#fff",
                  }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Productos más Vendidos - ODOO DATA */}
        <Card className="rounded-3xl border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-slate-700 font-bold">
              Top Productos (Cantidades)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topProducts}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={0}
                  tickFormatter={(val) =>
                    val.length > 12 ? `${val.substring(0, 12)}...` : val
                  }
                />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar
                  dataKey="qty"
                  fill="#3b82f6"
                  radius={[6, 6, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RANKING MARCAS LÍDERES */}
        <Card className="rounded-3xl border-none shadow-sm border-t-4 border-t-green-500 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-700 flex items-center gap-2 font-bold">
              <TrendingUp className="text-green-500" /> Marcas Líderes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.brands.mostSold.map((brand: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between items-center group"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-green-50 text-xs font-bold text-green-600">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-slate-600 uppercase">
                      {brand.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">
                      ${brand.revenue.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RANKING MARCAS BAJO RENDIMIENTO */}
        <Card className="rounded-3xl border-none shadow-sm border-t-4 border-t-red-500 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-700 flex items-center gap-2 font-bold">
              <Activity className="text-red-500" /> Alerta: Bajo Rendimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.brands.leastSold.map((brand: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between items-center opacity-80"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-xs font-bold text-red-600">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-slate-600 uppercase">
                      {brand.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">
                      ${brand.revenue.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TABLA CLIENTES - ODOO DATA */}
      <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Users size={16} /> Top Clientes por Facturación (Odoo)
          </CardTitle>
        </CardHeader>
        <div className="divide-y divide-slate-100">
          {data.topClients.map((client: any, i: number) => (
            <div
              key={i}
              className="p-5 flex justify-between items-center hover:bg-blue-50/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                  {client.name.charAt(0)}
                </div>
                <span className="font-bold text-slate-700">{client.name}</span>
              </div>
              <span className="text-blue-600 font-black text-lg">
                ${client.total.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend }: any) {
  return (
    <Card className="border-none shadow-sm rounded-3xl p-6 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
          <Icon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {title}
          </p>
          <h4
            className="text-lg font-black text-slate-900 truncate"
            title={value}
          >
            {value}
          </h4>
          <span className="text-[10px] text-green-500 font-bold bg-green-50 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        </div>
      </div>
    </Card>
  );
}
