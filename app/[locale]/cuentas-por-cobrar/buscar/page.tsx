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
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { descargarExcel } from "@/lib/excel";

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

// Fecha local en YYYY-MM-DD (toISOString la pasaría a UTC y cambia el día de noche).
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasAtras(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

const RANGOS: { label: string; rango: () => [string, string] }[] = [
  { label: "Hoy", rango: () => [diasAtras(0), diasAtras(0)] },
  { label: "Ayer", rango: () => [diasAtras(1), diasAtras(1)] },
  { label: "Últimos 7 días", rango: () => [diasAtras(6), diasAtras(0)] },
  { label: "Últimos 30 días", rango: () => [diasAtras(29), diasAtras(0)] },
  {
    label: "Este mes",
    rango: () => {
      const n = new Date();
      return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(n)];
    },
  },
  {
    label: "Mes pasado",
    rango: () => {
      const n = new Date();
      return [
        ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        ymd(new Date(n.getFullYear(), n.getMonth(), 0)),
      ];
    },
  },
];

function PaymentBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Pagada", cls: "bg-emerald-100 text-emerald-700" },
    partial: { label: "Parcial", cls: "bg-amber-100 text-amber-700" },
    not_paid: { label: "No pagada", cls: "bg-red-100 text-red-700" },
    in_payment: { label: "En pago", cls: "bg-emerald-100 text-emerald-700" },
    reversed: { label: "Revertida", cls: "bg-slate-100 text-slate-600" },
    invoicing_app_payment: { label: "Pago", cls: "bg-blue-100 text-blue-700" },
  };
  const info = map[state] || { label: state, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${info.cls}`}>
      {info.label}
    </span>
  );
}

function AgingBadge({ days }: { days: number }) {
  if (days <= 0) return <span className="text-emerald-600 font-semibold text-xs">Al día</span>;
  if (days <= 15) return <span className="text-amber-600 font-semibold text-xs">{days}d</span>;
  if (days <= 30) return <span className="text-orange-600 font-semibold text-xs">{days}d</span>;
  return <span className="text-red-600 font-bold text-xs">{days}d</span>;
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

export default function BuscarFacturasPage() {
  const { user } = useAuthStore();
  const userCids = user?.cids;
  const [query, setQuery] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Rango por fecha de factura; con rango no hace falta escribir nada.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  // Lo elegido en los campos y atajos; solo filtra al pulsar Aplicar.
  const [desdeB, setDesdeB] = useState("");
  const [hastaB, setHastaB] = useState("");
  const sinAplicar = desdeB !== desde || hastaB !== hasta;
  const aplicarFechas = () => {
    setDesde(desdeB);
    setHasta(hastaB);
    setPage(1);
  };
  const [exportando, setExportando] = useState(false);
  const hayFiltro = Boolean(debouncedQuery || desde || hasta);

  const paramsBase = useCallback(() => {
    const params = new URLSearchParams({ q: debouncedQuery, empresa });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (!empresa && userCids) params.set("userCids", String(userCids));
    return params;
  }, [debouncedQuery, empresa, desde, hasta, userCids]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchData = useCallback(async () => {
    if (!hayFiltro) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const params = paramsBase();
      params.set("page", String(page));
      params.set("limit", "50");
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/search?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [hayFiltro, paramsBase, page]);

  // Exporta todo lo filtrado (no solo la página): una fila por documento.
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const params = paramsBase();
      params.set("todos", "1");
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/search?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || `HTTP ${res.status}`);
      // El reporte de CxC trae una fila por vencimiento: una factura en
      // cuotas aparece varias veces.
      const vistos = new Set<number>();
      const filas = (json.data?.invoices || [])
        .filter((inv: any) => {
          const k = inv.moveId || -inv.id;
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        })
        .map((inv: any) => ({
          "Número de factura": inv.name || `#${inv.id}`,
          Fecha: formatDDMMYYYY(inv.invoiceDate),
          Cliente: inv.partnerName,
          "Monto total": inv.amountTotal,
          "Término de pago": inv.paymentTerm || "—",
        }));
      const rango = desde || hasta ? `_${desde || "inicio"}_a_${hasta || "hoy"}` : "";
      descargarExcel(`Facturas${rango}`, [{ nombre: "Facturas", filas }]);
    } catch (e: any) {
      alert("Error al exportar: " + (e?.message || e));
    } finally {
      setExportando(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const empresas = [
    { id: "", label: "Todas" },
    { id: "valencia", label: "Valencia" },
    { id: "caracas", label: "Caracas" },
    { id: "panama", label: "Panamá" },
  ];

  const invoices = data?.data?.invoices || [];
  const totalPages = data?.data?.totalPages || 1;
  const total = data?.data?.count || 0;

  return (
    <div className="space-y-6 p-8 bg-slate-50/50 min-h-screen">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Buscar Facturas
        </h2>
        <p className="text-slate-500">
          Busca por número de factura, cliente o vendedor, o filtra por fecha de factura
        </p>
      </div>

      {/* Fecha de factura */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Desde</label>
          <input
            type="date"
            value={desdeB}
            max={hastaB || undefined}
            onChange={(e) => setDesdeB(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Hasta</label>
          <input
            type="date"
            value={hastaB}
            min={desdeB || undefined}
            onChange={(e) => setHastaB(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGOS.map((r) => {
            const [d, h] = r.rango();
            const activo = desdeB === d && hastaB === h;
            return (
              <button
                key={r.label}
                onClick={() => {
                  setDesdeB(d);
                  setHastaB(h);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activo
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r.label}
              </button>
            );
          })}
          {(desde || hasta || desdeB || hastaB) && (
            <button
              onClick={() => {
                setDesdeB("");
                setHastaB("");
                setDesde("");
                setHasta("");
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Quitar fechas
            </button>
          )}
        </div>
        <button
          onClick={aplicarFechas}
          disabled={!sinAplicar}
          className="ml-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          Aplicar
        </button>
        <p className="basis-full text-xs text-slate-500">
          {sinAplicar
            ? "Pulsa Aplicar para filtrar con estas fechas."
            : desde || hasta
              ? `Facturas con fecha ${desde ? `desde ${formatDDMMYYYY(desde)}` : ""}${desde && hasta ? " " : ""}${hasta ? `hasta ${formatDDMMYYYY(hasta)}` : ""}.`
              : "Sin filtro de fecha."}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Ej: FAC-00123, Juan Pérez, María González..."
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setData(null);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {!userCids && (
          <div className="flex p-1 bg-slate-200/60 rounded-xl shadow-inner">
            {empresas.map((emp) => (
              <button
                key={emp.id}
                onClick={() => {
                  setEmpresa(emp.id);
                  setPage(1);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
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
        )}
      </div>

      {loading && (
        <div className="p-12 text-center font-bold text-slate-400 uppercase animate-pulse tracking-wider text-sm">
          Buscando facturas...
        </div>
      )}

      {!loading && hayFiltro && invoices.length === 0 && (
        <div className="p-12 text-center text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">No se encontraron facturas</p>
          <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase">
                {total} resultado{total !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={exportarExcel}
                  disabled={exportando}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                >
                  {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {exportando ? "Exportando..." : "Exportar Excel"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-center">
                    {["Factura", "Cliente", "Empresa", "Vendedor", "Fecha", "Vence", "Término", "Saldo", "Estado", "Días", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-center">
                  {invoices.map((inv: any) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-blue-50/30 transition-colors text-[11px]"
                    >
                      <td className="px-3 py-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="font-bold text-blue-600 hover:underline cursor-pointer">
                              {inv.name || `#${inv.id}`}
                            </button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>
                                {inv.name || `Factura #${inv.id}`}
                              </DialogTitle>
                              <DialogDescription className="sr-only">
                                Detalle de factura
                              </DialogDescription>
                            </DialogHeader>
                            <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2">
                              <InvoiceDetailView invoiceId={inv.moveId || inv.id} />
                            </div>
                          </DialogContent>
                        </Dialog>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 max-w-[150px] truncate">
                        {inv.partnerName}
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {inv.companyName}
                      </td>
                      <td className="px-3 py-3 text-slate-600 max-w-[120px] truncate">
                        {inv.invoiceUserName}
                      </td>
                      <td className="px-3 py-3 text-slate-500 font-mono">
                        {formatDDMMYYYY(inv.invoiceDate)}
                      </td>
                      <td className="px-3 py-3 text-slate-500 font-mono">
                        {formatDDMMYYYY(inv.invoiceDateDue)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {inv.paymentTerm || "—"}
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-900">
                        {formatCurrency(Math.abs(inv.amountResidual))}
                      </td>
                      <td className="px-3 py-3">
                        <PaymentBadge state={inv.paymentState} />
                      </td>
                      <td className="px-3 py-3">
                        <AgingBadge days={inv.agingDays} />
                      </td>
                      <td className="px-3 py-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="text-slate-400 hover:text-blue-600 transition-colors">
                              <FileText size={14} />
                            </button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>
                                {inv.name || `Factura #${inv.id}`}
                              </DialogTitle>
                              <DialogDescription className="sr-only">
                                Detalle de factura
                              </DialogDescription>
                            </DialogHeader>
                            <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2">
                              <InvoiceDetailView invoiceId={inv.moveId || inv.id} />
                            </div>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
                <div className="text-[10px] font-black text-slate-400 uppercase">
                  Página {page} de {totalPages}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="text-xs font-bold text-slate-700">
                    {page} / {totalPages}
                  </div>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!hayFiltro && !loading && (
        <div className="p-16 text-center text-slate-400">
          <Search size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm font-semibold">Escribe o elige un rango de fechas</p>
          <p className="text-xs mt-1">
            Puedes buscar por número de factura, nombre del cliente o vendedor, o por fecha de factura
          </p>
        </div>
      )}
    </div>
  );
}
