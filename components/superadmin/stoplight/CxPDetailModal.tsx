"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, RefreshCw } from "lucide-react";

interface CxPDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpiId: string;
  companyId: number;
  apiPrefix: string;
  empresaLabel: string;
  mes: string;
}

const EMPRESA_MAP: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };

// Modal de detalle de un KPI de Cuentas por Pagar (pagos a tiempo, vencidas,
// procesamiento oportuno, DPO): tarjetas de resumen + tabla de facturas de
// proveedor. Se fetchea solo al abrir. Extraído de StoplightReport.tsx (audit #23).
export default function CxPDetailModal({ isOpen, onClose, kpiId, companyId, apiPrefix, empresaLabel, mes }: CxPDetailModalProps) {
  const t = useTranslations("stoplight");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [pagosFilter, setPagosFilter] = useState<"all" | "pagado" | "no_pagado">("all");

  useEffect(() => {
    if (!isOpen || !kpiId) return;
    let cancelled = false;
    setData(null);
    setPagosFilter("all");
    setLoading(true);
    (async () => {
      try {
        const empresa = EMPRESA_MAP[companyId] || "valencia";
        const url = `${apiPrefix}/cuentas-pagar/detail?empresa=${empresa}&kpi_id=${kpiId}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching CPP detail:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, kpiId, companyId, apiPrefix]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
              {kpiId === "pagos_a_tiempo" ? t("cpp_pagos_title")
                : kpiId === "cuentas_pagar_vencidas" ? t("cpp_cxpagar_title")
                : kpiId === "procesamiento_oportuno" ? t("cpp_procesamiento_title")
                : t("cpp_dpo_title")}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {empresaLabel} | {mes}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors"
          >
            <X size={20} className="text-slate-700" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <RefreshCw size={24} className="animate-spin mr-2" /> {t("loading_detail")}
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center py-20 text-slate-400">{t("no_available_data")}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {kpiId === "pagos_a_tiempo" && (
                  <>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("total_facturas")}</p>
                      <p className="text-lg font-bold text-slate-800">{data.count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("monto_residual")}</p>
                      <p className="text-lg font-bold text-slate-800">${data.totalResidual?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="col-span-2 flex gap-2">
                      {(["all", "pagado", "no_pagado"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setPagosFilter(f)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            pagosFilter === f
                              ? f === "pagado" ? "bg-emerald-500 text-white" : f === "no_pagado" ? "bg-red-500 text-white" : "bg-slate-700 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {f === "all" ? t("todos") : f === "pagado" ? t("pagado") : t("no_pagado")}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {kpiId === "cuentas_pagar_vencidas" && (
                  <>
                    <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-medium">{t("facturas_con_saldo")}</p>
                      <p className="text-lg font-bold text-slate-800">{data.count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("monto_vencido")}</p>
                      <p className="text-lg font-bold text-red-600">${data.totalResidual?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                    </div>
                    {data.agingBuckets && (
                      <div className="col-span-2 grid grid-cols-6 gap-2">
                        {Object.entries(data.agingBuckets).map(([band, info]: [string, any]) => (
                          <div key={band} className={`rounded-lg p-2 text-center ${band === "corriente" ? "bg-emerald-50" : band === "91+" ? "bg-red-50" : "bg-amber-50"}`}>
                            <p className="text-[10px] font-medium text-slate-500">{band === "corriente" ? t("corriente") : band}</p>
                            <p className="text-sm font-bold text-slate-800">${info.amount?.toLocaleString("es-VE", { maximumFractionDigits: 0 })}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {kpiId === "procesamiento_oportuno" && (
                  <>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("facturas_recibidas")}</p>
                      <p className="text-lg font-bold text-slate-800">{data.count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("monto_total")}</p>
                      <p className="text-lg font-bold text-slate-800">${data.totalAmount?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </>
                )}
                {kpiId === "dpo" && (
                  <>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("cxp_abierta")}</p>
                      <p className="text-lg font-bold text-slate-800">${data.totalResidual?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("compras_credito")}</p>
                      <p className="text-lg font-bold text-slate-800">${data.totalAmount?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="p-3 text-left font-medium text-slate-600">{t("factura")}</th>
                      <th className="p-3 text-left font-medium text-slate-600">{t("proveedor")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("fecha_factura")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("vencimiento")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                      {kpiId === "procesamiento_oportuno" ? (
                        <>
                          <th className="p-3 text-center font-medium text-slate-600">{t("dias_proc")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("sla")}</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3 text-center font-medium text-slate-600">{t("dias_vencido")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("banda_aging")}</th>
                        </>
                      )}
                      <th className="p-3 text-right font-medium text-slate-600">{t("monto")}</th>
                      <th className="p-3 text-right font-medium text-slate-600">{t("saldo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kpiId === "pagos_a_tiempo"
                      ? data.bills.filter((b: any) => {
                          const isPaid = b.paymentState === "paid" || b.paymentState === "reconciled" || b.paymentState === "in_payment";
                          if (pagosFilter === "pagado") return isPaid;
                          if (pagosFilter === "no_pagado") return !isPaid;
                          return true;
                        })
                      : data.bills
                    ).map((bill: any) => (
                      <tr key={bill.id} className="border-b hover:bg-blue-50/40 transition-colors">
                        <td className="p-3 font-medium text-slate-800">{bill.name}</td>
                        <td className="p-3 text-slate-700 max-w-[200px] truncate">{bill.partnerName}</td>
                        <td className="p-3 text-center text-slate-600">{bill.invoiceDate || "—"}</td>
                        <td className="p-3 text-center text-slate-600">{bill.invoiceDateDue || "—"}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            bill.paymentState === "paid" || bill.paymentState === "reconciled" || bill.paymentState === "in_payment" ? "bg-emerald-100 text-emerald-700" :
                            bill.paymentState === "partial" ? "bg-amber-100 text-indigo-700" :
                            bill.paymentState === "nota_credito" || bill.isRefund ? "bg-purple-100 text-purple-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {bill.paymentState === "paid" || bill.paymentState === "reconciled" ? t("pagada") :
                             bill.paymentState === "in_payment" ? t("en_pago") :
                             bill.paymentState === "partial" ? t("parcial") :
                             bill.paymentState === "nota_credito" || bill.isRefund ? t("nc_redito") : t("pendiente")}
                          </span>
                        </td>
                        {kpiId === "procesamiento_oportuno" ? (
                          <>
                            <td className="p-3 text-center font-medium text-slate-700">{bill.processingDays ?? "—"}</td>
                            <td className="p-3 text-center">
                              {bill.slaOk === null ? <span className="text-slate-400">—</span> : (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bill.slaOk ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                  {bill.slaOk ? `≤${bill.sla}d ✓` : `>${bill.sla}d ✗`}
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 text-center">
                              <span className={`font-medium ${
                                bill.daysOverdue > 60 ? "text-red-600" : bill.daysOverdue > 30 ? "text-indigo-600" : bill.daysOverdue > 0 ? "text-orange-500" : "text-emerald-600"
                              }`}>
                                {bill.daysOverdue > 0 ? bill.daysOverdue : "—"}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                bill.agingBand === "corriente" ? "bg-emerald-100 text-emerald-700" :
                                bill.agingBand === "91+" ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-indigo-700"
                              }`}>
                                {bill.agingBand === "corriente" ? t("corriente") : bill.agingBand}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="p-3 text-right text-slate-600">${bill.amountUntaxed.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-right font-bold">
                          <span className={bill.amountResidual > 0 ? "text-red-600" : "text-emerald-600"}>
                            ${bill.amountResidual.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
