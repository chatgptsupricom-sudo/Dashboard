"use client";

import { useEffect, useState } from "react";

// Detalle de una factura de Odoo (datos, líneas, montos y pagos) por
// `/api/superadmin/cuentas-por-cobrar/invoice/[id]`. Lo usan Buscar facturas
// de CxC y el ranking de Spiff.

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

function formatDDMMYYYY(dateStr: string | null) {
  if (!dateStr) return "—";
  const [d] = dateStr.split(" ");
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

export default function InvoiceDetailView({ invoiceId }: { invoiceId: number }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    fetch(`/api/superadmin/cuentas-por-cobrar/invoice/${invoiceId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setDetail(json.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!detail) {
    return <p className="text-center text-slate-400 py-8">No se pudo cargar el detalle.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Datos de la factura */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          Datos de la Factura
        </h4>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-slate-500">Número:</span>
          <span className="font-mono font-bold text-right sm:text-left">{detail.name || "—"}</span>

          <span className="text-slate-500">Cliente:</span>
          <span className="font-medium text-right sm:text-left">{detail.partnerName}</span>

          <span className="text-slate-500">Empresa:</span>
          <span className="font-medium text-right sm:text-left">{detail.companyName}</span>

          <span className="text-slate-500">Vendedor:</span>
          <span className="font-medium text-slate-700 text-right sm:text-left">{detail.invoiceUserName || "No asignado"}</span>

          <span className="text-slate-500">Fecha factura:</span>
          <span className="font-mono text-right sm:text-left">{formatDDMMYYYY(detail.invoiceDate)}</span>

          <span className="text-slate-500">Vencimiento:</span>
          <span className="font-mono text-right sm:text-left">{formatDDMMYYYY(detail.invoiceDateDue)}</span>

          <span className="text-slate-500">Origen / Pedido:</span>
          <span className="font-medium text-right sm:text-left">{detail.invoiceOrigin || "—"}</span>

          <span className="text-slate-500">Referencia pago:</span>
          <span className="font-medium text-right sm:text-left">{detail.paymentReference || "—"}</span>

          <span className="text-slate-500">Tipo:</span>
          <span className="font-medium text-right sm:text-left">{detail.moveType === "out_refund" ? "Nota de crédito" : "Factura"}</span>

          <span className="text-slate-500">Diario:</span>
          <span className="font-medium text-right sm:text-left">{detail.journalName || "—"}</span>

          <span className="text-slate-500">Moneda:</span>
          <span className="font-medium text-right sm:text-left">{detail.currencyName || "USD"}</span>
        </div>
        {detail.narration && (
          <div className="mt-2 p-3 bg-white rounded-lg border border-slate-100">
            <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Notas</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.narration}</p>
          </div>
        )}
      </div>

      {/* Líneas de productos */}
      {detail.lines && detail.lines.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
              Productos ({detail.lines.length})
            </h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b text-slate-400 text-[10px] font-semibold uppercase">
                  <th className="p-3 pl-4">Producto</th>
                  <th className="p-3 text-center">Cant.</th>
                  <th className="p-3 text-right">P. Unitario</th>
                  <th className="p-3 text-center">Dto.%</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-right pr-4">Total c/ Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {detail.lines.map((line: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 pl-4 font-medium max-w-[220px]">
                      <span className="block truncate">{line.productName || line.name || "Producto"}</span>
                      {line.name && line.productName && line.name !== line.productName && (
                        <span className="text-[10px] text-slate-400 block truncate">{line.name}</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono font-medium">{line.quantity}</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(line.priceUnit)}</td>
                    <td className="p-3 text-center font-mono text-xs">
                      {line.discount > 0 ? (
                        <span className="text-amber-600 font-semibold">{line.discount}%</span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono">{formatCurrency(line.priceSubtotal)}</td>
                    <td className="p-3 text-right pr-4 font-mono font-bold">{formatCurrency(line.priceTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resumen de montos */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">
          Resumen de Montos
        </h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal (sin impuesto)</span>
            <span className="font-mono font-medium">{formatCurrency(detail.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Impuestos</span>
            <span className="font-mono font-medium">{formatCurrency(detail.totals.tax)}</span>
          </div>
          <div className="h-px bg-slate-200" />
          <div className="flex justify-between text-sm font-bold">
            <span className="text-slate-700">Total facturado</span>
            <span className="font-mono text-slate-900">{formatCurrency(detail.totals.total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Ya pagado</span>
            <span className="font-mono font-bold text-emerald-600">{formatCurrency(detail.totals.paid)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-red-600">Saldo pendiente</span>
            <span className={`font-mono ${detail.totals.residual > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {formatCurrency(detail.totals.residual)}
            </span>
          </div>
        </div>
      </div>

      {/* Pagos aplicados */}
      {detail.payments && detail.payments.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
              Pagos / Abonos Aplicados ({detail.payments.length})
            </h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b text-slate-400 text-[10px] font-semibold uppercase">
                  <th className="p-3 pl-4">Fecha</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3 text-right">Débito</th>
                  <th className="p-3 text-right pr-4">Crédito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {detail.payments.map((p: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 pl-4 font-mono text-xs">{formatDDMMYYYY(p.date)}</td>
                    <td className="p-3 text-xs text-slate-600 max-w-[200px] truncate">{p.name || "—"}</td>
                    <td className="p-3 text-right font-mono text-xs">{p.debit > 0 ? formatCurrency(p.debit) : "—"}</td>
                    <td className="p-3 text-right pr-4 font-mono text-xs">{p.credit > 0 ? formatCurrency(p.credit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
