"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Award, ChevronDown, ChevronLeft, ChevronRight, Download, Trophy, Users } from "lucide-react";

interface Detalle {
  reglaId: number;
  tipo: "marca" | "producto";
  marca: string;
  producto: string | null;
  modo: "monto" | "cantidad";
  meta: number;
  spiffPorMeta: number;
  vendido: number;
  metasCumplidas: number;
  spiff: number;
}
interface Vendedor {
  userId: number;
  nombre: string;
  totalSpiff: number;
  facturado: number;
  excluido: boolean;
  detalle: Detalle[];
}
interface Resumen {
  mes: string;
  reglas: number;
  totalSpiff: number;
  vendedores: Vendedor[];
}

const usd = (n: number, dec = 2) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const num = (n: number) => new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(n);
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
const nombreRegla = (d: Detalle) => (d.tipo === "producto" && d.producto ? `${d.marca} · ${d.producto}` : d.marca);
const vendidoTexto = (d: Detalle) => (d.modo === "monto" ? usd(d.vendido) : `${num(d.vendido)} uds`);
const metaTexto = (d: Detalle) => (d.modo === "monto" ? usd(d.meta, 0) : `${num(d.meta)} uds`);

/**
 * Resumen de SPIFF del mes para Gerencia de Ventas: qué vendedor ganó spiff,
 * cuánto y por qué marca(s). Cada fila se abre para ver el cálculo por regla.
 */
