"use client";
import { usePresentationMode } from "@/components/presentacion/presentation-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  TrendingUp,
  TrendingDown,
  Calendar,
  MapPin,
  Package,
  CreditCard,
  Filter,
  X,
  Receipt,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useEffect, useState, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const MAP_URL =
  "/geojson/venezuela.geojson";

const MAP_CONFIG = { scale: 1150, center: [-66.3, 6.6] };

const normalize = (name: string) => {
  if (!name) return "";
  return name
    .split("(")[0]
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ESTADO /g, "");
};

interface ClienteTop {
  nombre: string;
  monto: number;
  facturas: number;
  zona: string;
  tipoPago: string;
  diasPago: string;
  creditLimit: number;
  creditUsed: number;
  creditRemaining: number;
  diasCredito: number;
  adeudoTotal: number;
  totalAtrasado: number;
  diasLimite: number;
  fechaLimite: string;
  productosMasVendidos: { nombre: string; cantidad: number; monto: number; porcentaje: number }[];
  productosMenosVendidos: { nombre: string; cantidad: number; monto: number; porcentaje: number }[];
}

interface ProductoTop {
  nombre: string;
  cantidad: number;
  monto: number;
  porcentaje: number;
}

export default function TopClientesPage() {
  const { isPresentationMode } = usePresentationMode();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<ClienteTop | null>(null);

  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [startDate, endDate] = dateRange;

  const [zonaFilter, setZonaFilter] = useState("");
  const [productoFilter, setProductoFilter] = useState("");
  const [pagoFilter, setPagoFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.append("fechaInicio", startDate.toISOString().split("T")[0]);
    if (endDate) params.append("fechaFin", endDate.toISOString().split("T")[0]);
    if (zonaFilter) params.append("zona", zonaFilter);
    if (productoFilter) params.append("producto", productoFilter);
    if (pagoFilter) params.append("pago", pagoFilter);

    fetch(`/api/vendedores/top-clientes?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, [startDate, endDate, zonaFilter, productoFilter, pagoFilter]);

  useEffect(() => {
    const ok = !startDate || (startDate && endDate);
    if (ok) fetchData();
  }, [fetchData, startDate, endDate]);

  useEffect(() => {
    if (selectedClient) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => { document.body.classList.remove("overflow-hidden"); };
  }, [selectedClient]);

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

  const handleClearFilters = () => {
    setZonaFilter("");
    setProductoFilter("");
    setPagoFilter("");
    setDateRange([null, null]);
  };

  const hasActiveFilters = zonaFilter || productoFilter || pagoFilter || startDate;

  const topClientes: ClienteTop[] = data?.topClientes || [];
  const topMasVendidos: ProductoTop[] = data?.topMasVendidos || [];
  const topMenosVendidos: ProductoTop[] = data?.topMenosVendidos || [];
  const zonas: string[] = data?.zonas || [];
  const productos: string[] = data?.productos || [];
  const resumen = data?.resumen || { totalMonto: 0, totalFacturas: 0, totalContado: 0, totalCredito: 0, totalClientes: 0, totalProductos: 0 };

  const getRankIcon = (i: number) => {
    if (i === 0) return <Crown size={18} className="text-yellow-500" />;
    if (i === 1) return <Medal size={18} className="text-slate-400" />;
    if (i === 2) return <Award size={18} className="text-amber-600" />;
    return <span className="text-xs font-black text-slate-300 w-5 text-center">{i + 1}</span>;
  };

  const getRankBg = (i: number) => {
    if (i === 0) return "bg-yellow-50/80 border-yellow-200";
    if (i === 1) return "bg-slate-50/80 border-slate-200";
    if (i === 2) return "bg-amber-50/80 border-amber-200";
    return "bg-white border-slate-100";
  };

  if (loading && !data)
    return <div className="p-10 text-center font-bold text-slate-400">Cargando Top Clientes...</div>;

  return (
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-yellow-50 rounded-2xl">
            <Trophy size={28} className="text-yellow-600" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900">Top Clientes</h1>
            <p className="text-sm text-slate-400 font-medium">Clientes, productos y facturación</p>
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border transition-colors ${showFilters ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Filter size={14} /> Filtros
            {hasActiveFilters && <span className="h-2 w-2 bg-blue-500 rounded-full" />}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block"><MapPin size={12} className="inline mr-1" />Zona</label>
                <select value={zonaFilter} onChange={(e) => setZonaFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium bg-slate-50 outline-none focus:border-blue-400">
                  <option value="">Todas las zonas</option>
                  {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block"><Package size={12} className="inline mr-1" />Producto</label>
                <select value={productoFilter} onChange={(e) => setProductoFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium bg-slate-50 outline-none focus:border-blue-400">
                  <option value="">Todos los productos</option>
                  {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block"><CreditCard size={12} className="inline mr-1" />Tipo de Pago</label>
                <select value={pagoFilter} onChange={(e) => setPagoFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium bg-slate-50 outline-none focus:border-blue-400">
                  <option value="">Todos</option>
                  <option value="Contado">Contado</option>
                  <option value="Crédito">Crédito</option>
                </select>
              </div>
              {hasActiveFilters && (
                <button onClick={handleClearFilters} className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <X size={14} /> Limpiar
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Facturación Total</p>
          <h4 className="text-xl font-black text-emerald-600 mt-1">{isPresentationMode ? "$ XX,XXX" : `$${resumen.totalMonto.toLocaleString()}`}</h4>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Facturas</p>
          <h4 className="text-xl font-black text-slate-900 mt-1">{isPresentationMode ? "XX" : resumen.totalFacturas}</h4>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Clientes</p>
          <h4 className="text-xl font-black text-blue-600 mt-1">{isPresentationMode ? "XX" : resumen.totalClientes}</h4>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contado</p>
          <div className="flex items-end gap-2 mt-1">
            <h4 className="text-xl font-black text-slate-900">{isPresentationMode ? "XX" : resumen.totalContado}</h4>
            <span className="text-[10px] text-slate-400 font-medium mb-0.5">facturas</span>
          </div>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Crédito</p>
          <div className="flex items-end gap-2 mt-1">
            <h4 className="text-xl font-black text-slate-900">{isPresentationMode ? "XX" : resumen.totalCredito}</h4>
            <span className="text-[10px] text-slate-400 font-medium mb-0.5">facturas</span>
          </div>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm p-5 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productos</p>
          <h4 className="text-xl font-black text-purple-600 mt-1">{isPresentationMode ? "XX" : resumen.totalProductos}</h4>
        </Card>
      </div>

      {/* Tabla principal */}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-900 text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Trophy size={16} className="text-yellow-500" /> Top Clientes por Facturación
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topClientes.length === 0 ? (
            <div className="py-12 text-center">
              <Trophy size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">No hay datos para este período</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {topClientes.map((cliente, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedClient(cliente)}
                  className={`flex items-center gap-3 px-5 py-3 transition-all border-b last:border-none hover:shadow-md hover:scale-[1.005] cursor-pointer ${getRankBg(i)}`}
                >
                  <div className="flex-shrink-0 w-7 flex justify-center">{getRankIcon(i)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate uppercase tracking-tight">
                      {isPresentationMode ? `Cliente #${i + 1}` : cliente.nombre}
                    </p>
                    <p className="text-[10px] text-slate-400">{cliente.facturas} factura{cliente.facturas !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-black ${i === 0 ? "text-yellow-600" : i < 3 ? "text-slate-700" : "text-slate-500"}`}>
                      {isPresentationMode ? "$ X,XXX" : `$${cliente.monto.toLocaleString()}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL DETALLE CLIENTE */}
      <AnimatePresence>
        {selectedClient && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setSelectedClient(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-4">
                <div className="space-y-2">
                  <span className="text-[9px] bg-yellow-100 text-yellow-700 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">Ficha de Cliente</span>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{selectedClient.nombre}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                      <MapPin size={12} /> {selectedClient.zona}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${selectedClient.tipoPago === "Crédito" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      <CreditCard size={12} /> {selectedClient.tipoPago} — {selectedClient.diasPago}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-100 shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* KPIs del cliente */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-200">
                      <Receipt size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Monto Total</span>
                      <div className="text-lg font-black text-blue-600 mt-0.5 tabular-nums">${selectedClient.monto.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
                    <div className="p-2.5 bg-slate-900 rounded-xl text-white shadow-md">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tipo de Venta</span>
                      <div className="mt-0.5">
                        {selectedClient.tipoPago === "Crédito" ? (
                          <span className="bg-amber-100 border-none text-amber-700 rounded-lg font-bold text-[10px] py-1 px-2.5 inline-block">Crédito</span>
                        ) : (
                          <span className="bg-emerald-100 border-none text-emerald-700 rounded-lg font-bold text-[10px] py-1 px-2.5 inline-block">Contado</span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-2 font-bold">{selectedClient.diasPago}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-amber-50/50 border border-amber-100/50 rounded-2xl flex items-center gap-3">
                    <div className="p-2.5 bg-amber-600 rounded-xl text-white shadow-md shadow-amber-200">
                      <Receipt size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Adeudo Total</span>
                      <div className={`text-lg font-black mt-0.5 tabular-nums ${selectedClient.adeudoTotal > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        ${selectedClient.adeudoTotal.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50/50 border border-purple-100/50 rounded-2xl flex items-center gap-3">
                    <div className="p-2.5 bg-purple-600 rounded-xl text-white shadow-md shadow-purple-200">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Días Crédito</span>
                      {selectedClient.fechaLimite ? (
                        <div className="mt-0.5">
                          <span className={`text-lg font-black ${selectedClient.diasLimite >= 0 ? "text-purple-600" : "text-red-500"}`}>
                            {selectedClient.diasLimite >= 0 ? `${selectedClient.diasLimite} días` : `${selectedClient.diasLimite} días`}
                          </span>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                            vence: {(() => { const [y,m,d] = selectedClient.fechaLimite.split("-"); return `${d}/${m}/${y}`; })()}
                          </p>
                        </div>
                      ) : (
                        <div className="text-lg font-black text-purple-600 mt-0.5">N/A</div>
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-red-50/50 border border-red-100/50 rounded-2xl flex items-center gap-3">
                    <div className="p-2.5 bg-red-600 rounded-xl text-white shadow-md shadow-red-200">
                      <Receipt size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Atrasado</span>
                      <div className={`text-lg font-black mt-0.5 tabular-nums ${selectedClient.totalAtrasado > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        ${selectedClient.totalAtrasado.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mapa */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Ubicación Geográfica</h4>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden bg-[#fcfcfc] flex items-center justify-center" style={{ height: 240 }}>
                    <ComposableMap
                      projection="geoMercator"
                      projectionConfig={{ scale: MAP_CONFIG.scale, center: MAP_CONFIG.center as [number, number] }}
                      width={600}
                      height={240}
                    >
                      <Geographies geography={MAP_URL}>
                        {({ geographies }) =>
                          geographies.map((geo) => {
                            const geoName = geo.properties.name || geo.properties.NAME_1 || geo.properties.NAME || "";
                            const geoKey = normalize(geoName);
                            const isSelected = geoKey === normalize(selectedClient.zona);
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                style={{
                                  default: {
                                    fill: isSelected ? "#2563eb" : "#d1d5db",
                                    outline: "none",
                                    transition: "all 0.3s ease",
                                  },
                                  hover: { fill: "#60a5fa", outline: "none", cursor: "pointer" },
                                  pressed: { fill: "#1d4ed8", outline: "none" },
                                }}
                                className={`stroke-white ${isSelected ? "stroke-[2px]" : "stroke-[1px]"}`}
                              />
                            );
                          })
                        }
                      </Geographies>
                    </ComposableMap>
                  </div>
                  <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-100 py-2 rounded-xl">
                    <MapPin size={14} className="text-blue-600" />
                    <span className="text-sm font-black text-blue-700 uppercase tracking-wide">{selectedClient.zona}</span>
                  </div>
                </div>

                {/* Top Productos Más Vendidos del cliente */}
                {selectedClient.productosMasVendidos.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-1">
                      <TrendingUp size={12} className="text-emerald-500" /> Más vendidos
                    </h4>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="bg-slate-50 px-4 py-2 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <span>Producto</span>
                        <span className="text-right">Cant. / %</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {selectedClient.productosMasVendidos.map((p, i) => (
                          <div key={i} className="px-4 py-2.5 flex justify-between items-center text-xs hover:bg-slate-50/40 transition-all">
                            <span className="font-bold text-slate-700 uppercase tracking-tight truncate max-w-[70%]">{p.nombre}</span>
                            <div className="text-right">
                              <span className="font-black text-emerald-600">{p.porcentaje}%</span>
                              <span className="text-[10px] text-slate-400 ml-1">{p.cantidad} uds</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Productos Menos Vendidos del cliente */}
                {selectedClient.productosMenosVendidos.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-1">
                      <TrendingDown size={12} className="text-red-500" /> Menos vendidos
                    </h4>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="bg-slate-50 px-4 py-2 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <span>Producto</span>
                        <span className="text-right">Cant. / %</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {selectedClient.productosMenosVendidos.map((p, i) => (
                          <div key={i} className="px-4 py-2.5 flex justify-between items-center text-xs hover:bg-slate-50/40 transition-all">
                            <span className="font-bold text-slate-700 uppercase tracking-tight truncate max-w-[70%]">{p.nombre}</span>
                            <div className="text-right">
                              <span className="font-black text-red-500">{p.porcentaje}%</span>
                              <span className="text-[10px] text-slate-400 ml-1">{p.cantidad} uds</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
