"use client";

import { useState, useEffect } from "react";
import { X, ArrowLeft, Check, AlertTriangle, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";

interface ComprasDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpiType: string;
  kpiTitle: string;
  companyId: number;
  mes: string;
  onMesChange?: (mes: string) => void;
}

export default function ComprasDetailModal({
  isOpen,
  onClose,
  kpiType,
  kpiTitle,
  companyId,
  mes,
  onMesChange,
}: ComprasDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [forecastRows, setForecastRows] = useState<any[]>([]);
  const [forecastComponents, setForecastComponents] = useState<any[]>([]);
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !kpiType) return;
    setLoading(true);
    setData(null);
    setError(null);
    setSelectedItem(null);
    setEditingWeek(null);

    if (kpiType === "forecast") {
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[companyId] || "valencia";

      const [yearStr, monthStr] = mes.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const allWeeks: { inicio: Date; fin: Date }[] = [];
      let cur = new Date(monthStart);
      while (cur <= monthEnd) {
        const start = new Date(cur);
        let end = new Date(cur);
        end.setDate(end.getDate() + 6);
        if (end > monthEnd) end = new Date(monthEnd);
        allWeeks.push({ inicio: start, fin: end });
        cur = new Date(end);
        cur.setDate(cur.getDate() + 1);
      }

      fetch(`/api/superadmin/stoplight/forecast-semanal?empresa=${empresa}&mes=${mes}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success) {
            const existingRows = json.data.rows || [];
            const existingMap: Record<number, any> = {};
            existingRows.forEach((r: any) => { existingMap[r.semanaIndex] = r; });

            const fullRows = allWeeks.map((w, i) => {
              if (existingMap[i]) return existingMap[i];
              const label = `${w.inicio.getDate()} ${w.inicio.toLocaleDateString("es-VE", { month: "short" })} - ${w.fin.getDate()} ${w.fin.toLocaleDateString("es-VE", { month: "short" })}`;
              return {
                semanaIndex: i,
                semanaLabel: label,
                reunionRealizada: false,
                forecastActualizado: false,
                quiebresRevisados: false,
                decisionesRegistradas: false,
                notas: "",
                score: 0,
              };
            });

            setForecastRows(fullRows);
            setForecastComponents(json.data.components);
            setData({ forecastScore: json.data.score });
          } else setError(json.error || "Error al cargar datos");
        })
        .catch(() => setError("Error de conexion"))
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/superadmin/stoplight/compras-detail?kpi=${kpiType}&mes=${mes}&company_id=${companyId}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success) setData(json.data);
          else setError(json.error || "Error al cargar datos");
        })
        .catch(() => setError("Error de conexion"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, kpiType, companyId, mes]);

  const startEditWeek = (row: any) => {
    setEditingWeek(row.semanaIndex);
    setEditForm({
      reunion_realizada: row.reunionRealizada,
      forecast_actualizado: row.forecastActualizado,
      quiebres_revisados: row.quiebresRevisados,
      decisiones_registradas: row.decisionesRegistradas,
    });
  };

  const saveForecastWeek = async () => {
    if (editingWeek === null) return;
    setSaving(true);
    try {
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[companyId] || "valencia";
      const res = await fetch("/api/superadmin/stoplight/forecast-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa,
          mes,
          semana_index: editingWeek,
          reunion_realizada: editForm.reunion_realizada || false,
          forecast_actualizado: editForm.forecast_actualizado || false,
          quiebres_revisados: editForm.quiebres_revisados || false,
          decisiones_registradas: editForm.decisiones_registradas || false,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setForecastRows((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((r: any) => r.semanaIndex === editingWeek);
          const checked = Object.values(editForm).filter(Boolean).length;
          const newRow = {
            semanaIndex: editingWeek,
            reunionRealizada: editForm.reunion_realizada || false,
            forecastActualizado: editForm.forecast_actualizado || false,
            quiebresRevisados: editForm.quiebres_revisados || false,
            decisionesRegistradas: editForm.decisiones_registradas || false,
            notas: "",
            score: Math.round((checked / 4) * 100),
          };
          if (idx >= 0) updated[idx] = newRow;
          else updated.push(newRow);
          return updated;
        });
        setEditingWeek(null);
      }
    } catch (e) {
      console.error("Error saving forecast:", e);
    }
    setSaving(false);
  };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const mesLabelLocal = (mesStr: string) => {
    const [y, m] = mesStr.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-VE", { month: "short", year: "2-digit" });
  };

  const goMonth = (delta: number) => {
    if (!onMesChange) return;
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onMesChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            {selectedItem && (
              <button
                onClick={() => setSelectedItem(null)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft size={16} /> Volver
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-900">{kpiTitle}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {data?.resumen ? getResumenText(kpiType, data.resumen) : "Cargando..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onMesChange && (
              <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
                <button onClick={() => goMonth(-1)} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-medium min-w-[80px] text-center capitalize">
                  {mesLabelLocal(mes)}
                </span>
                <button onClick={() => goMonth(1)} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">Cargando datos...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <AlertTriangle size={40} className="text-amber-400 mb-3" />
              <p className="text-sm">{error}</p>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center py-20 text-slate-400">No hay datos disponibles</div>
          ) : kpiType === "forecast" ? (
            editingWeek !== null ? (
              <div className="space-y-4">
                <button onClick={() => setEditingWeek(null)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                  <ArrowLeft size={16} /> Volver a la lista
                </button>
                <h3 className="text-lg font-bold text-slate-900">Semana {editingWeek + 1} — Checklist del Forecast</h3>
                <p className="text-sm text-slate-500">Marca los puntos completados. Cada punto vale 25% del score semanal.</p>
                <div className="space-y-3">
                  {forecastComponents.map((comp: any) => (
                    <label key={comp.key} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={editForm[comp.key] || false}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, [comp.key]: e.target.checked }))}
                        className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="font-medium text-slate-800">{comp.label}</p>
                        <p className="text-xs text-slate-500">Peso: {comp.peso}%</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <div className="text-lg font-bold text-slate-800">
                    Score: {Math.round((Object.values(editForm).filter(Boolean).length / 4) * 100)}%
                  </div>
                  <button
                    onClick={saveForecastWeek}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500 font-medium">Score promedio</p>
                    <p className="text-2xl font-bold text-slate-800">{data.forecastScore ?? 0}%</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500 font-medium">Semanas con datos</p>
                    <p className="text-2xl font-bold text-slate-800">{forecastRows.length}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500 font-medium">Componentes</p>
                    <p className="text-2xl font-bold text-slate-800">{forecastComponents.length}</p>
                  </div>
                </div>
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                        <th className="p-3 text-center font-medium text-slate-600">Reunión</th>
                        <th className="p-3 text-center font-medium text-slate-600">Forecast</th>
                        <th className="p-3 text-center font-medium text-slate-600">Quiebres</th>
                        <th className="p-3 text-center font-medium text-slate-600">Decisiones</th>
                        <th className="p-3 text-center font-medium text-slate-600">Score</th>
                        <th className="p-3 text-center font-medium text-slate-600">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastRows.length === 0 ? (
                        <tr><td colSpan={7} className="p-8 text-center text-slate-400">No hay datos disponibles.</td></tr>
                      ) : (
                        forecastRows.map((row: any) => (
                          <tr key={row.semanaIndex} className="border-b hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => startEditWeek(row)}>
                            <td className="p-3 font-medium text-slate-800">
                              Semana {row.semanaIndex + 1}
                              {row.semanaLabel && <span className="text-xs text-slate-400 ml-2">({row.semanaLabel})</span>}
                            </td>
                            <td className="p-3 text-center">{row.reunionRealizada ? <Check size={18} className="text-green-600 mx-auto" /> : <span className="text-slate-300">—</span>}</td>
                            <td className="p-3 text-center">{row.forecastActualizado ? <Check size={18} className="text-green-600 mx-auto" /> : <span className="text-slate-300">—</span>}</td>
                            <td className="p-3 text-center">{row.quiebresRevisados ? <Check size={18} className="text-green-600 mx-auto" /> : <span className="text-slate-300">—</span>}</td>
                            <td className="p-3 text-center">{row.decisionesRegistradas ? <Check size={18} className="text-green-600 mx-auto" /> : <span className="text-slate-300">—</span>}</td>
                            <td className="p-3 text-center">
                              <span className={`font-bold ${row.score >= 100 ? "text-green-600" : row.score >= 75 ? "text-amber-600" : "text-red-600"}`}>
                                {row.score}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button className="text-blue-600 hover:text-blue-800 text-xs font-medium">{row.score > 0 ? "Editar" : "Registrar"}</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
          </table>
          </div>
        </div>
                <p className="text-xs text-slate-400 mt-2">Haz clic en una semana vacía o en "Editar" para registrar el checklist semanal.</p>
              </div>
            )
          ) : selectedItem ? (
            renderDetail(kpiType, selectedItem, fmt)
          ) : (
            renderList(kpiType, data, setSelectedItem, fmt)
          )}
        </div>
      </div>
    </div>
  );
}

function getResumenText(kpi: string, r: any): string {
  if (!r) return "";
  try {
    switch (kpi) {
      case "variacion_costo":
        return `${r.totalProductos ?? 0} productos | Var. promedio: ${r.promedioVariacion ?? 0}% | Ahorro: $${(r.ahorroTotalEstimado ?? 0).toLocaleString("es-VE")}`;
      case "rotacion":
        return `${r.totalConStock ?? 0} con stock | Sell-through: ${r.sellThroughGeneral ?? 0}% | ${r.saludables ?? 0} saludables`;
      case "quiebre":
        return `${r.totalConDemanda ?? 0} elegibles | ${r.enQuiebre ?? 0} quiebre | ${r.enRiesgo ?? 0} riesgo | ${r.porcentaje ?? 0}% SKU-días`;
      case "inventario_90":
        return `${r.productosEstancados ?? 0} de ${r.totalProductos ?? 0} +90d | ${r.porcentaje ?? 0}% valor ($${(r.valorEstancado ?? 0).toLocaleString("es-VE")})`;
      case "forecast":
        return `Score promedio: ${r.forecastScore ?? 0}% | Semáforo: ${r.forecastScore >= 100 ? "Verde" : r.forecastScore >= 75 ? "Amarillo" : "Rojo"}`;
      default:
        return "";
    }
  } catch {
    return "";
  }
}

function renderList(kpi: string, data: any, onSelect: (item: any) => void, fmt: (n: number | undefined | null) => string) {
  const items = data?.items;
  if (!items || items.length === 0) {
    return <div className="flex items-center justify-center py-20 text-slate-400">Sin datos para este KPI</div>;
  }

  if (kpi === "variacion_costo") {
    return (
      <div className="space-y-4">
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                <th className="p-3 text-center font-medium text-slate-600">Categoría</th>
                <th className="p-3 text-center font-medium text-slate-600">Costo Base (3m)</th>
                <th className="p-3 text-center font-medium text-slate-600">Costo Actual</th>
                <th className="p-3 text-center font-medium text-slate-600">Variación</th>
                <th className="p-3 text-center font-medium text-slate-600">Stock</th>
                <th className="p-3 text-center font-medium text-slate-600">Ahorro Unit.</th>
                <th className="p-3 text-center font-medium text-slate-600">Última Compra</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => onSelect(item)}>
                  <td className="p-3 font-medium text-slate-800">{item.nombre}</td>
                  <td className="p-3 text-center text-slate-600">{item.categoria}</td>
                  <td className="p-3 text-center">${fmt(item.costoBase)}</td>
                  <td className="p-3 text-center">${fmt(item.costoActual)}</td>
                  <td className="p-3 text-center">
                    <span className={`font-bold ${item.variacion > 0 ? "text-green-600" : item.variacion < 0 ? "text-red-600" : "text-slate-600"}`}>
                      {item.variacion > 0 ? "+" : ""}{item.variacion}%
                    </span>
                  </td>
                  <td className="p-3 text-center">{item.stock}</td>
                  <td className="p-3 text-center">
                    <span className={item.ahorroUnitario > 0 ? "text-green-600" : "text-red-600"}>
                      {item.ahorroUnitario > 0 ? "+" : ""}${fmt(item.ahorroUnitario)}
                    </span>
                  </td>
                  <td className="p-3 text-center text-slate-500 text-xs">{item.ultimaCompra}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  if (kpi === "rotacion") {
    return (
      <div className="space-y-4">
        {/* Sell-through summary */}
        {data.resumen?.sellThroughPorPlazo && (
          <div className="grid grid-cols-4 gap-3">
            {[30, 60, 90, 120].map((days) => (
              <div key={days} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 font-medium">Sell-through {days}d</p>
                <p className="text-xl font-bold text-slate-800">{data.resumen.sellThroughPorPlazo[days] ?? 0}%</p>
              </div>
            ))}
          </div>
        )}
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                <th className="p-3 text-center font-medium text-slate-600">Categoría</th>
                <th className="p-3 text-center font-medium text-slate-600">Stock</th>
                <th className="p-3 text-center font-medium text-slate-600">Valor Stock</th>
                <th className="p-3 text-center font-medium text-slate-600">Ventas</th>
                <th className="p-3 text-center font-medium text-slate-600">Sell-through</th>
                <th className="p-3 text-center font-medium text-slate-600">Últ. Recepción</th>
                <th className="p-3 text-center font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className={`border-b hover:bg-slate-50/50 transition-colors cursor-pointer ${!item.rotaSaludablemente ? "bg-red-50/30" : ""}`} onClick={() => onSelect(item)}>
                  <td className="p-3 font-medium text-slate-800">{item.nombre}</td>
                  <td className="p-3 text-center text-slate-600">{item.categoria}</td>
                  <td className="p-3 text-center">{item.stock}</td>
                  <td className="p-3 text-center">${fmt(item.valorStock)}</td>
                  <td className="p-3 text-center font-bold">{item.ventasTotales}</td>
                  <td className="p-3 text-center">
                    <span className={`font-bold ${item.sellThrough >= 70 ? "text-green-600" : item.sellThrough >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                      {item.sellThrough}%
                    </span>
                  </td>
                  <td className="p-3 text-center text-slate-500 text-xs">{item.ultimaRecepcion}</td>
                  <td className="p-3 text-center">
                    {item.rotaSaludablemente ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <Check size={12} /> Saludable
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        <AlertTriangle size={12} /> Baja rotación
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  if (kpi === "quiebre") {
    return (
      <div className="space-y-4">
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                <th className="p-3 text-center font-medium text-slate-600">Categoría</th>
                <th className="p-3 text-center font-medium text-slate-600">Stock</th>
                <th className="p-3 text-center font-medium text-slate-600">Demanda/mes</th>
                <th className="p-3 text-center font-medium text-slate-600">Demanda/día</th>
                <th className="p-3 text-center font-medium text-slate-600">Días p/quiebre</th>
                <th className="p-3 text-center font-medium text-slate-600">Días sin stock</th>
                <th className="p-3 text-center font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className={`border-b hover:bg-slate-50/50 transition-colors cursor-pointer ${
                  item.estado === "QUIEBRE TOTAL" ? "bg-red-50" : item.estado === "RIESGO ALTO" ? "bg-yellow-50/50" : ""
                }`} onClick={() => onSelect(item)}>
                  <td className="p-3 font-medium text-slate-800">{item.nombre}</td>
                  <td className="p-3 text-center text-slate-600">{item.categoria}</td>
                  <td className="p-3 text-center font-bold">{item.stock}</td>
                  <td className="p-3 text-center">{item.demandaMensual}</td>
                  <td className="p-3 text-center">{item.demandaDiaria}</td>
                  <td className="p-3 text-center">
                    <span className={`font-bold ${
                      item.diasHastaQuiebre === "Sin riesgo" ? "text-green-600" :
                      item.diasHastaQuiebre <= 7 ? "text-red-600" :
                      item.diasHastaQuiebre <= 15 ? "text-yellow-600" : "text-green-600"
                    }`}>
                      {item.diasHastaQuiebre}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`font-bold ${item.diasSinStockEstimado > 0 ? "text-red-600" : "text-green-600"}`}>
                      {item.diasSinStockEstimado}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {item.estado === "QUIEBRE TOTAL" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        <AlertTriangle size={12} /> Quiebre
                      </span>
                    ) : item.estado === "RIESGO ALTO" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                        <AlertTriangle size={12} /> Riesgo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <Check size={12} /> OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  if (kpi === "inventario_90") {
    return (
      <div className="space-y-4">
        {/* Bandas de envejecimiento */}
        {data.resumen?.bandas && (
          <div className="grid grid-cols-6 gap-2">
            {data.resumen.bandas.map((b: any, i: number) => (
              <div key={i} className={`rounded-xl p-3 text-center ${b.min >= 91 ? "bg-red-50 border border-red-200" : "bg-slate-50"}`}>
                <p className="text-xs text-slate-500 font-medium">{b.label}</p>
                <p className={`text-lg font-bold ${b.min >= 91 ? "text-red-700" : "text-slate-800"}`}>{b.cantidad}</p>
                <p className="text-xs text-slate-500">${fmt(b.valor)}</p>
                <p className="text-xs text-slate-400">{b.porcentaje}%</p>
              </div>
            ))}
          </div>
        )}
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                <th className="p-3 text-center font-medium text-slate-600">Categoría</th>
                <th className="p-3 text-center font-medium text-slate-600">Stock</th>
                <th className="p-3 text-center font-medium text-slate-600">Costo</th>
                <th className="p-3 text-center font-medium text-slate-600">Valor Inventario</th>
                <th className="p-3 text-center font-medium text-slate-600">Banda</th>
                <th className="p-3 text-center font-medium text-slate-600">Últ. Recepción</th>
                <th className="p-3 text-center font-medium text-slate-600">Días</th>
                <th className="p-3 text-center font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className={`border-b hover:bg-slate-50/50 transition-colors cursor-pointer ${item.esEstancado ? "bg-red-50/30" : ""}`} onClick={() => onSelect(item)}>
                  <td className="p-3 font-medium text-slate-800">{item.nombre}</td>
                  <td className="p-3 text-center text-slate-600">{item.categoria}</td>
                  <td className="p-3 text-center">{item.stock}</td>
                  <td className="p-3 text-center">${fmt(item.costo)}</td>
                  <td className="p-3 text-center font-bold">${fmt(item.valorInventario)}</td>
                  <td className="p-3 text-center text-xs font-medium text-slate-600">{item.banda}</td>
                  <td className="p-3 text-center text-slate-500 text-xs">{item.ultimoMovimiento}</td>
                  <td className="p-3 text-center">
                    <span className={`font-bold ${item.diasInactivo <= 90 ? "text-green-600" : item.diasInactivo <= 180 ? "text-yellow-600" : "text-red-600"}`}>
                      {item.diasInactivo >= 999 ? "N/A" : item.diasInactivo}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {item.esEstancado ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        <AlertTriangle size={12} /> +90d
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <Check size={12} /> OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function renderDetail(kpi: string, item: any, fmt: (n: number | undefined | null) => string) {
  if (kpi === "variacion_costo") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">SKU</p>
            <p className="text-lg font-bold text-slate-800">{item.sku}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Categoría</p>
            <p className="text-lg font-bold text-slate-800">{item.categoria}</p>
          </div>
          <div className={`rounded-xl p-4 ${item.variacion > 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className={`text-xs font-medium ${item.variacion > 0 ? "text-green-600" : "text-red-600"}`}>Variación</p>
            <p className={`text-lg font-bold ${item.variacion > 0 ? "text-green-700" : "text-red-700"}`}>
              {item.variacion > 0 ? "+" : ""}{item.variacion}%
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Costo Base (3m)</p>
            <p className="text-xl font-bold text-blue-700">${fmt(item.costoBase)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-xs text-amber-600 font-medium">Costo Actual</p>
            <p className="text-xl font-bold text-amber-700">${fmt(item.costoActual)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Stock</p>
            <p className="text-xl font-bold text-slate-700">{item.stock}</p>
          </div>
          <div className={`rounded-xl p-4 ${item.ahorroUnitario > 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className={`text-xs font-medium ${item.ahorroUnitario > 0 ? "text-green-600" : "text-red-600"}`}>Ahorro/Sobrecosto Unit.</p>
            <p className={`text-xl font-bold ${item.ahorroUnitario > 0 ? "text-green-700" : "text-red-700"}`}>
              {item.ahorroUnitario > 0 ? "+" : ""}${fmt(item.ahorroUnitario)}
            </p>
          </div>
        </div>
        {item.totalComprado3m && (
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Unidades compradas últimos 3 meses</p>
            <p className="text-xl font-bold text-slate-700">{item.totalComprado3m}</p>
          </div>
        )}
      </div>
    );
  }

  if (kpi === "rotacion") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">SKU</p>
            <p className="text-lg font-bold text-slate-800">{item.sku}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Categoría</p>
            <p className="text-lg font-bold text-slate-800">{item.categoria}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Stock</p>
            <p className="text-xl font-bold text-blue-700">{item.stock}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Valor Stock</p>
            <p className="text-xl font-bold text-blue-700">${fmt(item.valorStock)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-xs text-green-600 font-medium">Ventas totales</p>
            <p className="text-xl font-bold text-green-700">{item.ventasTotales}</p>
          </div>
          <div className={`rounded-xl p-4 ${item.sellThrough >= 70 ? "bg-green-50" : item.sellThrough >= 40 ? "bg-yellow-50" : "bg-red-50"}`}>
            <p className={`text-xs font-medium ${item.sellThrough >= 70 ? "text-green-600" : item.sellThrough >= 40 ? "text-yellow-600" : "text-red-600"}`}>Sell-through</p>
            <p className={`text-xl font-bold ${item.sellThrough >= 70 ? "text-green-700" : item.sellThrough >= 40 ? "text-yellow-700" : "text-red-700"}`}>
              {item.sellThrough}%
            </p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-xs text-amber-600 font-medium">Última recepción</p>
            <p className="text-xl font-bold text-amber-700">{item.ultimaRecepcion}</p>
          </div>
        </div>
      </div>
    );
  }

  if (kpi === "quiebre") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">SKU</p>
            <p className="text-lg font-bold text-slate-800">{item.sku}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Categoría</p>
            <p className="text-lg font-bold text-slate-800">{item.categoria}</p>
          </div>
          <div className={`rounded-xl p-4 ${item.estado === "OK" ? "bg-green-50" : item.estado === "RIESGO ALTO" ? "bg-yellow-50" : "bg-red-50"}`}>
            <p className={`text-xs font-medium ${item.estado === "OK" ? "text-green-600" : item.estado === "RIESGO ALTO" ? "text-yellow-600" : "text-red-600"}`}>Estado</p>
            <p className={`text-lg font-bold ${item.estado === "OK" ? "text-green-700" : item.estado === "RIESGO ALTO" ? "text-yellow-700" : "text-red-700"}`}>{item.estado}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Stock actual</p>
            <p className="text-xl font-bold text-blue-700">{item.stock}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Demanda mensual</p>
            <p className="text-lg font-bold text-slate-700">{item.demandaMensual}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Demanda/día</p>
            <p className="text-lg font-bold text-slate-700">{item.demandaDiaria}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-xs text-red-600 font-medium">Días p/quiebre</p>
            <p className="text-xl font-bold text-red-700">{item.diasHastaQuiebre}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-xs text-amber-600 font-medium">Días sin stock (estimado)</p>
            <p className="text-xl font-bold text-amber-700">{item.diasSinStockEstimado}</p>
          </div>
        </div>
      </div>
    );
  }

  if (kpi === "inventario_90") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">SKU</p>
            <p className="text-lg font-bold text-slate-800">{item.sku}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Categoría</p>
            <p className="text-lg font-bold text-slate-800">{item.categoria}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Stock</p>
            <p className="text-xl font-bold text-blue-700">{item.stock}</p>
          </div>
          <div className={`rounded-xl p-4 ${item.esEstancado ? "bg-red-50" : "bg-green-50"}`}>
            <p className={`text-xs font-medium ${item.esEstancado ? "text-red-600" : "text-green-600"}`}>Banda</p>
            <p className={`text-lg font-bold ${item.esEstancado ? "text-red-700" : "text-green-700"}`}>{item.banda}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-xs text-amber-600 font-medium">Costo unitario</p>
            <p className="text-xl font-bold text-amber-700">${fmt(item.costo)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-xs text-red-600 font-medium">Valor inmovilizado</p>
            <p className="text-xl font-bold text-red-700">${fmt(item.valorInventario)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Última recepción</p>
            <p className="text-xl font-bold text-slate-700">{item.ultimoMovimiento}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
