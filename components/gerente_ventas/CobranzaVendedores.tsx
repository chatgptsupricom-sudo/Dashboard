"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, HandCoins, Search, Wallet,
} from "lucide-react";

interface Cliente {
  partnerId: number;
  nombre: string;
  facturado: number;
  cobrado: number;
  porCobrar: number;
  vencido: number;
}
interface Vendedor {
  userId: number;
  nombre: string;
  excluido: boolean;
  facturado: number;
  facturas: number;
  cobrado: number;
  cobradoDelPeriodo: number;
  cobradoAnterior: number;
  pagos: number;
  porCobrar: number;
  vencido: number;
  clientes: Cliente[];
}

const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdCorto = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("es-VE", { maximumFractionDigits: 0 })}`;
const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const moverMes = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const etiquetaMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-VE", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Cobranza de los vendedores (Gerencia de Ventas): lo facturado y lo cobrado
 * en el mes por cada vendedor, y su cartera pendiente de hoy. Cada vendedor se
 * abre para ver sus clientes y enlaza a su estado de cuenta.
 */
export default function CobranzaVendedores() {
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [mes, setMes] = useState(mesActual);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [reintento, setReintento] = useState(0);
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [filtroCliente, setFiltroCliente] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    setAbierto(null);
    fetch(`/api/gerente_venta/cobranza?mes=${mes}`, { credentials: "include" })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && json?.success) setVendedores(json.data.vendedores || []);
        else { setVendedores([]); setError(true); }
      })
      .catch(() => { if (!cancelado) { setVendedores([]); setError(true); } })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [mes, reintento]);

  const visibles = useMemo(() => vendedores.filter((v) => verExcluidos || !v.excluido), [vendedores, verExcluidos]);
  const totales = useMemo(() => {
    const s = (k: keyof Vendedor) => visibles.reduce((a, v) => a + (v[k] as number), 0);
    return {
      facturado: s("facturado"),
      facturas: s("facturas"),
      cobrado: s("cobrado"),
      cobradoDelPeriodo: s("cobradoDelPeriodo"),
      cobradoAnterior: s("cobradoAnterior"),
      porCobrar: s("porCobrar"),
      vencido: s("vencido"),
    };
  }, [visibles]);
  const maxBarra = Math.max(1, ...visibles.map((v) => Math.max(v.facturado, v.cobrado)));

  const descargarExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visibles.map((v) => ({
      Vendedor: v.nombre,
      "Facturado sin IVA": v.facturado,
      Facturas: v.facturas,
      Cobrado: v.cobrado,
      "Cobrado de facturas del mes": v.cobradoDelPeriodo,
      "Cobrado de meses anteriores": v.cobradoAnterior,
      "Por cobrar (hoy)": v.porCobrar,
      "Vencido (hoy)": v.vencido,
    }))), "Vendedores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visibles.flatMap((v) => v.clientes.map((c) => ({
      Vendedor: v.nombre,
      Cliente: c.nombre,
      "Facturado sin IVA": c.facturado,
      Cobrado: c.cobrado,
      "Por cobrar (hoy)": c.porCobrar,
      "Vencido (hoy)": c.vencido,
    })))), "Clientes");
    XLSX.writeFile(wb, `cobranza-${mes}.xlsx`);
  };

  const th = "px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <HandCoins className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Cobranza de vendedores</h1>
            <p className="text-sm text-slate-500">Facturado y cobrado del mes por vendedor, con su cartera pendiente.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white">
            <button onClick={() => setMes((m) => moverMes(m, -1))} className="p-2 hover:bg-slate-50 rounded-l-xl" aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 text-sm font-semibold text-slate-700 min-w-[150px] text-center whitespace-nowrap">{etiquetaMes(mes)}</span>
            <button
              onClick={() => setMes((m) => moverMes(m, 1))}
              disabled={mes >= mesActual()}
              className="p-2 hover:bg-slate-50 rounded-r-xl disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={descargarExcel}
            disabled={visibles.length === 0}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100" />)}
          </div>
          <div className="h-80 rounded-2xl bg-slate-100" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center rounded-2xl border border-slate-200 bg-white">
          <AlertTriangle className="text-amber-500" size={26} />
          <p className="text-sm text-slate-600">No se pudo cargar la cobranza.</p>
          <button onClick={() => setReintento((n) => n + 1)} className="h-8 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* Tarjetas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><FileText size={14} className="text-indigo-500" /> Facturado del mes <span className="text-slate-400">(sin IVA)</span></div>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{usd(totales.facturado)}</p>
              <p className="text-xs text-slate-500">{totales.facturas} facturas</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><HandCoins size={14} className="text-emerald-500" /> Cobrado del mes</div>
              <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{usd(totales.cobrado)}</p>
              <p className="text-xs text-slate-500">
                {usdCorto(totales.cobradoDelPeriodo)} de facturas del mes · {usdCorto(totales.cobradoAnterior)} de meses anteriores
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Wallet size={14} className="text-blue-500" /> Por cobrar <span className="text-slate-400">(hoy)</span></div>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{usd(totales.porCobrar)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><AlertTriangle size={14} className="text-red-500" /> Vencido <span className="text-slate-400">(hoy)</span></div>
              <p className="mt-1 text-2xl font-bold text-red-700 tabular-nums">{usd(totales.vencido)}</p>
              {totales.porCobrar > 0 && (
                <p className="text-xs text-slate-500">{Math.round((totales.vencido / totales.porCobrar) * 100)}% de lo pendiente</p>
              )}
            </div>
          </div>

          {/* Tabla por vendedor */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${th} text-left`}>Vendedor</th>
                  <th className={`${th} text-right`}>Facturado</th>
                  <th className={`${th} text-right`}>Cobrado</th>
                  <th className={`${th} text-left w-[180px]`}>Facturado vs cobrado</th>
                  <th className={`${th} text-right`}>Por cobrar</th>
                  <th className={`${th} text-right`}>Vencido</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Sin movimientos en {etiquetaMes(mes).toLowerCase()}.</td></tr>
                )}
                {visibles.map((v) => {
                  const expandido = abierto === v.userId;
                  const q = filtroCliente.trim().toLowerCase();
                  const clientes = expandido ? v.clientes.filter((c) => !q || c.nombre.toLowerCase().includes(q)) : [];
                  return (
                    <Fragment key={v.userId}>
                      <tr
                        className="cursor-pointer hover:bg-blue-50/40"
                        onClick={() => { setAbierto(expandido ? null : v.userId); setFiltroCliente(""); }}
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800">
                            {v.nombre}
                            {v.excluido && <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">asistente</span>}
                          </p>
                          <p className="text-xs text-slate-400">{v.facturas} facturas · {v.pagos} cobros</p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{usd(v.facturado)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <p className="font-semibold text-emerald-700">{usd(v.cobrado)}</p>
                          {v.cobradoAnterior > 0 && (
                            <p className="text-[11px] text-slate-400">{usdCorto(v.cobradoAnterior)} de meses ant.</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(0, (v.facturado / maxBarra) * 100)}%` }} />
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, (v.cobrado / maxBarra) * 100)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{usd(v.porCobrar)}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${v.vencido > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>
                          {usd(v.vencido)}
                        </td>
                        <td className="pr-3 text-slate-400">
                          <ChevronDown size={16} className={`transition-transform ${expandido ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {expandido && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                              <div className="relative w-full max-w-xs">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  value={filtroCliente}
                                  onChange={(e) => setFiltroCliente(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Buscar cliente..."
                                  className="w-full h-8 pl-8 pr-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                              </div>
                              <Link
                                href={`/${locale}/gerente_venta/estado-cuenta/${v.userId}?nombre=${encodeURIComponent(v.nombre)}`}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                              >
                                Estado de cuenta del vendedor <ExternalLink size={14} />
                              </Link>
                            </div>
                            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50">
                                  <tr className="text-slate-500">
                                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                                    <th className="px-3 py-2 text-right font-medium">Facturado</th>
                                    <th className="px-3 py-2 text-right font-medium">Cobrado</th>
                                    <th className="px-3 py-2 text-right font-medium">Por cobrar</th>
                                    <th className="px-3 py-2 text-right font-medium">Vencido</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {clientes.map((c) => (
                                    <tr key={c.partnerId}>
                                      <td className="px-3 py-2 text-slate-700 max-w-[320px] truncate" title={c.nombre}>{c.nombre}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{c.facturado ? usd(c.facturado) : "–"}</td>
                                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{c.cobrado ? usd(c.cobrado) : "–"}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{c.porCobrar ? usd(c.porCobrar) : "–"}</td>
                                      <td className={`px-3 py-2 text-right tabular-nums ${c.vencido > 0 ? "text-red-700 font-medium" : "text-slate-400"}`}>
                                        {c.vencido ? usd(c.vencido) : "–"}
                                      </td>
                                    </tr>
                                  ))}
                                  {clientes.length === 0 && (
                                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Sin clientes.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {visibles.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                    <td className="px-3 py-3">Total</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(totales.facturado)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{usd(totales.cobrado)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 text-[11px] font-normal text-slate-500">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-400" /> Facturado</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Cobrado</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(totales.porCobrar)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-700">{usd(totales.vencido)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3 text-xs text-slate-500">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={verExcluidos} onChange={(e) => setVerExcluidos(e.target.checked)} className="rounded" />
              Incluir asistentes de ventas y cuentas internas
            </label>
            <p className="max-w-3xl text-[11px] leading-relaxed text-slate-400">
              Facturado: facturas y notas de crédito del mes, sin IVA. Cobrado: dinero que entró por banco o caja en el mes (con IVA),
              según la fecha de confirmación del pago; incluye cobros de facturas de meses anteriores. Por cobrar y vencido son el
              saldo pendiente de hoy. Son las mismas cifras de Cuentas por Cobrar; no incluyen al cliente interno Supricom.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
