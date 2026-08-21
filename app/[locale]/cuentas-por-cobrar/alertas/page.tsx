"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Package,
  RefreshCw,
  Search,
  Target,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth.store";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatDDMMYYYY(dateStr: string | null) {
  if (!dateStr) return "—";
  const [d] = dateStr.split(" ");
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

function InvoiceDetailTrigger({ item, onRenderSub }: { item: any; onRenderSub?: (item: any) => React.ReactNode }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/invoice/${item.moveId || item.id}`);
      const json = await res.json();
      if (json.success) setDetail(json.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [item.id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div
          onClick={(e) => { e.preventDefault(); fetchDetail(); }}
          className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:border-blue-400 transition-all"
        >
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{item.name || item.partnerName || "—"}</span>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{item.partnerName}</span>
              <span>•</span>
              <span>{item.companyName}</span>
              {item.invoiceUserName && item.invoiceUserName !== "Sin asignar" && (
                <><span>•</span><span>{item.invoiceUserName}</span></>
              )}
            </div>
            {onRenderSub && onRenderSub(item)}
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className="text-sm font-bold text-slate-900">{formatCurrency(Math.abs(item.amountResidual))}</div>
            <div className="text-[10px] text-slate-400">{item.invoiceDateDue ? formatDDMMYYYY(item.invoiceDateDue) : ""}</div>
          </div>
          <ChevronRight size={16} className="text-slate-400 shrink-0 ml-2" />
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Factura {detail?.name || item.name || ""}</DialogTitle>
          <DialogDescription className="sr-only">Detalle completo de factura</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[78vh] pr-2 space-y-5 mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <RefreshCw size={28} className="animate-spin text-blue-500 mx-auto mb-3" />
                <span className="text-slate-400 text-sm">Cargando documento...</span>
              </div>
            </div>
          ) : !detail ? (
            <div className="text-center py-16 text-slate-400">Error al cargar</div>
          ) : (
            <>
              {/* STATUS BANNER */}
              <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${
                detail.paymentState === "paid" ? "bg-emerald-50 border-emerald-200"
                  : detail.paymentState === "partial" ? "bg-amber-50 border-amber-200"
                    : detail.amountResidual > 0 && detail.invoiceDateDue && new Date(detail.invoiceDateDue) < new Date() ? "bg-red-50 border-red-200"
                      : "bg-blue-50 border-blue-200"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${detail.paymentState === "paid" ? "bg-emerald-500" : detail.paymentState === "partial" ? "bg-amber-500" : "bg-red-500"}`} />
                  <span className="text-sm font-bold text-slate-800">
                    {detail.paymentState === "paid" ? "Factura Pagada" : detail.paymentState === "partial" ? "Pago Parcial" : "Pendiente de Pago"}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  {detail.moveType === "out_refund" ? "Nota de Crédito" : "Factura de Venta"}
                </span>
              </div>

              {/* PAYMENT PROGRESS */}
              {detail.amountTotal > 0 && (
                <div className="bg-white border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progreso de Pago</span>
                    <span className="text-xs font-bold text-slate-700">{Math.round((detail.amountPaid / detail.amountTotal) * 100)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${detail.paymentState === "paid" ? "bg-emerald-500" : detail.paymentState === "partial" ? "bg-amber-500" : "bg-blue-500"}`}
                      style={{ width: `${Math.min((detail.amountPaid / detail.amountTotal) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium">
                    <span>Pagado: {formatCurrency(detail.amountPaid)}</span>
                    <span>Pendiente: {formatCurrency(detail.amountResidual)}</span>
                  </div>
                </div>
              )}

              {/* INFO GRID */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cliente</span>
                  <p className="text-sm font-bold text-slate-800 leading-tight">{detail.partnerName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sede</span>
                  <p className="text-sm font-bold text-slate-800">{detail.companyName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vendedor</span>
                  <p className="text-sm font-medium text-slate-700">{detail.invoiceUserName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Moneda</span>
                  <p className="text-sm font-medium text-slate-700">{detail.currencyName || "USD"}</p>
                </div>
              </div>

              {/* DATES ROW */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Calendar size={14} className="text-blue-600" /></div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Emisión</span>
                    <p className="text-xs font-bold text-slate-800">{formatDate(detail.invoiceDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${detail.invoiceDateDue && new Date(detail.invoiceDateDue) < new Date() && detail.amountResidual > 0 ? "bg-red-50" : "bg-amber-50"}`}>
                    <Clock size={14} className={detail.invoiceDateDue && new Date(detail.invoiceDateDue) < new Date() && detail.amountResidual > 0 ? "text-red-600" : "text-amber-600"} />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Vencimiento</span>
                    <p className={`text-xs font-bold ${detail.invoiceDateDue && new Date(detail.invoiceDateDue) < new Date() && detail.amountResidual > 0 ? "text-red-600" : "text-slate-800"}`}>{formatDate(detail.invoiceDateDue)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0"><FileText size={14} className="text-purple-600" /></div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Diario</span>
                    <p className="text-xs font-medium text-slate-700">{detail.journalName || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><Target size={14} className="text-slate-500" /></div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Ref. Pago</span>
                    <p className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{detail.paymentReference || "—"}</p>
                  </div>
                </div>
              </div>

              {/* TOTALS CARDS */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "Subtotal", value: detail.totals.subtotal, bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-100" },
                  { label: "Impuesto", value: detail.totals.tax, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100" },
                  { label: "Total", value: detail.totals.total, bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-100" },
                  { label: "Pagado", value: detail.totals.paid, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
                  { label: "Pendiente", value: detail.totals.residual, bg: "bg-red-50", text: "text-red-700", border: "border-red-100" },
                ].map((t) => (
                  <div key={t.label} className={`${t.bg} border ${t.border} rounded-xl p-3 text-center`}>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{t.label}</span>
                    <span className={`text-sm font-bold ${t.text}`}>{formatCurrency(t.value)}</span>
                  </div>
                ))}
              </div>

              {/* LINE ITEMS */}
              {detail.lines.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={14} className="text-slate-400" />
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle de Productos</h4>
                    <span className="text-[10px] text-slate-400 font-medium ml-auto">{detail.lines.length} ítems</span>
                  </div>
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/80">
                          <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">#</th>
                          <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cant.</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Precio Unit.</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Desc.</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line: any, idx: number) => (
                          <tr key={line.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                            <td className="py-2.5 px-4 text-slate-400 font-medium">{idx + 1}</td>
                            <td className="py-2.5 px-4">
                              <p className="font-semibold text-slate-800 text-xs">{line.productName || line.name}</p>
                              {line.productName && line.name !== line.productName && <p className="text-[10px] text-slate-400 mt-0.5">{line.name}</p>}
                            </td>
                            <td className="py-2.5 px-4 text-right font-medium text-slate-700">{line.quantity}</td>
                            <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceUnit)}</td>
                            <td className="py-2.5 px-4 text-right">
                              {line.discount > 0 ? <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded">{line.discount}%</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceSubtotal)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(line.priceTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50/80 border-t border-slate-200">
                          <td colSpan={5} className="py-2.5 px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</td>
                          <td colSpan={2} className="py-2.5 px-4 text-right font-bold text-slate-800 text-xs">{formatCurrency(detail.totals.subtotal)}</td>
                        </tr>
                        <tr className="bg-slate-50/80">
                          <td colSpan={5} className="py-2 px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest">Impuesto</td>
                          <td colSpan={2} className="py-2 px-4 text-right font-medium text-slate-600 text-xs">{formatCurrency(detail.totals.tax)}</td>
                        </tr>
                        <tr className="bg-blue-50/60 border-t border-blue-100">
                          <td colSpan={5} className="py-3 px-4 text-right text-[10px] font-bold text-blue-700 uppercase tracking-widest">Total</td>
                          <td colSpan={2} className="py-3 px-4 text-right font-black text-blue-900 text-sm">{formatCurrency(detail.totals.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* PAYMENT HISTORY */}
              {detail.payments && detail.payments.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign size={14} className="text-emerald-500" />
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historial de Pagos</h4>
                    <span className="text-[10px] text-slate-400 font-medium ml-auto">{detail.payments.length} movimientos</span>
                  </div>
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/80">
                          <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Referencia</th>
                          <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Débito</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Crédito</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo</th>
                          <th className="text-center py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Conciliado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((p: any) => (
                          <tr key={p.id} className="border-t border-slate-50 hover:bg-emerald-50/20 transition-colors">
                            <td className="py-2.5 px-4 font-medium text-slate-700">{p.name}</td>
                            <td className="py-2.5 px-4 text-slate-500">{formatDate(p.date)}</td>
                            <td className="py-2.5 px-4 text-right text-slate-600">{p.debit > 0 ? formatCurrency(p.debit) : "—"}</td>
                            <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">{p.credit > 0 ? formatCurrency(p.credit) : "—"}</td>
                            <td className="py-2.5 px-4 text-right font-medium text-slate-800">{formatCurrency(Math.abs(p.amount_residual || 0))}</td>
                            <td className="py-2.5 px-4 text-center">
                              {p.reconciled ? <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold leading-5 text-center">✓</span> : <span className="inline-block w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold leading-5 text-center">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* NOTES */}
              {(detail.invoiceOrigin || detail.narration) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {detail.invoiceOrigin && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Origen</span>
                      <p className="text-xs text-slate-700 leading-relaxed">{detail.invoiceOrigin}</p>
                    </div>
                  )}
                  {detail.narration && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Notas Internas</span>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{detail.narration.replace(/<[^>]*>/g, "")}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlertCard({
  title,
  icon,
  data,
  desc,
  gradient,
  severity = 0,
  onRenderSub,
}: {
  title: string;
  icon: React.ReactNode;
  data: any[];
  desc: string;
  gradient: string;
  severity?: number;
  onRenderSub?: (item: any) => React.ReactNode;
}) {
  const list = Array.isArray(data) ? data : [];
  const [searchQuery, setSearchQuery] = useState("");
  const severityLevel =
    severity > 10 ? "high" : severity > 3 ? "medium" : severity > 0 ? "low" : "none";
  const borderColor =
    severityLevel === "high"
      ? "border-l-red-500 border-t-red-200 border-r-red-200 border-b-red-200"
      : severityLevel === "medium"
        ? "border-l-amber-500 border-t-amber-200 border-r-amber-200 border-b-amber-200"
        : severityLevel === "low"
          ? "border-l-blue-500 border-t-blue-100 border-r-blue-100 border-b-blue-100"
          : "border-l-slate-300";

  const q = searchQuery.toLowerCase();
  const filteredList = q
    ? list.filter(
        (item: any) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.partnerName || "").toLowerCase().includes(q) ||
          (item.companyName || "").toLowerCase().includes(q) ||
          (item.invoiceUserName || "").toLowerCase().includes(q),
      )
    : list;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className={`group relative p-6 rounded-2xl border-2 ${borderColor} bg-gradient-to-br ${gradient} shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <div className="scale-150">{icon}</div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
              {icon}
            </div>
            <span
              className={`text-4xl font-extrabold tracking-tighter text-slate-900 ${
                severity > 0 ? "animate-pulse" : ""
              }`}
            >
              {list.length}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide uppercase">
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{desc}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center text-xs font-semibold text-slate-600 group-hover:translate-x-1 transition-transform">
              Ver detalle <ChevronRight size={14} className="ml-1" />
            </span>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Detalle de {title.toLowerCase()} que requieren atención.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 mt-4">
          {list.length > 3 && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por factura, cliente, empresa..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {filteredList.length > 0 ? (
            filteredList.map((item: any, i: number) => (
              <InvoiceDetailTrigger key={i} item={item} onRenderSub={onRenderSub} />
            ))
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-full mb-4">{icon}</div>
              <p className="text-sm font-semibold">Todo en orden</p>
              <p className="text-xs mt-1">
                No hay {title.toLowerCase()} para mostrar.
              </p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-semibold">Sin resultados</p>
              <p className="text-xs mt-1">No se encontraron facturas para "{searchQuery}"</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CxcAlertas() {
  const { user } = useAuthStore();
  const userCids = user?.cids;
  const [empresa, setEmpresa] = useState("");

  const { data, error, isLoading, mutate } = useSWR(
    `/api/superadmin/cuentas-por-cobrar/alerts?empresa=${empresa}${userCids && !empresa ? `&userCids=${userCids}` : ""}`,
    fetcher,
    { refreshInterval: 300000 },
  );

  const empresas = [
    { id: "", label: "Todas" },
    { id: "valencia", label: "Valencia" },
    { id: "caracas", label: "Caracas" },
    { id: "panama", label: "Panamá" },
  ];

  return (
    <div className="space-y-6 p-8 bg-slate-50/50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Alertas CxC
          </h2>
          <p className="text-slate-500">
            Facturas que requieren atención inmediata
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all font-medium text-sm self-stretch sm:self-auto justify-center"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />{" "}
          Actualizar
        </button>
      </div>

      {!userCids && (
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md shadow-inner">
          {empresas.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setEmpresa(emp.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 text-sm font-semibold rounded-lg transition-all ${
                empresa === emp.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Building2 size={15} />
              {emp.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="p-20 text-center font-bold text-slate-400 uppercase animate-pulse tracking-wider">
          Cargando alertas...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AlertCard
            title="Facturas por Vencer"
            icon={<Clock className="text-amber-500" />}
            data={data?.data?.facturasPorVencer}
            desc="Vencen en los próximos 3 días"
            gradient="from-amber-50 to-white"
            severity={data?.data?.facturasPorVencer?.length}
            onRenderSub={(item) => (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-amber-500 font-semibold">
                  Vence en {item.daysUntilDue} día
                  {item.daysUntilDue !== 1 ? "s" : ""}
                </span>
                <span>•</span>
                <span>{formatCurrency(Math.abs(item.amountResidual))}</span>
              </div>
            )}
          />
          <AlertCard
            title="Facturas Vencidas"
            icon={<AlertTriangle className="text-red-500" />}
            data={data?.data?.facturasVencidas}
            desc="Saldo vencido pendiente de cobro"
            gradient="from-red-50 to-white"
            severity={data?.data?.facturasVencidas?.length}
            onRenderSub={(item) => (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-red-500 font-semibold">
                  {item.agingDays} días vencido
                </span>
                <span>•</span>
                <span>{formatCurrency(Math.abs(item.amountResidual))}</span>
              </div>
            )}
          />
        </div>
      )}

      {data?.data && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500 uppercase font-semibold">
              Por Vencer
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {data.data.summary.totalPorVencer}
            </p>
            <p className="text-xs text-slate-400">
              {formatCurrency(data.data.summary.totalPorVencerMonto)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500 uppercase font-semibold">
              Vencidas
            </p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {data.data.summary.totalVencidas}
            </p>
            <p className="text-xs text-slate-400">
              {formatCurrency(data.data.summary.totalVencidasMonto)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
