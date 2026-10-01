"use client";

import { motion } from "framer-motion";
import { Tag, TrendingUp, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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

  // Estados de filtros
  const [filters, setFilters] = useState({ co: "all", seller: "all" });
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [startDate, endDate] = dateRange;

  // Lógica de carga automática
  useEffect(() => {
    // Solo cargamos si el rango está completo o si no hay fechas (para cargar datos globales)
    const isDateRangeComplete = !startDate || (startDate && endDate);

    if (isDateRangeComplete) {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.co !== "all") params.append("company_id", filters.co);
      if (filters.seller !== "all") params.append("seller_id", filters.seller);
      if (startDate)
        params.append("date_from", startDate.toISOString().split("T")[0]);
      if (endDate)
        params.append("date_to", endDate.toISOString().split("T")[0]);

      fetch(`/api/gerente_operaciones/reports?${params.toString()}`)
        .then((res) => res.json())
        .then((json) => {
          setData(json);
          setLoading(false);
        });
    }
  }, [filters, startDate, endDate]);

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateRange([start, end]);
  };

  if (loading && !data)
    return (
      <div className="h-screen flex items-center justify-center font-black text-slate-300">
        CARGANDO INTELIGENCIA...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-8 space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
          Executive Reports
        </h1>

        <div className="flex gap-3 items-center">
          <DatePicker
            selectsRange={true}
            startDate={startDate}
            endDate={endDate}
            onChange={(update) => setDateRange(update)}
            placeholderText="Seleccionar periodo..."
            className="py-3 px-6 bg-slate-50 rounded-xl text-xs font-bold w-64 cursor-pointer outline-none hover:bg-slate-100"
            dateFormat="dd MMM yyyy"
          />

          <select
            onChange={(e) => setFilters({ ...filters, seller: e.target.value })}
            className="py-3 px-4 bg-slate-50 rounded-xl text-xs font-bold outline-none"
          >
            <option value="all">Vendedor</option>
            {data?.sellersList?.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPIBox
          title="Ventas Totales"
          value={`$${data?.summary?.totalRevenue?.toLocaleString() ?? "0"}`}
          icon={TrendingUp}
          color="blue"
        />
        <KPIBox
          title="Vendedores"
          value={data?.summary?.totalSellers ?? "0"}
          icon={Users}
          color="purple"
        />
        <KPIBox
          title="Clientes"
          value={data?.summary?.newClients ?? "0"}
          icon={UserPlus}
          color="green"
        />
        <KPIBox
          title="Marcas Top"
          value={data?.summary?.topBrand ?? "No definido"}
          icon={Tag}
          color="orange"
        />
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border shadow-sm">
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-8">
            Ventas por Marca
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data?.salesByBrand || []}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tick={{ fontSize: 11, fontWeight: 700 }}
              />
              <Tooltip cursor={{ fill: "#f8fafc" }} />
              <Bar
                dataKey="ventas"
                fill="#3b82f6"
                radius={[10, 10, 0, 0]}
                barSize={40}
              >
                {data?.salesByBrand?.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-6">
            Top Vendedores
          </h3>
          <div className="space-y-6">
            {data?.salesBySeller?.map((seller: any, i: number) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700">
                  {seller.name}
                </span>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  ${seller.total?.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPIBox({ title, value, icon: Icon, color }: any) {
  const colorMap: any = {
    blue: "text-blue-600 bg-blue-50",
    purple: "text-purple-600 bg-purple-50",
    green: "text-green-600 bg-green-50",
    orange: "text-orange-600 bg-orange-50",
  };
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-[2rem] border shadow-sm flex items-center justify-between"
    >
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">
          {title}
        </p>
        <h3 className="text-xl font-black text-slate-900">{value}</h3>
      </div>
      <div className={`p-3 rounded-2xl ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
    </motion.div>
  );
}
