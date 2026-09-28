"use client";

/**
 * Metas por Marca (SuperAdmin > Ventas): el superadmin asigna una meta de
 * venta mensual a cada marca por sede, y ve cuánto % de esa meta lleva cada
 * una (contra el mes completo y contra lo esperado a hoy), su proyección, y
 * una auditoría de los datos de Odoo detrás de los números.
 *
 * Datos: /api/superadmin/metas-marca (+ /auditoria). Metas propias, separadas
 * de las del KPI Cobertura de marcas del Stoplight.
 */

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Download, MapPin, RefreshCw, Target } from "lucide-react";
import { AuditoriaPanel } from "./AuditoriaPanel";
import { DetalleMarca } from "./DetalleMarca";
import { EditorMetas } from "./EditorMetas";
import { ResumenMetas } from "./ResumenMetas";
import { TablaMarcas } from "./TablaMarcas";
import { ESTADO_UI, dinero, nombreMes, porcentaje, type DatosMetas, type EstadoMarca, type FilaMarca } from "./formato";

type Tab = "cumplimiento" | "metas" | "auditoria";

const SEDES = [
  { id: "9", nombre: "Valencia" },
  { id: "10", nombre: "Caracas" },
  { id: "7", nombre: "Panamá" },
  { id: "todas", nombre: "Todas las sedes" },
];

const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mover = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  return mesDe(new Date(y, m - 1 + delta, 1));
};

