"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Maximize2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  User,
  X,
  Check,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

const getCellColor = (value: string) => {
  if (!value) return "";
  const numValue = parseInt(value);
  if (isNaN(numValue)) return "";
  if (numValue < 60) return "bg-red-100 text-red-800 font-medium";
  if (numValue >= 100) return "bg-green-100 text-green-800 font-medium";
  return "bg-yellow-100 text-yellow-800 font-medium";
};

interface SellerData {
  nombre: string;
  cuotaMensual: number;
  facturadoMensual: number;
  semanas: { facturado: number; cuotaSemanal: number }[];
}

interface KpiData {
  metaMensual: number;
  totalCuotaMensual: number;
  totalFacturadoMensual: number;
  porcentajeCumplimiento: number;
  numSemanas: number;
  weekHeaders: string[];
  sellers: SellerData[];
  semanaGlobal: string[];
  trend: string;
}

interface SellerDetail {
  sellerId: number;
  nombre: string;
  cuotaMensual: number;
  cuotaDiaria: number;
  totalFacturado: number;
  porcentajeMensual: number;
  cumple: boolean;
  dias: { fecha: string; diaSemana: string; esFeriado: boolean; esDiaUtil: boolean; facturado: number; cuotaDiaria: number; cumple: boolean }[];
  semanas: { numero: number; inicio: string; fin: string; facturado: number; cuotaSemanal: number; diasUtiles: number; porcentaje: number }[];
}

