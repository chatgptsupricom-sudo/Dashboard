"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, Check, ArrowLeft } from "lucide-react";
import ModalMonthPicker from "./ModalMonthPicker";

interface ClientesNuevosModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id a enviar, o null en los modos que no lo mandan. */
  companyId: number | null;
  defaultMes: string;
}

// Modal "Clientes nuevos": resumen y semanal por vendedor, con drill-down
// vendedor → cliente → factura → líneas. Autocontenido. Extraído de
// StoplightReport.tsx (audit #23). Todo — listado y drill-down — respeta el
// selector de mes del modal (issue #132).
export default function ClientesNuevosModal({ isOpen, onClose, apiPrefix, companyId, defaultMes }: ClientesNuevosModalProps) {
  const t = useTranslations("stoplight");
  const locale = useLocale();

  const [mes, setMes] = useState(defaultMes);
  const [tab, setTab] = useState<"resumen" | "semanal">("resumen");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [sellerDetail, setSellerDetail] = useState<any>(null);
  const [sellerLoading, setSellerLoading] = useState(false);

  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const buildQuery = (extras: Record<string, string> = {}) => {
    const params = new URLSearchParams({ mes, ...extras });
    if (companyId != null) params.set("company_id", String(companyId));
    return params.toString();
  };

  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
      setTab("resumen");
      setSelectedSeller(null);
      setSelectedClient(null);
      setSellerDetail(null);
      setSelectedInvoice(null);
      setInvoiceDetail(null);
    }
  }, [isOpen, defaultMes]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setSelectedSeller(null);
    setSelectedClient(null);
    setSellerDetail(null);
    (async () => {
      try {
        const res = await fetch(`${apiPrefix}/clientes-nuevos-detail?${buildQuery()}`);
        const json = await res.json();
        if (!cancelled && json.success) setData(json.data);
      } catch (e) {
        console.error("Error fetching clientes nuevos detail:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mes, companyId, apiPrefix]);

  const openSellerDetail = async (seller: any) => {
    setSelectedSeller(seller);
    setSelectedClient(null);
    setSellerLoading(true);
    setSellerDetail(null);
    try {
      const res = await fetch(`${apiPrefix}/clientes-nuevos-seller-detail?${buildQuery({ seller_name: encodeURIComponent(seller.nombre) })}`);
      const json = await res.json();
      if (json.success) setSellerDetail(json.data);
    } catch (e) {
      console.error("Error fetching seller detail:", e);
    }
    setSellerLoading(false);
  };

  const openInvoiceDetail = async (invoice: any) => {
    setSelectedInvoice(invoice);
    setInvoiceLoading(true);
    setInvoiceDetail(null);
    try {
      const res = await fetch(`${apiPrefix}/invoice-detail?${buildQuery({ invoice_id: String(invoice.id) })}`);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            {(selectedInvoice || selectedClient || selectedSeller) && (
              <button
                onClick={() => {
                  if (selectedInvoice) {
                    setSelectedInvoice(null);
                    setInvoiceDetail(null);
                  } else if (selectedClient) {
                    setSelectedClient(null);
                  } else if (selectedSeller) {
                    setSelectedSeller(null);
                    setSellerDetail(null);
                  }
                }}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft size={16} /> {t("back")}
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                {selectedInvoice
                  ? `${selectedInvoice.type === "Nota de credito" ? t("nota_credito_label") : t("factura")} ${selectedInvoice.reference}`
                  : selectedSeller
                    ? selectedClient
                      ? t("facturas_de", { cliente: selectedClient.partnerName })
                      : t("clientes_nuevos_titulo", { vendedor: selectedSeller.nombre })
                    : t("clientes_nuevos_title")}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {selectedInvoice
                  ? `${selectedInvoice.date} | ${t("total")}: $${Math.abs(selectedInvoice.amount || 0).toLocaleString(locale, { minimumFractionDigits: 2 })}`
                  : selectedSeller
                    ? selectedClient
                      ? `${mes} | ${t("total")}: $${(selectedClient.totalFacturado || 0).toLocaleString(locale, { minimumFractionDigits: 2 })}`
                      : `${mes} | ${t("clientes_nuevos_col")}: ${sellerDetail?.totalNuevos || 0}`
                    : t("clientes_nuevos_subtitle", { mes: data?.mes || mes, meta: data?.metaPerSeller || 0 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!selectedInvoice && !selectedClient && !selectedSeller && (
              <ModalMonthPicker value={mes} onChange={setMes} />
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Tabs - only show when not in drill-down */}
        {!selectedSeller && (
          <div className="flex gap-4 px-5 pt-4 border-b">
            {(["resumen", "semanal"] as const).map((tb) => (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={`pb-3 text-sm font-medium capitalize transition-colors ${
                  tab === tb ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tb === "resumen" ? t("tab_resumen_vendedores") : t("tab_detalle_semanal_vendedor")}
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumb when drill-down */}
        {selectedSeller && (
          <div className="flex gap-2 px-5 pt-3 text-xs text-slate-500">
            <button onClick={() => { setSelectedSeller(null); setSelectedClient(null); setSelectedInvoice(null); setInvoiceDetail(null); setSellerDetail(null); }} className="hover:text-indigo-600 transition-colors">
              {t("resumen")}
            </button>
            <span>/</span>
            <button onClick={() => { setSelectedClient(null); setSelectedInvoice(null); setInvoiceDetail(null); }} className="hover:text-indigo-600 transition-colors">
              {selectedSeller.nombre}
            </button>
            {selectedClient && (
              <>
                <span>/</span>
                <button onClick={() => { setSelectedInvoice(null); setInvoiceDetail(null); }} className="hover:text-indigo-600 transition-colors">
                  {selectedClient.partnerName}
                </button>
              </>
            )}
            {selectedInvoice && (
              <>
                <span>/</span>
                <span className="text-slate-800 font-medium">{selectedInvoice.reference}</span>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">{t("loading")}</div>
          ) : !data ? (
            <div className="flex items-center justify-center py-20 text-slate-400">{t("no_available_data")}</div>
          ) : (
            <>
              {/* RESUMEN TAB */}
              {tab === "resumen" && !selectedSeller && (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <p className="text-xs text-emerald-600 font-medium">{t("total_clientes_nuevos")}</p>
                      <p className="text-2xl font-bold text-emerald-700">{data.totalNuevos}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">{t("vendedores")}</p>
                      <p className="text-2xl font-bold text-slate-900">{data.numSellers}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-4">
                      <p className="text-xs text-indigo-600 font-medium">{t("meta_por_vendedor")}</p>
                      <p className="text-2xl font-bold text-indigo-700">{data.metaPerSeller}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-600 font-medium">{t("promedio_por_vendedor")}</p>
                      <p className="text-2xl font-bold text-slate-700">
                        {data.numSellers > 0
                          ? Math.round((data.totalNuevos / data.numSellers) * 10) / 10
                          : 0}
                      </p>
                    </div>
                  </div>

                  {/* Seller table */}
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("vendedor")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("clientes_nuevos_col")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("meta")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("porcentaje")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("estado")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sellers.map((seller: any) => {
                          const meta = data.metaPerSeller || 0;
                          const pct = meta > 0 ? Math.round((seller.nuevosMes / meta) * 100) : 0;
                          const cumple = pct >= 100;
                          return (
                            <tr
                              key={seller.sellerId}
                              className="border-b hover:bg-blue-50/40 transition-colors cursor-pointer"
                              onClick={() => openSellerDetail(seller)}
                            >
                              <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                              <td className="p-3 text-center font-bold text-lg">{seller.nuevosMes}</td>
                              <td className="p-3 text-center text-slate-600">{meta}</td>
                              <td className="p-3 text-center">
                                <span className={`font-bold ${pct >= 100 ? "text-green-600" : pct >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                  {meta > 0 ? `${pct}%` : "-"}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {meta > 0 ? (
                                   cumple ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                      <Check size={12} /> {t("cumple")}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                      <X size={12} /> {t("no_cumple")}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs text-slate-400">{t("sin_meta")}</span>
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

              {/* SEMANAL TAB */}
              {tab === "semanal" && !selectedSeller && (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("vendedor")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("total")}</th>
                        {data.weekHeaders?.map((_: string, i: number) => (
                          <th key={i} className="p-3 text-center font-medium text-slate-600">{t("sem")} {i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sellers.map((seller: any) => (
                        <tr key={seller.sellerId} className="border-b hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                          <td className="p-3 text-center font-bold">{seller.nuevosMes}</td>
                          {seller.semanas.map((sem: any, i: number) => (
                            <td key={i} className="p-3 text-center">
                              <div className="flex flex-col items-center">
                                <span className={`font-medium ${sem.porcentaje >= 100 ? "text-green-600" : sem.porcentaje >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                  {sem.nuevos} / {sem.meta}
                                </span>
                                <span className={`text-xs ${sem.porcentaje >= 100 ? "text-green-500" : "text-red-500"}`}>
                                  {sem.meta > 0 ? `${sem.porcentaje}%` : "-"}
                                </span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SELLER DRILL-DOWN: List of new clients */}
              {selectedSeller && !selectedClient && (
                <div className="space-y-4">
                  {sellerLoading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">{t("cargando_clientes")}</div>
                  ) : !sellerDetail || sellerDetail.clients.length === 0 ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">{t("no_clientes_vendedor")}</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-medium text-slate-600">{t("clientes_nuevos_de", { vendedor: selectedSeller.nombre })}:</span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{sellerDetail.totalNuevos}</span>
                      </div>
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">{t("cliente")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("facturado")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("facturas")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("accion")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sellerDetail.clients.map((client: any) => (
                              <tr key={client.partnerId} className="border-b hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => setSelectedClient(client)}>
                                <td className="p-3 font-medium text-slate-800">{client.partnerName}</td>
                                <td className="p-3 text-center font-bold">${client.totalFacturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center text-slate-600">{client.invoices.length}</td>
                                <td className="p-3 text-center">
                                  <span className="text-xs text-blue-600 underline">{t("ver_facturas")}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CLIENT DRILL-DOWN: Invoice list */}
              {selectedClient && !selectedInvoice && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-medium text-slate-600">{t("facturas_de", { cliente: selectedClient.partnerName })}:</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">
                      Total: ${selectedClient.totalFacturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("referencia")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("fecha")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("tipo")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("monto")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClient.invoices.map((inv: any) => (
                          <tr
                            key={inv.id}
                            className={`border-b hover:bg-blue-50/40 transition-colors cursor-pointer ${inv.type === "Nota de credito" ? "bg-red-50/30" : ""}`}
                            onClick={() => openInvoiceDetail(inv)}
                          >
                            <td className="p-3 font-medium text-slate-800">{inv.reference}</td>
                            <td className="p-3 text-center text-slate-600">{inv.date}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                inv.type === "Nota de credito" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                              }`}>
                                {inv.type === "Nota de credito" ? <X size={10} /> : <Check size={10} />}
                                {inv.type}
                              </span>
                            </td>
                            <td className={`p-3 text-center font-bold ${inv.amount >= 0 ? "text-slate-800" : "text-red-600"}`}>
                              ${Math.abs(inv.amount).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* INVOICE DETAIL: Products */}
              {selectedInvoice && (
                <div className="space-y-4">
                  {invoiceLoading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">{t("loading_detail")}</div>
                  ) : !invoiceDetail ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">{t("error_loading")}</div>
                  ) : (
                    <>
                      {/* Invoice summary */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
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

                      {/* Products table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">{t("producto")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("cantidad")}</th>
                              <th className="p-3 text-center font-medium text-slate-600">{t("precio_unitario")}</th>
                              <th className="p-3 text-right font-medium text-slate-600">{t("subtotal")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoiceDetail.lines.map((line: any, idx: number) => (
                              <tr key={idx} className="border-b hover:bg-slate-50/50 transition-colors">
                                <td className="p-3">
                                  <div className="font-medium text-slate-800">{line.productName}</div>
                                  {line.description && line.description !== line.productName && (
                                    <div className="text-xs text-slate-500 mt-0.5">{line.description}</div>
                                  )}
                                </td>
                                <td className="p-3 text-center">{line.quantity}</td>
                                <td className="p-3 text-center">${line.priceUnit.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-right font-bold">${line.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                            {invoiceDetail.lines.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-slate-400">{t("sin_lineas")}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 border-t-2">
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
                                ${Math.abs(invoiceDetail.total).toLocaleString(locale, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
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
