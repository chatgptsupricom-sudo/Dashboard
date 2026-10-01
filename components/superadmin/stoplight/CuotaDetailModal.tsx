"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, Check, ArrowLeft } from "lucide-react";
import type { SellerDetail } from "@/lib/stoplight/types";
import ModalMonthPicker from "./ModalMonthPicker";

interface CuotaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id a enviar, o null en los modos que no lo mandan (vendedor / gerente de operaciones). */
  companyId: number | null;
  defaultMes: string;
}

interface CuotaData {
  mes: string;
  totalDiasUtiles: number;
  sellers: SellerDetail[];
}

// Modal "Cumplimiento de cuota": resumen por vendedor + drill-down diario y
// semanal. Autocontenido — su propio mes, tab y fetch. Extraído de
// StoplightReport.tsx (audit #23).
export default function CuotaDetailModal({ isOpen, onClose, apiPrefix, companyId, defaultMes }: CuotaDetailModalProps) {
  const t = useTranslations("stoplight");
  const locale = useLocale();

  const [mes, setMes] = useState(defaultMes);
  const [tab, setTab] = useState<"resumen" | "diario" | "semanal">("resumen");
  const [selectedSeller, setSelectedSeller] = useState<SellerDetail | null>(null);
  const [data, setData] = useState<CuotaData | null>(null);
  const [loading, setLoading] = useState(false);

  // Al abrir: volver al mes actual y a la pestaña de resumen.
  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
      setTab("resumen");
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
        const params = new URLSearchParams({ mes });
        if (companyId != null) params.set("company_id", String(companyId));
        const res = await fetch(`${apiPrefix}/cuota-detail?${params.toString()}`);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching cuota detail:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, mes, companyId, apiPrefix]);

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
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{t("modal_cuota_title")}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {t("modal_cuota_subtitle", { mes: data?.mes || mes, dias: data?.totalDiasUtiles || 0 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModalMonthPicker value={mes} onChange={setMes} />
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Modal Tabs */}
        <div className="flex gap-4 px-5 pt-4 border-b">
          {(["resumen", "diario", "semanal"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`pb-3 text-sm font-medium capitalize transition-colors ${
                tab === tb ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tb === "resumen" ? t("tab_resumen_vendedores") : tb === "diario" ? t("tab_detalle_diario") : t("tab_detalle_semanal")}
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
              {/* Resumen Tab */}
              {tab === "resumen" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("total_vendedores")}</p>
                      <p className="text-2xl font-bold text-slate-900">{data.sellers.length}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4">
                      <p className="text-xs text-green-600 font-medium">{t("cumplieron")}</p>
                      <p className="text-2xl font-bold text-green-700">
                        {data.sellers.filter((s) => s.cumple).length}
                      </p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4">
                      <p className="text-xs text-red-600 font-medium">{t("no_cumplieron")}</p>
                      <p className="text-2xl font-bold text-red-700">
                        {data.sellers.filter((s) => !s.cumple).length}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-600 font-medium">{t("dias_utiles_mes")}</p>
                      <p className="text-2xl font-bold text-slate-700">{data.totalDiasUtiles}</p>
                    </div>
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("vendedor")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("cuota_mensual")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("facturado")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("porcentaje")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("accion")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sellers.map((seller) => (
                          <tr key={seller.sellerId} className="border-b hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => { setSelectedSeller(seller); setTab("diario"); }}>
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
                                  <Check size={12} /> {t("cumple")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                  <X size={12} /> {t("no_cumple")}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-xs text-blue-600 hover:text-blue-800 underline">
                                {t("ver_detalle")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detalle Diario Tab */}
              {tab === "diario" && (
                <div>
                  {!selectedSeller ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500 mb-3">{t("selecciona_vendedor_diario")}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {data.sellers.map((seller) => (
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
                            {t("back")}
                          </button>
                          <h3 className="font-bold text-slate-800">{selectedSeller.nombre}</h3>
                          <span className={`text-sm font-bold ${selectedSeller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                            {selectedSeller.porcentajeMensual}%
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {t("cuota_diaria", { value: selectedSeller.cuotaDiaria.toLocaleString(locale, { minimumFractionDigits: 2 }) })}
                        </span>
                      </div>
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-2 text-left font-medium text-slate-600">{t("fecha")}</th>
                              <th className="p-2 text-center font-medium text-slate-600">{t("dia")}</th>
                              <th className="p-2 text-center font-medium text-slate-600">{t("cuota")}</th>
                              <th className="p-2 text-center font-medium text-slate-600">{t("facturado")}</th>
                              <th className="p-2 text-center font-medium text-slate-600">{t("estado")}</th>
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
                                      ? t("feriado")
                                      : t("descanso")}
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
                                      <Check size={12} /> {t("ok")}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                      <X size={12} /> {t("falta")}
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
              {tab === "semanal" && (
                <div>
                  {!selectedSeller ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500 mb-3">{t("selecciona_vendedor_semanal")}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {data.sellers.map((seller) => (
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
                          {t("back")}
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
                              <th className="p-3 text-left font-medium text-slate-600">{t("semana")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("periodo")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("dias_utiles")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("cuota_semanal")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("facturado")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("porcentaje")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSeller.semanas.map((sem) => (
                              <tr key={sem.numero} className={`border-b ${sem.porcentaje != null && sem.porcentaje >= 100 ? "bg-green-50/30" : ""}`}>
                                  <td className="p-3 font-medium">{t("semana_numero", { num: sem.numero })}</td>
                                <td className="p-3 text-center text-slate-600">{sem.inicio} - {sem.fin}</td>
                                <td className="p-3 text-center">{sem.diasUtiles}</td>
                                <td className="p-3 text-center">${sem.cuotaSemanal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center font-medium">${sem.facturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center">
                                  {sem.porcentaje != null ? (
                                    <span className={`font-bold ${sem.porcentaje >= 100 ? "text-green-600" : sem.porcentaje >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                      {sem.porcentaje}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {sem.porcentaje != null ? (
                                    sem.porcentaje >= 100 ? (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                        <Check size={12} /> {t("cumple")}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                        <X size={12} /> {t("no_cumple")}
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