export default function StoplightReportSuperadmin() {
  const [activeTab, setActiveTab] = useState("Weekly");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ "group-ventas": true });
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<{ mes: string; totalDiasUtiles: number; sellers: SellerDetail[] } | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<SellerDetail | null>(null);
  const [modalTab, setModalTab] = useState<"resumen" | "diario" | "semanal">("resumen");
  const [goalValues, setGoalValues] = useState<Record<string, string>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState(10);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);

  const now = new Date();
  const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const empresas = [
    { id: 9, label: "Valencia" },
    { id: 10, label: "Caracas" },
    { id: 7, label: "Panama" },
  ];
  const empresaLabel = empresas.find((e) => e.id === selectedCompanyId)?.label || "Caracas";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/stoplight?mes=${currentMes}&company_id=${selectedCompanyId}`);
      const json = await res.json();
      if (json.success) {
        setKpiData(json.data);
        setMetaInput(json.data.metaMensual > 0 ? String(json.data.metaMensual) : "");
      }
    } catch (e) {
      console.error("Error fetching stoplight data:", e);
    }
    setLoading(false);
  }, [currentMes, selectedCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveMeta = async () => {
    try {
      await fetch("/api/superadmin/stoplight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpi_key: "cumplimiento_cuota_ventas",
          company_id: selectedCompanyId,
          meta_mensual: parseFloat(metaInput) || 0,
          mes: currentMes,
        }),
      });
      setEditingMeta(false);
      fetchData();
    } catch (e) {
      console.error("Error saving meta:", e);
    }
  };

  const openCuotaModal = async () => {
    setModalOpen(true);
    setModalLoading(true);
    setSelectedSeller(null);
    setModalTab("resumen");
    try {
      const res = await fetch(`/api/superadmin/stoplight/cuota-detail?mes=${currentMes}&company_id=${selectedCompanyId}`);
      const json = await res.json();
      if (json.success) setModalData(json.data);
    } catch (e) {
      console.error("Error fetching cuota detail:", e);
    }
    setModalLoading(false);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  if (loading) {
    return (
      <div className="p-6 bg-white min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Cargando datos...</div>
      </div>
    );
  }

  const numWeeks = kpiData?.numSemanas || 5;
  const defaultWeeks = Array(numWeeks).fill(null);

  const getGoal = (id: string, defaultVal: string) => goalValues[id] ?? defaultVal;

  const ventasKpis = [
    {
      id: "cumplimiento_cuota",
      trend: kpiData ? (kpiData.trend === "green" ? "help" : "alert") : "help",
      title: "Cumplimiento de cuota de ventas",
      peso: "30%",
      average: kpiData ? `${kpiData.porcentajeCumplimiento}%` : "0%",
      weeks: kpiData?.semanaGlobal || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData ? String(kpiData.totalCuotaMensual) : "0",
      goalSuffix: "",
    },
    {
      id: "margen_bruto",
      trend: "help",
      title: "Margen bruto",
      peso: "15%",
      average: "0%",
      weeks: defaultWeeks,
      goalDefault: "15",
      goalSuffix: "%",
    },
    {
      id: "visitas_semanales",
      trend: "help",
      title: "Cantidad de visitas semanales",
      peso: "10%",
      average: "0",
      weeks: defaultWeeks,
      goalDefault: "10",
      goalSuffix: "",
    },
    {
      id: "efectividad_cierre",
      trend: "help",
      title: "Tasa de efectividad de cierre",
      peso: "15%",
      average: "0%",
      weeks: defaultWeeks,
      goalDefault: "15",
      goalSuffix: "%",
    },
    {
      id: "activacion_cartera",
      trend: "help",
      title: "Porcentaje de activación de cartera",
      peso: "15%",
      average: "0%",
      weeks: defaultWeeks,
      goalDefault: "15",
      goalSuffix: "%",
    },
    {
      id: "clientes_nuevos",
      trend: "help",
      title: "Clientes nuevos captados",
      peso: "5%",
      average: "0",
      weeks: defaultWeeks,
      goalDefault: "5",
      goalSuffix: "",
    },
    {
      id: "cobertura_marcas",
      trend: "help",
      title: "Cobertura de marcas",
      peso: "10%",
      average: "0%",
      weeks: defaultWeeks,
      goalDefault: "10",
      goalSuffix: "%",
    },
  ];

  const logisticaKpis = [
    {
      id: "envio_reporte_inv",
      trend: "help",
      title: "Cumplimiento de Envío de Reporte de Antigüedad de Inventario",
      peso: "25%",
      average: "0%",
      weeks: [null, null, null, null, null],
      goalDefault: "75",
      goalSuffix: "%",
    },
    {
      id: "nuevos_productos",
      trend: "help",
      title: "Identificación de Nuevos Productos y Oportunidades de Mercado",
      peso: "25%",
      average: "0%",
      weeks: [null, null, null, null, null],
      goalDefault: "75",
      goalSuffix: "%",
    },
    {
      id: "antiguedad_inv",
      trend: "help",
      title: "Antigüedad de inventario (Costo)",
      peso: "25%",
      average: "0%",
      weeks: [null, null, null, null, null],
      goalDefault: "25",
      goalSuffix: "%",
    },
    {
      id: "activacion_sku",
      trend: "alert",
      title: "Tasa de Activación de Portafolio de productos (SKU Activos)",
      peso: "25%",
      average: "60%",
      weeks: ["50%", "70%", null, null, null],
      goalDefault: "61",
      goalSuffix: "%",
    },
  ];

  const groups = [
    { id: "group-logistica", title: "Logística e Inventario", count: logisticaKpis.length, kpis: logisticaKpis },
    { id: "group-ventas", title: "Ventas", count: ventasKpis.length, kpis: ventasKpis },
  ];

  const weekHeaders = kpiData?.weekHeaders || ["Jul 13 - Jul 19", "Jul 6 - Jul 12", "Jun 29 - Jul 5", "Jun 22 - Jun 28", "Jun 15 - Jun 21"];

  return (
    <div className="p-6 bg-white min-h-screen font-sans text-slate-800">
      {/* Header & Title */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stoplight Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Record and evaluate key metrics, streamlined for strategic success.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm font-medium text-amber-600 flex items-center gap-1 transition-transform hover:scale-105">
            Ask Supri{" "}
            <span className="text-[10px] bg-amber-100 px-1 rounded text-amber-700">NEW</span>
          </button>
          <button className="p-2 border rounded-md hover:bg-slate-50 transition-colors">
            <Settings size={16} />
          </button>
          <button className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 transition-colors shadow-sm">
            Create
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b mb-6 text-sm font-medium text-slate-500">
        {["Trends", "Weekly", "Monthly", "Quarterly", "Annual"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 transition-colors ${activeTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "hover:text-slate-800"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-3">
          <div
            onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors relative cursor-pointer"
          >
            Team: {empresaLabel} <ChevronDown size={14} />
            {teamDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[160px]">
                {empresas.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCompanyId(emp.id);
                      setTeamDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${selectedCompanyId === emp.id ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-700"}`}
                  >
                    {emp.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors">
            View by: Week <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors">
            Date Range: Last 13 Weeks <ChevronDown size={14} />
          </button>
        </div>
        <div className="flex gap-3 items-center">
          <button className="p-1.5 border rounded-md hover:bg-slate-50 transition-colors">
            <RotateCcw size={16} />
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm text-amber-600 hover:bg-amber-50 transition-colors">
            <Plus size={14} /> New group
          </button>
          <button className="px-3 py-1.5 border rounded-md text-sm text-amber-600 hover:bg-amber-50 transition-colors">
            Go to KPI Manager
          </button>
          <button className="p-1.5 border rounded-md hover:bg-slate-50 transition-colors">
            <MoreHorizontal size={16} />
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search KPIs..."
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-64 transition-shadow"
            />
          </div>
        </div>
      </div>

      {/* KPI Groups */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id} className="border rounded-lg overflow-hidden bg-white shadow-sm transition-all">
            {/* Group Header */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
              <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => toggleGroup(group.id)}
              >
                <span className="font-semibold text-lg text-slate-800">{group.title}</span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full font-medium">
                  {group.count}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-3 py-1 border rounded text-xs text-amber-600 bg-white hover:bg-amber-50 transition-colors">
                  New KPI <ChevronDown size={12} />
                </button>
                <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                  <MoreHorizontal size={16} />
                </button>
                <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                  <Maximize2 size={14} />
                </button>
                <button
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  {expandedGroups[group.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {/* Table */}
            {expandedGroups[group.id] && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-white border-b text-slate-500">
                      <th className="p-3 w-10 text-center border-r">
                        <input type="checkbox" className="rounded border-slate-300" />
                      </th>
                      <th className="p-3 w-16 text-center border-r text-xs font-normal">View<br />Trend</th>
                      <th className="p-3 border-r font-medium min-w-[300px]">Title</th>
                      <th className="p-3 w-16 text-center border-r font-medium">Owner</th>
                      <th className="p-3 w-24 text-center border-r font-medium">Goal</th>
                      <th className="p-3 w-24 text-center border-r font-medium">Average</th>
                      <th className="p-3 w-20 text-center border-r font-medium border-r-blue-400 border-r-2">Peso</th>
                      {weekHeaders.map((week, idx) => (
                        <th key={idx} className="p-3 w-28 text-center border-r font-normal text-xs text-slate-400">
                          <div className="flex flex-col">
                            <span>{week.split(" - ")[0]} -</span>
                            <span>{week.split(" - ")[1]}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.kpis.map((kpi: any) => (
                      <tr
                        key={kpi.id}
                        className={`border-b group ${kpi.isClickable ? "cursor-pointer hover:bg-blue-50/40" : ""}`}
                        onClick={kpi.isClickable ? openCuotaModal : undefined}
                      >
                        <td className="p-3 text-center border-r bg-white" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded border-slate-300" />
                        </td>
                        <td className="p-3 text-center border-r bg-white">
                          {kpi.trend === "help" ? (
                            <HelpCircle size={16} className="text-slate-400 mx-auto cursor-pointer hover:text-slate-600" />
                          ) : (
                            <AlertTriangle size={16} className="text-amber-500 mx-auto cursor-pointer hover:text-amber-600" />
                          )}
                        </td>
                        <td className="p-3 border-r text-slate-700 bg-white font-medium">
                          {kpi.title}
                          {kpi.isClickable && (
                            <span className="ml-2 text-[10px] text-blue-500 font-normal">(Click para ver detalle)</span>
                          )}
                        </td>
                        <td className="p-3 border-r text-center bg-white">
                          <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-500 cursor-pointer hover:bg-slate-300 transition-colors">
                            <User size={14} />
                          </div>
                        </td>
                        <td className="p-3 border-r text-center bg-white" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={getGoal(kpi.id, kpi.goalDefault)}
                            onChange={(e) => setGoalValues((prev) => ({ ...prev, [kpi.id]: e.target.value }))}
                            className="w-20 text-center text-sm font-semibold text-slate-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"
                          />
                        </td>
                        <td className="p-3 border-r text-center text-slate-600 bg-white font-bold">{kpi.average}</td>
                        <td className="p-3 border-r text-center text-slate-600 border-r-blue-400 border-r-2 bg-slate-50/50 font-bold">{kpi.peso}</td>
                        {kpi.weeks.map((val: string | null, idx: number) => (
                          <td
                            key={idx}
                            className={`border-r text-center p-3 transition-colors ${getCellColor(val || "")}`}
                          >
                            {val || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* MODAL DE CUMPLIMIENTO DE CUOTA */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Cumplimiento de Cuota de Ventas</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Detalle por vendedor - {modalData?.mes || currentMes} | Dias utiles: {modalData?.totalDiasUtiles || 0}
                </p>
              </div>
              <button
                onClick={() => { setModalOpen(false); setSelectedSeller(null); }}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-4 px-5 pt-4 border-b">
              {(["resumen", "diario", "semanal"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setModalTab(tab)}
                  className={`pb-3 text-sm font-medium capitalize transition-colors ${
                    modalTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "resumen" ? "Resumen Vendedores" : tab === "diario" ? "Detalle Diario" : "Detalle Semanal"}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {modalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : !modalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  No hay datos disponibles
                </div>
              ) : (
                <>
                  {/* Resumen Tab */}
                  {modalTab === "resumen" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-blue-50 rounded-xl p-4">
                          <p className="text-xs text-blue-600 font-medium">Total Vendedores</p>
                          <p className="text-2xl font-bold text-blue-700">{modalData.sellers.length}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <p className="text-xs text-green-600 font-medium">Cumplieron</p>
                          <p className="text-2xl font-bold text-green-700">
                            {modalData.sellers.filter((s) => s.cumple).length}
                          </p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-4">
                          <p className="text-xs text-red-600 font-medium">No Cumplieron</p>
                          <p className="text-2xl font-bold text-red-700">
                            {modalData.sellers.filter((s) => !s.cumple).length}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-600 font-medium">Dias Utiles Mes</p>
                          <p className="text-2xl font-bold text-slate-700">{modalData.totalDiasUtiles}</p>
                        </div>
                      </div>

                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-center font-medium text-slate-600">Cuota Mensual</th>
                              <th className="p-3 text-center font-medium text-slate-600">Facturado</th>
                              <th className="p-3 text-center font-medium text-slate-600">Porcentaje</th>
                              <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                              <th className="p-3 text-center font-medium text-slate-600">Accion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modalData.sellers.map((seller) => (
                              <tr key={seller.sellerId} className="border-b hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                                <td className="p-3 text-center">${seller.cuotaMensual.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center">${seller.totalFacturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center">
                                  <span className={`font-bold ${seller.porcentajeMensual >= 100 ? "text-green-600" : seller.porcentajeMensual >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                    {seller.porcentajeMensual}%
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  {seller.cumple ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                      <Check size={12} /> Cumple
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                      <X size={12} /> No cumple
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={() => { setSelectedSeller(seller); setModalTab("diario"); }}
                                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                                  >
                                    Ver detalle
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Detalle Diario Tab */}
                  {modalTab === "diario" && (
                    <div>
                      {!selectedSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle diario:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {modalData.sellers.map((seller) => (
                              <button
                                key={seller.sellerId}
                                onClick={() => setSelectedSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="font-medium text-slate-800">{seller.nombre}</span>
                                <span className={`text-sm font-bold ${seller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.porcentajeMensual}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <button onClick={() => setSelectedSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                                Volver
                              </button>
                              <h3 className="font-bold text-slate-800">{selectedSeller.nombre}</h3>
                              <span className={`text-sm font-bold ${selectedSeller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                                {selectedSeller.porcentajeMensual}%
                              </span>
                            </div>
                            <span className="text-xs text-slate-400">
                              Cuota diaria: ${selectedSeller.cuotaDiaria.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-2 text-left font-medium text-slate-600">Fecha</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Dia</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Cuota</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Facturado</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedSeller.dias.map((dia) => (
                                  <tr
                                    key={dia.fecha}
                                    className={`border-b ${
                                      !dia.esDiaUtil
                                        ? "bg-slate-50 text-slate-400"
                                        : dia.cumple
                                          ? "bg-green-50/30"
                                          : dia.facturado > 0
                                            ? "bg-yellow-50/30"
                                            : ""
                                    }`}
                                  >
                                    <td className="p-2">{dia.fecha}</td>
                                    <td className="p-2 text-center">{dia.diaSemana}</td>
                                    <td className="p-2 text-center">
                                      {dia.esDiaUtil
                                        ? `$${dia.cuotaDiaria.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                                        : dia.esFeriado
                                          ? "Feriado"
                                          : "Descanso"}
                                    </td>
                                    <td className="p-2 text-center font-medium">
                                      {dia.facturado > 0
                                        ? `$${dia.facturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                                        : "-"}
                                    </td>
                                    <td className="p-2 text-center">
                                      {!dia.esDiaUtil ? (
                                        <span className="text-xs text-slate-400">-</span>
                                      ) : dia.cumple ? (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                          <Check size={12} /> OK
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                          <X size={12} /> Falta
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detalle Semanal Tab */}
                  {modalTab === "semanal" && (
                    <div>
                      {!selectedSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle semanal:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {modalData.sellers.map((seller) => (
                              <button
                                key={seller.sellerId}
                                onClick={() => setSelectedSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="font-medium text-slate-800">{seller.nombre}</span>
                                <span className={`text-sm font-bold ${seller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.porcentajeMensual}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setSelectedSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                              Volver
                            </button>
                            <h3 className="font-bold text-slate-800">{selectedSeller.nombre}</h3>
                            <span className={`text-sm font-bold ${selectedSeller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                              {selectedSeller.porcentajeMensual}%
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Periodo</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Dias Utiles</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Cuota Semanal</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Facturado</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Porcentaje</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedSeller.semanas.map((sem) => (
                                  <tr key={sem.numero} className={`border-b ${sem.porcentaje >= 100 ? "bg-green-50/30" : ""}`}>
                                    <td className="p-3 font-medium">Semana {sem.numero}</td>
                                    <td className="p-3 text-center text-slate-600">{sem.inicio} - {sem.fin}</td>
                                    <td className="p-3 text-center">{sem.diasUtiles}</td>
                                    <td className="p-3 text-center">${sem.cuotaSemanal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-center font-medium">${sem.facturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-center">
                                      <span className={`font-bold ${sem.porcentaje >= 100 ? "text-green-600" : sem.porcentaje >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                        {sem.porcentaje}%
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      {sem.porcentaje >= 100 ? (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                          <Check size={12} /> Cumple
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                          <X size={12} /> No cumple
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