export default function SpiffResumen() {
  const [mes, setMes] = useState(mesActual);
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [reintento, setReintento] = useState(0);
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [verSinSpiff, setVerSinSpiff] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    setAbierto(null);
    fetch(`/api/gerente_venta/spiff/resumen?mes=${mes}`, { credentials: "include" })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && json?.success) setData(json.data);
        else { setData(null); setError(true); }
      })
      .catch(() => { if (!cancelado) { setData(null); setError(true); } })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [mes, reintento]);

  const visibles = useMemo(
    () => (data?.vendedores || []).filter((v) => verExcluidos || !v.excluido),
    [data, verExcluidos],
  );
  const conSpiff = visibles.filter((v) => v.totalSpiff > 0);
  const sinSpiff = visibles.filter((v) => v.totalSpiff <= 0);
  const totalSpiff = conSpiff.reduce((s, v) => s + v.totalSpiff, 0);

  // Spiff por marca (suma de todos los vendedores visibles).
  const porMarca = useMemo(() => {
    const m = new Map<string, { spiff: number; vendedores: number }>();
    conSpiff.forEach((v) => {
      const marcas = new Set<string>();
      v.detalle.filter((d) => d.spiff > 0).forEach((d) => {
        const acc = m.get(d.marca) ?? { spiff: 0, vendedores: 0 };
        acc.spiff += d.spiff;
        m.set(d.marca, acc);
        marcas.add(d.marca);
      });
      marcas.forEach((mk) => { m.get(mk)!.vendedores += 1; });
    });
    return [...m.entries()].sort((a, b) => b[1].spiff - a[1].spiff);
  }, [conSpiff]);

  const descargarExcel = async () => {
    const XLSX = await import("xlsx");
    const filas = conSpiff.flatMap((v) =>
      v.detalle.filter((d) => d.spiff > 0).map((d) => ({
        Vendedor: v.nombre,
        Marca: d.marca,
        Producto: d.producto || "",
        Modo: d.modo === "monto" ? "Monto ($)" : "Cantidad (uds)",
        Vendido: d.vendido,
        "Meta por spiff": d.meta,
        "Metas cumplidas": d.metasCumplidas,
        "Spiff por meta": d.spiffPorMeta,
        "Spiff ganado": d.spiff,
      })),
    );
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Spiff");
    XLSX.writeFile(wb, `spiff-${mes}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Spiff ganado en el mes</h2>
          <p className="text-sm text-slate-500">Quién ganó, cuánto y por qué marcas, según las reglas activas.</p>
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
            disabled={conSpiff.length === 0}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-100" />)}
          </div>
          <div className="h-64 rounded-2xl bg-slate-100" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center rounded-2xl border border-slate-200 bg-white">
          <AlertTriangle className="text-amber-500" size={26} />
          <p className="text-sm text-slate-600">No se pudo calcular el spiff del mes.</p>
          <button onClick={() => setReintento((n) => n + 1)} className="h-8 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">
            Reintentar
          </button>
        </div>
      ) : data && data.reglas === 0 ? (
        <div className="py-14 text-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          No hay reglas de spiff activas en {etiquetaMes(mes).toLowerCase()}.
        </div>
      ) : (
        <>
          {/* Tarjetas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Award size={14} className="text-amber-500" /> Spiff total a pagar</div>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{usd(totalSpiff)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Users size={14} className="text-emerald-500" /> Vendedores que ganaron</div>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {conSpiff.length}<span className="text-base font-medium text-slate-400"> / {visibles.length}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Trophy size={14} className="text-violet-500" /> Marca que más pagó</div>
              <p className="mt-1 text-2xl font-bold text-slate-900 truncate">{porMarca[0]?.[0] || "–"}</p>
              {porMarca[0] && <p className="text-xs text-slate-500">{usd(porMarca[0][1].spiff)} · {porMarca[0][1].vendedores} vendedor(es)</p>}
            </div>
          </div>

          {/* Tabla por vendedor */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Vendedor</th>
                  <th className="px-4 py-3 text-left">Marca(s)</th>
                  <th className="px-4 py-3 text-right">Facturado del mes</th>
                  <th className="px-4 py-3 text-right">Spiff ganado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conSpiff.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Nadie alcanzó una meta de spiff este mes.</td></tr>
                )}
                {conSpiff.map((v) => {
                  const ganadoras = v.detalle.filter((d) => d.spiff > 0);
                  const expandido = abierto === v.nombre;
                  return (
                    <Fragment key={v.nombre}>
                      <tr className="cursor-pointer hover:bg-amber-50/40" onClick={() => setAbierto(expandido ? null : v.nombre)}>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {v.nombre}
                          {v.excluido && <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">asistente</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {ganadoras.map((d) => (
                              <span key={d.reglaId} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                {nombreRegla(d)} <span className="tabular-nums text-amber-600">{usd(d.spiff, 0)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{usd(v.facturado)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-700">{usd(v.totalSpiff)}</td>
                        <td className="pr-4 text-slate-400">
                          <ChevronDown size={16} className={`transition-transform ${expandido ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {expandido && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="px-4 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500">
                                  <th className="py-1.5 text-left font-medium">Regla</th>
                                  <th className="py-1.5 text-right font-medium">Vendido</th>
                                  <th className="py-1.5 text-right font-medium">Meta</th>
                                  <th className="py-1.5 text-right font-medium">Metas cumplidas</th>
                                  <th className="py-1.5 text-right font-medium">Spiff por meta</th>
                                  <th className="py-1.5 text-right font-medium">Ganado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {v.detalle.map((d) => (
                                  <tr key={d.reglaId} className={d.spiff > 0 ? "text-slate-800" : "text-slate-400"}>
                                    <td className="py-1.5">{nombreRegla(d)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{vendidoTexto(d)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{metaTexto(d)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{d.metasCumplidas}</td>
                                    <td className="py-1.5 text-right tabular-nums">{usd(d.spiffPorMeta, 0)}</td>
                                    <td className="py-1.5 text-right tabular-nums font-semibold">{usd(d.spiff)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Spiff por marca */}
          {porMarca.length > 1 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Spiff por marca</h3>
              <div className="space-y-2">
                {porMarca.map(([marca, v]) => (
                  <div key={marca} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate text-slate-700">{marca}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${(v.spiff / porMarca[0][1].spiff) * 100}%` }} />
                    </div>
                    <span className="w-28 text-right tabular-nums font-medium text-slate-800">{usd(v.spiff)}</span>
                    <span className="w-24 text-right text-xs text-slate-500">{v.vendedores} vendedor(es)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={verExcluidos} onChange={(e) => setVerExcluidos(e.target.checked)} className="rounded" />
              Incluir asistentes de ventas
            </label>
            {sinSpiff.length > 0 && (
              <button onClick={() => setVerSinSpiff((x) => !x)} className="underline-offset-2 hover:underline">
                {verSinSpiff ? "Ocultar" : "Ver"} {sinSpiff.length} vendedor(es) sin spiff
              </button>
            )}
          </div>
          {verSinSpiff && sinSpiff.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {sinSpiff.map((v) => v.nombre).join(" · ")}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-400">
            Se gana el spiff por cada meta completa de la regla (monto sin IVA o unidades). Solo cuentan las facturas dentro de las fechas de cada regla, y las notas de crédito restan.
          </p>
        </>
      )}
    </div>
  );
}