export function MetasMarcaVentas() {
  const [sede, setSede] = useState("9");
  const [mes, setMes] = useState(() => mesDe(new Date()));
  const [ic, setIc] = useState(false);
  const [tab, setTab] = useState<Tab>("cumplimiento");
  const [data, setData] = useState<DatosMetas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState<{ n: number; forzar: boolean }>({ n: 0, forzar: false });
  const [filtroEstado, setFiltroEstado] = useState<EstadoMarca | "todas">("todas");
  const [detalle, setDetalle] = useState<FilaMarca | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams({ company_id: sede, mes });
    if (ic) qs.set("ic", "1");
    if (recarga.forzar) qs.set("refrescar", "1");
    fetch(`/api/superadmin/metas-marca?${qs}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setData(j.data);
        else setError(j?.error || "No se pudieron cargar los datos");
      })
      .catch(() => { if (!cancelado) setError("No se pudieron cargar los datos"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [sede, mes, ic, recarga]);

  const recargar = useCallback((forzar = false) => setRecarga((x) => ({ n: x.n + 1, forzar })), []);

  const exportar = () => {
    if (!data) return;
    const enCurso = data.periodo.estado === "en_curso";
    const filas = data.marcas
      .filter((m) => m.meta != null || m.vendido !== 0)
      .map((m) => ({
        Marca: m.marca,
        "Meta (USD)": m.meta ?? "",
        "Vendido (USD)": m.vendido,
        "% Meta": m.cumplimiento ?? "",
        ...(enCurso ? { "Meta al día": m.metaAlDia ?? "", "% Al día": m.cumplimientoAlDia ?? "", Proyección: m.proyeccion ?? "", "% Proyección": m.proyeccionPct ?? "" } : {}),
        Falta: m.falta ?? "",
        "% de la venta": m.participacion,
        Estado: ESTADO_UI[m.estado].label,
        "Prom. 3 meses": m.promedio3m,
        Facturas: m.facturas,
        Clientes: m.clientes,
      }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Metas por marca");
    XLSX.writeFile(wb, `metas-por-marca-${SEDES.find((s) => s.id === sede)?.nombre}-${mes}.xlsx`);
  };

  const p = data?.periodo;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl"><Target className="text-blue-600" size={24} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Metas por Marca</h1>
            <p className="text-sm text-slate-500">Meta de venta de cada marca y cuánto llevamos contra ella</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-white border rounded-xl p-1.5 flex items-center gap-1 shadow-sm">
            <MapPin size={16} className="text-slate-400 ml-2" />
            <select
              value={sede}
              onChange={(e) => { setSede(e.target.value); setDetalle(null); }}
              className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer outline-none pr-2"
            >
              {SEDES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="bg-white border rounded-xl p-1 flex items-center shadow-sm">
            <button onClick={() => setMes(mover(mes, -1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <label className="flex items-center gap-2 px-2 text-sm font-bold text-slate-700 cursor-pointer">
              <CalendarDays size={15} className="text-slate-400" />
              <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="bg-transparent outline-none cursor-pointer" />
            </label>
            <button onClick={() => setMes(mover(mes, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
          <label className="bg-white border rounded-xl px-3 h-10 flex items-center gap-2 shadow-sm text-xs font-semibold text-slate-600 cursor-pointer select-none" title="Ventas a empresas del grupo (Valencia → Caracas, etc.)">
            <input type="checkbox" checked={ic} onChange={(e) => setIc(e.target.checked)} className="rounded border-slate-300" />
            Incluir intercompañía
          </label>
          <button onClick={() => recargar(true)} disabled={cargando} className="h-10 w-10 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Actualizar desde Odoo">
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportar}
            disabled={!data || cargando}
            className="flex items-center gap-2 px-4 h-10 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download size={16} /> Excel
          </button>
        </div>
      </div>

      {/* Avance del mes */}
      {p && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm font-bold text-slate-800">{nombreMes(data!.mes)}</p>
          <div className="flex-1 min-w-[180px] h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min(p.avance, 100)}%` }} />
          </div>
          <p className="text-xs text-slate-500">
            {p.estado === "en_curso"
              ? <>Día hábil <b className="text-slate-800">{p.diasTranscurridos}</b> de {p.diasHabiles} · {porcentaje(p.avance)} del mes · quedan {p.diasRestantes}</>
              : p.estado === "cerrado" ? <>Mes cerrado · {p.diasHabiles} días hábiles</> : <>Mes por empezar · {p.diasHabiles} días hábiles</>}
          </p>
          {data!.actualizado.fecha && (
            <p className="text-[11px] text-slate-400">Metas actualizadas {new Date(data!.actualizado.fecha).toLocaleString("es-VE")}{data!.actualizado.por ? ` por ${data!.actualizado.por}` : ""}</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {([
          { id: "cumplimiento", label: "Cumplimiento" },
          { id: "metas", label: "Asignar metas" },
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

      {error && tab !== "auditoria" && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
          <button onClick={() => recargar()} className="font-semibold underline">Reintentar</button>
        </div>
      )}

      {tab === "auditoria" ? (
        <AuditoriaPanel companyParam={sede} mes={mes} />
      ) : cargando && !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
          <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : data ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          {tab === "cumplimiento" ? (
            <>
              <ResumenMetas data={data} onFiltrarEstado={(e) => setFiltroEstado(e)} />
              <TablaMarcas data={data} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado} onAbrir={setDetalle} />
              <p className="text-[11px] leading-relaxed text-slate-400">
                Venta = facturas y notas de crédito de cliente publicadas en Odoo, por fecha de factura, sin IVA, en dólares. Se excluyen las ventas a empresas del grupo
                {data.incluyeIntercompania ? " (ahora incluidas por el filtro)" : ` (${dinero(data.intercompania)} este mes)`}. Las facturas sin vendedor sí cuentan.
                Las marcas repetidas en Odoo solo por mayúsculas o espacios se suman como una.
              </p>
            </>
          ) : (
            // key: al cambiar de sede o mes se descartan los cambios sin guardar
            // (si no, se podían guardar en la otra sede). La sede sale de `data`,
            // no del selector, que cambia antes de que lleguen los datos nuevos.
            <EditorMetas
              key={`${data.sedes.map((s) => s.id).join(",")}|${data.mes}`}
              data={data}
              companyId={data.editable ? data.sedes[0]?.id ?? null : null}
              onGuardado={() => recargar()}
            />
          )}
        </div>
      ) : null}

      {data && <DetalleMarca data={data} fila={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}
