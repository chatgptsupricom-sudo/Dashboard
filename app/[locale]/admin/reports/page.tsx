"use client";

import { motion } from "framer-motion";
import {
  Building2,
  ChevronRight,
  Download,
  Filter,
  Globe,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function PremiumReports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCo, setSelectedCo] = useState("all");

  useEffect(() => {
    fetch(`/api/superadmin/reports?company_id=${selectedCo}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      });
  }, [selectedCo]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center font-black text-slate-300 animate-pulse">
        CARGANDO INTELIGENCIA DE NEGOCIOS...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 space-y-8">
      {/* HEADER DE ALTO NIVEL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
            Executive <span className="text-blue-600">Reports</span>
          </h1>
          <p className="text-slate-500 font-medium">
            Análisis consolidado del ecosistema Supricom
          </p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Filter
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <select
              onChange={(e) => setSelectedCo(e.target.value)}
              className="pl-10 pr-8 py-3 bg-white border-none rounded-2xl shadow-sm font-bold text-xs focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="all">Todas las Empresas</option>
              {data.companies.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button className="bg-slate-900 text-white p-3 rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* KPI GRID PREMIUM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPIBox
          title="Facturación Global"
          value={`$${data.summary.totalRevenue.toLocaleString()}`}
          trend="+12.4%"
          icon={TrendingUp}
          color="blue"
        />
        <KPIBox
          title="Empresas en Holding"
          value={data.summary.activeCompanies}
          trend="Operativas"
          icon={Building2}
          color="purple"
        />
        <KPIBox
          title="Compañía Líder"
          value={data.summary.topCompany}
          trend="Mayor ROI"
          icon={Globe}
          color="green"
        />
      </div>

      {/* SECCIÓN GRÁFICA PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rendimiento por Empresa */}
        <ChartContainer title="Rendimiento por Unidad de Negocio">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.companyPerformance}>
              <defs>
                <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700 }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{
                  borderRadius: "16px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                }}
              />
              <Bar
                dataKey="total"
                fill="url(#colorBar)"
                radius={[10, 10, 0, 0]}
                barSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Top Productos Rentables */}
        <ChartContainer title="Top 10 Productos por Ingresos ($)">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.productRanking}
                innerRadius={80}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {data.productRanking.map((_: any, index: number) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
}

// SUB-COMPONENTES ESTILIZADOS
function KPIBox({ title, value, trend, icon: Icon, color }: any) {
  const colorMap: any = {
    blue: "text-blue-600 bg-blue-50",
    purple: "text-purple-600 bg-purple-50",
    green: "text-green-600 bg-green-50",
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between"
    >
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">
          {title}
        </p>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">
          {value}
        </h3>
        <span className="text-[10px] font-bold text-green-500 bg-green-50 px-2 py-1 rounded-full mt-2 inline-block">
          {trend}
        </span>
      </div>
      <div className={`p-4 rounded-3xl ${colorMap[color]}`}>
        <Icon size={28} />
      </div>
    </motion.div>
  );
}

function ChartContainer({ title, children }: any) {
  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
          {title}
        </h3>
        <ChevronRight className="text-slate-300" />
      </div>
      {children}
    </div>
  );
}
