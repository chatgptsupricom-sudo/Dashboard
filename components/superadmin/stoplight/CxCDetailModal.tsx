"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, ArrowLeft, RefreshCw } from "lucide-react";

interface CxCDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpiId: string;
  companyId: number;
  empresaLabel: string;
  mes: string;
}

const EMPRESA_MAP: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };

// Modal de detalle de un KPI de Cuentas por Cobrar: lista de facturas con saldo
// y, al hacer clic en una, el detalle de líneas. Se fetchea solo al abrir.
// Extraído de StoplightReport.tsx (audit #23).
export default function CxCDetailModal({ isOpen, onClose, kpiId, companyId, empresaLabel, mes }: CxCDetailModalProps) {
  const t = useTranslations("stoplight");
  const locale = useLocale();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !kpiId) return;
    let cancelled = false;
    setSelectedInvoice(null);
    setInvoiceDetail(null);
    setData(null);
    setLoading(true);
    (async () => {
      try {
        const empresa = EMPRESA_MAP[companyId] || "valencia";
        let url = `/api/superadmin/cuentas-por-cobrar/detail?empresa=${empresa}`;
        if (kpiId === "cartera_vencida") {
          url += `&aging_band=${encodeURIComponent("1-30")}`;
        }
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching CxC detail:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, kpiId, companyId]);

  const openInvoiceDetail = async (inv: any) => {
    setSelectedInvoice(inv);
    setInvoiceLoading(true);
    try {
      const res = await fetch(`/api/superadmin/stoplight/invoice-detail?invoice_id=${inv.id}&company_id=${inv.companyId}`);
      const json = await res.json();
      if (json.success) setInvoiceDetail(json.data);
    } catch (e) {
      console.error("Error fetching invoice detail:", e);
    }
    setInvoiceLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            {selectedInvoice && (
              <button
                onClick={() => { setSelectedInvoice(null); setInvoiceDetail(null); }}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft size={16} /> {t("back")}
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                {selectedInvoice
                  ? `${selectedInvoice.name} — ${selectedInvoice.partnerName}`
                  : kpiId === "efectividad_cobranza" ? t("cxc_efectividad_title")
                  : kpiId === "cartera_vencida" ? t("cxc_cartera_title")
                  : kpiId === "recuperacion_vencidos" ? t("cxc_recuperacion_title")
                  : t("cxc_dso_title")}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {selectedInvoice
                  ? `${t("factura")} ${selectedInvoice.invoiceDate || ""} — ${selectedInvoice.companyName}`
                  : t("facturas_saldo", { empresa: empresaLabel, mes })}
              </p>
            </div>
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
          ) : selectedInvoice ? (
            <>
              {invoiceLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  <RefreshCw size={24} className="animate-spin mr-2" /> {t("loading_detail")}
                </div>
              ) : !invoiceDetail ? (
                <div className="flex items-center justify-center py-20 text-slate-400">{t("error_loading")}</div>
              ) : (
                <>
                  {invoiceDetail.lines.some((l: any) => l.productName.includes("SAL_INI") || l.productName.includes("Saldo Inicial")) && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                      <strong>{t("saldo_inicial")}</strong> {t("saldo_inicial_desc")}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("subtotal")}</p>
                      <p className="text-lg font-bold text-slate-800">${invoiceDetail.subtotal.toLocaleString(locale, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("impuestos")}</p>
                      <p className="text-lg font-bold text-slate-800">${invoiceDetail.tax.toLocaleString(locale, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className={`rounded-xl p-4 ${invoiceDetail.moveType === "Nota de credito" ? "bg-red-50" : "bg-green-50"}`}>
                      <p className={`text-xs font-medium ${invoiceDetail.moveType === "Nota de credito" ? "text-red-600" : "text-green-600"}`}>{t("total")}</p>
                      <p className={`text-lg font-bold ${invoiceDetail.moveType === "Nota de credito" ? "text-red-700" : "text-green-700"}`}>
                        ${Math.abs(invoiceDetail.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("producto")}</th>
                          <th className="p-3 text-right font-medium text-slate-600">{t("cantidad")}</th>
                          <th className="p-3 text-right font-medium text-slate-600">{t("p_unitario")}</th>
                          <th className="p-3 text-right font-medium text-slate-600">{t("subtotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceDetail.lines.map((line: any, idx: number) => {
                          const isSaldoInicial = line.productName.includes("SAL_INI") || line.productName.includes("Saldo Inicial");
                          return (
                            <tr key={idx} className={`border-b hover:bg-blue-50/40 transition-colors ${isSaldoInicial ? "bg-amber-50/30" : ""}`}>
                              <td className="p-3 font-medium text-slate-800">
                                {line.productName}
                                {isSaldoInicial && (
                                  <span className="ml-2 inline-block px-1.5 py-0.5 bg-amber-100 text-indigo-700 rounded text-[10px] font-medium">
                                     {t("saldo_migracion")}
                                  </span>
                                )}
                              </td>
                            <td className="p-3 text-right text-slate-600">{line.quantity}</td>
                            <td className="p-3 text-right text-slate-600">${line.priceUnit.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right font-medium text-slate-800">${line.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50">
                          <td colSpan={3} className="p-3 text-right font-medium text-slate-600">{t("subtotal")}</td>
                          <td className="p-3 text-right font-bold">${invoiceDetail.subtotal.toLocaleString(locale, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td colSpan={3} className="p-3 text-right font-medium text-slate-600">{t("impuestos")}</td>
                          <td className="p-3 text-right font-bold">${invoiceDetail.tax.toLocaleString(locale, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className={`border-t-2 ${invoiceDetail.moveType === "Nota de credito" ? "bg-red-50" : "bg-green-50"}`}>
                          <td colSpan={3} className="p-3 text-right font-bold text-slate-700">{t("total")}</td>
                          <td className={`p-3 text-right font-bold text-lg ${invoiceDetail.moveType === "Nota de credito" ? "text-red-700" : "text-green-700"}`}>
                            ${Math.abs(invoiceDetail.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-medium">{t("total_cartera")}</p>
                  <p className="text-lg font-bold text-slate-800">${data.total.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("facturas_con_saldo")}</p>
                  <p className="text-lg font-bold text-slate-800">{data.count}</p>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="p-3 text-left font-medium text-slate-600">{t("factura")}</th>
                      <th className="p-3 text-left font-medium text-slate-600">{t("cliente")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("sede")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("fecha_factura")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("vencimiento")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                      <th className="p-3 text-center font-medium text-slate-600">{t("dias_vencido")}</th>
                      <th className="p-3 text-right font-medium text-slate-600">{t("monto")}</th>
                      <th className="p-3 text-right font-medium text-slate-600">{t("saldo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv: any) => (
                      <tr
                        key={inv.id}
                        className="border-b hover:bg-blue-50/40 transition-colors cursor-pointer"
                        onClick={() => openInvoiceDetail(inv)}
                      >
                        <td className="p-3 font-medium text-slate-800">{inv.name}</td>
                        <td className="p-3 text-slate-700 max-w-[200px] truncate">{inv.partnerName}</td>
                        <td className="p-3 text-center text-slate-600">{inv.companyName}</td>
                        <td className="p-3 text-center text-slate-600">{inv.invoiceDate || "—"}</td>
                        <td className="p-3 text-center text-slate-600">{inv.invoiceDateDue || "—"}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            inv.paymentState === "paid" || inv.paymentState === "reconciled" || inv.paymentState === "in_payment" ? "bg-emerald-100 text-emerald-700" :
                            inv.paymentState === "partial" ? "bg-amber-100 text-indigo-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {inv.paymentState === "paid" || inv.paymentState === "reconciled" ? t("pagada") :
                             inv.paymentState === "in_payment" ? t("en_pago") :
                             inv.paymentState === "partial" ? t("parcial") : t("pendiente")}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-medium ${
                            inv.agingDays > 60 ? "text-red-600" : inv.agingDays > 30 ? "text-indigo-600" : inv.agingDays > 0 ? "text-orange-500" : "text-emerald-600"
                          }`}>
                            {inv.agingDays > 0 ? inv.agingDays : "—"}
                          </span>
                        </td>
                        <td className="p-3 text-right text-slate-600">${Math.abs(inv.amountUntaxed).toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-right font-bold">
                          <span className={inv.amountResidual > 0 ? "text-red-600" : "text-emerald-600"}>
                            ${Math.abs(inv.amountResidual).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
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
