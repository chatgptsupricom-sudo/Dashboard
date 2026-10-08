"use client";

/**
 * Stock por Marca (SuperAdmin > Ventas): de cada marca, el stock, lo vendido
 * y qué % se vendió del total que hubo (vendido ÷ (vendido + stock al
 * cierre)), con la serie mes a mes, el detalle por producto y una auditoría
 * de los datos de Odoo.
 *
 * Datos: /api/superadmin/stock-marca (+ /auditoria). Mismo stock y mismas
 * unidades que Compras (lib/compras/datosOdoo.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Boxes, CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, MapPin, RefreshCw } from "lucide-react";
import { AuditoriaStock } from "./AuditoriaStock";
import { DetalleMarca } from "./DetalleMarca";
import { Resumen } from "./Resumen";
import { TablaMarcas } from "./TablaMarcas";
import {
  ESTADO_UI, dinero, fechaCorta, nombreMes, textoPeriodo,
  type DatosStock, type EstadoStock, type FilaMarca, type FilaProducto,
} from "./formato";

type Tab = "marcas" | "auditoria";
type Modo = "mes" | "30" | "90";

const SEDES = [
  { id: "9", nombre: "Valencia" },
  { id: "10", nombre: "Caracas" },
  { id: "7", nombre: "Panamá" },
  { id: "todas", nombre: "Todas las sedes" },
];

const MODOS: { id: Modo; label: string }[] = [
  { id: "mes", label: "Mes" },
  { id: "30", label: "Últimos 30 días" },
  { id: "90", label: "Últimos 90 días" },
];

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Mes de hoy en Caracas (UTC-4), no el del navegador. */
const mesHoy = () => new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 7);
const mover = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function StockMarca() {
  const [sede, setSede] = useState("9");
  const [modo, setModo] = useState<Modo>("mes");
  const [mes, setMes] = useState(mesHoy);
  const [ic, setIc] = useState(false);
  const [tab, setTab] = useState<Tab>("marcas");
  const [data, setData] = useState<DatosStock | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const forzar = useRef(false);
  const [exportando, setExportando] = useState(false);
  const [filtro, setFiltro] = useState<EstadoStock | "todas">("todas");
  // Se guarda la clave: al recargar, el detalle abierto muestra los números nuevos.
  const [detalleClave, setDetalleClave] = useState<string | null>(null);
  const detalle: FilaMarca | null = (detalleClave && data?.marcas.find((m) => m.clave === detalleClave)) || null;

  const minMes = data?.periodo.minMes ?? "2026-04";
  const icEfectivo = ic && sede !== "todas";
  /** Parámetros de la vista (sin refrescar): los comparten la tabla, el detalle y la auditoría. */
  const query = useMemo(() => {
    const qs = new URLSearchParams({ company_id: sede, modo });
    if (modo === "mes") qs.set("mes", mes);
    if (icEfectivo) qs.set("ic", "1");
    return qs.toString();
  }, [sede, modo, mes, icEfectivo]);

  useEffect(() => { setFiltro("todas"); }, [query]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const refrescar = forzar.current;
    forzar.current = false;
    fetch(`/api/superadmin/stock-marca?${query}${refrescar ? "&refrescar=1" : ""}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setData(j.data);
        else setError(j?.error || "No se pudieron cargar los datos");
      })
      .catch(() => { if (!cancelado) setError("No se pudieron cargar los datos"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [query, recarga]);

  const recargar = useCallback(() => { forzar.current = true; setRecarga((n) => n + 1); }, []);

  const exportar = async () => {
    if (!data) return;
    setExportando(true);
    try {
      const r = await fetch(`/api/superadmin/stock-marca?${query}&productos=1`);
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error || "Error");
      const d = j.data as DatosStock;
      const sedeDe = (id: number) => d.sedes.find((s) => s.id === id)?.nombre ?? id;
      const hayDisp = d.totales.disponible != null;
      const marcas = d.marcas.map((m) => ({
        Marca: m.marca,
        [d.periodo.enCurso ? "Stock hoy (u)" : "Stock al cierre (u)"]: m.stock,
        ...(hayDisp ? { "Disponible (u)": m.disponible ?? "" } : {}),
        "Vendido (u)": m.vendido,
        "% vendido": m.pct ?? "",
        "% vendido período anterior": m.pctAnterior ?? "",
        "Venta sin IVA (USD)": m.ventaUsd,
        "Valor stock al costo (USD)": m.valor,
        "Le alcanza (días)": m.cobertura ?? "",
        "Productos": m.productos,
        "Productos con stock": m.conStock,
        "Productos con stock sin venta": m.sinVenta,
        "Valor sin venta (USD)": m.valorSinVenta,
        "% del stock": m.participacionStock,
        Estado: ESTADO_UI[m.estado].label,
      }));
      const productos = (d.productos || []).map((p: FilaProducto) => ({
        Sede: sedeDe(p.companyId),
        Código: p.codigo,
        Producto: p.nombre,
        "Marca Odoo": p.marcaOdoo || "(sin marca)",
        Categoría: p.categoria,
        Archivado: p.activo ? "No" : "Sí",
        "Stock (u)": p.stock,
        ...(hayDisp ? { "Disponible (u)": p.disponible ?? "" } : {}),
        "Vendido (u)": p.vendido,
        "% vendido": p.pct ?? "",
        "Venta sin IVA (USD)": p.ventaUsd,
        "Costo unitario (USD)": p.costo,
        "Valor stock (USD)": p.valor,
        "Le alcanza (días)": p.cobertura ?? "",
        "Última venta": p.ultimaVenta ?? "",
      }));
      const serie = d.serie.map((s) => ({ Mes: s.mes, "Vendido (u)": s.vendido, "Stock al cierre (u)": s.stock, "% vendido": s.pct ?? "" }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(marcas), "Marcas");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productos), "Productos");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serie), "Mes a mes");
      const nombre = SEDES.find((s) => s.id === sede)?.nombre ?? sede;
      XLSX.writeFile(wb, `stock-por-marca-${nombre}-${d.periodo.desde}-a-${d.periodo.corte}.xlsx`);
    } catch {
      setError("No se pudo generar el Excel");
    } finally {
      setExportando(false);
    }
  };

  const p = data?.periodo;
  const enMesActual = mes >= mesHoy();

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl"><Boxes className="text-blue-600" size={24} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Stock por Marca</h1>
            <p className="text-sm text-slate-500">De todo lo que hubo de cada marca, cuánto se vendió y cuánto queda</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-white border rounded-xl p-1.5 flex items-center gap-1 shadow-sm">
            <MapPin size={16} className="text-slate-400 ml-2" />
            <select
              value={sede}
              onChange={(e) => { setSede(e.target.value); setDetalleClave(null); }}
              aria-label="Sede"
              className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer outline-none pr-2"
            >
              {SEDES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="bg-white border rounded-xl p-1 flex items-center gap-0.5 shadow-sm" role="group" aria-label="Período">
            {MODOS.map((m) => (
              <button key={m.id} onClick={() => { setModo(m.id); setDetalleClave(null); }}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition ${modo === m.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {m.label}
              </button>
            ))}
          </div>
          {modo === "mes" && (
            <div className="bg-white border rounded-xl p-1 flex items-center shadow-sm">
              <button onClick={() => setMes(mover(mes, -1))} disabled={mes <= minMes} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
              <label className="flex items-center gap-2 px-2 text-sm font-bold text-slate-700 cursor-pointer">
                <CalendarDays size={15} className="text-slate-400" />
                <input
                  type="month"
                  value={mes}
                  min={minMes}
                  max={mesHoy()}
                  aria-label="Mes"
                  // Safari muestra un campo de texto: solo se acepta AAAA-MM completo y dentro del rango.
                  onChange={(e) => { const v = e.target.value; if (MES_VALIDO.test(v) && v >= minMes && v <= mesHoy()) setMes(v); }}
                  className="bg-transparent outline-none cursor-pointer"
                />
              </label>
              <button onClick={() => setMes(mover(mes, 1))} disabled={enMesActual} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
            </div>
          )}
          <label
            className={`bg-white border rounded-xl px-3 h-10 flex items-center gap-2 shadow-sm text-xs font-semibold select-none ${sede === "todas" ? "text-slate-300 cursor-not-allowed" : "text-slate-600 cursor-pointer"}`}
            title={sede === "todas" ? "Con todas las sedes no se suma: la mercancía se contaría vendida dos veces" : "Ventas a empresas del grupo (Valencia → Caracas, etc.)"}
          >
            <input type="checkbox" checked={icEfectivo} disabled={sede === "todas"} onChange={(e) => setIc(e.target.checked)} className="rounded border-slate-300" />
            Incluir intercompañía
          </label>
          <button onClick={recargar} disabled={cargando} className="h-10 w-10 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Actualizar desde Odoo" title="Actualizar desde Odoo">
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportar}
            disabled={!data || cargando || exportando}
            className="flex items-center gap-2 px-4 h-10 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Excel
          </button>
        </div>
      </div>

      {/* Período */}
      {p && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex flex-wrap items-center gap-x-6 gap-y-1">
          <p className="text-sm font-bold text-slate-800">{p.modo === "mes" && p.mes ? nombreMes(p.mes) : `Últimos ${p.modo} días`}</p>
          <p className="text-xs text-slate-500">
            Ventas del <b className="text-slate-700">{textoPeriodo(p.desde, p.corte)}</b> ({p.dias} días) · stock {p.enCurso ? <>de <b className="text-slate-700">hoy</b></> : <>al cierre del <b className="text-slate-700">{fechaCorta(p.corte, true)}</b></>} en {data!.sedes.length === 1 ? `el almacén ${data!.sedes[0].almacen}` : data!.sedes.map((s) => `${s.nombre} (${s.almacen})`).join(", ")}
          </p>
          {p.anterior && <p className="text-xs text-slate-400">Comparado con {fechaCorta(p.anterior.desde)}–{fechaCorta(p.anterior.corte, true)}</p>}
          {p.recortado && <p className="text-xs text-amber-700">Empieza el {fechaCorta(p.desde, true)}: antes de esa fecha no se facturaba en Odoo.</p>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {([
          { id: "marcas", label: "Por marca" },
          { id: "auditoria", label: "Auditoría de datos" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && tab === "marcas" && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
          <button onClick={() => setRecarga((n) => n + 1)} className="font-semibold underline">Reintentar</button>
        </div>
      )}

      {tab === "auditoria" ? (
        <AuditoriaStock query={query} />
      ) : cargando && !data ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Leyendo stock y ventas de Odoo…</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
          <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : data ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          <Resumen data={data} onFiltrar={(e) => setFiltro(e)} onAbrir={(f) => setDetalleClave(f.clave)} />
          <TablaMarcas data={data} filtro={filtro} setFiltro={setFiltro} onAbrir={(f) => setDetalleClave(f.clave)} />
          <p className="text-[11px] leading-relaxed text-slate-400">
            Stock = almacén principal de cada sede (Existencias y Entrada), igual que en Compras; no cuenta exhibición, mal estado ni consumo interno.
            {p?.enCurso ? " El de hoy sale de Odoo en vivo" : " El de un día pasado es el histórico de Odoo a esa fecha"}. Solo productos almacenables: los servicios y consumibles no llevan stock.
            {!data.incluyeIntercompania && data.totales.excluido.icUsd !== 0 && ` Se excluyen ${dinero(data.totales.excluido.icUsd)} vendidos a empresas del grupo en el período.`}
            {" "}Valor = stock × costo de la sede en Odoo.
          </p>
        </div>
      ) : null}

      {data && <DetalleMarca data={data} fila={detalle} query={query} onClose={() => setDetalleClave(null)} />}
    </div>
  );
}
