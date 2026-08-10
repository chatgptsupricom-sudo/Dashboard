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
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  RefreshCw,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function AgingBadge({ days }: { days: number }) {
  if (days <= 0)
    return (
      <span className="text-emerald-600 font-semibold text-xs">Al día</span>
    );
  if (days <= 15)
    return (
      <span className="text-amber-600 font-semibold text-xs">{days}d</span>
    );
  if (days <= 30)
    return (
      <span className="text-orange-600 font-semibold text-xs">{days}d</span>
    );
  return <span className="text-red-600 font-bold text-xs">{days}d</span>;
}

function formatDDMMYYYY(dateStr: string | null) {
  if (!dateStr) return "—";
  const [d] = dateStr.split(" ");
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function InvoiceDetailView({ invoiceId }: { invoiceId: number }) {
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!detail) {
    return <p className="text-center text-slate-400 py-8">No se pudo cargar el detalle.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">Datos de la Factura</h4>
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
        </div>
        {detail.narration && (
          <div className="mt-2 p-3 bg-white rounded-lg border border-slate-100">
            <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Notas</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.narration}</p>
          </div>
        )}
      </div>

      {detail.lines && detail.lines.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Productos ({detail.lines.length})</h5>
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
                      {line.discount > 0 ? <span className="text-amber-600 font-semibold">{line.discount}%</span> : "—"}
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

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Resumen de Montos</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
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

      {detail.payments && detail.payments.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Pagos / Abonos ({detail.payments.length})</h5>
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

function ClientDetail({ partnerId, partnerName }: { partnerId: number; partnerName: string }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerId) return;
    setLoading(true);
    fetch(`/api/superadmin/cuentas-por-cobrar/search?q=${encodeURIComponent(partnerName)}&limit=100`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setInvoices(
            (json.data?.invoices || []).filter(
              (inv: any) => inv.partnerId === partnerId && inv.amountResidual > 0,
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [partnerId, partnerName]);

  const total = invoices.reduce((s, i) => s + Math.abs(i.amountResidual), 0);
  const overdue = invoices
    .filter((i) => i.agingDays > 0)
    .reduce((s, i) => s + Math.abs(i.amountResidual), 0);
  const totalFacturado = invoices.reduce((s, i) => s + Math.abs(i.amountTotal), 0);
  const companies = [...new Set(invoices.map((i) => i.companyName).filter(Boolean))];

  const diasCredito = (() => {
    const diffs = invoices
      .filter((i) => i.invoiceDate && i.invoiceDateDue)
      .map((i) => {
        const [y1, m1, d1] = i.invoiceDate!.split(" ")[0].split("-").map(Number);
        const [y2, m2, d2] = i.invoiceDateDue!.split(" ")[0].split("-").map(Number);
        const diff = Math.round(
          (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return diff;
      })
      .filter((d) => d > 0);
    if (diffs.length === 0) return null;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <p className="text-center text-slate-400 py-6 text-sm">
        No hay facturas abiertas para este cliente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase">
          Ficha de Cliente
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {companies.map((co) => (
          <span
            key={co}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700"
          >
            <Building2 size={12} />
            {co}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <DollarSign size={14} className="text-blue-600" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Monto Total</span>
          </div>
          <p className="text-lg font-bold text-blue-700">{formatCurrency(totalFacturado)}</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign size={14} className="text-amber-600" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Adeudo Total</span>
          </div>
          <p className="text-lg font-bold text-amber-700">{formatCurrency(total)}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl p-4 border border-purple-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock size={14} className="text-purple-600" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Días Crédito</span>
          </div>
          <p className="text-lg font-bold text-purple-700">
            {diasCredito !== null ? `${diasCredito} días` : "N/A"}
          </p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-white rounded-xl p-4 border border-red-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
              <Clock size={14} className="text-red-600" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Atrasado</span>
          </div>
          <p className={`text-lg font-bold ${overdue > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {formatCurrency(overdue)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
              <FileText size={14} className="text-slate-600" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Facturas Abiertas</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{invoices.length}</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign size={14} className="text-emerald-600" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Ya Pagado</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalFacturado - total)}</p>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 text-[10px] font-semibold uppercase">
                <th className="px-3 py-2.5 text-left">Factura</th>
                <th className="px-3 py-2.5 text-center">Empresa</th>
                <th className="px-3 py-2.5 text-center">Fecha</th>
                <th className="px-3 py-2.5 text-center">Vence</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Saldo</th>
                <th className="px-3 py-2.5 text-center">Días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map((inv) => (
                <Dialog key={inv.id}>
                  <DialogTrigger asChild>
                    <tr className="hover:bg-blue-50/20 transition-colors cursor-pointer">
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-blue-600 hover:underline">
                        {inv.name || `#${inv.id}`}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                        {inv.companyName}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                        {formatDDMMYYYY(inv.invoiceDate)}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                        {formatDDMMYYYY(inv.invoiceDateDue)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-medium">
                        {formatCurrency(Math.abs(inv.amountTotal))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-red-600">
                        {formatCurrency(Math.abs(inv.amountResidual))}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {inv.agingDays > 0 ? (
                          <span className="text-[10px] font-bold text-red-600">{inv.agingDays}d</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-600">Al día</span>
                        )}
                      </td>
                    </tr>
                  </DialogTrigger>

                  <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FileText size={18} className="text-blue-500" />
                        {inv.name || `Factura #${inv.id}`}
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        Detalle de factura
                      </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 max-h-[70vh] overflow-y-auto pr-2">
                      <InvoiceDetailView invoiceId={inv.id} />
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SalespersonCard({ sp }: { sp: any }) {
  const [open, setOpen] = useState(false);
  const overduePct =
    sp.totalReceivable > 0
      ? Math.round((sp.totalOverdue / sp.totalReceivable) * 100)
      : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
            {(sp.userName || "?").charAt(0).toUpperCase()}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">{sp.userName}</p>
            <p className="text-xs text-slate-400">
              {sp.clients.length} cliente{sp.clients.length !== 1 ? "s" : ""} ·{" "}
              {sp.invoiceCount} factura{sp.invoiceCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase font-semibold">
              Cartera
            </p>
            <p className="text-sm font-bold text-slate-900">
              {formatCurrency(sp.totalReceivable)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase font-semibold">
              Vencido
            </p>
            <p
              className={`text-sm font-bold ${overduePct > 20 ? "text-red-600" : overduePct > 10 ? "text-amber-600" : "text-slate-900"}`}
            >
              {formatCurrency(sp.totalOverdue)}
              <span className="text-[10px] ml-1 font-medium">
                ({overduePct}%)
              </span>
            </p>
          </div>
          <ChevronDown
            size={18}
            className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-slate-400 text-[10px] font-semibold uppercase">
                <th className="px-6 py-2.5 text-left">Cliente</th>
                <th className="px-3 py-2.5 text-center">Sede</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Vencido</th>
                <th className="px-3 py-2.5 text-center">Fact.</th>
                <th className="px-3 py-2.5 text-center">Antig.</th>
                <th className="px-6 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sp.clients.map((c: any) => {
                const clientPct =
                  sp.totalReceivable > 0
                    ? Math.round((c.total / sp.totalReceivable) * 100)
                    : 0;
                return (
                  <Dialog key={c.partnerId}>
                    <DialogTrigger asChild>
                      <tr className="hover:bg-blue-50/20 transition-colors cursor-pointer">
                        <td className="px-6 py-3">
                          <p className="font-semibold text-slate-800 truncate max-w-[250px] hover:text-blue-600 hover:underline">
                            {c.partnerName}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {c.companies.map((co: string) => (
                              <span
                                key={co}
                                className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-medium text-slate-600"
                              >
                                {co}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(c.total)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {c.overdue > 0 ? (
                            <span className="font-bold text-red-600">
                              {formatCurrency(c.overdue)}
                            </span>
                          ) : (
                            <span className="text-emerald-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-500">
                          {c.count}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <AgingBadge days={c.oldest} />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${clientPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 w-8 text-right">
                              {clientPct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    </DialogTrigger>

                    <DialogContent className="sm:max-w-3xl">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileText size={18} className="text-blue-500" />
                          {c.partnerName}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                          Facturas abiertas de {c.partnerName}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-2">
                        <ClientDetail partnerId={c.partnerId} partnerName={c.partnerName} />
                      </div>
                    </DialogContent>
                  </Dialog>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TopClientesVendedorPage() {
  const [empresa, setEmpresa] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      const res = await fetch(
        `/api/superadmin/cuentas-por-cobrar/top-clients?${params}`,
      );
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [empresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            Top Clientes por Vendedor
          </h2>
          <p className="text-slate-500">
            Cartera de cobranza agrupada por responsable
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all font-medium text-sm"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />{" "}
          Actualizar
        </button>
      </div>

      <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md shadow-inner">
        {empresas.map((emp) => (
          <button
            key={emp.id}
            onClick={() => setEmpresa(emp.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
              empresa === emp.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building2 size={13} />
            {emp.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-20 text-center font-bold text-slate-400 uppercase animate-pulse tracking-wider text-sm">
          Cargando datos...
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Users size={18} className="mx-auto text-blue-500 mb-1" />
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Vendedores
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {data.summary.totalSalespeople}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <DollarSign size={18} className="mx-auto text-emerald-500 mb-1" />
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Cartera Total
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatCurrency(data.summary.totalReceivable)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Clock size={18} className="mx-auto text-red-500 mb-1" />
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Vencida
              </p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(data.summary.totalOverdue)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Building2 size={18} className="mx-auto text-amber-500 mb-1" />
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Clientes
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {data.summary.totalClients}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {data.salespeople.map((sp: any) => (
              <SalespersonCard key={sp.userId} sp={sp} />
            ))}
          </div>

          {data.salespeople.length === 0 && (
            <div className="p-16 text-center text-slate-400">
              <Users size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm font-semibold">Sin datos de vendedores</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
