"use client";
import { usePresentationMode } from "@/components/presentacion/presentation-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Award,
  TrendingUp,
  Package,
  BarChart3,
  Calendar,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Trophy,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface MarcaData {
  nombre: string;
  monto: number;
  cantidad: number;
  porcentaje: number;
  spiffMeta: number;
  spiffPorMeta: number;
  spiffGanado: number;
  tieneRegla: boolean;
  productos: { nombre: string; cantidad: number; monto: number; porcentaje: number }[];
}

export default function SpiffPage() {
  const { isPresentationMode } = usePresentationMode();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMarca, setExpandedMarca] = useState<string | null>(null);

  const now = new Date();
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(now.getFullYear(), now.getMonth(), 1),
    now,
  ]);
  const [startDate, endDate] = dateRange;

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.append("fechaInicio", startDate.toISOString().split("T")[0]);
    if (endDate) params.append("fechaFin", endDate.toISOString().split("T")[0]);

    fetch(`/api/vendedores/spiff?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => {
    const ok = !startDate || (startDate && endDate);
    if (ok) fetchData();
  }, [fetchData, startDate, endDate]);

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateRange([start, end]);
  };

  const handleMonthStart = () => {
    const now = new Date();
    setDateRange([new Date(now.getFullYear(), now.getMonth(), 1), now]);
  };

  const marcas: MarcaData[] = data?.marcas || [];
  const totalGeneral = data?.totalGeneral || 0;
  const totalFacturas = data?.totalFacturas || 0;
  const totalSpiff = data?.totalSpiff || 0;
  const rankingVendedores = data?.rankingVendedores || [];
  const miPosicion = data?.miPosicion || { posicion: 0, nombre: "", totalSpiff: 0, totalFacturado: 0 };

  const getBarColor = (index: number) => {
    const colors = [
      "bg-yellow-400",
      "bg-slate-400",
      "bg-amber-600",
      "bg-blue-500",
      "bg-emerald-500",
      "bg-purple-500",
      "bg-red-400",
      "bg-cyan-500",
      "bg-orange-400",
      "bg-indigo-500",
    ];
    return colors[index % colors.length];
  };

  if (loading && !data)
    return <div className="p-10 text-center font-bold text-slate-400">Cargando Spiff...</div>;

  return (
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 rounded-2xl">
            <Award size={28} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900">Spiff</h1>
            <p className="text-sm text-slate-400 font-medium">Facturación total por marca</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-sm">
            <Calendar size={16} className="text-slate-400" />
            <DatePicker
              selectsRange
              startDate={startDate}
              endDate={endDate}
              onChange={(update) => setDateRange(update)}
              placeholderText="Seleccionar periodo..."
              className="text-xs font-bold w-56 cursor-pointer outline-none bg-transparent"
              dateFormat="dd MMM yyyy"
            />
          </div>
          <div className="flex gap-1">
            <button onClick={() => handleQuickRange(0)} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">Hoy</button>
            <button onClick={handleMonthStart} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">Este Mes</button>
            <button onClick={() => handleQuickRange(30)} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">30 días</button>
            <button onClick={() => handleQuickRange(90)} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">90 días</button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Total Spiff</p>
          <h4 className="text-xl font-black text-amber-600 mt-1">{isPresentationMode ? "$ X,XXX" : `$${totalSpiff.toLocaleString()}`}</h4>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marcas con Spiff</p>
          <h4 className="text-xl font-black text-slate-900 mt-1">{isPresentationMode ? "XX" : marcas.length}</h4>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Facturas</p>
          <h4 className="text-xl font-black text-blue-600 mt-1">{isPresentationMode ? "XX" : totalFacturas}</h4>
        </Card>
      </div>

      {/* Tabla de marcas */}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-900 text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={16} className="text-amber-500" /> Facturación por Marca
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {marcas.length === 0 ? (
            <div className="py-12 text-center">
              <Award size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">No hay reglas de spiff activas para este período</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {marcas.map((marca, i) => {
                const isExpanded = expandedMarca === marca.nombre;
                const barWidth = marcas[0]?.monto > 0 ? (marca.monto / marcas[0].monto) * 100 : 0;
                return (
                  <div key={marca.nombre} className="border-b last:border-none">
                    <div
                      onClick={() => setExpandedMarca(isExpanded ? null : marca.nombre)}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 cursor-pointer transition-all"
                    >
                      <div className="flex-shrink-0 w-8 flex justify-center">
                        {i === 0 ? (
                          <Award size={18} className="text-yellow-500" />
                        ) : i === 1 ? (
                          <Award size={18} className="text-slate-400" />
                        ) : i === 2 ? (
                          <Award size={18} className="text-amber-600" />
                        ) : (
                          <span className="text-xs font-black text-slate-300">{i + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-tight">{isPresentationMode ? `Marca #${i + 1}` : marca.nombre}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-400">{marca.porcentaje}%</span>
                            <span className="text-xs font-black text-slate-700 tabular-nums">${isPresentationMode ? "X,XXX" : marca.monto.toLocaleString()}</span>
                            {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${getBarColor(i)}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{isPresentationMode ? "XX uds" : `${marca.cantidad.toLocaleString()} unidades`}</p>
                        {marca.tieneRegla && (
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[9px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md">
                              Meta: ${marca.spiffMeta.toLocaleString()}
                            </span>
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                              Spiff: ${marca.spiffPorMeta.toLocaleString()}/meta
                            </span>
                            {marca.spiffGanado > 0 && (
                              <span className="text-[9px] font-black text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-md">
                                Ganado: ${marca.spiffGanado.toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && marca.productos.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 pl-16">
                            <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                              <div className="bg-slate-100/50 px-4 py-2 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                <span>Producto</span>
                                <span className="text-right">Monto / %</span>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {marca.productos.map((p, j) => (
                                  <div key={j} className="px-4 py-2 flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 truncate max-w-[65%]">{isPresentationMode ? `Producto #${j + 1}` : p.nombre}</span>
                                    <div className="text-right">
                                      <span className="font-black text-slate-700">${isPresentationMode ? "X,XXX" : p.monto.toLocaleString()}</span>
                                      <span className="text-[10px] text-slate-400 ml-1.5">{p.porcentaje}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking de Spiffs */}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-900 text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" /> Ranking de Spiffs
          </CardTitle>
          {miPosicion.posicion > 0 && (
            <p className="text-xs text-slate-400 font-medium mt-1">
              Tu posición: <span className="font-black text-amber-600">#{miPosicion.posicion}</span> de <span className="font-black text-slate-700">{rankingVendedores.length}</span> vendedores
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {rankingVendedores.length === 0 ? (
            <div className="py-12 text-center">
              <Trophy size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">No hay spiffs calculados para este período</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rankingVendedores.map((vendedor: any) => {
                const isMe = vendedor.nombre === miPosicion.nombre;
                return (
                  <div
                    key={vendedor.nombre}
                    className={`flex items-center gap-4 px-5 py-4 transition-all ${isMe ? "bg-amber-50/70" : "hover:bg-slate-50/50"}`}
                  >
                    <div className="flex-shrink-0 w-8 flex justify-center">
                      {vendedor.posicion === 1 ? (
                        <Award size={18} className="text-yellow-500" />
                      ) : vendedor.posicion === 2 ? (
                        <Award size={18} className="text-slate-400" />
                      ) : vendedor.posicion === 3 ? (
                        <Award size={18} className="text-amber-600" />
                      ) : (
                        <span className="text-xs font-black text-slate-300">{vendedor.posicion}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold uppercase tracking-tight ${isMe ? "text-amber-700" : "text-slate-700"}`}>
                        {isPresentationMode ? `Vendedor #${vendedor.posicion}` : vendedor.nombre}
                        {isMe && <span className="ml-2 text-[9px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-md">TÚ</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-black ${isMe ? "text-amber-600" : "text-slate-700"}`}>
                        ${isPresentationMode ? "X,XXX" : vendedor.totalSpiff.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
