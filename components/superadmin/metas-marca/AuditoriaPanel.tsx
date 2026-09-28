"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, ChevronDown, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { CONTROL_UI, dinero, nombreMes, porcentaje, type AuditoriaSede, type EstadoControl } from "./formato";

function valorCelda(v: string | number | null | undefined, tipo?: string) {
  if (v == null) return "–";
  if (tipo === "dinero") return dinero(Number(v), 2);
  if (tipo === "numero") return Number(v).toLocaleString("es-VE");
  if (tipo === "pct") return porcentaje(Number(v), 1);
  return String(v);
}

function Control({ c }: { c: AuditoriaSede["controles"][number] }) {
  const [abierto, setAbierto] = useState(c.estado === "error");
  const ui = CONTROL_UI[c.estado];
  const tieneTabla = !!c.columnas?.length && !!c.filas?.length;
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${ui.borde} rounded-xl shadow-sm`}>
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-start justify-between gap-4 p-4 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ui.chip}`}>{ui.label}</span>
            <p className="font-bold text-slate-800">{c.titulo}</p>
          </div>
          <p className="mt-1 text-sm text-slate-600">{c.resumen}</p>
        </div>
        <ChevronDown size={18} className={`shrink-0 mt-1 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs leading-relaxed text-slate-500 bg-slate-50 rounded-lg p-3">{c.explicacion}</p>
          {tieneTabla && (
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {c.columnas!.map((col) => (
                      <th key={col.key} className={`px-3 py-2 ${col.tipo && col.tipo !== "texto" ? "text-right" : "text-left"}`}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.filas!.map((f, i) => (
                    <tr key={i}>
                      {c.columnas!.map((col) => (
                        <td key={col.key} className={`px-3 py-1.5 ${col.tipo && col.tipo !== "texto" ? "text-right tabular-nums" : ""} ${col.key === "diferencia" && Math.abs(Number(f[col.key] ?? 0)) > 1 ? "text-red-600 font-semibold" : "text-slate-700"}`}>
                          {valorCelda(f[col.key], col.tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ORDEN: EstadoControl[] = ["error", "aviso", "info", "ok"];

export function AuditoriaPanel({ companyParam, mes }: { companyParam: string; mes: string }) {
  const [datos, setDatos] = useState<AuditoriaSede[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams({ company_id: companyParam, mes });
    if (recarga > 0) qs.set("refrescar", "1");
    fetch(`/api/superadmin/metas-marca/auditoria?${qs}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setDatos(j.data.auditorias);
        else setError(j?.error || "No se pudo auditar");
      })
      .catch(() => { if (!cancelado) setError("No se pudo auditar"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [companyParam, mes, recarga]);

  const exportar = async () => {
    setExportando(true);
    try {
      const r = await fetch(`/api/superadmin/metas-marca/auditoria?${new URLSearchParams({ company_id: companyParam, mes, lineas: "1" })}`);
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error || "Error");
      const filas = (j.data as any[]).map((l) => ({
        Empresa: l.companyId, Factura: l.factura, Fecha: l.fecha, Tipo: l.tipo === "out_refund" ? "Nota de crédito" : "Factura",
        Cliente: l.cliente, Vendedor: l.vendedor, Código: l.codigo, Producto: l.producto,
        "Marca Odoo": l.marcaOdoo || "(sin marca)", "Marca panel": l.clave, Cantidad: l.cantidad,
        "Venta sin IVA (USD)": Math.round(l.ingreso * 100) / 100, "Subtotal moneda factura": Math.round(l.subtotalFirmado * 100) / 100,
        Intercompañía: l.intercompania ? "Sí" : "No", "Producto archivado": l.productoActivo ? "No" : "Sí",
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Líneas Odoo");
      XLSX.writeFile(wb, `lineas-odoo-metas-marca-${companyParam}-${mes}.xlsx`);
    } catch {
      setError("No se pudo generar el Excel de líneas");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={20} /></span>
          <div>
            <p className="font-bold text-slate-800">Auditoría de los datos de Odoo · {nombreMes(mes)}</p>
            <p className="text-sm text-slate-500 max-w-2xl">
              Cada control vuelve a consultar Odoo de otra forma (conteos y sumas en el servidor, filtro por marca en el dominio) y lo compara con lo que muestra esta sección.
              También señala datos de Odoo que distorsionan la venta por marca.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportar} disabled={exportando} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Líneas de Odoo (Excel)
          </button>
          <button onClick={() => setRecarga((n) => n + 1)} disabled={cargando} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Volver a auditar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && !datos && (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      )}

      {datos?.map((a) => (
        <section key={a.companyId} className={`space-y-3 ${cargando ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-slate-900">{a.sede} <span className="text-sm font-normal text-slate-400">{a.desde} a {a.hasta}</span></h3>
            <div className="flex items-center gap-1.5">
              {ORDEN.map((e) => (
                <span key={e} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${CONTROL_UI[e].chip}`}>
                  {CONTROL_UI[e].label} <b className="tabular-nums">{a.conteo[e]}</b>
                </span>
              ))}
            </div>
          </div>
          {[...a.controles].sort((x, y) => ORDEN.indexOf(x.estado) - ORDEN.indexOf(y.estado)).map((c) => <Control key={c.id} c={c} />)}
          <p className="text-[11px] text-slate-400">Generada {new Date(a.generado).toLocaleString("es-VE")}.</p>
        </section>
      ))}
    </div>
  );
}
