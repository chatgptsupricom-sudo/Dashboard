"use client";

/**
 * Auditoría de notas de crédito, facturas anuladas y facturas reabiertas
 * (SuperAdmin). Cada documento con sus alertas (quién, cuándo, qué cambió),
 * resúmenes por motivo/usuario/vendedor/cliente y una verificación de los
 * datos contra Odoo. Datos: /api/superadmin/auditoria-nc (+ /documento,
 * /verificacion). Lógica en lib/auditoria-nc/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CalendarRange, Download, FileSearch, Loader2, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { ALERTAS } from "@/lib/auditoria-nc/analisis";
import { CATEGORIA_LABEL } from "@/lib/auditoria-nc/motivos";
import { Control } from "@/components/superadmin/metas-marca/AuditoriaPanel";
import { CONTROL_UI } from "@/components/superadmin/metas-marca/formato";
import type { EstadoControl } from "@/lib/metas-marca/auditoria";
import type { VerificacionSede } from "@/lib/auditoria-nc/verificacion";
import { DetalleDocumento, type DocumentoAbierto } from "./DetalleDocumento";
import { PestanaAnuladas, PestanaNC, PestanaReabiertas } from "./Pestanas";
import { Resumen } from "./Resumen";
import { PAGO, fecha, type DatosAuditoriaNC } from "./formato";

type Tab = "resumen" | "notas" | "anuladas" | "reabiertas" | "verificacion";
type Preset = "mes" | "mes_anterior" | "trimestre" | "anio" | "personalizado";

const SEDES = [
  { id: "9", nombre: "Valencia" },
  { id: "10", nombre: "Caracas" },
  { id: "7", nombre: "Panamá" },
  { id: "todas", nombre: "Todas las sedes" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangoDe(p: Preset): { desde: string; hasta: string } {
  const hoy = new Date();
  const y = hoy.getFullYear(), m = hoy.getMonth();
  if (p === "mes_anterior") return { desde: iso(new Date(y, m - 1, 1)), hasta: iso(new Date(y, m, 0)) };
  if (p === "trimestre") return { desde: iso(new Date(y, m - 2, 1)), hasta: iso(hoy) };
  if (p === "anio") return { desde: iso(new Date(y, 0, 1)), hasta: iso(hoy) };
  return { desde: iso(new Date(y, m, 1)), hasta: iso(hoy) };
}
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function AuditoriaNC() {
  const [sede, setSede] = useState("9");
  const [preset, setPreset] = useState<Preset>("mes");
  const [rango, setRango] = useState(() => rangoDe("mes"));
  const [importacion, setImportacion] = useState(false);
  const [tab, setTab] = useState<Tab>("resumen");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [data, setData] = useState<DatosAuditoriaNC | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const forzar = useRef(false);
  const [abierto, setAbierto] = useState<DocumentoAbierto | null>(null);
  const [verif, setVerif] = useState<{ clave: string; datos: VerificacionSede[] | null; error: string | null; cargando: boolean }>({ clave: "", datos: null, error: null, cargando: false });

  const query = useMemo(() => new URLSearchParams({ company_id: sede, desde: rango.desde, hasta: rango.hasta }).toString(), [sede, rango]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams(query);
    if (forzar.current) { qs.set("refrescar", "1"); forzar.current = false; }
    fetch(`/api/superadmin/auditoria-nc?${qs}`)
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

  // La verificación relee Odoo entera: solo se pide al abrir su pestaña.
  const cargarVerificacion = useCallback(() => {
    setVerif({ clave: query, datos: null, error: null, cargando: true });
    fetch(`/api/superadmin/auditoria-nc/verificacion?${query}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        setVerif(r.ok && j?.success
          ? { clave: query, datos: j.data.verificaciones, error: null, cargando: false }
          : { clave: query, datos: null, error: j?.error || "No se pudo verificar", cargando: false });
      })
      .catch(() => setVerif({ clave: query, datos: null, error: "No se pudo verificar", cargando: false }));
  }, [query]);
  useEffect(() => { if (tab === "verificacion" && verif.clave !== query && !verif.cargando) cargarVerificacion(); }, [tab, query, verif, cargarVerificacion]);

  const cambiarPreset = (p: Preset) => { setPreset(p); if (p !== "personalizado") setRango(rangoDe(p)); };
  const irA = (t: "notas" | "anuladas" | "reabiertas", c?: string) => { setTab(t); setCodigo(c ?? null); };

  const notas = useMemo(() => (data?.notas || []).filter((n) => importacion || n.categoria !== "importacion"), [data, importacion]);
  const multiSede = (data?.sedes.length || 0) > 1;
  const abrir = (x: { id: number; numero: string; sede: string; alertas: DocumentoAbierto["alertas"] }) => setAbierto({ id: x.id, numero: x.numero, sede: x.sede, alertas: x.alertas });

  const exportar = () => {
    if (!data) return;
    const alertasTxt = (xs: { codigo: string; texto: string; severidad: string }[]) => xs.map((a) => `[${a.severidad}] ${ALERTAS[a.codigo]?.titulo ?? a.codigo}: ${a.texto}`).join(" | ");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notas.map((n) => ({
      Sede: n.sede, "Nota de crédito": n.numero, Fecha: n.fecha, Estado: n.estado, Cliente: n.cliente, Intercompañía: n.intercompania ? "Sí" : "No",
      "Base sin IVA": n.base, Total: n.total, Factura: n.origen?.numero || n.origenNumero, "Fecha factura": n.origen?.fecha || "",
      "Monto factura": n.origen?.base ?? "", "Días desde factura": n.diasDesdeFactura ?? "", Motivo: n.motivo, Categoría: CATEGORIA_LABEL[n.categoria],
      "Creada por": n.creadoPor, Vendedor: n.origen?.vendedor || n.vendedor, Aplicada: PAGO[n.estadoPago] || n.estadoPago, Pendiente: n.residual,
      Alertas: alertasTxt(n.alertas),
    }))), "Notas de crédito");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.anuladas.map((a) => ({
      Sede: a.sede, Documento: a.numero, Tipo: a.tipo === "out_refund" ? "Nota de crédito" : "Factura", Fecha: a.fecha, Cliente: a.cliente,
      "Base sin IVA": a.base, "Monto al emitir": a.montoOriginal ?? "", Emitida: a.fuePublicada ? "Sí" : "No", "Anulada el": a.anuladaEl || "",
      "Anulada por": a.anuladaPor, "Creada por": a.creadoPor, Reemplazo: a.reemplazo?.numero || "", Alertas: alertasTxt(a.alertas),
    }))), "Anuladas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.reabiertas.map((r) => ({
      Sede: r.sede, Documento: r.numero, Tipo: r.tipo === "out_refund" ? "Nota de crédito" : "Factura", Fecha: r.fecha, Cliente: r.cliente,
      "Estado hoy": r.estado, "Reabierta el": r.reaperturas[0]?.fecha || "", "Reabierta por": r.reaperturas[0]?.usuario || "", Veces: r.reaperturas.length,
      "Monto antes": r.montoAntes ?? "", "Monto después": r.montoDespues ?? "", "Qué cambió": [...new Set(r.cambios.map((c) => c.etiqueta))].join(", ") + (r.lineasImpuesto ? " Impuestos" : ""),
      Alertas: alertasTxt(r.alertas),
    }))), "Reabiertas");
    XLSX.writeFile(wb, `auditoria-nc-${SEDES.find((s) => s.id === sede)?.nombre}-${rango.desde}-a-${rango.hasta}.xlsx`);
  };

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "notas", label: "Notas de crédito", n: notas.length },
    { id: "anuladas", label: "Anuladas", n: data?.anuladas.length },
    { id: "reabiertas", label: "Reabiertas", n: data?.reabiertas.length },
    { id: "verificacion", label: "Verificación de datos" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-2xl"><FileSearch className="text-red-600" size={24} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Auditoría de NC y anuladas</h1>
            <p className="text-sm text-slate-500">Notas de crédito, facturas anuladas y facturas modificadas después de emitidas</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-white border rounded-xl p-1.5 flex items-center gap-1 shadow-sm">
            <MapPin size={16} className="text-slate-400 ml-2" />
            <select value={sede} onChange={(e) => { setSede(e.target.value); setAbierto(null); }} aria-label="Sede"
              className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer outline-none pr-2">
              {SEDES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <button onClick={() => { forzar.current = true; setRecarga((n) => n + 1); }} disabled={cargando} aria-label="Actualizar desde Odoo"
            className="h-10 w-10 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
          <button onClick={exportar} disabled={!data || cargando}
            className="flex items-center gap-2 px-4 h-10 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none">
            <Download size={16} /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-3">
        <CalendarRange size={16} className="text-slate-400 ml-1" />
        <div className="flex flex-wrap gap-1">
          {([["mes", "Este mes"], ["mes_anterior", "Mes anterior"], ["trimestre", "Últimos 3 meses"], ["anio", "Este año"], ["personalizado", "Personalizado"]] as [Preset, string][]).map(([p, l]) => (
            <button key={p} onClick={() => cambiarPreset(p)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${preset === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={rango.desde} max={rango.hasta} aria-label="Desde"
            onChange={(e) => { if (FECHA.test(e.target.value)) { setPreset("personalizado"); setRango((r) => ({ ...r, desde: e.target.value })); } }}
            className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
          <span className="text-slate-400">a</span>
          <input type="date" value={rango.hasta} min={rango.desde} aria-label="Hasta"
            onChange={(e) => { if (FECHA.test(e.target.value)) { setPreset("personalizado"); setRango((r) => ({ ...r, hasta: e.target.value })); } }}
            className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none" title="Carga inicial de abril 2026 (&quot;Importación Masiva&quot;)">
          <input type="checkbox" checked={importacion} onChange={(e) => setImportacion(e.target.checked)} className="rounded border-slate-300" />
          Incluir importación masiva
        </label>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setCodigo(null); }}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === t.id ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}{t.n != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{t.n}</span>}
          </button>
        ))}
      </div>

      {error && tab !== "verificacion" && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
          <button onClick={() => setRecarga((n) => n + 1)} className="font-semibold underline">Reintentar</button>
        </div>
      )}

      {tab === "verificacion" ? (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={20} /></span>
              <div>
                <p className="font-bold text-slate-800">Verificación de los datos de Odoo · {fecha(rango.desde)} a {fecha(rango.hasta)}</p>
                <p className="text-sm text-slate-500 max-w-2xl">Conteos y sumas recalculados en el servidor de Odoo, historial de anulaciones, vínculo NC → factura, motivos sin clasificar y números saltados en la secuencia.</p>
              </div>
            </div>
            <button onClick={cargarVerificacion} disabled={verif.cargando} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              <RefreshCw size={14} className={verif.cargando ? "animate-spin" : ""} /> Volver a verificar
            </button>
          </div>
          {verif.error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertTriangle size={16} /> {verif.error}</div>}
          {verif.cargando && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Verificando contra Odoo…</div>}
          {verif.datos?.map((v) => (
            <section key={v.companyId} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-black text-slate-900">{v.sede}</h3>
                <div className="flex items-center gap-1.5">
                  {(["error", "aviso", "info", "ok"] as EstadoControl[]).map((e) => (
                    <span key={e} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${CONTROL_UI[e].chip}`}>{CONTROL_UI[e].label} <b className="tabular-nums">{v.conteo[e]}</b></span>
                  ))}
                </div>
              </div>
              {[...v.controles].sort((a, b) => ["error", "aviso", "info", "ok"].indexOf(a.estado) - ["error", "aviso", "info", "ok"].indexOf(b.estado)).map((c) => <Control key={c.id} c={c} />)}
            </section>
          ))}
        </div>
      ) : cargando && !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
          <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
          <p className="text-center text-xs text-slate-400">Leyendo notas de crédito, anulaciones e historial en Odoo… con períodos largos puede tardar unos segundos.</p>
        </div>
      ) : data ? (
        <div className={`transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          {tab === "resumen" && <Resumen data={data} irA={irA} />}
          {tab === "notas" && <PestanaNC key={`n-${query}`} filas={notas} multiSede={multiSede} onAbrir={abrir} codigo={codigo} setCodigo={setCodigo} />}
          {tab === "anuladas" && <PestanaAnuladas key={`a-${query}`} filas={data.anuladas} multiSede={multiSede} onAbrir={abrir} codigo={codigo} setCodigo={setCodigo} />}
          {tab === "reabiertas" && <PestanaReabiertas key={`r-${query}`} filas={data.reabiertas} multiSede={multiSede} onAbrir={abrir} codigo={codigo} setCodigo={setCodigo} />}
        </div>
      ) : null}

      <DetalleDocumento abierto={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}
