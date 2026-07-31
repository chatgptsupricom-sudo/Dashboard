"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Save,
  X,
  Target,
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  XCircle,
} from "lucide-react";

interface KPI {
  id: string;
  nombre: string;
  peso: number;
  meta: number;
  actual: number;
  porcentaje: number;
  cumple: boolean;
  detalle: string;
}

interface CuotaSeller {
  seller_id: number;
  name: string;
  cuota_mensual: number;
  facturado_mes: number;
  dias_habiles: number;
  cuota_diaria: number;
  cuota_semanal: number;
  dias_detalle: { date: string; esHabil: boolean; facturado: number; cuotaDiaria: number; cumple: boolean }[];
  semanas_detalle: { semana: string; facturado: number; cuotaSemanal: number; cumple: boolean }[];
}

interface StoplightData {
  kpis: KPI[];
  scoreGeneral: number;
  weeks: { start: string; end: string; label: string }[];
  businessDays: number;
  totalWeeks: number;
  company_id: number;
  year: number;
  month: number;
  metaCuota: number;
  totalFacturado: number;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const SEDES = [{ id: 9, label: "Valencia" }, { id: 10, label: "Caracas" }, { id: 7, label: "Panamá" }];

function getTrafficLight(pct: number, cumple: boolean) {
  if (cumple || pct >= 80) return { color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", label: "Cumple" };
  if (pct >= 50) return { color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", label: "En riesgo" };
  return { color: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: "No cumple" };
}

export default function StoplightReportSuperadmin() {
  const [data, setData] = useState<StoplightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(9);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [editingMeta, setEditingMeta] = useState<string | null>(null);
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [cuotaModal, setCuotaModal] = useState(false);
  const [cuotaData, setCuotaData] = useState<CuotaSeller[]>([]);
  const [cuotaLoading, setCuotaLoading] = useState(false);
  const [cuotaTab, setCuotaTab] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [cuotaSellerFilter, setCuotaSellerFilter] = useState<string>("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/stoplight?company_id=${companyId}&year=${year}&month=${month}`);
      const json = await res.json();
      if (json.success !== false) setData(json);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [companyId, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (data) {
      const vals: Record<string, string> = {};
      data.kpis.forEach((k) => { vals[k.id] = k.meta > 0 ? String(k.meta) : ""; });
      setMetaValues(vals);
    }
  }, [data]);

  const saveMetas = async () => {
    setSaving(true);
    try {
      const kpis = Object.entries(metaValues).map(([name, value]) => ({
        name,
        meta_value: parseFloat(value) || 0,
      }));
      await fetch("/api/superadmin/stoplight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, year, month, kpis }),
      });
      await fetchData();
      setEditingMeta(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openCuotaModal = async () => {
    setCuotaModal(true);
    setCuotaLoading(true);
    try {
      const res = await fetch(`/api/superadmin/stoplight/cuota-detail?company_id=${companyId}&year=${year}&month=${month}`);
      const json = await res.json();
      if (json.sellers) setCuotaData(json.sellers);
    } catch (e) { console.error(e); }
    setCuotaLoading(false);
  };

  const metaPerWeek = (metaTotal: number) => {
    if (!data || data.totalWeeks === 0) return 0;
    return metaTotal / data.totalWeeks;
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">KPI de Ventas</h1>
            <p className="text-sm text-slate-500 mt-1">Stoplight Report — Cumplimiento de metas por sucursal</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm bg-white"
            >
              {SEDES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm bg-white"
            >
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm bg-white"
            >
              {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white">
                <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Score General</p>
                <p className="text-4xl font-black mt-1">{data.scoreGeneral}%</p>
                <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${Math.min(data.scoreGeneral, 100)}%` }} />
                </div>
              </div>
              <div className="bg-white border rounded-2xl p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Días Hábiles</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{data.businessDays}</p>
                <p className="text-xs text-slate-500 mt-1">{data.totalWeeks} semanas en el mes</p>
              </div>
              <div className="bg-white border rounded-2xl p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Facturado</p>
                <p className="text-3xl font-black text-slate-900 mt-1">${data.totalFacturado.toLocaleString()}</p>
                {data.metaCuota > 0 && (
                  <p className={`text-xs mt-1 ${data.totalFacturado >= data.metaCuota ? "text-emerald-600" : "text-red-500"}`}>
                    Meta: ${data.metaCuota.toLocaleString()} ({((data.totalFacturado / data.metaCuota) * 100).toFixed(1)}%)
                  </p>
                )}
              </div>
              <div className="bg-white border rounded-2xl p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">KPIs que cumplen</p>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {data.kpis.filter((k) => k.cumple).length}/{data.kpis.length}
                </p>
              </div>
            </div>

            <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between p-5 border-b bg-slate-50">
                <h2 className="text-lg font-bold text-slate-900">KPI definitivos del equipo de ventas</h2>
                <div className="flex gap-2">
                  {editingMeta !== null ? (
                    <>
                      <button onClick={saveMetas} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                        <Save size={14} /> {saving ? "Guardando..." : "Guardar"}
                      </button>
                      <button onClick={() => setEditingMeta(null)} className="flex items-center gap-1.5 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                        <X size={14} /> Cancelar
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditingMeta("all")} className="flex items-center gap-1.5 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                      <Edit3 size={14} /> Editar Metas
                    </button>
                  )}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white border-b text-slate-500">
                    <th className="p-4 text-left font-medium w-12">N.°</th>
                    <th className="p-4 text-left font-medium">KPI</th>
                    <th className="p-4 text-center font-medium w-24">Peso</th>
                    <th className="p-4 text-center font-medium w-40">Meta</th>
                    <th className="p-4 text-center font-medium w-40">Actual</th>
                    <th className="p-4 text-center font-medium w-32">% Avance</th>
                    <th className="p-4 text-center font-medium w-32">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kpis.map((kpi, idx) => {
                    const tl = getTrafficLight(kpi.porcentaje, kpi.cumple);
                    const metaSemanal = metaPerWeek(kpi.meta);
                    return (
                      <tr
                        key={kpi.id}
                        className={`border-b hover:bg-slate-50/50 transition-colors ${kpi.id === "cumplimiento_cuota" ? "cursor-pointer" : ""}`}
                        onClick={() => { if (kpi.id === "cumplimiento_cuota") openCuotaModal(); }}
                      >
                        <td className="p-4 text-center text-slate-500 font-medium">{idx + 1}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{kpi.nombre}</span>
                            {kpi.id === "cumplimiento_cuota" && (
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">VER DETALLE</span>
                            )}
                          </div>
                          {kpi.meta > 0 && kpi.id === "cumplimiento_cuota" && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              ${kpi.meta.toLocaleString()} total → ${metaSemanal.toLocaleString()}/semana
                            </p>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-slate-600 font-bold">{kpi.peso}%</span>
                        </td>
                        <td className="p-4 text-center">
                          {editingMeta !== null ? (
                            <input
                              type="number"
                              value={metaValues[kpi.id] || ""}
                              onChange={(e) => setMetaValues((prev) => ({ ...prev, [kpi.id]: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-28 px-2 py-1.5 border rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Meta"
                            />
                          ) : (
                            <span className="text-slate-700 font-medium">
                              {kpi.id === "margen_bruto" || kpi.id === "efectividad_cierre" || kpi.id === "activacion_cartera" || kpi.id === "cobertura_marcas"
                                ? `${kpi.meta}%`
                                : kpi.meta > 0 ? `$${kpi.meta.toLocaleString()}` : "—"}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-slate-700 font-medium">
                            {kpi.id === "margen_bruto" || kpi.id === "efectividad_cierre" || kpi.id === "activacion_cartera" || kpi.id === "cobertura_marcas"
                              ? `${kpi.actual.toFixed(1)}%`
                              : `$${kpi.actual.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${tl.color}`}
                                style={{ width: `${Math.min(kpi.porcentaje, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-600">{kpi.porcentaje.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${tl.bg} ${tl.text}`}>
                            {kpi.cumple ? <CheckCircle2 size={12} /> : kpi.porcentaje >= 50 ? <AlertTriangle size={12} /> : <XCircle size={12} />}
                            {tl.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-4" />
                    <td className="p-4 text-slate-800">Total</td>
                    <td className="p-4 text-center text-slate-800">100%</td>
                    <td className="p-4" />
                    <td className="p-4" />
                    <td className="p-4 text-center text-lg text-blue-600">{data.scoreGeneral}%</td>
                    <td className="p-4" />
                  </tr>
                </tbody>
              </table>
            </div>

            {data.kpis.find((k) => k.id === "cumplimiento_cuota") && (
              <div className="mt-6 bg-white border rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 mb-3">Distribución Semanal de Cuota</h3>
                <div className="grid grid-cols-4 gap-3">
                  {data.weeks.map((w, i) => {
                    const metaSem = metaPerWeek(data.metaCuota);
                    const pctSem = metaSem > 0 ? Math.min((data.totalFacturado / (metaSem * (i + 1))) * 100, 100) : 0;
                    return (
                      <div key={i} className="border rounded-xl p-3">
                        <p className="text-xs font-medium text-slate-400">{w.label}</p>
                        <p className="text-xs text-slate-500">{w.start} — {w.end}</p>
                        <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pctSem >= 80 ? "bg-emerald-500" : pctSem >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pctSem}%` }} />
                        </div>
                        <p className="text-xs mt-1 text-slate-600">${metaSem.toLocaleString()} / semana</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {cuotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCuotaModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Cumplimiento de Cuota de Ventas</h2>
                <p className="text-sm text-slate-500 mt-0.5">Detalle por vendedor — {MESES[month - 1]} {year}</p>
              </div>
              <div className="flex items-center gap-3">
                <select value={cuotaSellerFilter} onChange={(e) => setCuotaSellerFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
                  <option value="todos">Todos los vendedores</option>
                  {cuotaData.map((s) => <option key={s.seller_id} value={String(s.seller_id)}>{s.name}</option>)}
                </select>
                <button onClick={() => setCuotaModal(false)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
              </div>
            </div>

            <div className="flex gap-1 p-1 bg-slate-100 mx-6 mt-4 rounded-lg w-fit">
              {(["mensual", "semanal", "diario"] as const).map((tab) => (
                <button key={tab} onClick={() => setCuotaTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${cuotaTab === tab ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                  {tab === "mensual" ? "Mensual" : tab === "semanal" ? "Semanal" : "Diario"}
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {cuotaLoading ? (
                <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
              ) : cuotaData.length === 0 ? (
                <p className="text-center text-slate-400 py-10">No hay datos de cuota para este período</p>
              ) : cuotaTab === "mensual" ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-slate-500">
                      <th className="p-3 text-left font-medium">Vendedor</th>
                      <th className="p-3 text-center font-medium">Cuota Mensual</th>
                      <th className="p-3 text-center font-medium">Facturado</th>
                      <th className="p-3 text-center font-medium">%</th>
                      <th className="p-3 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotaData
                      .filter((s) => cuotaSellerFilter === "todos" || String(s.seller_id) === cuotaSellerFilter)
                      .map((s) => {
                        const pct = s.cuota_mensual > 0 ? (s.facturado_mes / s.cuota_mensual) * 100 : 0;
                        return (
                          <tr key={s.seller_id} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium">{s.name}</td>
                            <td className="p-3 text-center">${s.cuota_mensual.toLocaleString()}</td>
                            <td className="p-3 text-center font-bold">${s.facturado_mes.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs font-bold">{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pct >= 80 ? "bg-emerald-100 text-emerald-700" : pct >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                                {pct >= 80 ? "Cumple" : pct >= 50 ? "Riesgo" : "No cumple"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              ) : cuotaTab === "semanal" ? (
                <div className="space-y-4">
                  {cuotaData
                    .filter((s) => cuotaSellerFilter === "todos" || String(s.seller_id) === cuotaSellerFilter)
                    .map((s) => (
                      <div key={s.seller_id} className="border rounded-xl p-4">
                        <h4 className="font-bold text-slate-800 mb-2">{s.name}</h4>
                        <p className="text-xs text-slate-500 mb-3">Cuota semanal: ${s.cuota_semanal.toLocaleString()} | Días hábiles: {s.dias_habiles}</p>
                        <div className="grid grid-cols-5 gap-2">
                          {s.semanas_detalle.map((sem, i) => (
                            <div key={i} className={`p-2 rounded-lg text-center text-xs ${sem.cumple ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                              <p className="font-bold text-slate-700">{sem.semana}</p>
                              <p className="text-slate-500">${sem.facturado.toLocaleString()}</p>
                              <p className={`font-bold ${sem.cumple ? "text-emerald-600" : "text-red-600"}`}>{sem.cuotaSemanal > 0 ? ((sem.facturado / sem.cuotaSemanal) * 100).toFixed(0) : 0}%</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {cuotaData
                    .filter((s) => cuotaSellerFilter === "todos" || String(s.seller_id) === cuotaSellerFilter)
                    .map((s) => (
                      <div key={s.seller_id} className="border rounded-xl p-4">
                        <h4 className="font-bold text-slate-800 mb-2">{s.name}</h4>
                        <p className="text-xs text-slate-500 mb-3">Cuota diaria: ${s.cuota_diaria.toLocaleString()} | Días hábiles: {s.dias_habiles}</p>
                        <div className="grid grid-cols-7 gap-1.5">
                          {s.dias_detalle.map((dia, i) => (
                            <div key={i} className={`p-1.5 rounded-lg text-center text-[10px] ${!dia.esHabil ? "bg-slate-100 text-slate-400" : dia.cumple ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                              <p className="font-medium">{new Date(dia.date + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}</p>
                              {dia.esHabil ? (
                                <>
                                  <p className="text-slate-500">${dia.facturado.toLocaleString()}</p>
                                  <p className={`font-bold ${dia.cumple ? "text-emerald-600" : "text-red-600"}`}>{dia.cuotaDiaria > 0 ? ((dia.facturado / dia.cuotaDiaria) * 100).toFixed(0) : 0}%</p>
                                </>
                              ) : <p className="text-slate-400">Festivo</p>}
                            </div>
                          ))}
                        </div>
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
