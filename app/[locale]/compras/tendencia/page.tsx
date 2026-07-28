"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TopProducto {
  id: number;
  nombre: string;
  totalVentas: number;
  semanal: number[];
}

interface TendenciaData {
  historico: false;
  mes: string;
  semanas: string[];
  totalPorSemana: { semana: string; total: number }[];
  topProductos: TopProducto[];
  productosPorSemana: Record<string, { nombre: string; qty: number }[]>;
  productosTotal: { nombre: string; qty: number }[];
}

interface HistoricoData {
  historico: true;
  totalHistorico: number;
  promedioMensual: number;
  mejorMes: { label: string; total: number };
  mesesConVenta: number;
  topProductos: { nombre: string; qty: number }[];
}

interface DrillDown {
  titulo: string;
  productos: { nombre: string; qty: number }[];
}

const SEDES = [
  { id: "todas", label: "Todas las sedes" },
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
  { id: "7", label: "Panamá" },
];

const COLORES = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#65a30d",
  "#ea580c",
  "#6d28d9",
];

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function generarMeses(n = 13) {
  const hoy = new Date();
  const meses: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
    meses.push({ value, label });
  }
  return meses;
}

async function fetchHistorico(sede: string): Promise<HistoricoData | null> {
  const params = new URLSearchParams({ historico: "true" });
  if (sede !== "todas") params.set("sede", sede);
  const r = await fetch(`/api/compras/tendencia?${params}`);
  const json = await r.json();
  return json.success ? json.data : null;
}

async function fetchTendencia(
  mes: string,
  sede: string,
): Promise<TendenciaData | null> {
  const params = new URLSearchParams({ mes });
  if (sede !== "todas") params.set("sede", sede);
  const r = await fetch(`/api/compras/tendencia?${params}`);
  const json = await r.json();
  return json.success ? json.data : null;
}

