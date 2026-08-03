"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock,
  LayoutGrid,
  List,
  Package,
  RefreshCw,
  Shuffle,
  Tags,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function InventoryReport() {
  const { user } = useAuthStore();
  const [biData, setBiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [reportType, setReportType] = useState<"product" | "brand">("product");

  // Estado de Sucursal
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [companies] = useState([
    { id: "9", name: "Valencia" },
    { id: "10", name: "Caracas" },
    { id: "7", name: "Panamá" },
  ]);

  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const defaultStartDate = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
  };
  const defaultEndDate = () => new Date().toISOString().split("T")[0];

  // Trigger manual: solo se recarga cuando el usuario presiona "Aplicar"
  const [applyTrigger, setApplyTrigger] = useState(0);

  function resetFilters() {
    setSelectedCompany("all");
    setStartDate(defaultStartDate());
    setEndDate(defaultEndDate());
    setApplyTrigger((n) => n + 1);
  }

  useEffect(() => {
    async function loadBiReport() {
      if (!user) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await fetch(
          `/api/reports/inventory?userId=${user.uid || user.id}&companyId=${selectedCompany}&startDate=${startDate}&endDate=${endDate}`,
        );
        const data = await res.json();
        if (res.ok) {
          setBiData(data);
        } else {
          setErrorMsg(data.error || "Error al procesar el cubo analítico.");
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("Error de conexión con el servidor.");
      } finally {
        setLoading(false);
      }
    }
    loadBiReport();
  }, [user, applyTrigger]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 bg-white rounded-2xl border border-slate-100 min-h-[400px] shadow-sm">
        <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-3" />
        <p className="text-slate-500 text-sm font-medium">
          Recalculando reportes y segmentando fechas...
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-red-100 text-center min-h-[350px] shadow-sm">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <p className="text-slate-800 font-bold text-sm">
          Error de sincronización empresarial
        </p>
        <p className="text-slate-500 text-xs mt-1 max-w-sm">{errorMsg}</p>
      </div>
    );
  }

  const getMaxValue = (array: any[], key: string) => {
    return Math.max(...array.map((item) => item[key]), 1);
  };

  return (
    <div className="space-y-8 w-full text-slate-800">
      {/* SECCIÓN SUPERIOR: BARRA DE FILTROS INTEGRADOS (SUCURSAL + CALENDARIO DE FECHAS) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Control Operativo
            </h3>
            <p className="text-sm font-bold text-slate-700">
              Filtro multidimensional síncrono
            </p>
          </div>
        </div>

        {/* Grupo de Selectores */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          {/* Sucursal */}
          <div className="w-full sm:w-56">
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer shadow-sm"
            >
              <option value="all">🏢 Ver Todas las Empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  📍 Sede {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha Inicio */}
          <div className="w-full sm:w-auto flex items-center bg-slate-50 border border-slate-200 px-3 h-10 rounded-xl gap-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              Desde
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Fecha Fin */}
          <div className="w-full sm:w-auto flex items-center bg-slate-50 border border-slate-200 px-3 h-10 rounded-xl gap-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              Hasta
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Botón Limpiar */}
          <button
            onClick={resetFilters}
            disabled={loading}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-500 text-xs font-black uppercase rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap"
          >
            Limpiar
          </button>

          {/* Botón Aplicar */}
          <button
            onClick={() => setApplyTrigger((n) => n + 1)}
            disabled={loading}
            className="h-10 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black uppercase rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* MÓDULOS DE TARJETAS ESTADÍSTICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between min-h-[160px]">
          <div className="space-y-2 flex-1 pr-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              PRODUCTO ESTRELLA
            </span>
            <h3 className="text-sm font-bold text-slate-700 leading-snug break-words">
              {biData?.masVendidos?.[0]?.name || "N/A"}
            </h3>
            <div className="pt-1">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                $
                {biData?.masVendidos?.[0]?.total_amount.toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2 },
                )}
              </span>
            </div>
            <div className="pt-1">
              <span className="inline-block text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                LÍDER
              </span>
            </div>
          </div>
          <div className="p-4 bg-purple-50 text-purple-500 rounded-2xl flex-shrink-0">
            <ArrowUpRight size={22} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between min-h-[160px]">
          <div className="space-y-2 flex-1 pr-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              MARCA LÍDER FACTURACIÓN
            </span>
            <h3 className="text-sm font-bold text-slate-700 leading-snug break-words">
              {biData?.porMarca?.[0]?.brand || "N/A"}
            </h3>
            <div className="pt-1">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                $
                {biData?.porMarca?.[0]?.total_amount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="pt-1">
              <span className="inline-block text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                Top Fabricante
              </span>
            </div>
          </div>
          <div className="p-4 bg-emerald-50 text-emerald-500 rounded-2xl flex-shrink-0">
            <Tags size={22} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between min-h-[160px]">
          <div className="space-y-2 flex-1 pr-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              RIESGO OBSOLESCENCIA
            </span>
            <h3 className="text-sm font-bold text-slate-700 leading-snug break-words">
              {biData?.estancados?.[0]?.name || "Ninguno"}
            </h3>
            <div className="pt-1">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {biData?.estancados?.[0]
                  ? `${biData.estancados[0].days_inactive}`
                  : "0"}{" "}
                <span className="text-xs font-medium text-slate-400">
                  días inactivo
                </span>
              </span>
            </div>
            <div className="pt-1">
              <span className="inline-block text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                ALERTA
              </span>
            </div>
          </div>
          <div className="p-4 bg-orange-50 text-orange-500 rounded-2xl flex-shrink-0">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* CONTENEDOR DE TABLAS DE CONTROL */}
      <Tabs defaultValue="rentabilidad" className="w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-4 gap-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              Análisis Comercial Cubo Odoo
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Exploración segmentada según el filtro corporativo activo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 w-full sm:w-auto justify-center">
              <button
                onClick={() => setReportType("product")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === "product" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Package size={14} /> Productos
              </button>
              <button
                onClick={() => setReportType("brand")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === "brand" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Tags size={14} /> Marcas
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 w-full sm:w-auto justify-center">
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
              >
                <List size={14} /> Tabla
              </button>
              <button
                onClick={() => setViewMode("chart")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "chart" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
              >
                <LayoutGrid size={14} /> Estadística
              </button>
            </div>

            {reportType === "product" && (
              <TabsList className="bg-slate-50 border border-slate-100 p-1 rounded-xl grid grid-cols-3 w-full sm:w-[280px] h-10">
                <TabsTrigger
                  value="rentabilidad"
                  className="rounded-lg text-xs font-semibold text-slate-500"
                >
                  Monto
                </TabsTrigger>
                <TabsTrigger
                  value="volumen"
                  className="rounded-lg text-xs font-semibold text-slate-500"
                >
                  Volumen
                </TabsTrigger>
                <TabsTrigger
                  value="alertas"
                  className="rounded-lg text-xs font-semibold text-slate-500"
                >
                  Alertas
                </TabsTrigger>
              </TabsList>
            )}
          </div>
        </div>

        {reportType === "product" ? (
          <>
            {/* TAB MONTO */}
            <TabsContent value="rentabilidad" className="mt-4">
              {viewMode === "table" ? (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <Table className="min-w-[900px]">
                    <TableHeader className="bg-slate-50/70">
                      <TableRow>
                        <TableHead className="pl-6 py-4 w-[45%]">
                          Producto
                        </TableHead>
                        <TableHead className="text-right py-4 w-[15%]">
                          Cantidad
                        </TableHead>
                        <TableHead className="text-right py-4 w-[15%]">
                          Monto Total
                        </TableHead>
                        <TableHead className="text-left py-4 pr-6 w-[25%]">
                          <span className="flex items-center gap-1 pl-4">
                            <Shuffle size={12} /> Cross-Selling
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {biData?.masVendidos?.map((item: any, i: number) => (
                        <TableRow
                          key={i}
                          className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        >
                          <TableCell className="pl-6 py-4 font-semibold text-xs text-slate-700">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-right text-slate-500 text-xs font-medium">
                            {item.total_qty.toLocaleString()} uds
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-800">
                            $
                            {item.total_amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-left pr-6 py-4 pl-4">
                            <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100">
                              {item.cross_sell_product}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
                  {biData?.masVendidos?.map((item: any, i: number) => {
                    const max = getMaxValue(biData.masVendidos, "total_amount");
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span className="pr-4 break-words">{item.name}</span>
                          <span className="font-bold whitespace-nowrap">
                            ${item.total_amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${(item.total_amount / max) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB VOLUMEN */}
            <TabsContent value="volumen" className="mt-4">
              {viewMode === "table" ? (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <Table className="min-w-[900px]">
                    <TableHeader className="bg-slate-50/70">
                      <TableRow>
                        <TableHead className="pl-6 py-4 w-[50%]">
                          Producto
                        </TableHead>
                        <TableHead className="text-center py-4 w-[20%]">
                          Estatus
                        </TableHead>
                        <TableHead className="text-right py-4 w-[15%]">
                          Total Unidades
                        </TableHead>
                        <TableHead className="text-right pr-6 py-4 w-[15%]">
                          Monto Acumulado
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {biData?.mayorRotacion?.map((item: any, i: number) => (
                        <TableRow
                          key={i}
                          className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        >
                          <TableCell className="pl-6 py-4 font-semibold text-xs text-slate-700 whitespace-normal leading-relaxed">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-md border border-emerald-100 uppercase">
                              Alta Rotación
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-800 text-xs whitespace-nowrap">
                            {item.total_qty.toLocaleString()} uds
                          </TableCell>
                          <TableCell className="text-right text-slate-500 text-xs pr-6 whitespace-nowrap">
                            $
                            {item.total_amount.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Despacho Físico por Cantidad de Unidades
                  </div>
                  {biData?.mayorRotacion?.map((item: any, i: number) => {
                    const max = getMaxValue(biData.mayorRotacion, "total_qty");
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span className="pr-4 break-words">{item.name}</span>
                          <span className="font-bold whitespace-nowrap">
                            {item.total_qty.toLocaleString()} uds
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${(item.total_qty / max) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB ALERTAS */}
            <TabsContent value="alertas" className="mt-4">
              {viewMode === "table" ? (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <Table className="min-w-[900px]">
                    <TableHeader className="bg-slate-50/70">
                      <TableRow>
                        <TableHead className="pl-6 py-4 w-[50%]">
                          Producto Inactivo
                        </TableHead>
                        <TableHead className="text-center py-4 w-[20%]">
                          Días sin Transacciones
                        </TableHead>
                        <TableHead className="text-right pr-6 py-4 w-[30%]">
                          Acción Estratégica
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {biData?.estancados?.map((item: any, i: number) => (
                        <TableRow
                          key={i}
                          className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        >
                          <TableCell className="pl-6 py-4 font-semibold text-xs text-slate-700 whitespace-normal leading-relaxed">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs text-slate-700 py-4 whitespace-nowrap">
                            {item.days_inactive} días
                          </TableCell>
                          <TableCell className="text-right pr-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${item.days_inactive > 90 ? "bg-red-50 text-red-600 border border-red-100" : "bg-amber-50 text-amber-600 border border-amber-100"}`}
                            >
                              {item.days_inactive > 90
                                ? "Liquidar Inventario"
                                : "Revisar Canales"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Índice Crítico de Días de Inactividad Comercial
                  </div>
                  {biData?.estancados?.map((item: any, i: number) => {
                    const max = getMaxValue(biData.estancados, "days_inactive");
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span className="pr-4 break-words">{item.name}</span>
                          <span
                            className={`font-bold whitespace-nowrap ${item.days_inactive > 90 ? "text-red-500" : "text-amber-500"}`}
                          >
                            {item.days_inactive} días
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${item.days_inactive > 90 ? "bg-red-500" : "bg-amber-500"}`}
                            style={{
                              width: `${(item.days_inactive / max) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </>
        ) : (
          /* REPORTE DE MARCAS POR FILTRO CORPORATIVO ACTIVO */
          <div className="mt-4">
            {viewMode === "table" ? (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <Table className="min-w-[1000px]">
                  <TableHeader className="bg-slate-50/70 border-b border-slate-100">
                    <TableRow>
                      <TableHead className="pl-6 py-4">
                        Fabricante / Marca
                      </TableHead>
                      <TableHead className="text-right">
                        Volumen Movido
                      </TableHead>
                      <TableHead className="text-right">
                        Total Facturado
                      </TableHead>
                      <TableHead className="pl-8">
                        Nombre del Cliente (Top Buyer)
                      </TableHead>
                      <TableHead className="text-center">
                        Frecuencia de Compra
                      </TableHead>
                      <TableHead className="pr-6">
                        Vendedor Responsable
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {biData?.porMarca?.map((item: any, i: number) => (
                      <TableRow
                        key={i}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      >
                        <TableCell className="pl-6 py-4 font-bold text-xs text-slate-800 uppercase tracking-wider">
                          {item.brand}
                        </TableCell>
                        <TableCell className="text-right text-slate-500 text-xs font-medium">
                          {item.total_qty.toLocaleString()} uds
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">
                          $
                          {item.total_amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>

                        <TableCell className="pl-8 py-4">
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs text-slate-700">
                              {item.top_client}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Volumen acumulado: $
                              {item.client_amount.toLocaleString()}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-center py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                            <CalendarDays size={12} /> {item.frequency_monthly}{" "}
                            facturas en el período
                          </span>
                        </TableCell>

                        <TableCell className="pr-6 py-4">
                          <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                            {item.vendor}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
                {biData?.porMarca?.map((item: any, i: number) => {
                  const maxBrand = getMaxValue(biData.porMarca, "total_amount");
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span className="font-bold uppercase tracking-wider">
                          {item.brand}
                        </span>
                        <span className="font-bold text-slate-900">
                          ${item.total_amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{
                            width: `${(item.total_amount / maxBrand) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Tabs>
    </div>
  );
}
