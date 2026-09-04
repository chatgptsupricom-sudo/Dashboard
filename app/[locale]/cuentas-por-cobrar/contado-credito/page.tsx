"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Calendar,
  RefreshCw,
  Wallet,
  CreditCard,
  Users,
  X,
  FileText,
  Package,
  Clock,
  DollarSign,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useAuthStore } from "@/lib/stores/auth.store";

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const PIE_COLORS = ["#10b981", "#3b82f6"];
const BAR_COLOR = "#3b82f6";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col ${wide ? "w-full max-w-4xl" : "w-full max-w-2xl"}`}
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

type ClienteDetalle = { partnerId: number; partnerName: string; monto: number; facturas: number };
type Acumulado = { monto: number; pct: number; facturas: number; clientes: number; clientesDetalle: ClienteDetalle[] };
type Bucket = Acumulado & { dias: number };
type ContadoCreditoData = {
  totalFacturado: number;
  contado: Acumulado;
  credito: Acumulado;
  buckets: Bucket[];
  updatedAt: string;
};
type FacturaCliente = { id: number; name: string; invoiceDate: string | null; moveType: string; amountTotal: number; paymentTermName: string };

export default function ContadoCreditoPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ContadoCreditoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const userCids = (user as any)?.cids;

  // Modal 1: clientes de un grupo (contado / credito / bucket)
  const [clientesModal, setClientesModal] = useState<{ open: boolean; titulo: string; clientes: ClienteDetalle[] }>({ open: false, titulo: "", clientes: [] });

  // Modal 2: facturas del mes de un cliente
  const [facturasModal, setFacturasModal] = useState<{ open: boolean; partnerId: number; partnerName: string }>({ open: false, partnerId: 0, partnerName: "" });
  const [facturasData, setFacturasData] = useState<FacturaCliente[]>([]);
  const [facturasLoading, setFacturasLoading] = useState(false);

  // Modal 3: detalle de una factura
  const [invoiceModal, setInvoiceModal] = useState<{ open: boolean; invoiceId: number }>({ open: false, invoiceId: 0 });
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      params.set("month", String(selectedMonth));
      params.set("year", String(selectedYear));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/contado-credito?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Error:", e);
    }
    setLoading(false);
  }, [empresa, userCids, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openClientes = (titulo: string, clientes: ClienteDetalle[]) => {
    setClientesModal({ open: true, titulo, clientes });
  };

  const openFacturasCliente = useCallback(async (partnerId: number, partnerName: string) => {
    setClientesModal((prev) => ({ ...prev, open: false }));
    setFacturasModal({ open: true, partnerId, partnerName });
    setFacturasLoading(true);
    setFacturasData([]);
    try {
      const params = new URLSearchParams({ partnerId: String(partnerId) });
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      params.set("month", String(selectedMonth));
      params.set("year", String(selectedYear));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/contado-credito/facturas-cliente?${params}`);
      const json = await res.json();
      if (json.success) setFacturasData(json.data.facturas || []);
    } catch (e) {
      console.error(e);
    }
    setFacturasLoading(false);
  }, [empresa, userCids, selectedMonth, selectedYear]);

  const closeFacturasModal = () => {
    setFacturasModal({ open: false, partnerId: 0, partnerName: "" });
  };

  const openInvoiceDetail = useCallback(async (invoiceId: number) => {
    setFacturasModal((prev) => ({ ...prev, open: false }));
    setInvoiceModal({ open: true, invoiceId });
    setInvoiceLoading(true);
    setInvoiceDetail(null);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/invoice/${invoiceId}`);
      const json = await res.json();
      if (json.success) setInvoiceDetail(json.data);
    } catch (e) {
      console.error(e);
    }
    setInvoiceLoading(false);
  }, []);

  const closeInvoiceModal = () => {
    setInvoiceModal({ open: false, invoiceId: 0 });
    setFacturasModal((prev) => ({ ...prev, open: true }));
  };

  const bucketLabel = (b: Bucket) => `${b.dias} días`;

  const pieData = data ? [
    { name: "Contado", value: data.contado.monto },
    { name: "Crédito", value: data.credito.monto },
  ] : [];

  const barData = data ? data.buckets.map((b) => ({
    label: `${b.dias}d`,
    fullLabel: bucketLabel(b),
    monto: b.monto,
  })) : [];

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contado / Crédito</h1>
          <p className="text-sm text-slate-500 mt-1">
            Supricom — {MONTHS[selectedMonth - 1]} {selectedYear}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          )}
          {userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-400" />
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
              {MONTHS.map((m, i) => {
                const isFuture = selectedYear === now.getFullYear() && i > now.getMonth();
                return <option key={i} value={i + 1} disabled={isFuture}>{m}</option>;
              })}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700 ml-1">
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <button onClick={fetchData} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Cargando...</div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Sin datos para este período</div>
      ) : (
        <div className="space-y-6">
          {/* Total facturado */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Facturado del Mes</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{formatCurrency(data.totalFacturado)}</p>
            <div className="mt-4 h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${data.contado.pct}%` }} title={`Contado: ${data.contado.pct}%`} />
              <div className="h-full bg-blue-500" style={{ width: `${data.credito.pct}%` }} title={`Crédito: ${data.credito.pct}%`} />
            </div>
          </div>

          {/* Contado vs Credito + grafica de torta */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <button
              onClick={() => openClientes(`Clientes — Contado`, data.contado.clientesDetalle)}
              className="text-left bg-white border border-emerald-200 bg-emerald-50/30 rounded-2xl p-5 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-center gap-2 text-emerald-700">
                <Wallet size={18} />
                <p className="text-sm font-semibold">Contado</p>
              </div>
              <p className="text-3xl font-bold text-emerald-700 mt-2">{data.contado.pct}%</p>
              <p className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(data.contado.monto)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.contado.facturas} facturas · {data.contado.clientes} clientes (click para ver)</p>
            </button>
            <button
              onClick={() => openClientes(`Clientes — Crédito`, data.credito.clientesDetalle)}
              className="text-left bg-white border border-blue-200 bg-blue-50/30 rounded-2xl p-5 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-center gap-2 text-blue-700">
                <CreditCard size={18} />
                <p className="text-sm font-semibold">Crédito</p>
              </div>
              <p className="text-3xl font-bold text-blue-700 mt-2">{data.credito.pct}%</p>
              <p className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(data.credito.monto)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.credito.facturas} facturas · {data.credito.clientes} clientes (click para ver)</p>
            </button>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Buckets de credito */}
          {data.buckets.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <p className="text-sm font-semibold text-slate-700 mb-3">Distribución del crédito por plazo</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.buckets.map((b) => (
                    <button
                      key={String(b.dias)}
                      onClick={() => openClientes(`Clientes — ${bucketLabel(b)}`, b.clientesDetalle)}
                      className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition cursor-pointer"
                    >
                      <p className="text-xs text-slate-500 uppercase tracking-wide">{bucketLabel(b)}</p>
                      <p className="text-xl font-bold text-slate-800 mt-1">{b.pct}%</p>
                      <p className="text-xs text-slate-600 mt-1">{formatCurrency(b.monto)}</p>
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                        <Users size={12} />
                        {b.clientes} cliente{b.clientes !== 1 ? "s" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <p className="text-xs font-semibold text-slate-500 mb-1 px-2 pt-1">Monto por plazo</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""} />
                    <Bar dataKey="monto" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal 1: clientes del grupo */}
      <Modal open={clientesModal.open} onClose={() => setClientesModal((prev) => ({ ...prev, open: false }))} title={clientesModal.titulo}>
        {clientesModal.clientes.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Sin clientes</div>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Facturas</th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto</th>
                </tr>
              </thead>
              <tbody>
                {clientesModal.clientes.map((c) => (
                  <tr key={c.partnerId} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <button onClick={() => openFacturasCliente(c.partnerId, c.partnerName)} className="font-semibold text-blue-600 hover:underline text-left">
                        {c.partnerName}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{c.facturas}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal 2: facturas del cliente ese mes */}
      <Modal open={facturasModal.open} onClose={closeFacturasModal} title={`Facturas — ${facturasModal.partnerName}`}>
        {facturasLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : facturasData.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Sin facturas este mes</div>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Factura</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plazo</th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto</th>
                </tr>
              </thead>
              <tbody>
                {facturasData.map((f) => (
                  <tr key={f.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <button onClick={() => openInvoiceDetail(f.id)} className="font-semibold text-blue-600 hover:underline">
                        {f.name || `#${f.id}`}
                      </button>
                      {f.moveType === "out_refund" && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">NC</span>}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{formatDate(f.invoiceDate)}</td>
                    <td className="py-2.5 px-4 text-slate-500">{f.paymentTermName}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(f.amountTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal 3: detalle de factura */}
      <Modal open={invoiceModal.open} onClose={closeInvoiceModal} title={`Factura ${invoiceDetail?.name || ""}`} wide>
        {invoiceLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : !invoiceDetail ? (
          <div className="text-center py-8 text-slate-400">Error al cargar</div>
        ) : (
          <div className="space-y-5">
            {(() => {
              const isPaid = invoiceDetail.paymentState === "paid" || invoiceDetail.amountResidual <= 0;
              const isPartial = !isPaid && (invoiceDetail.paymentState === "partial" || (invoiceDetail.amountPaid > 0 && invoiceDetail.amountResidual > 0));
              return (
                <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${isPaid ? "bg-emerald-50 border-emerald-200" : isPartial ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isPaid ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-red-500"}`} />
                    <span className="text-sm font-bold text-slate-800">{isPaid ? "Factura Pagada" : isPartial ? "Pago Parcial" : "Pendiente de Pago"}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{invoiceDetail.moveType === "out_refund" ? "Nota de Crédito" : "Factura de Venta"}</span>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cliente</span>
                <p className="text-sm font-bold text-slate-800">{invoiceDetail.partnerName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sede</span>
                <p className="text-sm font-bold text-slate-800">{invoiceDetail.companyName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vendedor</span>
                <p className="text-sm font-medium text-slate-700">{invoiceDetail.invoiceUserName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Moneda</span>
                <p className="text-sm font-medium text-slate-700">{invoiceDetail.currencyName || "USD"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar size={14} className="text-blue-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Emisión</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(invoiceDetail.invoiceDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock size={14} className="text-amber-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Vencimiento</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(invoiceDetail.invoiceDateDue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-purple-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Diario</span>
                  <p className="text-xs font-medium text-slate-700">{invoiceDetail.journalName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <DollarSign size={14} className="text-slate-500" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Ref. Pago</span>
                  <p className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{invoiceDetail.paymentReference || "—"}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Subtotal", value: invoiceDetail.totals.subtotal, bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-100" },
                { label: "Impuesto", value: invoiceDetail.totals.tax, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100" },
                { label: "Total", value: invoiceDetail.totals.total, bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-100" },
                { label: "Pagado", value: invoiceDetail.totals.paid, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
                { label: "Pendiente", value: invoiceDetail.totals.residual, bg: "bg-red-50", text: "text-red-700", border: "border-red-100" },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl p-3 text-center`}>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{item.label}</span>
                  <span className={`text-sm font-bold ${item.text}`}>{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>

            {invoiceDetail.lines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={14} className="text-slate-400" />
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle de Productos</h4>
                  <span className="text-[10px] text-slate-400 font-medium ml-auto">{invoiceDetail.lines.length} ítems</span>
                </div>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">#</th>
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cant.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Precio Unit.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceDetail.lines.map((line: any, idx: number) => (
                        <tr key={line.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                          <td className="py-2.5 px-4 text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-slate-800 text-xs">{line.productName || line.name}</p>
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-700">{line.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceUnit)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(line.priceSubtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
