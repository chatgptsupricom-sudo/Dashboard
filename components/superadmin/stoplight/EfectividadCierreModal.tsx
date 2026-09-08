"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Check, ArrowLeft } from "lucide-react";
import ModalMonthPicker from "./ModalMonthPicker";

interface EfectividadCierreModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id a enviar, o null en los modos que no lo mandan. */
  companyId: number | null;
  defaultMes: string;
}

type Periodo = "mes" | "trimestre" | "anio" | "todo";

// Modal "Efectividad de cierre": embudo global + tabla por vendedor + detalle
// semanal (con drill-down), con selector de período (mes / trimestre / año /
// todo). Autocontenido. Extraído de StoplightReport.tsx (audit #23).
export default function EfectividadCierreModal({ isOpen, onClose, apiPrefix, companyId, defaultMes }: EfectividadCierreModalProps) {
  const t = useTranslations("stoplight");

  const [mes, setMes] = useState(defaultMes);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [tab, setTab] = useState<"vendedor" | "semanal">("vendedor");
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
      setPeriodo("mes");
      setTab("vendedor");
      setSelectedSeller(null);
    }
  }, [isOpen, defaultMes]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setSelectedSeller(null);
    (async () => {
      try {
        const params = new URLSearchParams({ mes, periodo });
        if (companyId != null) params.set("company_id", String(companyId));
        const res = await fetch(`${apiPrefix}/efectividad-detail?${params.toString()}`);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching efectividad detail:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, mes, periodo, companyId, apiPrefix]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            {selectedSeller && (
              <button
                onClick={() => setSelectedSeller(null)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft size={16} /> {t("back")}
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{t("efectividad_title")}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {data?.periodoLabel || t("efectividad_subtitle")}
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
                    ? "bg-slate-900 text-white"
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
              onClick={() => { setTab(tb); setSelectedSeller(null); }}
              className={`pb-3 text-sm font-medium capitalize transition-colors ${
                tab === tb ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tb === "vendedor" ? t("tab_por_vendedor") : t("tab_detalle_semanal")}
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
              {/* POR VENDEDOR Tab */}
              {tab === "vendedor" && (
                <div className="space-y-6">
                   {/* Global Funnel */}
                  {data.global && (
                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("embudo_global", { periodo: data?.periodoLabel || t("periodo_mes") })}</h3>
                      <div className="flex items-center justify-between gap-4">
                        {/* Ordenes */}
                        <div className="flex-1 text-center">
                          <div className="bg-indigo-50 rounded-xl p-4 mb-2">
                            <p className="text-3xl font-bold text-indigo-700">{data.global.ordenes}</p>
                          </div>
                          <p className="text-xs font-medium text-indigo-600">{t("ordenes")}</p>
                          <p className="text-[10px] text-slate-400">{t("ordenenes_confirmadas")}</p>
                        </div>
                        {/* Arrow */}
                        <div className="flex flex-col items-center">
                          <span className="text-2xl text-slate-300">→</span>
                        </div>
                        {/* Facturacion */}
                        <div className="flex-1 text-center">
                          <div className="bg-green-100 rounded-xl p-4 mb-2">
                            <p className="text-3xl font-bold text-green-700">{data.global.facturadas}</p>
                          </div>
                          <p className="text-xs font-medium text-green-600">{t("facturadas_completo")}</p>
                          <p className="text-[10px] text-slate-400">{t("invoice_status")}</p>
                        </div>
                        {/* Efectividad */}
                        <div className="flex flex-col items-center ml-4">
                          <div className="bg-purple-100 rounded-xl px-6 py-4 mb-2">
                            <p className="text-3xl font-bold text-purple-700">{data.global.efectividad}%</p>
                          </div>
                          <p className="text-xs font-medium text-purple-600">{t("efectividad")}</p>
                          <p className="text-[10px] text-slate-400">{t("formula_efectividad")}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Seller table */}
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("vendedor")}</th>
                          <th className="p-3 text-center font-medium text-indigo-600">{t("ordenes")}</th>
                          <th className="p-3 text-center font-medium text-green-600">{t("facturadas_completo")}</th>
                          <th className="p-3 text-center font-medium text-purple-600">{t("efectividad_pct")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sellers.map((seller: any) => {
                          const cumple = seller.efectividad >= 60;
                          return (
                            <tr
                              key={seller.nombre}
                              className="border-b hover:bg-blue-50/40 transition-colors"
                            >
                              <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                              <td className="p-3 text-center text-indigo-600 font-bold">{seller.ordenes}</td>
                              <td className="p-3 text-center text-green-600 font-bold">{seller.facturadas}</td>
                              <td className="p-3 text-center">
                                <span className={`font-bold ${seller.efectividad >= 60 ? "text-green-600" : seller.efectividad >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                  {seller.efectividad}%
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {cumple ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                    <Check size={12} /> {t("cumple")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                    <X size={12} /> {t("no_cumple")}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DETALLE SEMANAL Tab */}
              {tab === "semanal" && (
                <div>
                  {!selectedSeller ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500 mb-3">{t("selecciona_vendedor_semanal")}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {data.sellers.map((seller: any) => (
                          <button
                            key={seller.nombre}
                            onClick={() => setSelectedSeller(seller)}
                            className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="font-medium text-slate-800">{seller.nombre}</span>
                            <span className={`text-sm font-bold ${seller.efectividad >= 60 ? "text-green-600" : "text-red-600"}`}>
                              {seller.efectividad}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <button onClick={() => setSelectedSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                          {t("back")}
                        </button>
                        <h3 className="font-bold text-slate-800">{selectedSeller.nombre}</h3>
                        <span className={`text-sm font-bold ${selectedSeller.efectividad >= 60 ? "text-green-600" : "text-red-600"}`}>
                          {selectedSeller.efectividad}%
                        </span>
                      </div>
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">{t("semana")}</th>
                              <th className="p-3 text-center font-medium text-indigo-600">{t("ordenes")}</th>
                              <th className="p-3 text-center font-medium text-green-600">{t("facturadas_completo")}</th>
                              <th className="p-3 text-center font-medium text-purple-600">{t("efectividad_pct")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSeller.semanas.map((sem: any) => (
                              <tr key={sem.numero} className={`border-b ${sem.efectividad != null && sem.efectividad >= 60 ? "bg-green-50/30" : ""}`}>
                                <td className="p-3 font-medium text-sm">{sem.label || t("semana_numero", { num: sem.numero })}</td>
                                <td className="p-3 text-center text-indigo-600 font-bold">{sem.efectividad != null ? sem.ordenes : "-"}</td>
                                <td className="p-3 text-center text-green-600 font-bold">{sem.efectividad != null ? sem.facturadas : "-"}</td>
                                <td className="p-3 text-center">
                                  {sem.efectividad != null ? (
                                    <span className={`font-bold ${sem.efectividad >= 60 ? "text-green-600" : sem.efectividad >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                      {sem.efectividad}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {sem.efectividad != null ? (
                                    sem.efectividad >= 60 ? (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                        <Check size={12} /> {t("ok")}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                        <X size={12} /> Bajo
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400">-</span>
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
  );
}
