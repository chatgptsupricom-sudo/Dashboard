"use client";

// Leads de los Excel de redes sociales de antes del panel, y la importación de
// esos Excel y del reporte de facturas de Smartbit con el que se les busca el RIF.

import { Check, Loader2, Pencil, Search, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const SEDES: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
const ORIGEN_RIF: Record<string, string> = {
  factura: "por la factura",
  pedido: "por el pedido de Odoo",
  nombre: "por el nombre (Smartbit)",
  odoo_nombre: "por el nombre (Odoo)",
  manual: "cargado a mano",
};
const campo = "py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600";

export default function LeadsHistoricos({ filtroInicial = "" }: { filtroInicial?: string }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [estatus, setEstatus] = useState(filtroInicial);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [sede, setSede] = useState("10");
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const [editando, setEditando] = useState<number | null>(null);
  const [rifNuevo, setRifNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setEstatus(filtroInicial), [filtroInicial]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/adminleads/recompra/historicos").then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setLeads(r.leads);
      setFacturas(r.facturasSmartbit);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const importar = async () => {
    if (!archivo) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("sede", sede);
      const r = await fetch("/api/adminleads/recompra/importar", { method: "POST", body: fd }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      const que = r.tipo === "leads" ? `${r.filas} leads de ${r.hojas} hoja(s)` : `${r.filas} facturas de Smartbit`;
      const rif = r.rif ? ` RIF ubicado en ${r.rif.resueltos} venta(s); ${r.rif.sinRif} sin ubicar.` : "";
      setMensaje({ ok: true, texto: `Importado: ${que} de ${SEDES[Number(sede)]}.${rif}` });
      setArchivo(null);
      await cargar();
    } catch (e: any) {
      setMensaje({ ok: false, texto: e.message });
    } finally {
      setSubiendo(false);
    }
  };

  const guardarRif = async (id: number, rif: string) => {
    setGuardando(true);
    try {
      const r = await fetch("/api/adminleads/recompra/historicos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, rif }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setEditando(null);
      await cargar();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const estatuses = useMemo(() => [...new Set(leads.map((l) => l.estatus).filter(Boolean))].sort(), [leads]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return leads.filter(
      (l) =>
        (!estatus ||
          (estatus === "SIN_RIF" ? l.estatus === "CONCRETADO" && !l.rif : l.estatus === estatus)) &&
        (!q || `${l.nombre} ${l.vendedor} ${l.rif ?? ""} ${l.factura_txt ?? ""} ${l.ubicacion ?? ""}`.toLowerCase().includes(q)),
    );
  }, [leads, buscar, estatus]);
  const vendidos = leads.filter((l) => l.estatus === "CONCRETADO");

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm space-y-3">
        <p className="text-sm font-bold text-zinc-700">Importar Excel</p>
        <p className="text-xs text-zinc-500">
          Sirve el Excel de leads de redes (una hoja por semana, con &quot;Nombre del Cliente&quot;, &quot;Estatus&quot; y
          &quot;Factura/Pedido&quot;) y el reporte de Smartbit &quot;Ventas / Devoluciones&quot; de la sede: con las
          facturas de Smartbit se ubica el RIF de cada venta. Se pueden subir de nuevo; lo repetido se actualiza.
        </p>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-sm text-zinc-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-zinc-100 file:text-zinc-700 file:text-xs file:font-semibold"
          />
          <select className={campo} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede del archivo">
            {Object.entries(SEDES).map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
          <button
            onClick={importar}
            disabled={!archivo || subiendo}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40"
          >
            {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {subiendo ? "Importando…" : "Importar"}
          </button>
        </div>
        {mensaje && (
          <p className={`text-xs font-semibold ${mensaje.ok ? "text-emerald-600" : "text-red-500"}`}>{mensaje.texto}</p>
        )}
        {facturas.length > 0 && (
          <p className="text-[11px] text-zinc-400">
            Facturas de Smartbit cargadas:{" "}
            {facturas
              .map((f) => `${SEDES[f.company_id] ?? f.company_id} ${Number(f.facturas).toLocaleString()} (${f.desde} a ${f.hasta})`)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm">
        <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center border-b border-zinc-100">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
              placeholder="Buscar cliente, vendedor, RIF o factura…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </div>
          <select className={campo} value={estatus} onChange={(e) => setEstatus(e.target.value)} aria-label="Estatus">
            <option value="">Todos los estatus</option>
            {estatuses.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
            <option value="SIN_RIF">Vendidos sin RIF</option>
          </select>
          <span className="text-xs text-zinc-400 md:ml-auto">
            {visibles.length} de {leads.length} leads · {vendidos.length} vendidos ·{" "}
            {vendidos.filter((l) => !l.rif).length} sin RIF
          </span>
        </div>

        {error && <p className="p-4 text-sm font-semibold text-red-500">{error}</p>}
        {cargando && !leads.length ? (
          <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-3" /> Cargando…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Red</th>
                  <th className="text-left px-3 py-2">Ubicación</th>
                  <th className="text-left px-3 py-2">Vendedor</th>
                  <th className="text-left px-3 py-2">Estatus</th>
                  <th className="text-right px-3 py-2">Monto</th>
                  <th className="text-left px-3 py-2">Factura / pedido</th>
                  <th className="text-left px-3 py-2">RIF</th>
                  <th className="text-left px-3 py-2">Observación</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.id} className="border-t border-zinc-100 align-top">
                    <td className="px-3 py-2 tabular-nums text-zinc-600 whitespace-nowrap">{l.fecha ?? "—"}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-zinc-800">{l.nombre}</p>
                      <p className="text-[11px] text-zinc-400">
                        {SEDES[l.company_id]} · {l.telefono}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{l.red_social}</td>
                    <td className="px-3 py-2 text-zinc-600">{l.ubicacion}</td>
                    <td className="px-3 py-2 text-zinc-600">{l.vendedor}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${l.estatus === "CONCRETADO" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
                      >
                        {l.estatus || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                      {l.monto != null ? `$${Number(l.monto).toLocaleString()}` : ""}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 text-xs">{l.factura_txt}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {l.estatus !== "CONCRETADO" ? null : editando === l.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            className="w-28 py-1 px-2 bg-zinc-50 rounded-lg text-xs border border-zinc-200"
                            value={rifNuevo}
                            placeholder="J123456789"
                            onChange={(e) => setRifNuevo(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && guardarRif(l.id, rifNuevo)}
                          />
                          <button
                            disabled={guardando}
                            onClick={() => guardarRif(l.id, rifNuevo)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            aria-label="Guardar RIF"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditando(null)} className="p-1 text-zinc-400 hover:bg-zinc-100 rounded" aria-label="Cancelar">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditando(l.id);
                            setRifNuevo(l.rif ?? "");
                          }}
                          className="group text-left"
                          title="Corregir el RIF (vacío = que el panel lo vuelva a buscar)"
                        >
                          {l.rif ? (
                            <>
                              <span className="font-semibold text-zinc-700">{l.rif}</span>
                              <Pencil className="inline w-3 h-3 ml-1 text-zinc-300 group-hover:text-zinc-500" />
                              <p className="text-[10px] text-zinc-400">
                                {ORIGEN_RIF[l.rif_origen] ?? ""}
                                {l.cliente_rif ? ` · ${l.cliente_rif}` : ""}
                              </p>
                            </>
                          ) : (
                            <span className="text-amber-600 font-semibold">
                              Sin RIF <Pencil className="inline w-3 h-3 ml-1" />
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500 max-w-xs">{l.observacion}</td>
                  </tr>
                ))}
                {!visibles.length && (
                  <tr>
                    <td colSpan={10} className="text-center text-zinc-400 py-10 text-sm">
                      {leads.length ? "Ningún lead con estos filtros." : "Todavía no se importó ningún Excel."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
