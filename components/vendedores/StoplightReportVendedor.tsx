"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Maximize2,
  Package,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
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

export default function StoplightReportVendedor() {
  const [activeTab, setActiveTab] = useState("Weekly");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ "group-ventas": true });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [modalTab, setModalTab] = useState<"resumen" | "diario" | "semanal">("resumen");

  const [margenModalOpen, setMargenModalOpen] = useState(false);
  const [margenModalLoading, setMargenModalLoading] = useState(false);
  const [margenModalData, setMargenModalData] = useState<any>(null);

  const [efectividadModalOpen, setEfectividadModalOpen] = useState(false);
  const [efectividadModalLoading, setEfectividadModalLoading] = useState(false);
  const [efectividadModalData, setEfectividadModalData] = useState<any>(null);

  const [coberturaModalOpen, setCoberturaModalOpen] = useState(false);
  const [coberturaModalLoading, setCoberturaModalLoading] = useState(false);
  const [coberturaModalData, setCoberturaModalData] = useState<any>(null);

  const [activacionModalOpen, setActivacionModalOpen] = useState(false);
  const [activacionModalLoading, setActivacionModalLoading] = useState(false);
  const [activacionModalData, setActivacionModalData] = useState<any>(null);

  const [visitasModalOpen, setVisitasModalOpen] = useState(false);
  const [visitasData, setVisitasData] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight?mes=${mes}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Error fetching stoplight data:", e);
    }
    setLoading(false);
  }, [mes]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (modalOpen || margenModalOpen || efectividadModalOpen || coberturaModalOpen || activacionModalOpen || visitasModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [modalOpen, margenModalOpen, efectividadModalOpen, coberturaModalOpen, activacionModalOpen, visitasModalOpen]);

  const openCuotaModal = async () => {
    setModalOpen(true);
    setModalLoading(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight/cuota-detail?mes=${mes}`);
      const json = await res.json();
      if (json.success) setModalData(json.data);
    } catch (e) { console.error(e); }
    setModalLoading(false);
  };

  const openMargenModal = async () => {
    setMargenModalOpen(true);
    setMargenModalLoading(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight/margen-detail?mes=${mes}`);
      const json = await res.json();
      if (json.success) setMargenModalData(json.data);
    } catch (e) { console.error(e); }
    setMargenModalLoading(false);
  };

  const openEfectividadModal = async () => {
    setEfectividadModalOpen(true);
    setEfectividadModalLoading(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight/efectividad-detail?mes=${mes}`);
      const json = await res.json();
      if (json.success) setEfectividadModalData(json.data);
    } catch (e) { console.error(e); }
    setEfectividadModalLoading(false);
  };

  const openCoberturaModal = async () => {
    setCoberturaModalOpen(true);
    setCoberturaModalLoading(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight/cobertura-detail?mes=${mes}`);
      const json = await res.json();
      if (json.success) setCoberturaModalData(json.data);
    } catch (e) { console.error(e); }
    setCoberturaModalLoading(false);
  };

  const openActivacionModal = async () => {
    setActivacionModalOpen(true);
    setActivacionModalLoading(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight/activacion-detail?mes=${mes}`);
      const json = await res.json();
      if (json.success) setActivacionModalData(json.data);
    } catch (e) { console.error(e); }
    setActivacionModalLoading(false);
  };

  const openVisitasModal = async () => {
    setVisitasModalOpen(true);
    try {
      const res = await fetch(`/api/vendedores/stoplight/weekly-visits?mes=${mes}`);
      const json = await res.json();
      if (json.success) setVisitasData(json.data);
    } catch (e) { console.error(e); }
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

  const numWeeks = data?.numSemanas || 5;
  const defaultWeeks = Array(numWeeks).fill(null);
  const weekHeaders = data?.weekHeaders || [];

  const ventasKpis = [
    {
      id: "cumplimiento_cuota",
      title: "Cumplimiento de cuota de ventas",
      peso: "30%",
      average: data ? `${data.avgCumplimiento}%` : "0%",
      weeks: data?.semanaGlobal || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgCumplimiento >= 100 : false,
    },
    {
      id: "margen_bruto",
      title: "Margen bruto",
      peso: "15%",
      average: data ? `${data.avgMargen}%` : "0%",
      weeks: data?.semanaMargen || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgMargen >= 100 : false,
    },
    {
      id: "visitas_semanales",
      title: "Cantidad de visitas semanales",
      peso: "10%",
      average: data ? String(data.avgVisitas) : "0",
      weeks: data?.semanaVisitas || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgVisitas >= 100 : false,
    },
    {
      id: "efectividad_cierre",
      title: "Tasa de efectividad de cierre",
      peso: "15%",
      average: data ? `${data.avgEfectividad}%` : "0%",
      weeks: data?.semanaEfectividad || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgEfectividad >= 100 : false,
    },
    {
      id: "activacion_cartera",
      title: "Porcentaje de activación de cartera",
      peso: "15%",
      average: data ? `${data.avgActivacion}%` : "0%",
      weeks: data?.semanaActivacion || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgActivacion >= 100 : false,
    },
    {
      id: "clientes_nuevos",
      title: "Clientes nuevos captados",
      peso: "5%",
      average: data ? `${data.avgClientes}%` : "0%",
      weeks: data?.semanaClientes || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgClientes >= 100 : false,
    },
    {
      id: "cobertura_marcas",
      title: "Cobertura de marcas",
      peso: "10%",
      average: data ? `${data.avgCobertura}%` : "0%",
      weeks: data?.semanaCobertura || defaultWeeks,
      isClickable: true,
      cumple: data ? data.avgCobertura >= 100 : false,
    },
  ];

  const groups = [
    { id: "group-ventas", title: "Ventas", count: ventasKpis.length, kpis: ventasKpis },
  ];

  return (
    <div className="p-6 bg-white min-h-screen font-sans text-slate-800">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi Stoplight</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data?.sellerName && `Vendedor: ${data.sellerName}`} — Vista de solo lectura
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-slate-100 text-slate-600 text-sm rounded-md">{mes}</span>
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
              <button
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => toggleGroup(group.id)}
              >
                {expandedGroups[group.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {/* Table */}
            {expandedGroups[group.id] && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-white border-b text-slate-500">
                      <th className="p-3 w-10 text-center border-r">
                        <div className="w-5 h-5 bg-white border border-slate-200 rounded" />
                      </th>
                      <th className="p-3 w-16 text-center border-r text-xs font-normal">View<br />Trend</th>
                      <th className="p-3 border-r font-medium min-w-[300px]">Title</th>
                      <th className="p-3 w-24 text-center border-r font-medium">Goal</th>
                      <th className="p-3 w-24 text-center border-r font-medium">Average</th>
                      <th className="p-3 w-20 text-center border-r font-medium border-r-blue-400 border-r-2">Peso</th>
                      {weekHeaders.map((week: string, idx: number) => (
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
                        onClick={kpi.isClickable ? (kpi.id === "cumplimiento_cuota" ? openCuotaModal : kpi.id === "margen_bruto" ? openMargenModal : kpi.id === "efectividad_cierre" ? openEfectividadModal : kpi.id === "cobertura_marcas" ? openCoberturaModal : kpi.id === "activacion_cartera" ? openActivacionModal : kpi.id === "visitas_semanales" ? openVisitasModal : undefined) : undefined}
                      >
                        <td className="p-3 text-center border-r bg-white" onClick={(e) => e.stopPropagation()}>
                          {kpi.cumple ? (
                            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center mx-auto">
                              <Check size={14} className="text-white" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 border border-slate-300 rounded mx-auto" />
                          )}
                        </td>
                        <td className="p-3 text-center border-r" onClick={(e) => e.stopPropagation()}>
                          <button className="text-slate-400 hover:text-slate-600 transition-colors">
                            <TrendingUp size={16} />
                          </button>
                        </td>
                        <td className="p-3 border-r font-medium text-slate-700">
                          <div className="flex items-center gap-2">
                            <span>{kpi.title}</span>
                            <HelpCircle size={14} className="text-slate-300" />
                          </div>
                        </td>
                        <td className="p-3 text-center border-r text-slate-500">—</td>
                        <td className="p-3 text-center border-r font-semibold text-slate-700">
                          {kpi.average || "0%"}
                        </td>
                        <td className="p-3 text-center border-r font-medium border-r-blue-400 border-r-2 text-slate-500">
                          {kpi.peso}
                        </td>
                        {kpi.weeks.map((week: string | null, idx: number) => (
                          <td
                            key={idx}
                            className={`p-3 text-center border-r font-medium ${week ? getCellColor(week) : "text-slate-300"}`}
                          >
                            {week || "—"}
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

      {/* Modal cuota detail */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Detalle Cuota</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {modalLoading ? <p className="text-slate-500">Cargando...</p> : (
                <div>
                  {modalData?.sellers?.[0] && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                      <p className="font-semibold">{modalData.sellers[0].nombre}</p>
                      <p className="text-sm text-slate-600">Cuota mensual: ${modalData.sellers[0].cuotaMensual?.toLocaleString()} | Facturado: ${modalData.sellers[0].totalFacturado?.toLocaleString()} | {modalData.sellers[0].porcentajeMensual}%</p>
                    </div>
                  )}
                  {modalData?.sellers?.[0]?.semanas?.map((s: any) => (
                    <div key={s.numero} className="border rounded-lg p-3 mb-2">
                      <p className="font-medium">Semana {s.numero}: {s.inicio} - {s.fin}</p>
                      <p className="text-sm text-slate-600">Facturado: ${s.facturado?.toLocaleString()} | Cuota: ${s.cuotaSemanal?.toLocaleString()} | {s.porcentaje != null ? `${s.porcentaje}%` : '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal margen */}
      {margenModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setMargenModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Detalle Margen</h2>
              <button onClick={() => setMargenModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {margenModalLoading ? <p className="text-slate-500">Cargando...</p> : (
                <div>
                  {margenModalData?.sellers?.[0] && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                      <p className="font-semibold">{margenModalData.sellers[0].nombre}</p>
                      <p className="text-sm text-slate-600">Margen: {margenModalData.sellers[0].margenMensual}% ({margenModalData.sellers[0].margenMensualPct}% vs meta)</p>
                      <p className="text-sm text-slate-600">Revenue: ${margenModalData.sellers[0].revenue?.toLocaleString()} | Costo: ${margenModalData.sellers[0].costo?.toLocaleString()}</p>
                    </div>
                  )}
                  {margenModalData?.sellers?.[0]?.semanas?.map((s: any) => (
                    <div key={s.numero} className="border rounded-lg p-3 mb-2">
                      <p className="font-medium">Semana {s.numero}</p>
                      <p className="text-sm text-slate-600">Revenue: ${s.revenue?.toLocaleString()} | Costo: ${s.costo?.toLocaleString()} | Margen: {s.margen != null ? `${s.margen}%` : '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal efectividad */}
      {efectividadModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEfectividadModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Detalle Efectividad</h2>
              <button onClick={() => setEfectividadModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {efectividadModalLoading ? <p className="text-slate-500">Cargando...</p> : (
                <div>
                  {efectividadModalData?.sellers?.[0] && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                      <p className="font-semibold">{efectividadModalData.sellers[0].nombre}</p>
                      <p className="text-sm text-slate-600">Efectividad: {efectividadModalData.sellers[0].efectividad}%</p>
                      <p className="text-sm text-slate-600">Órdenes: {efectividadModalData.sellers[0].ordenes} | Facturadas: {efectividadModalData.sellers[0].facturadas}</p>
                      <p className="text-sm text-slate-600">Monto órdenes: ${efectividadModalData.sellers[0].montoOrdenes?.toLocaleString()} | Facturadas: ${efectividadModalData.sellers[0].montoFacturadas?.toLocaleString()}</p>
                    </div>
                  )}
                  {efectividadModalData?.sellers?.[0]?.semanas?.map((s: any) => (
                    <div key={s.numero} className="border rounded-lg p-3 mb-2">
                      <p className="font-medium">Semana {s.numero}: {s.label}</p>
                      <p className="text-sm text-slate-600">Órdenes: {s.ordenes} | Facturadas: {s.facturadas} | Efectividad: {s.efectividad != null ? `${s.efectividad}%` : '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal cobertura */}
      {coberturaModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCoberturaModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Detalle Cobertura de Marcas</h2>
              <button onClick={() => setCoberturaModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {coberturaModalLoading ? <p className="text-slate-500">Cargando...</p> : (
                <div>
                  {coberturaModalData?.sellers?.[0] && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                      <p className="font-semibold">{coberturaModalData.sellers[0].nombre}</p>
                      <p className="text-sm text-slate-600">Cantidad total: {coberturaModalData.sellers[0].cantidadVendida} | Meta: {coberturaModalData.sellers[0].metaCantidad}</p>
                    </div>
                  )}
                  {coberturaModalData?.brands?.map((b: any) => (
                    <div key={b.marca} className="border rounded-lg p-3 mb-2">
                      <p className="font-medium">{b.marca}</p>
                      <p className="text-sm text-slate-600">Revenue: ${b.revenue?.toLocaleString()} | Costo: ${b.costo?.toLocaleString()} | Ganancia: ${b.ganancia?.toLocaleString()} | Cant: {b.cantidad} | Margen: {b.margen}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal activacion */}
      {activacionModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setActivacionModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Detalle Activación de Cartera</h2>
              <button onClick={() => setActivacionModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {activacionModalLoading ? <p className="text-slate-500">Cargando...</p> : (
                <div>
                  {activacionModalData?.sellers?.map((s: any) => (
                    <div key={s.sellerId} className="border rounded-lg p-3 mb-2">
                      <p className="font-medium">{s.nombre}</p>
                      <p className="text-sm text-slate-600">Activos: {s.activos}/{s.metaActivacion} ({s.pctMeta}%)</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal visitas */}
      {visitasModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setVisitasModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Mis Visitas</h2>
              <button onClick={() => setVisitasModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {visitasData.length === 0 ? (
                <p className="text-slate-500 text-sm">No hay visitas registradas este mes.</p>
              ) : (
                <div className="space-y-2">
                  {visitasData.map((v: any) => (
                    <div key={v.id} className="flex items-center gap-3 border rounded-lg p-3">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{v.client_name}</p>
                        <p className="text-xs text-slate-500">{v.visit_date} {v.is_prospect === 1 && "• Prospecto"}</p>
                      </div>
                      {v.photo_url && <img src={v.photo_url} alt="" className="w-10 h-10 rounded object-cover" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
