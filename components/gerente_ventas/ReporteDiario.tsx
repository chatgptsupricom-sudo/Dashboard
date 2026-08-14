"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/stores/auth.store";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

interface Vendedor {
  name: string;
  cuota: number;
  cuotaDiaria: number;
  cuotaAlDia: number;
  venta: number;
  pedidos: number;
  ventaMasPedidos: number;
  porcentaje: number;
  posicion: number;
}

interface Sede {
  id: number;
  name: string;
}

interface ReporteData {
  fecha: string;
  diasHabiles: number;
  diasTranscurridos: number;
  porcentajeDias: number;
  meta: number;
  cuotaAlDia: number;
  ventas: number;
  pedidos: number;
  ventaMasPedidos: number;
  vendedores: Vendedor[];
  sedes: Sede[];
}

function getBarColor(v: Vendedor): string {
  if (v.porcentaje >= 100) return "#10b981";
  if (v.porcentaje >= 60) return "#3b82f6";
  if (v.porcentaje >= 40) return "#f59e0b";
  return "#ef4444";
}

function getBarBgColor(v: Vendedor): string {
  if (v.porcentaje >= 100) return "bg-emerald-50";
  if (v.porcentaje >= 60) return "bg-blue-50";
  if (v.porcentaje >= 40) return "bg-amber-50";
  return "bg-red-50";
}

