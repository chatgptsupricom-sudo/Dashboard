"use client";

import { motion } from "framer-motion";
import {
  Download,
  Filter,
  Tag,
  TrendingUp, // Asegúrate de incluir los nuevos que usamos
  UserPlus,
  Users,
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
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function PremiumReports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCo, setSelectedCo] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let url = `/api/superadmin/reports?company_id=${selectedCo}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      });
  }, [selectedCo, dateFrom, dateTo]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center font-black text-slate-300">
        CARGANDO INTELIGENCIA...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-8 space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
            Executive <span className="text-blue-600">Reports</span>
          </h1>
          <p className="text-slate-500 font-medium">
            Consolidado operativo y comercial
          </p>
        </div>
        <div className="flex gap-4">
          {/* Filtro de Empresas */}
          <div className="relative flex items-center">
            <Filter
              className="absolute left-4 text-slate-400 pointer-events-none"
              size={16}
            />
            <select
              onChange={(e) => setSelectedCo(e.target.value)}
              className="pl-10 pr-8 py-3 bg-white border-none rounded-2xl shadow-sm font-bold text-xs focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              <option value="all">Todas las Empresas</option>
              {/* AÑADE ESTA VERIFICACIÓN */}
              {data?.companies?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Botón de Descarga */}
          <button className="group flex items-center gap-2 px-5 py-3 bg-white text-slate-700 rounded-2xl shadow-sm border border-slate-100 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-300 font-bold text-xs uppercase tracking-widest active:scale-95">
            <Download size={16} className="group-hover:animate-bounce" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPIBox
          title="Ventas Totales"
          // Usamos ?. para evitar el error y ?? 0 para un valor por defecto
          value={`$${data?.summary?.totalRevenue?.toLocaleString() ?? "0"}`}
          trend="+15%"
          icon={TrendingUp}
          color="blue"
        />
        <KPIBox
          title="Vendedores"
          value={data?.summary?.totalSellers ?? "0"}
          trend="Activos"
          icon={Users}
          color="purple"
        />
        <KPIBox
          title="Clientes Nuevos"
          value={data?.summary?.newClients ?? "0"}
          trend="Mes actual"
          icon={UserPlus}
          color="green"
        />
        <KPIBox
          title="Marcas Top"
          value={
            data?.salesByBrand?.length > 0
              ? data.summary.topBrand
              : "No definido"
          }
          trend={
            data?.salesByBrand?.length > 0 ? "Alta demanda" : "Revise catálogo"
          }
          icon={Tag}
          color="orange"
        />
      </div>

      {/* MAIN CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ventas por Marca/Estado */}
        {/* Ventas por Marca y Estado */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Ventas por Marca y Estado
            </h3>
            <div className="flex gap-2">
              {/* Indicador de estado opcional */}
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            </div>
          </div>

          {data?.salesByBrand && data.salesByBrand.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={data.salesByBrand}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: "#64748b" }}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar
                  // Si 'ventas' no existe en tus objetos, esto es lo que causa que el gráfico esté vacío
                  dataKey="ventas"
                  fill="#3b82f6"
                  radius={[10, 10, 0, 0]}
                  barSize={45}
                  onMouseEnter={(data) =>
                    console.log("Datos de esta barra:", data)
                  } // ¡Esto te dirá qué nombres de campos existen realmente!
                >
                  {data.salesByBrand.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[350px] flex flex-col items-center justify-center text-slate-300">
              <p className="text-[10px] font-black uppercase tracking-widest">
                Sin datos para este periodo
              </p>
            </div>
          )}
        </div>

        {/* Top Vendedores */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
            Top Vendedores
          </h3>
          <div className="space-y-6">
            {data?.salesBySeller?.map((seller: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs">
                    {/* Usamos ?. y un fallback para evitar errores si el nombre falta */}
                    {seller.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <span className="text-sm font-bold text-slate-700">
                    {seller.name}
                  </span>
                </div>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  ${seller.total?.toLocaleString() || "0"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTES ---

function KPIBox({ title, value, trend, icon: Icon, color }: any) {
  const colorMap: any = {
    blue: "text-blue-600 bg-blue-50",
    purple: "text-purple-600 bg-purple-50",
    green: "text-green-600 bg-green-50",
    orange: "text-orange-600 bg-orange-50",
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between"
    >
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">
          {title}
        </p>
        <h3 className="text-xl font-black text-slate-900">{value}</h3>
        <span className="text-[9px] font-black uppercase text-slate-500">
          {trend}
        </span>
      </div>
      <div className={`p-3 rounded-2xl ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
    </motion.div>
  );
}
