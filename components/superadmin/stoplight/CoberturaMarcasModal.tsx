"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Package } from "lucide-react";
import ModalMonthPicker from "./ModalMonthPicker";

interface CoberturaMarcasModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id a enviar, o null en los modos que no lo mandan. */
  companyId: number | null;
  defaultMes: string;
}

type Periodo = "mes" | "trimestre" | "anio" | "todo";

// Modal "Cobertura de marcas": resumen global + tabla por marca + detalle
// semanal (con drill-down a una marca), con selector de período. Autocontenido.
// Extraído de StoplightReport.tsx (audit #23).
export default function CoberturaMarcasModal({ isOpen, onClose, apiPrefix, companyId, defaultMes }: CoberturaMarcasModalProps) {
  const t = useTranslations("stoplight");

  const [mes, setMes] = useState(defaultMes);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [tab, setTab] = useState<"vendedor" | "semanal">("vendedor");
  const [selectedMarca, setSelectedMarca] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
      setPeriodo("mes");
      setTab("vendedor");
      setSelectedMarca(null);
    }
  }, [isOpen, defaultMes]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setSelectedMarca(null);
    (async () => {
      try {
        const params = new URLSearchParams({ mes, periodo });
        if (companyId != null) params.set("company_id", String(companyId));
        const res = await fetch(`${apiPrefix}/cobertura-detail?${params.toString()}`);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching cobertura detail:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, mes, periodo, companyId, apiPrefix]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Package size={20} className="text-cyan-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{t("cobertura_title")}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {data?.periodoLabel || t("cobertura_subtitle")}
              </p>
            </div>
          </div>
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            <ModalMonthPicker value={mes} onChange={setMes} />
            {(["mes", "trimestre", "anio", "todo"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  periodo === p
                    ? "bg-cyan-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p === "mes" ? t("periodo_mes") : p === "trimestre" ? t("periodo_trimestre") : p === "anio" ? t("periodo_anio") : t("periodo_todo")}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex gap-4 px-5 pt-4 border-b">
          {(["vendedor", "semanal"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => { setTab(tb); setSelectedMarca(null); }}
              className={`pb-3 text-sm font-medium capitalize transition-colors ${
                tab === tb ? "text-cyan-500 border-b-2 border-cyan-500" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tb === "vendedor" ? t("tab_por_marca") : t("tab_detalle_semanal")}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              {t("loading")}
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              {t("no_available_data")}
            </div>
          ) : (
            <>
              {/* POR MARCA Tab */}
              {tab === "vendedor" && (
                <div className="space-y-6">
                  {/* Global Summary */}
                  {data.global && (
                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("resumen_global", { periodo: data.periodoLabel })}</h3>
                      <div className="grid grid-cols-5 gap-4">
                        <div className="text-center">
                          <div className="bg-cyan-100 rounded-xl p-3 mb-2">
                            <p className="text-2xl font-bold text-cyan-700">{data.global.totalMarcas}</p>
                          </div>
                          <p className="text-xs font-medium text-cyan-600">{t("marcas")}</p>
                        </div>
                        <div className="text-center">
                          <div className="bg-green-100 rounded-xl p-3 mb-2">
                            <p className="text-2xl font-bold text-green-700">${data.global.revenue?.toLocaleString()}</p>
                          </div>
                          <p className="text-xs font-medium text-green-600">{t("revenue_total")}</p>
                        </div>
                        <div className="text-center">
                          <div className="bg-red-100 rounded-xl p-3 mb-2">
                            <p className="text-2xl font-bold text-red-700">${data.global.costo?.toLocaleString()}</p>
                          </div>
                          <p className="text-xs font-medium text-red-600">{t("costo_total")}</p>
                        </div>
                        <div className="text-center">
                          <div className="bg-purple-100 rounded-xl p-3 mb-2">
                            <p className="text-2xl font-bold text-purple-700">{data.global.margen}%</p>
                          </div>
                          <p className="text-xs font-medium text-purple-600">{t("margen_promedio")}</p>
                        </div>
                        <div className="text-center">
                          <div className="bg-indigo-50 rounded-xl p-3 mb-2">
                            <p className="text-2xl font-bold text-indigo-700">{data.global.totalVendedores}</p>
                          </div>
                          <p className="text-xs font-medium text-indigo-600">{t("vendedores")}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Brands table */}
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("marca")}</th>
                          <th className="p-3 text-right font-medium text-green-600">{t("revenue")}</th>
                          <th className="p-3 text-right font-medium text-red-600">{t("costo")}</th>
                          <th className="p-3 text-right font-medium text-emerald-600">{t("ganancia")}</th>
                          <th className="p-3 text-right font-medium text-indigo-600">{t("cantidad")}</th>
                          <th className="p-3 text-right font-medium text-cyan-600">{t("p_vendidos")}</th>
                          <th className="p-3 text-right font-medium text-slate-600">{t("vendedores")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.marcas.map((marca: any) => (
                          <tr
                            key={marca.marca}
                            className="border-b hover:bg-cyan-50/40 transition-colors cursor-pointer"
                            onClick={() => setSelectedMarca(marca)}
                          >
                            <td className="p-3 font-medium text-slate-800">{marca.marca}</td>
                            <td className="p-3 text-right text-green-600 font-bold">${marca.revenue?.toLocaleString()}</td>
                            <td className="p-3 text-right text-red-600">${marca.costo?.toLocaleString()}</td>
                            <td className={`p-3 text-right font-bold ${marca.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              ${marca.ganancia?.toLocaleString()}
                            </td>
                            <td className="p-3 text-right text-indigo-600">{marca.cantidad}</td>
                            <td className="p-3 text-right text-cyan-600">{marca.productosVendidos}</td>
                            <td className="p-3 text-right text-slate-600">{marca.vendedores}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DETALLE SEMANAL Tab */}
              {tab === "semanal" && (
                <div>
                  {!selectedMarca ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500 mb-3">{t("selecciona_marca")}</p>
                      <div className="grid grid-cols-3 gap-3">
                        {data.marcas.map((marca: any) => (
                          <button
                            key={marca.marca}
                            onClick={() => setSelectedMarca(marca)}
                            className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                          >
                            <div>
                              <span className="font-medium text-slate-800">{marca.marca}</span>
                              <p className="text-xs text-slate-500">${marca.revenue?.toLocaleString()} revenue</p>
                            </div>
                            <span className={`text-sm font-bold ${marca.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              ${marca.ganancia?.toLocaleString()}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <button onClick={() => setSelectedMarca(null)} className="text-sm text-slate-500 hover:text-slate-800">
                          {t("back")}
                        </button>
                        <h3 className="font-bold text-slate-800">{selectedMarca.marca}</h3>
                        <span className={`text-sm font-bold ${selectedMarca.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          ${selectedMarca.ganancia?.toLocaleString()} ganancia
                        </span>
                      </div>
                      {/* Vendedores que venden esta marca */}
                      {selectedMarca.vendedoresLista && selectedMarca.vendedoresLista.length > 0 && (
                        <div className="mb-4 p-4 bg-cyan-50 rounded-xl border">
                          <p className="text-xs font-medium text-cyan-700 mb-2">Vendedores ({selectedMarca.vendedores}):</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedMarca.vendedoresLista.map((v: string) => (
                              <span key={v} className="px-2 py-1 bg-white text-cyan-700 rounded text-xs font-medium border border-cyan-200">
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">{t("semana")}</th>
                              <th className="p-3 text-right font-medium text-green-600">{t("revenue")}</th>
                              <th className="p-3 text-right font-medium text-red-600">{t("costo")}</th>
                              <th className="p-3 text-right font-medium text-emerald-600">{t("ganancia")}</th>
                              <th className="p-3 text-right font-medium text-indigo-600">{t("cantidad")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedMarca.semanas.map((sem: any) => (
                              <tr key={sem.numero} className={`border-b ${sem.cantidadPct != null && sem.cantidadPct >= 100 ? "bg-green-50/30" : ""}`}>
                                <td className="p-3 font-medium text-sm">{sem.label || t("semana_numero", { num: sem.numero })}</td>
                                <td className="p-3 text-right text-green-600 font-bold">${sem.revenue?.toLocaleString()}</td>
                                <td className="p-3 text-right text-red-600">${sem.costo?.toLocaleString()}</td>
                                <td className={`p-3 text-right font-bold ${sem.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  ${sem.ganancia?.toLocaleString()}
                                </td>
                                <td className="p-3 text-right text-indigo-600 font-bold">{sem.cantidad}</td>
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
  );
}