function formatMoney(n: number): string {
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ReporteDiarioVentas() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState(() => {
    const now = new Date();
    return format(now, "yyyy-MM-dd");
  });
  const [sede, setSede] = useState("all");

  const isSuperAdmin =
    user?.role?.toLowerCase().trim() === "superadmin" ||
    user?.role?.toLowerCase().trim() === "super admin";

  useEffect(() => {
    setLoading(true);
    let url = `/api/gerente_venta/reporte-diario?date=${fecha}`;
    if (isSuperAdmin && sede !== "all") {
      url += `&sede=${sede}`;
    }
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error:", err);
        setLoading(false);
      });
  }, [fecha, sede, isSuperAdmin]);

  const fechaDisplay = data?.fecha
    ? format(new Date(data.fecha + "T12:00:00"), "dd/MM/yyyy", { locale: es })
    : fecha;

  const exportarExcel = () => {
    if (!data) return;

    const rows = data.vendedores.map((v) => ({
      Vendedor: v.name.toUpperCase(),
      Cuota: v.cuota,
      "Cuota al día": v.cuotaAlDia,
      Venta: v.venta,
      Pedidos: v.pedidos,
      "Venta + Pedidos": v.ventaMasPedidos,
      "%": v.porcentaje,
      Posición: v.posicion,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 8 },
      { wch: 8 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Reporte ${fechaDisplay}`);
    XLSX.writeFile(
      wb,
      `Reporte_Diario_Ventas_${fechaDisplay.replace(/\//g, "-")}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700">
          Cargando reporte...
        </h2>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-slate-400">
        <p>No se pudieron cargar los datos</p>
      </div>
    );
  }

  const porcentajeVentas =
    data.cuotaAlDia > 0 ? Math.round((data.ventas / data.cuotaAlDia) * 100) : 0;
  const porcentajePedidos =
    data.cuotaAlDia > 0
      ? Math.round((data.pedidos / data.cuotaAlDia) * 100)
      : 0;
  const porcentajeTotal =
    data.cuotaAlDia > 0
      ? Math.round((data.ventaMasPedidos / data.cuotaAlDia) * 100)
      : 0;

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-50">
            <ClipboardList className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              Reporte Diario de Ventas
            </h1>
            <p className="text-sm text-slate-500">
              Seguimiento diario por vendedor vs cuota
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro de sede (solo SuperAdmin) */}
          {isSuperAdmin && data.sedes && data.sedes.length > 0 && (
            <div className="bg-white border rounded-xl p-2 flex items-center gap-2 shadow-sm">
              <MapPin size={16} className="text-slate-400 ml-2" />
              <select
                value={sede}
                onChange={(e) => setSede(e.target.value)}
                className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer"
              >
                <option value="all">Todas las Sedes</option>
                {data.sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="bg-white border rounded-xl p-2 flex items-center gap-2 shadow-sm">
            <CalendarIcon size={16} className="text-slate-400 ml-2" />
            <input
              type="date"
              className="text-sm border-none focus:ring-0 font-bold text-slate-700"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <button
            onClick={exportarExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all duration-300 font-bold text-xs uppercase tracking-widest active:scale-95"
          >
            <Download size={16} />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* Info del mes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Fecha
          </span>
          <p className="text-sm font-black text-slate-900">{fechaDisplay}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Días Hábiles
          </span>
          <p className="text-sm font-black text-slate-900">
            {data.diasHabiles}
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Días Transcurridos
          </span>
          <p className="text-sm font-black text-slate-900">
            {data.diasTranscurridos}
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            % Días Transcurridos
          </span>
          <p className="text-sm font-black text-slate-900">
            {data.porcentajeDias}%
          </p>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Meta Mensual
            </span>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatMoney(data.meta)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Cuota al Día
            </span>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatMoney(data.cuotaAlDia)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Venta
            </span>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatMoney(data.ventas)}
            </p>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {porcentajeVentas}%
            </span>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Pedidos
            </span>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatMoney(data.pedidos)}
            </p>
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
              {porcentajePedidos}%
            </span>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Venta + Pedidos
            </span>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatMoney(data.ventaMasPedidos)}
            </p>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {porcentajeTotal}%
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de vendedores + Gráfico */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabla */}
        <Card className="lg:col-span-2 border-none shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="bg-slate-50/80 border-b border-slate-100 pb-3">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <TrendingUp size={16} /> Ranking de Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      ✓
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Vendedor
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Cuota
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Cuota al día
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Venta
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                      %
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Posición
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendedores.map((v, i) => (
                    <tr
                      key={i}
                      className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${getBarBgColor(v)}`}
                    >
                      <td className="px-4 py-3">
                        {v.porcentaje >= 100 && (
                          <CheckCircle2
                            size={16}
                            className="text-emerald-500"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 uppercase text-xs">
                        {v.name}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-xs text-slate-700">
                        {formatMoney(v.cuota)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-xs text-slate-500">
                        {formatMoney(v.cuotaAlDia)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-xs text-slate-900">
                        {formatMoney(v.venta)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                            v.porcentaje >= 100
                              ? "text-emerald-700 bg-emerald-100"
                              : v.porcentaje >= 60
                                ? "text-blue-700 bg-blue-100"
                                : v.porcentaje >= 40
                                  ? "text-amber-700 bg-amber-100"
                                  : "text-red-700 bg-red-100"
                          }`}
                        >
                          {v.porcentaje}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-bold text-slate-600">
                          {v.posicion}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Panel lateral: gráfico + porcentajes */}
        <div className="space-y-4">
          {/* Gráfico de barras */}
          <Card className="border-none shadow-sm rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Ventas por Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.vendedores}
                  layout="vertical"
                  margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
                    width={100}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `$${value.toLocaleString()}`,
                      "Venta",
                    ]}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="venta" radius={[0, 6, 6, 0]} barSize={18}>
                    {data.vendedores.map((v, i) => (
                      <Cell key={i} fill={getBarColor(v)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Resumen de porcentajes */}
          <Card className="border-none shadow-sm rounded-2xl bg-white">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">
                  Objetivo:
                </span>
                <span className="text-sm font-black text-slate-900">
                  {formatMoney(data.meta)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">
                  Real (venta):
                </span>
                <span className="text-sm font-black text-blue-600">
                  {formatMoney(data.ventas)}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">
                    Porcentaje alcanzado:
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{
                          width: `${Math.min(porcentajeVentas, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-black text-emerald-600">
                      {porcentajeVentas}%
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">
                    Porcentaje restante:
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-amber-500 h-2 rounded-full"
                        style={{
                          width: `${Math.max(100 - porcentajeVentas, 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-black text-amber-600">
                      {Math.max(100 - porcentajeVentas, 0)}%
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-50">
                  <span className="text-xs font-bold text-slate-500">
                    Porcentaje Total (V+P):
                  </span>
                  <span className="text-xs font-black text-slate-900">
                    {porcentajeTotal}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
