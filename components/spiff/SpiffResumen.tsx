"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Award, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Loader2, Percent, Receipt, Target, Trophy, Users,
} from "lucide-react";
import type { FacturaSpiff } from "@/lib/spiff/calculo";

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
  monto: number;
  cantidad: number;
  productos: { nombre: string; monto: number; cantidad: number }[];
}
interface Vendedor {
  userId: number;
  nombre: string;
  totalSpiff: number;
  facturado: number;
  facturas: number;
  excluido: boolean;
  detalle: Detalle[];
}
interface Regla {
  id: number;
  brand_name: string;
  tipo: string;
  product_name: string | null;
  target_amount: number;
  spiff_amount: number;
  modo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}
interface Resumen {
  mes: string;
  reglas: number;
  reglasDelMes: Regla[];
  totalSpiff: number;
  vendedores: Vendedor[];
}

const SEDES = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
  { id: 7, nombre: "Panamá" },
];
/** Un vendedor está "cerca" de una regla si no completó ninguna meta pero ya lleva este tanto. */
const UMBRAL_CERCA = 0.75;

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
const MESES = Array.from({ length: 24 }, (_, i) => moverMes(mesActual(), -i));
const fechaCorta = (f: string | null) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : null);
const nombreRegla = (marca: string, producto: string | null) => (producto ? `${marca} · ${producto}` : marca);
const enModo = (modo: string, n: number, dec = 2) => (modo === "cantidad" ? `${num(n)} uds` : usd(n, dec));
const pct = (n: number) => `${(n * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;

/** Avance hacia la próxima meta de una regla: lo que lleva del bloque en curso y lo que le falta. */
function avance(d: { vendido: number; meta: number }) {
  if (d.meta <= 0 || d.vendido <= 0) return { parte: 0, falta: d.meta };
  const resto = d.vendido % d.meta;
  return { parte: resto / d.meta, falta: d.meta - resto };
}

function Barra({ valor, tono = "amber" }: { valor: number; tono?: "amber" | "emerald" }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${tono === "emerald" ? "bg-emerald-500" : "bg-amber-500"}`}
        style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%` }}
      />
    </div>
  );
}

function Tarjeta({ icono, titulo, valor, detalle }: { icono: React.ReactNode; titulo: string; valor: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">{icono} {titulo}</div>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums truncate">{valor}</p>
      {detalle && <p className="text-xs text-slate-500 truncate">{detalle}</p>}
    </div>
  );
}

/**
 * Facturas y NC de un vendedor que suman a una regla en el mes (las mismas
 * líneas del cálculo: `/api/vendedores/spiff/facturas`).
 */
function FacturasRegla({ companyId, mes, reglaId, vendedor, modo }: { companyId: number | null; mes: string; reglaId: number; vendedor: string; modo: string }) {
  const [estado, setEstado] = useState<{ cargando: boolean; error: boolean; facturas: FacturaSpiff[] }>({ cargando: true, error: false, facturas: [] });
  useEffect(() => {
    let cancelado = false;
    const [y, m] = mes.split("-").map(Number);
    const params = new URLSearchParams({ regla_id: String(reglaId), vendedor, year: String(y), month: String(m) });
    if (companyId) params.set("company_id", String(companyId));
    fetch(`/api/vendedores/spiff/facturas?${params}`, { credentials: "include" })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (cancelado) return;
        setEstado(r.ok && json ? { cargando: false, error: false, facturas: json.facturas || [] } : { cargando: false, error: true, facturas: [] });
      })
      .catch(() => { if (!cancelado) setEstado({ cargando: false, error: true, facturas: [] }); });
    return () => { cancelado = true; };
  }, [companyId, mes, reglaId, vendedor]);

  if (estado.cargando) {
    return <div className="flex items-center gap-2 py-3 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Buscando las facturas en Odoo…</div>;
  }
  if (estado.error) return <p className="py-3 text-xs text-red-600">No se pudieron traer las facturas.</p>;
  if (estado.facturas.length === 0) return <p className="py-3 text-xs text-slate-500">Sin facturas para esta regla.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[520px]">
        <thead>
          <tr className="text-slate-500">
            <th className="py-1.5 text-left font-medium">Factura</th>
            <th className="py-1.5 text-left font-medium">Fecha</th>
            <th className="py-1.5 text-left font-medium">Cliente</th>
            <th className="py-1.5 text-right font-medium">Monto sin IVA</th>
            <th className="py-1.5 text-right font-medium">Unidades</th>
          </tr>
        </thead>
        <tbody>
          {estado.facturas.map((f) => (
            <tr key={f.id} className={f.notaCredito ? "text-red-600" : "text-slate-700"}>
              <td className="py-1 font-medium whitespace-nowrap">{f.numero}{f.notaCredito && <span className="ml-1 text-[10px] font-semibold uppercase">NC</span>}</td>
              <td className="py-1 whitespace-nowrap">{fechaCorta(f.fecha)}</td>
              <td className="py-1 max-w-[260px] truncate">{f.cliente}</td>
              <td className={`py-1 text-right tabular-nums ${modo === "monto" ? "font-semibold" : ""}`}>{usd(f.monto)}</td>
              <td className={`py-1 text-right tabular-nums ${modo === "cantidad" ? "font-semibold" : ""}`}>{num(f.cantidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Resumen de SPIFF de un mes: cuánto se paga, quién lo ganó, cómo le fue a
 * cada regla y las facturas detrás de cada número. Mes y sede elegibles
 * (la sede solo para los roles que la eligen; la API decide).
 */
export default function SpiffResumen() {
  const [mes, setMes] = useState(mesActual);
  const [sede, setSede] = useState<number | null>(null);
  const [eligeSede, setEligeSede] = useState(false);
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [reintento, setReintento] = useState(0);
  const [vista, setVista] = useState<"vendedores" | "reglas">("vendedores");
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [verSinSpiff, setVerSinSpiff] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  // Facturas abiertas: `${reglaId}|${vendedor}`.
  const [facturasDe, setFacturasDe] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    setAbierto(null);
    setFacturasDe(null);
    const params = new URLSearchParams({ mes });
    if (sede) params.set("company_id", String(sede));
    fetch(`/api/gerente_venta/spiff/resumen?${params}`, { credentials: "include" })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && json?.success) {
          setData(json.data);
          setEligeSede(!!json.eligeSede);
          if (!sede && json.companyId) setSede(Number(json.companyId));
        } else { setData(null); setError(true); }
      })
      .catch(() => { if (!cancelado) { setData(null); setError(true); } })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
    // `sede` se completa con la respuesta: no vuelve a pedir si es la misma.
  }, [mes, sede, reintento]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(
    () => (data?.vendedores || []).filter((v) => verExcluidos || !v.excluido),
    [data, verExcluidos],
  );
  const conSpiff = visibles.filter((v) => v.totalSpiff > 0);
  const sinSpiff = visibles.filter((v) => v.totalSpiff <= 0);
  const totalSpiff = conSpiff.reduce((s, v) => s + v.totalSpiff, 0);
  const facturado = visibles.reduce((s, v) => s + v.facturado, 0);

  // Métricas por regla con los vendedores visibles.
  const porRegla = useMemo(() => {
    return (data?.reglasDelMes || []).map((r) => {
      const filas = visibles
        .map((v) => ({ vendedor: v, d: v.detalle.find((d) => d.reglaId === r.id) }))
        .filter((x): x is { vendedor: Vendedor; d: Detalle } => !!x.d)
        .sort((a, b) => b.d.spiff - a.d.spiff || b.d.vendido - a.d.vendido);
      const modo = r.modo === "cantidad" ? "cantidad" : "monto";
      return {
        regla: r,
        modo,
        filas,
        vendido: filas.reduce((s, x) => s + x.d.vendido, 0),
        spiff: filas.reduce((s, x) => s + x.d.spiff, 0),
        ganaron: filas.filter((x) => x.d.spiff > 0).length,
        cerca: filas.filter((x) => x.d.metasCumplidas === 0 && x.d.vendido >= r.target_amount * UMBRAL_CERCA).length,
      };
    }).sort((a, b) => b.spiff - a.spiff || b.vendido - a.vendido);
  }, [data, visibles]);
  const reglasQuePagaron = porRegla.filter((r) => r.spiff > 0).length;
  const cercaTotal = porRegla.reduce((s, r) => s + r.cerca, 0);
  const mejorRegla = porRegla[0]?.spiff > 0 ? porRegla[0] : null;
  const nombreSede = SEDES.find((s) => s.id === sede)?.nombre;

  const descargarExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const vendedores = visibles.flatMap((v) =>
      v.detalle.map((d) => ({
        Vendedor: v.nombre,
        "Facturado del mes (sin IVA)": v.facturado,
        Regla: nombreRegla(d.marca, d.producto),
        Modo: d.modo === "monto" ? "Monto ($)" : "Cantidad (uds)",
        Vendido: d.vendido,
        "Meta por spiff": d.meta,
        "Metas cumplidas": d.metasCumplidas,
        "Spiff por meta": d.spiffPorMeta,
        "Spiff ganado": d.spiff,
        "Falta para la próxima meta": avance(d).falta,
      })),
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendedores), "Por vendedor");
    const reglas = porRegla.map((r) => ({
      Regla: nombreRegla(r.regla.brand_name, r.regla.tipo === "producto" ? r.regla.product_name : null),
      Modo: r.modo === "monto" ? "Monto ($)" : "Cantidad (uds)",
      Desde: fechaCorta(r.regla.fecha_inicio) || "",
      Hasta: fechaCorta(r.regla.fecha_fin) || "",
      "Meta por spiff": r.regla.target_amount,
      "Spiff por meta": r.regla.spiff_amount,
      "Vendido (todos)": r.vendido,
      "Vendedores con venta": r.filas.length,
      "Ganaron spiff": r.ganaron,
      "Cerca de la meta": r.cerca,
      "Spiff pagado": r.spiff,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reglas), "Por regla");
    XLSX.writeFile(wb, `spiff-${nombreSede ? `${nombreSede.toLowerCase()}-` : ""}${mes}.xlsx`);
  };

  const toggleFacturas = (clave: string) => setFacturasDe((f) => (f === clave ? null : clave));

  return (
    <div className="space-y-5">
      {/* Encabezado y filtros */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Spiff de {etiquetaMes(mes).toLowerCase()}{nombreSede ? ` · ${nombreSede}` : ""}</h2>
          <p className="text-sm text-slate-500">Cuánto se paga, quién lo ganó y cómo le fue a cada regla, con las facturas que lo componen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eligeSede && (
            <select
              value={sede ?? ""}
              onChange={(e) => setSede(Number(e.target.value) || null)}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700"
              aria-label="Sede"
            >
              {SEDES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          )}
          <div className="flex items-center h-9 rounded-xl border border-slate-200 bg-white">
            <button onClick={() => setMes((m) => moverMes(m, -1))} className="h-full px-2 hover:bg-slate-50 rounded-l-xl" aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-full bg-transparent px-1 text-sm font-semibold text-slate-700 outline-none cursor-pointer"
              aria-label="Mes"
            >
              {(MESES.includes(mes) ? MESES : [mes, ...MESES]).map((m) => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
            </select>
            <button
              onClick={() => setMes((m) => moverMes(m, 1))}
              disabled={mes >= mesActual()}
              className="h-full px-2 hover:bg-slate-50 rounded-r-xl disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={descargarExcel}
            disabled={!data || visibles.length === 0}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-100" />)}
          </div>
          <div className="h-64 rounded-2xl bg-slate-100" />
          <p className="text-center text-xs text-slate-400">Calculando con las facturas de Odoo del mes…</p>
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
          No hubo reglas de spiff vigentes en {etiquetaMes(mes).toLowerCase()}{nombreSede ? ` en ${nombreSede}` : ""}.
        </div>
      ) : data ? (
        <>
          {/* Métricas */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Tarjeta
              icono={<Award size={14} className="text-amber-500" />}
              titulo="Spiff a pagar"
              valor={usd(totalSpiff)}
              detalle={`${reglasQuePagaron} de ${porRegla.length} regla(s) pagaron`}
            />
            <Tarjeta
              icono={<Users size={14} className="text-emerald-500" />}
              titulo="Vendedores que ganaron"
              valor={<>{conSpiff.length}<span className="text-base font-medium text-slate-400"> / {visibles.length}</span></>}
              detalle={conSpiff.length > 0 ? `Promedio ${usd(totalSpiff / conSpiff.length)} por vendedor` : "Nadie completó una meta"}
            />
            <Tarjeta
              icono={<Receipt size={14} className="text-sky-500" />}
              titulo="Facturado del mes (sin IVA)"
              valor={usd(facturado, 0)}
              detalle={`${visibles.reduce((s, v) => s + v.facturas, 0)} factura(s), NC restadas`}
            />
            <Tarjeta
              icono={<Percent size={14} className="text-slate-500" />}
              titulo="Spiff sobre lo facturado"
              valor={facturado > 0 ? pct(totalSpiff / facturado) : "–"}
              detalle="Costo del incentivo del mes"
            />
            <Tarjeta
              icono={<Trophy size={14} className="text-violet-500" />}
              titulo="Regla que más pagó"
              valor={mejorRegla ? nombreRegla(mejorRegla.regla.brand_name, mejorRegla.regla.tipo === "producto" ? mejorRegla.regla.product_name : null) : "–"}
              detalle={mejorRegla ? `${usd(mejorRegla.spiff)} · ${mejorRegla.ganaron} vendedor(es)` : undefined}
            />
            <Tarjeta
              icono={<Target size={14} className="text-rose-500" />}
              titulo="Cerca de la meta"
              valor={cercaTotal}
              detalle={`Sin spiff pero con ${pct(UMBRAL_CERCA)} o más de una meta`}
            />
          </div>

          {/* Vistas */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {([["vendedores", "Por vendedor"], ["reglas", "Por regla"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setVista(v); setAbierto(null); setFacturasDe(null); }}
                className={`px-4 h-8 rounded-lg text-sm font-semibold transition-colors ${vista === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {vista === "vendedores" ? (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Vendedor</th>
                    <th className="px-4 py-3 text-left">Reglas que ganó</th>
                    <th className="px-4 py-3 text-right">Facturado del mes</th>
                    <th className="px-4 py-3 text-right">Spiff ganado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(verSinSpiff ? visibles : conSpiff).length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Nadie alcanzó una meta de spiff este mes.</td></tr>
                  )}
                  {(verSinSpiff ? [...conSpiff, ...sinSpiff] : conSpiff).map((v) => {
                    const ganadoras = v.detalle.filter((d) => d.spiff > 0);
                    const expandido = abierto === v.nombre;
                    return (
                      <Fragment key={v.nombre}>
                        <tr className="cursor-pointer hover:bg-amber-50/40" onClick={() => { setAbierto(expandido ? null : v.nombre); setFacturasDe(null); }}>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {v.nombre}
                            {v.excluido && <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">asistente</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {ganadoras.length === 0 && <span className="text-xs text-slate-400">{v.detalle.length > 0 ? `Vendió en ${v.detalle.length} regla(s), sin meta completa` : "Sin ventas en las reglas"}</span>}
                              {ganadoras.map((d) => (
                                <span key={d.reglaId} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                  {nombreRegla(d.marca, d.producto)} <span className="tabular-nums text-amber-600">{usd(d.spiff, 0)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{usd(v.facturado)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${v.totalSpiff > 0 ? "text-emerald-700" : "text-slate-400"}`}>{usd(v.totalSpiff)}</td>
                          <td className="pr-4 text-slate-400">
                            <ChevronDown size={16} className={`transition-transform ${expandido ? "rotate-180" : ""}`} />
                          </td>
                        </tr>
                        {expandido && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={5} className="px-4 py-3">
                              {v.detalle.length === 0 ? (
                                <p className="text-xs text-slate-500">No vendió nada de las marcas o productos con regla este mes.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500">
                                      <th className="py-1.5 text-left font-medium">Regla</th>
                                      <th className="py-1.5 text-right font-medium">Vendido</th>
                                      <th className="py-1.5 text-right font-medium">Meta</th>
                                      <th className="py-1.5 text-right font-medium">Metas</th>
                                      <th className="py-1.5 text-left font-medium pl-4 w-40">Próxima meta</th>
                                      <th className="py-1.5 text-right font-medium">Ganado</th>
                                      <th className="w-20" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {v.detalle.map((d) => {
                                      const a = avance(d);
                                      const clave = `${d.reglaId}|${v.nombre}`;
                                      return (
                                        <Fragment key={d.reglaId}>
                                          <tr className={d.spiff > 0 ? "text-slate-800" : "text-slate-500"}>
                                            <td className="py-1.5">{nombreRegla(d.marca, d.producto)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{enModo(d.modo, d.vendido)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{enModo(d.modo, d.meta, 0)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{d.metasCumplidas} × {usd(d.spiffPorMeta, 0)}</td>
                                            <td className="py-1.5 pl-4">
                                              <Barra valor={a.parte} />
                                              <span className="text-[10px] text-slate-500">faltan {enModo(d.modo, a.falta, 0)}</span>
                                            </td>
                                            <td className="py-1.5 text-right tabular-nums font-semibold">{usd(d.spiff)}</td>
                                            <td className="py-1.5 text-right">
                                              {!v.excluido && (
                                                <button
                                                  onClick={() => toggleFacturas(clave)}
                                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline"
                                                >
                                                  <FileText size={12} /> {facturasDe === clave ? "Ocultar" : "Facturas"}
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          {facturasDe === clave && (
                                            <tr>
                                              <td colSpan={7} className="pb-2 pl-3 border-l-2 border-amber-300">
                                                <FacturasRegla companyId={sede} mes={mes} reglaId={d.reglaId} vendedor={v.nombre} modo={d.modo} />
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Regla</th>
                    <th className="px-4 py-3 text-left">Vigencia</th>
                    <th className="px-4 py-3 text-right">Meta → spiff</th>
                    <th className="px-4 py-3 text-right">Vendido</th>
                    <th className="px-4 py-3 text-right">Con venta</th>
                    <th className="px-4 py-3 text-right">Ganaron</th>
                    <th className="px-4 py-3 text-right">Cerca</th>
                    <th className="px-4 py-3 text-right">Spiff pagado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porRegla.map((r) => {
                    const clave = `regla-${r.regla.id}`;
                    const expandido = abierto === clave;
                    const producto = r.regla.tipo === "producto" ? r.regla.product_name : null;
                    return (
                      <Fragment key={r.regla.id}>
                        <tr className="cursor-pointer hover:bg-amber-50/40" onClick={() => { setAbierto(expandido ? null : clave); setFacturasDe(null); }}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-800">{nombreRegla(r.regla.brand_name, producto)}</span>
                            <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">{r.regla.tipo === "producto" ? "producto" : "marca"} · {r.modo === "monto" ? "$" : "uds"}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {fechaCorta(r.regla.fecha_inicio) || "sin inicio"} → {fechaCorta(r.regla.fecha_fin) || "sin fin"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 whitespace-nowrap">{enModo(r.modo, r.regla.target_amount, 0)} → {usd(r.regla.spiff_amount, 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{enModo(r.modo, r.vendido)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.filas.length}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.ganaron}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.cerca}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${r.spiff > 0 ? "text-emerald-700" : "text-slate-400"}`}>{usd(r.spiff)}</td>
                          <td className="pr-4 text-slate-400">
                            <ChevronDown size={16} className={`transition-transform ${expandido ? "rotate-180" : ""}`} />
                          </td>
                        </tr>
                        {expandido && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={9} className="px-4 py-3">
                              {r.filas.length === 0 ? (
                                <p className="text-xs text-slate-500">Ningún vendedor vendió de esta regla en el mes.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500">
                                      <th className="py-1.5 text-left font-medium">Vendedor</th>
                                      <th className="py-1.5 text-right font-medium">Vendido</th>
                                      <th className="py-1.5 text-right font-medium">Metas</th>
                                      <th className="py-1.5 text-left font-medium pl-4 w-40">Próxima meta</th>
                                      <th className="py-1.5 text-left font-medium pl-4">Productos</th>
                                      <th className="py-1.5 text-right font-medium">Ganado</th>
                                      <th className="w-20" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.filas.map(({ vendedor: v, d }) => {
                                      const a = avance(d);
                                      const claveF = `${d.reglaId}|${v.nombre}`;
                                      return (
                                        <Fragment key={v.nombre}>
                                          <tr className={d.spiff > 0 ? "text-slate-800" : "text-slate-500"}>
                                            <td className="py-1.5 font-medium">{v.nombre}</td>
                                            <td className="py-1.5 text-right tabular-nums">{enModo(d.modo, d.vendido)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{d.metasCumplidas}</td>
                                            <td className="py-1.5 pl-4">
                                              <Barra valor={a.parte} tono={d.metasCumplidas === 0 && d.vendido >= d.meta * UMBRAL_CERCA ? "emerald" : "amber"} />
                                              <span className="text-[10px] text-slate-500">faltan {enModo(d.modo, a.falta, 0)}</span>
                                            </td>
                                            <td className="py-1.5 pl-4 max-w-[280px] truncate" title={d.productos.map((p) => `${p.nombre} (${num(p.cantidad)})`).join(" · ")}>
                                              {d.productos.slice(0, 3).map((p) => `${p.nombre} (${num(p.cantidad)})`).join(" · ")}
                                              {d.productos.length > 3 && ` +${d.productos.length - 3}`}
                                            </td>
                                            <td className="py-1.5 text-right tabular-nums font-semibold">{usd(d.spiff)}</td>
                                            <td className="py-1.5 text-right">
                                              {!v.excluido && (
                                                <button
                                                  onClick={() => toggleFacturas(claveF)}
                                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline"
                                                >
                                                  <FileText size={12} /> {facturasDe === claveF ? "Ocultar" : "Facturas"}
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          {facturasDe === claveF && (
                                            <tr>
                                              <td colSpan={7} className="pb-2 pl-3 border-l-2 border-amber-300">
                                                <FacturasRegla companyId={sede} mes={mes} reglaId={d.reglaId} vendedor={v.nombre} modo={d.modo} />
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={verExcluidos} onChange={(e) => setVerExcluidos(e.target.checked)} className="rounded" />
              Incluir asistentes de ventas
            </label>
            {vista === "vendedores" && sinSpiff.length > 0 && (
              <button onClick={() => setVerSinSpiff((x) => !x)} className="underline-offset-2 hover:underline">
                {verSinSpiff ? "Ocultar" : "Ver"} {sinSpiff.length} vendedor(es) sin spiff
              </button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Se gana el spiff por cada meta completa de la regla (monto sin IVA o unidades). Solo cuentan las facturas dentro de las fechas de cada regla, y las notas de crédito restan.
          </p>
        </>
      ) : null}
    </div>
  );
}
