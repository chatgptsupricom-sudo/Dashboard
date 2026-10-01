"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Package,
  RefreshCw,
  Target,
  X,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

/**
 * Paso 3 (estado de cuenta del cliente) y paso 4 (detalle de una factura,
 * como modal) de "Estado de Cuentas".
 *
 * Mismos endpoints y misma UI que el dashboard de Cuentas por Cobrar
 * (app/[locale]/cuentas-por-cobrar/page.tsx, Modal 2 y Modal 3) — se copia el
 * patron en vez de importar ese componente porque esta pantalla entra por
 * cliente+vendedor puntual (params de URL), no por el flujo del dashboard
 * general.
 */

type FacturaResumen = {
  id: number;
  moveId: number;
  name: string;
  partnerId: number;
  partnerName: string;
  companyName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountResidual: number;
  amountTotal: number;
  agingDays: number;
  agingBand: string;
  transactionType: string;
};

type FacturaDetalle = {
  id: number;
  name: string;
  partnerId: number;
  partnerName: string;
  companyName: string;
  moveType: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  paymentState: string;
  invoiceUserId: number;
  invoiceUserName: string;
  invoiceOrigin: string;
  currencyName: string;
  journalName: string;
  paymentReference: string;
  narration: string;
  amountTotal: number;
  amountResidual: number;
  amountPaid: number;
  lines: any[];
  payments: any[];
  totals: { subtotal: number; tax: number; total: number; paid: number; residual: number };
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

const BAND_COLORS: Record<string, { bg: string; text: string }> = {
  corriente: { bg: "bg-emerald-50", text: "text-emerald-700" },
  "1-30": { bg: "bg-amber-50", text: "text-amber-700" },
  "31-60": { bg: "bg-orange-50", text: "text-orange-700" },
  "61-90": { bg: "bg-red-50", text: "text-red-700" },
  "91+": { bg: "bg-red-100", text: "text-red-800" },
};

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  // Portal a document.body: el sidebar fijo vive en su propio z-[100], por
  // encima del z-50 que suelen usar los modales de este panel. Sin el
  // portal, el modal queda anidado dentro del contenido de la pagina y el
  // sidebar lo tapa por completo del lado izquierdo por mas z-index que se
  // le suba — es cuestion de contexto de apilamiento, no solo de numero.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default function EstadoCuentaClientePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "es";
  const vendedorId = params?.vendedorId as string;
  const clienteId = params?.clienteId as string;
  const nombreCliente = searchParams?.get("nombre") || "";
  const nombreVendedor = searchParams?.get("vendedor") || "";

  const { user } = useAuthStore();

  const [facturas, setFacturas] = useState<FacturaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detalle, setDetalle] = useState<FacturaDetalle | null>(null);
  const [detalleCargando, setDetalleCargando] = useState(false);

  useEffect(() => {
    if (!vendedorId || !clienteId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    const qp = new URLSearchParams({ user_id: vendedorId, partner_id: clienteId });
    if (user?.cids) qp.set("userCids", String(user.cids));
    fetch(`/api/superadmin/cuentas-por-cobrar/detail?${qp}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelado) return;
        if (!json.success) {
          setError(json.error || "No se pudo cargar");
          return;
        }
        setFacturas(json.data?.invoices || []);
      })
      .catch(() => {
        if (!cancelado) setError("Error al cargar el estado de cuenta");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [vendedorId, clienteId, user?.cids]);

  const abrirFactura = useCallback(async (moveId: number) => {
    setModalOpen(true);
    setDetalleCargando(true);
    setDetalle(null);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/invoice/${moveId}`);
      const json = await res.json();
      if (json.success) setDetalle(json.data);
    } catch {
      // el modal se queda mostrando "Error al cargar"
    }
    setDetalleCargando(false);
  }, []);

  const bandas: Record<string, { count: number; total: number }> = {};
  facturas.forEach((f) => {
    const band = f.agingBand || "corriente";
    if (!bandas[band]) bandas[band] = { count: 0, total: 0 };
    bandas[band].count++;
    bandas[band].total += f.amountResidual;
  });
  const totalPendiente = facturas.reduce((s, f) => s + f.amountResidual, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/gerente_venta/estado-cuenta/${vendedorId}?nombre=${encodeURIComponent(nombreVendedor)}`}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900">{nombreCliente || "Cliente"} — Estado de Cuenta</h1>
          <p className="text-sm text-slate-500">
            {nombreVendedor && `Vendedor: ${nombreVendedor} · `}
            {cargando ? "Cargando..." : `${facturas.length} facturas pendientes · ${formatCurrency(totalPendiente)}`}
          </p>
        </div>
      </div>

      {cargando && (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm flex items-center justify-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!cargando && !error && facturas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
          <RefreshCw className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">Este cliente no tiene facturas pendientes</p>
        </div>
      )}

      {!cargando && !error && facturas.length > 0 && (
        <>
          {/* Aging summary cards */}
          <div className="grid grid-cols-5 gap-2">
            {["corriente", "1-30", "31-60", "61-90", "91+"].map((band) => {
              const b = bandas[band] || { count: 0, total: 0 };
              const c = BAND_COLORS[band];
              return (
                <div key={band} className={`${c.bg} border rounded-xl p-3 text-center`}>
                  <span className="text-[9px] font-bold uppercase tracking-widest block mb-1">
                    {band === "corriente" ? "Corriente" : `${band} días`}
                  </span>
                  <span className={`text-base font-bold ${c.text}`}>{formatCurrency(b.total)}</span>
                  <span className="text-[10px] text-slate-400 block">{b.count} fact.</span>
                </div>
              );
            })}
          </div>

          {/* Invoice list */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Factura</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Tipo</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Fecha</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Vencimiento</th>
                    <th className="text-center py-2.5 px-4 text-slate-500 font-medium">Band</th>
                    <th className="text-right py-2.5 px-4 text-slate-500 font-medium">Pendiente</th>
                    <th className="text-center py-2.5 px-4 text-slate-500 font-medium">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f) => {
                    const c = BAND_COLORS[f.agingBand] || BAND_COLORS.corriente;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => abrirFactura(f.moveId || f.id)}
                        className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-4 font-medium text-slate-700">{f.name}</td>
                        <td className="py-2.5 px-4 text-slate-500 text-xs">
                          {f.transactionType === "out_refund" ? "NC" : "Factura"}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 text-xs">{formatDate(f.invoiceDate)}</td>
                        <td className="py-2.5 px-4 text-slate-500 text-xs">{formatDate(f.invoiceDateDue)}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${c.bg} ${c.text}`}>
                            {f.agingBand}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-800">
                          {formatCurrency(f.amountResidual)}
                        </td>
                        <td className="py-2.5 px-4 text-center text-slate-500 text-xs">
                          {f.agingDays > 0 ? f.agingDays : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Factura detail modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Factura ${detalle?.name || ""}`}>
        {detalleCargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <RefreshCw size={28} className="animate-spin text-blue-500 mx-auto mb-3" />
              <span className="text-slate-400 text-sm">Cargando documento...</span>
            </div>
          </div>
        ) : !detalle ? (
          <div className="text-center py-16 text-slate-400">Error al cargar</div>
        ) : (
          <div className="space-y-5">
            {/* Status banner */}
            {(() => {
              const isPaid = detalle.paymentState === "paid" || detalle.amountResidual <= 0;
              const isPartial =
                !isPaid && (detalle.paymentState === "partial" || (detalle.amountPaid > 0 && detalle.amountResidual > 0));
              return (
                <div
                  className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${
                    isPaid
                      ? "bg-emerald-50 border-emerald-200"
                      : isPartial
                        ? "bg-amber-50 border-amber-200"
                        : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        isPaid ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm font-bold text-slate-800">
                      {isPaid ? "Factura Pagada" : isPartial ? "Pago Parcial" : "Pendiente de Pago"}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    {detalle.moveType === "out_refund" ? "Nota de Crédito" : "Factura de Venta"}
                  </span>
                </div>
              );
            })()}

            {/* Payment progress */}
            {detalle.amountTotal > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progreso de Pago</span>
                  <span className="text-xs font-bold text-slate-700">
                    {Math.round((detalle.amountPaid / detalle.amountTotal) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      detalle.paymentState === "paid"
                        ? "bg-emerald-500"
                        : detalle.paymentState === "partial"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.min((detalle.amountPaid / detalle.amountTotal) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium">
                  <span>Pagado: {formatCurrency(detalle.amountPaid)}</span>
                  <span>Pendiente: {formatCurrency(detalle.amountResidual)}</span>
                </div>
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cliente</span>
                <p className="text-sm font-bold text-slate-800 leading-tight">{detalle.partnerName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sede</span>
                <p className="text-sm font-bold text-slate-800">{detalle.companyName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vendedor</span>
                <p className="text-sm font-medium text-slate-700">{detalle.invoiceUserName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Moneda</span>
                <p className="text-sm font-medium text-slate-700">{detalle.currencyName || "USD"}</p>
              </div>
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar size={14} className="text-blue-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Emisión</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(detalle.invoiceDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    detalle.invoiceDateDue && new Date(detalle.invoiceDateDue) < new Date() && detalle.amountResidual > 0
                      ? "bg-red-50"
                      : "bg-amber-50"
                  }`}
                >
                  <Clock
                    size={14}
                    className={
                      detalle.invoiceDateDue && new Date(detalle.invoiceDateDue) < new Date() && detalle.amountResidual > 0
                        ? "text-red-600"
                        : "text-amber-600"
                    }
                  />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Vencimiento</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(detalle.invoiceDateDue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-purple-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Diario</span>
                  <p className="text-xs font-medium text-slate-700">{detalle.journalName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <Target size={14} className="text-slate-500" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Ref. Pago</span>
                  <p className="text-xs font-medium text-slate-700 truncate max-w-[120px]">
                    {detalle.paymentReference || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Subtotal", value: detalle.totals.subtotal, bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-100" },
                { label: "Impuesto", value: detalle.totals.tax, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100" },
                { label: "Total", value: detalle.totals.total, bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-100" },
                { label: "Pagado", value: detalle.totals.paid, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
                { label: "Pendiente", value: detalle.totals.residual, bg: "bg-red-50", text: "text-red-700", border: "border-red-100" },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl p-3 text-center`}>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{item.label}</span>
                  <span className={`text-sm font-bold ${item.text}`}>{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>

            {/* Line items */}
            {detalle.lines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={14} className="text-slate-400" />
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle de Productos</h4>
                  <span className="text-[10px] text-slate-400 font-medium ml-auto">{detalle.lines.length} ítems</span>
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
                      {detalle.lines.map((line: any, idx: number) => (
                        <tr key={line.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                          <td className="py-2.5 px-4 text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-slate-800 text-xs">{line.productName || line.name}</p>
                            {line.productName && line.name !== line.productName && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{line.name}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-700">{line.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceUnit)}</td>
                          <td className="py-2.5 px-4 text-right">
                            {line.discount > 0 ? (
                              <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded">
                                {line.discount}%
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceSubtotal)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(line.priceTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/80 border-t border-slate-200">
                        <td colSpan={5} className="py-2.5 px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Subtotal
                        </td>
                        <td colSpan={2} className="py-2.5 px-4 text-right font-bold text-slate-800 text-xs">
                          {formatCurrency(detalle.totals.subtotal)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/80">
                        <td colSpan={5} className="py-2 px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Impuesto
                        </td>
                        <td colSpan={2} className="py-2 px-4 text-right font-medium text-slate-600 text-xs">
                          {formatCurrency(detalle.totals.tax)}
                        </td>
                      </tr>
                      <tr className="bg-blue-50/60 border-t border-blue-100">
                        <td colSpan={5} className="py-3 px-4 text-right text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                          Total
                        </td>
                        <td colSpan={2} className="py-3 px-4 text-right font-black text-blue-900 text-sm">
                          {formatCurrency(detalle.totals.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Payment history */}
            {detalle.payments && detalle.payments.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign size={14} className="text-emerald-500" />
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historial de Pagos</h4>
                  <span className="text-[10px] text-slate-400 font-medium ml-auto">{detalle.payments.length} movimientos</span>
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
                      {detalle.payments.map((p: any) => (
                        <tr key={p.id} className="border-t border-slate-50 hover:bg-emerald-50/20 transition-colors">
                          <td className="py-2.5 px-4 font-medium text-slate-700">{p.name}</td>
                          <td className="py-2.5 px-4 text-slate-500">{formatDate(p.date)}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{p.debit > 0 ? formatCurrency(p.debit) : "—"}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">
                            {p.credit > 0 ? formatCurrency(p.credit) : "—"}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-800">
                            {formatCurrency(Math.abs(p.amount_residual || 0))}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {p.reconciled ? (
                              <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold leading-5 text-center">
                                ✓
                              </span>
                            ) : (
                              <span className="inline-block w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold leading-5 text-center">
                                —
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

            {/* Notes / origin */}
            {(detalle.invoiceOrigin || detalle.narration) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detalle.invoiceOrigin && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Origen</span>
                    <p className="text-xs text-slate-700 leading-relaxed">{detalle.invoiceOrigin}</p>
                  </div>
                )}
                {detalle.narration && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Notas Internas</span>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {detalle.narration.replace(/<[^>]*>/g, "")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
