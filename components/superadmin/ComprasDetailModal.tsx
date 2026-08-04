"use client";

import { useState, useEffect } from "react";
import { X, ArrowLeft, Check, AlertTriangle, BarChart3 } from "lucide-react";

interface ComprasDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpiType: string;
  kpiTitle: string;
  companyId: number;
  mes: string;
}

export default function ComprasDetailModal({
  isOpen,
  onClose,
  kpiType,
  kpiTitle,
  companyId,
  mes,
}: ComprasDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !kpiType) return;
    setLoading(true);
    setData(null);
    setError(null);
    setSelectedItem(null);
    fetch(`/api/superadmin/stoplight/compras-detail?kpi=${kpiType}&mes=${mes}&company_id=${companyId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
        else setError(json.error || "Error al cargar datos");
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }, [isOpen, kpiType, companyId, mes]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
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
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
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
          <table className="w-full text-sm">
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
          <table className="w-full text-sm">
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
    );
  }

  if (kpi === "quiebre") {
    return (
      <div className="space-y-4">
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
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
          <table className="w-full text-sm">
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
