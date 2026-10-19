"use client";

// Reporte de recompra: cuántas veces volvió a comprar cada cliente que llegó
// por un lead, después de la primera venta. Datos de /api/adminleads/recompra.

import type { ReporteRecompra } from "@/lib/adminleads/recompra";
import { ChevronDown, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

const SEDES: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const campo = "py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600";

export default function RecompraClientes({
  onVerSinRif,
  onListo,
}: {
  onVerSinRif: () => void;
  onListo?: () => void;
}) {
  const [sede, setSede] = useState("");
  const [origen, setOrigen] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState("");
  const [data, setData] = useState<ReporteRecompra | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (sede) p.set("sede", sede);
    if (origen) p.set("origen", origen);
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    return p.toString();
  }, [sede, origen, desde, hasta]);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`/api/adminleads/recompra?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((r) => {
        if (r.error) throw new Error(r.detail || r.error);
        setData(r);
        onListo?.();
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setCargando(false));
    return () => ctrl.abort();
  }, [qs]);

  const clientes = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!data) return [];
    return q
      ? data.clientes.filter((c) => `${c.cliente} ${c.rif} ${c.vendedor}`.toLowerCase().includes(q))
      : data.clientes;
  }, [data, buscar]);

  const r = data?.resumen;
  const maxDist = Math.max(1, ...(r?.distribucion.map((d) => d.clientes) ?? [1]));

  return (
    <div className="space-y-6">
      <div data-tour="filtros" className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm md:items-center flex-wrap">
        <select className={campo} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
          <option value="">Todas las sedes</option>
          {Object.entries(SEDES).map(([id, n]) => (
            <option key={id} value={id}>{n}</option>
          ))}
        </select>
        <select className={campo} value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Origen del lead">
          <option value="">Leads del panel y de Excel</option>
          <option value="Panel">Solo leads del panel</option>
          <option value="Excel">Solo leads de Excel</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Primera venta desde
          <input type="date" className={campo} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          hasta
          <input type="date" className={campo} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <a
          data-tour="exportar"
          href={`/api/adminleads/recompra/export?${qs}`}
          className="md:ml-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
        >
          <Download className="w-3.5 h-3.5" /> Exportar Excel
        </a>
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      {cargando && !data && (
        <div className="flex items-center justify-center py-20 text-zinc-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-3" /> Cruzando leads con la facturación…
        </div>
      )}

      {r && data && (
        <div className={cargando ? "opacity-50 pointer-events-none transition-opacity" : ""}>
          <div data-tour="resumen" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ["Clientes de leads", r.clientes.toLocaleString()],
              ["Volvieron a comprar", `${r.conRecompra.toLocaleString()}${r.pctRecompra != null ? ` (${r.pctRecompra}%)` : ""}`],
              ["Compras después", r.comprasDespues.toLocaleString()],
              ["Monto después", usd(r.montoDespues)],
              ["Ya eran clientes", r.yaEranClientes.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{k}</p>
                <p className="text-xl font-black text-zinc-800 mt-1 tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1fr_2fr] gap-4 mt-4">
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
              <p className="text-sm font-bold text-zinc-700 mb-3">Compras después de la primera venta</p>
              <div className="space-y-2">
                {r.distribucion.map((d) => (
                  <div key={d.rango} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-zinc-500">{d.rango}</span>
                    <div className="flex-1 h-4 bg-zinc-50 rounded">
                      <div className="h-4 bg-blue-500 rounded" style={{ width: `${(d.clientes * 100) / maxDist}%` }} />
                    </div>
                    <span className="w-10 text-right font-semibold tabular-nums text-zinc-700">{d.clientes}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 text-xs text-zinc-500 space-y-1.5">
              <p>
                Las compras se buscan <b>por RIF</b>, en todas las sedes: hasta el {data.corte} en Smartbit y desde esa
                fecha en Odoo (facturas de cliente; las notas de crédito no cuentan).
              </p>
              <p>
                Las facturas de hasta {data.ventana} días después de la primera venta se toman como parte de ella (la
                factura del día siguiente, un pedido partido). Si un cliente vino por varios leads, cuenta desde el primero.
              </p>
              <p>
                &quot;Ya eran clientes&quot; = compraron antes de que entrara el lead (Smartbit desde un año antes del
                primer lead).
              </p>
              {data.sinRif.length > 0 && (
                <p className="text-amber-700">
                  {data.sinRif.length} lead(s) vendidos no entran porque no se les ubicó el RIF.{" "}
                  <button onClick={onVerSinRif} className="underline font-semibold">
                    Revisar los de Excel en &quot;Por revisar&quot;
                  </button>
                  ; los del panel se corrigen cargando el RIF en el lead.
                </p>
              )}
            </div>
          </div>

          <div data-tour="tabla" className="bg-white rounded-2xl border border-zinc-100 shadow-sm mt-4">
            <div className="p-4 flex items-center gap-3 border-b border-zinc-100">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Buscar cliente, RIF o vendedor…"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                />
              </div>
              <span className="text-xs text-zinc-400">{clientes.length} clientes</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50">
                  <tr>
                    <th className="w-8" />
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-left px-3 py-2">Sede</th>
                    <th className="text-left px-3 py-2">Lead</th>
                    <th className="text-left px-3 py-2">Vendedor</th>
                    <th className="text-left px-3 py-2">Primera venta</th>
                    <th className="text-right px-3 py-2">Compras después</th>
                    <th className="text-right px-3 py-2">Monto después</th>
                    <th className="text-right px-3 py-2">Días a la 2.ª</th>
                    <th className="text-left px-3 py-2">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => {
                    const ver = abierto === c.rif;
                    return (
                      <Fragment key={c.rif}>
                        <tr
                          className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                          onClick={() => setAbierto(ver ? null : c.rif)}
                        >
                          <td className="pl-3 text-zinc-400">
                            {c.comprasDespues > 0 && (ver ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-zinc-800">{c.cliente}</p>
                            <p className="text-[11px] text-zinc-400">
                              {c.rif}
                              {c.comprasAntes > 0 && (
                                <span className="ml-2 text-amber-600">ya era cliente ({c.comprasAntes} compras antes)</span>
                              )}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-zinc-600">{(c.sede != null && SEDES[c.sede]) || "—"}</td>
                          <td className="px-3 py-2 text-zinc-600">
                            <p>{c.origen}</p>
                            <p className="text-[11px] text-zinc-400">{c.campana}</p>
                          </td>
                          <td className="px-3 py-2 text-zinc-600">{c.vendedor || "—"}</td>
                          <td className="px-3 py-2 text-zinc-600 tabular-nums whitespace-nowrap">
                            <p>{c.primeraVenta}</p>
                            {c.montoPrimera > 0 && <p className="text-[11px] text-zinc-400">{usd(c.montoPrimera)}</p>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-zinc-800">{c.comprasDespues}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{usd(c.montoDespues)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{c.diasHastaRecompra ?? "—"}</td>
                          <td className="px-3 py-2 text-zinc-600 tabular-nums whitespace-nowrap">{c.ultimaCompra ?? "—"}</td>
                        </tr>
                        {ver && c.despues.length > 0 && (
                          <tr className="bg-zinc-50/60">
                            <td />
                            <td colSpan={9} className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {c.despues.map((d, i) => (
                                  <span key={i} className="text-[11px] bg-white border border-zinc-200 rounded-lg px-2 py-1 tabular-nums">
                                    {d.fecha} · {SEDES[d.sede] ?? d.sede} · {d.fuente} {d.documento} · <b>{usd(d.monto)}</b>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {clientes.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center text-zinc-400 py-10 text-sm">
                        No hay clientes con estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