export default function TendenciaPage() {
  const mesesDisponibles = useMemo(() => generarMeses(13), []);
  const mesActual = mesesDisponibles[0].value;

  const [sede, setSede] = useState("todas");

  // KPI cards: histórico últimos 24 meses
  const [historicoData, setHistoricoData] = useState<HistoricoData | null>(
    null,
  );
  const [kpiLoading, setKpiLoading] = useState(true);

  // Gráficas: mes seleccionable
  const [chartMes, setChartMes] = useState(mesActual);
  const [chartData, setChartData] = useState<TendenciaData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  const [topN, setTopN] = useState(5);
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [activeBar, setActiveBar] = useState<string | null>(null);

  // Cargar KPIs históricos (últimos 24 meses)
  useEffect(() => {
    setKpiLoading(true);
    fetchHistorico(sede)
      .then((d) => setHistoricoData(d))
      .catch(console.error)
      .finally(() => setKpiLoading(false));
  }, [sede]);

  // Cargar datos de gráficas (mes seleccionado)
  useEffect(() => {
    setChartLoading(true);
    setDrillDown(null);
    setActiveBar(null);
    fetchTendencia(chartMes, sede)
      .then((d) => setChartData(d))
      .catch(console.error)
      .finally(() => setChartLoading(false));
  }, [sede, chartMes]);

  const chartMesLabel =
    mesesDisponibles.find((m) => m.value === chartMes)?.label ?? chartMes;

  const handleBarClick = (weekLabel: string) => {
    if (!chartData) return;
    if (activeBar === weekLabel) {
      setDrillDown(null);
      setActiveBar(null);
      return;
    }
    setDrillDown({
      titulo: weekLabel,
      productos: chartData.productosPorSemana[weekLabel] ?? [],
    });
    setActiveBar(weekLabel);
  };

  const handleKpiClick = (
    titulo: string,
    productos: { nombre: string; qty: number }[],
  ) => {
    if (drillDown?.titulo === titulo) {
      setDrillDown(null);
      return;
    }
    setDrillDown({ titulo, productos });
    setActiveBar(null);
  };

  // Chart values
  const barData =
    chartData?.totalPorSemana.map((s) => ({
      semana: s.semana,
      total: s.total,
    })) ?? [];
  const lineData = chartData
    ? chartData.semanas.map((sem, wi) => {
        const point: Record<string, any> = { semana: sem };
        chartData.topProductos.slice(0, topN).forEach((p) => {
          const key =
            p.nombre.length > 28 ? p.nombre.slice(0, 28) + "…" : p.nombre;
          point[key] = p.semanal[wi];
        });
        return point;
      })
    : [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Tendencia de Ventas
          </h1>
          <p className="text-gray-500">Unidades facturadas por semana.</p>
        </div>
        <Select value={sede} onValueChange={setSede}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sede" />
          </SelectTrigger>
          <SelectContent>
            {SEDES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards — histórico últimos 24 meses */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-medium">
          Histórico últimos 24 meses
        </p>
        {kpiLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-gray-200 shadow-sm animate-pulse">
                <CardContent className="p-4 h-20" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              className={`border-blue-200 bg-blue-50/40 shadow-sm cursor-pointer transition-all ${drillDown?.titulo === "Top productos histórico" ? "ring-2 ring-blue-500" : "hover:shadow-md"}`}
              onClick={() =>
                handleKpiClick(
                  "Top productos histórico",
                  historicoData?.topProductos ?? [],
                )
              }
            >
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Total histórico
                </p>
                <p className="text-3xl font-bold text-blue-700 mt-1">
                  {(historicoData?.totalHistorico ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-blue-400 mt-1">Ver productos →</p>
              </CardContent>
            </Card>
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Promedio mensual
                </p>
                <p className="text-3xl font-bold text-gray-700 mt-1">
                  {(historicoData?.promedioMensual ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">Unidades / mes</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50/40 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Mejor mes
                </p>
                <p className="text-3xl font-bold text-green-700 mt-1">
                  {(historicoData?.mejorMes.total ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-green-400 mt-1">
                  {historicoData?.mejorMes.label ?? "-"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Meses con venta
                </p>
                <p className="text-3xl font-bold text-gray-700 mt-1">
                  {historicoData?.mesesConVenta ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  De 24 meses analizados
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Drill-down panel */}
      {drillDown && (
        <Card className="border-blue-300 bg-blue-50/30 shadow-md">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-blue-800">
              Productos — {drillDown.titulo}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({drillDown.productos.length} productos ·{" "}
                {drillDown.productos
                  .reduce((s, p) => s + p.qty, 0)
                  .toLocaleString()}{" "}
                uds)
              </span>
            </CardTitle>
            <button
              onClick={() => {
                setDrillDown(null);
                setActiveBar(null);
              }}
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-blue-50 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">
                      #
                    </th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">
                      Producto
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">
                      Unidades
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">
                      % del total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.productos.map((p, i) => {
                    const total = drillDown.productos.reduce(
                      (s, x) => s + x.qty,
                      0,
                    );
                    const pct =
                      total > 0 ? ((p.qty / total) * 100).toFixed(1) : "0.0";
                    return (
                      <tr
                        key={i}
                        className="border-b last:border-0 hover:bg-blue-50/50"
                      >
                        <td className="py-1.5 px-3 text-gray-400 text-xs">
                          {i + 1}
                        </td>
                        <td className="py-1.5 px-3 truncate max-w-[400px]">
                          {p.nombre}
                        </td>
                        <td className="py-1.5 px-3 text-right font-medium">
                          {p.qty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-500">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gráficas — selector de mes en el header de la primera tarjeta ── */}
      <div className="space-y-4">
        {chartLoading ? (
          <Card className="shadow-sm border-gray-200">
            <CardContent className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Bar chart — selector de mes en el header */}
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Unidades facturadas por semana
                  <span className="text-xs font-normal text-gray-400">
                    (clic en barra para ver productos)
                  </span>
                </CardTitle>
                <Select value={chartMes} onValueChange={setChartMes}>
                  <SelectTrigger className="w-44 flex-shrink-0">
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {mesesDisponibles.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={barData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    onClick={(e) => {
                      if (e?.activeLabel) handleBarClick(e.activeLabel);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any) => [v.toLocaleString(), "Unidades"]}
                    />
                    <Bar dataKey="total" radius={[3, 3, 0, 0]} name="Total">
                      {barData.map((entry) => (
                        <Cell
                          key={entry.semana}
                          fill="#2563eb"
                          opacity={
                            activeBar && activeBar !== entry.semana ? 0.45 : 1
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Line chart */}
            {chartData && chartData.topProductos.length > 0 && (
              <Card className="shadow-sm border-gray-200">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle className="text-base">
                    Top productos — {chartMesLabel}
                  </CardTitle>
                  <Select
                    value={String(topN)}
                    onValueChange={(v) => setTopN(Number(v))}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">Top 3</SelectItem>
                      <SelectItem value="5">Top 5</SelectItem>
                      <SelectItem value="10">Top 10</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={lineData}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {chartData.topProductos.slice(0, topN).map((p, i) => {
                        const key =
                          p.nombre.length > 28
                            ? p.nombre.slice(0, 28) + "…"
                            : p.nombre;
                        return (
                          <Line
                            key={p.id}
                            type="monotone"
                            dataKey={key}
                            stroke={COLORES[i % COLORES.length]}
                            strokeWidth={2}
                            dot={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Ranking top 10 — histórico */}
            {historicoData && (
              <Card className="shadow-sm border-gray-200">
                <CardHeader>
                  <CardTitle className="text-base">
                    Top 10 productos — Histórico 24 meses
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">
                            #
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">
                            Producto
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            Unidades
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            % del total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoData.topProductos.slice(0, 10).map((p, i) => {
                          const pct =
                            historicoData.totalHistorico > 0
                              ? (
                                  (p.qty / historicoData.totalHistorico) *
                                  100
                                ).toFixed(1)
                              : "0.0";
                          return (
                            <tr
                              key={i}
                              className="border-b last:border-0 hover:bg-gray-50"
                            >
                              <td className="px-4 py-2.5 text-gray-400">
                                {i + 1}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{
                                      background: COLORES[i % COLORES.length],
                                    }}
                                  />
                                  <span className="truncate max-w-[420px]">
                                    {p.nombre}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium">
                                {p.qty.toLocaleString()}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-500">
                                {pct}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
