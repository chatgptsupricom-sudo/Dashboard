"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, Check, ArrowLeft } from "lucide-react";
import ModalMonthPicker from "./ModalMonthPicker";

interface MargenBrutoModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id a enviar, o null en los modos que no lo mandan. */
  companyId: number | null;
  defaultMes: string;
}

// Modal "Margen bruto": tabs por vendedor / por producto / detalle semanal,
// con drill-down a un vendedor en la semanal. Autocontenido. Extraído de
// StoplightReport.tsx (audit #23).
export default function MargenBrutoModal({ isOpen, onClose, apiPrefix, companyId, defaultMes }: MargenBrutoModalProps) {
  const t = useTranslations("stoplight");
  const locale = useLocale();

  const [mes, setMes] = useState(defaultMes);
  const [tab, setTab] = useState<"vendedor" | "producto" | "semanal">("vendedor");
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
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
        const params = new URLSearchParams({ mes });
        if (companyId != null) params.set("company_id", String(companyId));
        const res = await fetch(`${apiPrefix}/margen-detail?${params.toString()}`);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching margen detail:", e);
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
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{t("margen_bruto_title")}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {t("margen_bruto_subtitle", { mes: data?.mes || mes })}
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
          {(["vendedor", "producto", "semanal"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => { setTab(tb); setSelectedSeller(null); }}
              className={`pb-3 text-sm font-medium capitalize transition-colors ${
                tab === tb ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tb === "vendedor" ? t("tab_por_vendedor") : tb === "producto" ? t("tab_por_producto") : t("tab_detalle_semanal")}
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
                <div className="space-y-4">
                  {/* Summary cards */}
                  {(() => {
                    const totalRevenue = data.sellers.reduce((sum: number, s: any) => sum + s.revenue, 0);
                    const totalCosto = data.sellers.reduce((sum: number, s: any) => sum + s.costo, 0);
                    const totalGanancia = totalRevenue - totalCosto;
                    const margenPromedio = data.sellers.length > 0
                      ? Math.round(data.sellers.reduce((sum: number, s: any) => sum + s.margenMensual, 0) / data.sellers.length)
                      : 0;
                    return (
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-purple-50 rounded-xl p-4">
                          <p className="text-xs text-purple-600 font-medium">{t("revenue_total")}</p>
                          <p className="text-2xl font-bold text-purple-700">
                            ${totalRevenue.toLocaleString(locale, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-4">
                          <p className="text-xs text-red-600 font-medium">{t("costo_total")}</p>
                          <p className="text-2xl font-bold text-red-700">
                            ${totalCosto.toLocaleString(locale, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <p className="text-xs text-green-600 font-medium">{t("ganancia_total")}</p>
                          <p className={`text-2xl font-bold ${totalGanancia >= 0 ? "text-green-700" : "text-red-700"}`}>
                            ${totalGanancia.toLocaleString(locale, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-indigo-50 rounded-xl p-4">
                          <p className="text-xs text-indigo-600 font-medium">{t("margen_promedio")}</p>
                          <p className="text-2xl font-bold text-indigo-700">{margenPromedio}%</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Seller table */}
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("vendedor")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("revenue")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("costo")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("ganancia")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("margen_pct")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sellers.map((seller: any) => {
                          const ganancia = seller.revenue - seller.costo;
                          const cumple = seller.margenMensual >= 15;
                          return (
                            <tr
                              key={seller.nombre}
                              className="border-b hover:bg-purple-50/40 transition-colors cursor-pointer"
                              onClick={() => setSelectedSeller(seller)}
                            >
                              <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                              <td className="p-3 text-center">${seller.revenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-center text-red-600">${seller.costo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                              <td className={`p-3 text-center font-bold ${ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>
                                ${ganancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`font-bold ${seller.margenMensual >= 15 ? "text-green-600" : seller.margenMensual >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                                  {seller.margenMensual}%
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

              {/* POR PRODUCTO Tab */}
              {tab === "producto" && (
                <div className="space-y-4">
                  {/* Summary cards */}
                  {(() => {
                    const totalRevenue = data.products.reduce((sum: number, p: any) => sum + p.revenue, 0);
                    const totalCosto = data.products.reduce((sum: number, p: any) => sum + p.costo, 0);
                    const totalGanancia = totalRevenue - totalCosto;
                    const totalProductos = data.products.length;
                    return (
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-purple-50 rounded-xl p-4">
                          <p className="text-xs text-purple-600 font-medium">{t("revenue_total")}</p>
                          <p className="text-2xl font-bold text-purple-700">
                            ${totalRevenue.toLocaleString(locale, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-4">
                          <p className="text-xs text-red-600 font-medium">{t("costo_total")}</p>
                          <p className="text-2xl font-bold text-red-700">
                            ${totalCosto.toLocaleString(locale, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <p className="text-xs text-green-600 font-medium">{t("ganancia_total")}</p>
                          <p className={`text-2xl font-bold ${totalGanancia >= 0 ? "text-green-700" : "text-red-700"}`}>
                            ${totalGanancia.toLocaleString(locale, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-600 font-medium">{t("total_productos")}</p>
                          <p className="text-2xl font-bold text-slate-700">{totalProductos}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Product table */}
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("producto")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("cant_vendida")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("revenue")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("costo")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("ganancia")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("margen_pct")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.products.map((product: any) => (
                          <tr key={product.productId} className="border-b hover:bg-purple-50/40 transition-colors">
                            <td className="p-3 font-medium text-slate-800 max-w-[300px] truncate" title={product.nombre}>
                              {product.nombre}
                            </td>
                            <td className="p-3 text-center">{product.cantidadVendida}</td>
                            <td className="p-3 text-center">${product.revenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-center text-red-600">${product.costo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            <td className={`p-3 text-center font-bold ${product.ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>
                              ${product.ganancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-bold ${product.margen >= 15 ? "text-green-600" : product.margen >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                                {product.margen}%
                              </span>
                            </td>
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
                  {!selectedSeller ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500 mb-3">{t("selecciona_vendedor_margen")}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {data.sellers.map((seller: any) => (
                          <button
                            key={seller.nombre}
                            onClick={() => setSelectedSeller(seller)}
                            className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="font-medium text-slate-800">{seller.nombre}</span>
                            <span className={`text-sm font-bold ${seller.margenMensual >= 15 ? "text-green-600" : "text-red-600"}`}>
                              {seller.margenMensual}%
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
                        <span className={`text-sm font-bold ${selectedSeller.margenMensual >= 15 ? "text-green-600" : "text-red-600"}`}>
                          {selectedSeller.margenMensual}%
                        </span>
                      </div>
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">{t("semana")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("revenue")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("costo")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("ganancia")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("margen_pct")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSeller.semanas.map((sem: any) => {
                              const ganancia = sem.revenue - sem.costo;
                              return (
                                <tr key={sem.numero} className={`border-b ${sem.margen != null && sem.margen >= 15 ? "bg-green-50/30" : ""}`}>
                                <td className="p-3 font-medium">{t("semana_numero", { num: sem.numero })}</td>
                                  <td className="p-3 text-center">${sem.revenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                  <td className="p-3 text-center text-red-600">${sem.costo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                  <td className={`p-3 text-center font-medium ${ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    ${ganancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-3 text-center">
                                    {sem.margen != null ? (
                                      <span className={`font-bold ${sem.margen >= 15 ? "text-green-600" : sem.margen >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                                        {sem.margen}%
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center">
                                    {sem.margen != null ? (
                                      sem.margen >= 15 ? (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                          <Check size={12} /> {t("ok")}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                          <X size={12} /> {t("bajo")}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-slate-400">-</span>
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
