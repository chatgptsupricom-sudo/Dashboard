"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { Building2, RefreshCw, Search, X, Ban, Undo2, Download, Info } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

// Incobrables marcados a mano (api/superadmin/cuentas-por-cobrar/incobrables).
// Una factura marcada sale de Cartera Vencida, Recuperación, DSO y CEI y pasa a
// la tarjeta Incobrables del Dashboard. Todo queda registrado: quién, cuándo y
// por qué, y lo mismo al revertir.

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MIN_TEXTO = 10;

type Candidata = {
  id: number; name: string; partnerName: string; companyId: number; companyName: string;
  invoiceDate: string | null; invoiceDateDue: string | null; amountTotal: number; saldo: number;
  estado: "disponible" | "marcada" | "automatica";
};
type Registro = {
  id: number; companyId: number; moveId: number; moveName: string; partnerName: string;
  saldoAlMarcar: number; saldoHoy: number | null; vencimiento: string | null; justificacion: string;
  marcadoPor: string; marcadoEn: string; activo: boolean;
  revertidoPor: string | null; revertidoEn: string | null; motivoReversion: string | null;
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const formatDate = (s: string | null) => (s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("es-VE") : "—");
const formatDateTime = (s: string | null) => (s ? new Date(s).toLocaleString("es-VE") : "—");
const diasVencida = (due: string | null) =>
  due ? Math.max(0, Math.round((Date.now() - new Date(String(due).slice(0, 10) + "T00:00:00").getTime()) / 86400000)) : 0;

export default function IncobrablesPage() {
  const { user } = useAuthStore();
  const userCids = user?.cids ? Number(user.cids) : undefined;
  const esSuperadmin = String(user?.role || "").toLowerCase().trim() === "superadmin";

  const [tab, setTab] = useState<"marcar" | "registro">("marcar");
  const [empresa, setEmpresa] = useState("");
  const [buscar, setBuscar] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [candidatas, setCandidatas] = useState<Candidata[] | null>(null);
  const [registro, setRegistro] = useState<Registro[]>([]);
  const [cargandoRegistro, setCargandoRegistro] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Modal de justificación (marcar) o motivo (revertir).
  const [accion, setAccion] = useState<
    { tipo: "marcar"; factura: Candidata } | { tipo: "revertir"; registro: Registro } | null
  >(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (esSuperadmin && empresa) p.set("empresa", empresa);
    return p;
  }, [esSuperadmin, empresa]);

  const cargarRegistro = useCallback(async () => {
    setCargandoRegistro(true);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/incobrables?${params()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar el registro");
      setRegistro(json.data.registro);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargandoRegistro(false);
    }
  }, [params]);

  const buscarFacturas = useCallback(async () => {
    if (buscar.trim().length < 3) {
      setCandidatas(null);
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/incobrables?${params({ buscar: buscar.trim() })}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo buscar");
      setCandidatas(json.data.facturas);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBuscando(false);
    }
  }, [buscar, params]);

  useEffect(() => { cargarRegistro(); }, [cargarRegistro]);
  useEffect(() => {
    const t = setTimeout(buscarFacturas, 400);
    return () => clearTimeout(t);
  }, [buscarFacturas]);

  const confirmar = async () => {
    if (!accion || texto.trim().length < MIN_TEXTO) return;
    setGuardando(true);
    setError(null);
    try {
      const body = accion.tipo === "marcar"
        ? { accion: "marcar", moveId: accion.factura.id, justificacion: texto.trim() }
        : { accion: "revertir", id: accion.registro.id, motivo: texto.trim() };
      const res = await fetch("/api/superadmin/cuentas-por-cobrar/incobrables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo guardar");
      setAviso(accion.tipo === "marcar"
        ? `${accion.factura.name} marcada como incobrable.`
        : `Se revirtió ${accion.registro.moveName}: vuelve a contar en los KPIs.`);
      setAccion(null);
      setTexto("");
      await Promise.all([cargarRegistro(), buscarFacturas()]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const exportarRegistro = () => {
    const ws = XLSX.utils.json_to_sheet(registro.map((r) => ({
      Estado: r.activo ? "Vigente" : "Revertida",
      Sede: COMPANY_MAP[r.companyId] || r.companyId,
      Factura: r.moveName,
      Cliente: r.partnerName,
      Vencimiento: r.vencimiento ? String(r.vencimiento).slice(0, 10) : "",
      "Saldo al marcar": r.saldoAlMarcar,
      "Saldo hoy": r.saldoHoy ?? "",
      Justificación: r.justificacion,
      "Marcado por": r.marcadoPor,
      "Marcado el": r.marcadoEn,
      "Revertido por": r.revertidoPor || "",
      "Revertido el": r.revertidoEn || "",
      "Motivo de reversión": r.motivoReversion || "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Incobrables");
    XLSX.writeFile(wb, "Incobrables_marcados.xlsx");
  };

  const vigentes = registro.filter((r) => r.activo);
  const totalVigente = vigentes.reduce((s, r) => s + (r.saldoHoy ?? r.saldoAlMarcar), 0);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto tabular-nums">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Incobrables</h1>
          <p className="text-sm text-slate-500 mt-1">
            Marca facturas como incobrables con su justificación. Salen de Cartera Vencida, Recuperación, DSO y Efectividad y pasan a la tarjeta Incobrables.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {esSuperadmin ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          ) : userCids ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          ) : null}
          <button onClick={cargarRegistro} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={cargandoRegistro ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-600">Marcadas vigentes</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{vigentes.length}</p>
          <p className="text-xs text-slate-500 mt-2">Saldo de hoy: {formatCurrency(totalVigente)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-600">Revertidas</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{registro.length - vigentes.length}</p>
          <p className="text-xs text-slate-500 mt-2">Volvieron a contar en los KPIs</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 col-span-2 lg:col-span-1 flex gap-2 text-xs text-slate-500">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p>Las vencidas antes de 2025 ya son incobrables automáticamente y no hace falta marcarlas. Cada marca y cada reversión quedan registradas con usuario, fecha y motivo.</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">{error}</div>}
      {aviso && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3 mb-4 flex justify-between">
          {aviso}
          <button onClick={() => setAviso(null)}><X size={14} /></button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button onClick={() => setTab("marcar")} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === "marcar" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>
              Marcar facturas
            </button>
            <button onClick={() => setTab("registro")} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === "registro" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>
              Registro ({registro.length})
            </button>
          </div>
          {tab === "marcar" ? (
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar cliente o número de factura..."
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 w-80"
              />
            </div>
          ) : (
            registro.length > 0 && (
              <button onClick={exportarRegistro} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition">
                <Download size={13} /> Excel
              </button>
            )
          )}
        </div>

        {tab === "marcar" ? (
          buscando ? (
            <div className="text-center py-10 text-slate-400 text-sm">Buscando...</div>
          ) : candidatas === null ? (
            <div className="text-center py-10 text-slate-400 text-sm">Escribe al menos 3 letras del cliente o del número de factura.</div>
          ) : candidatas.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No hay facturas con saldo que coincidan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="py-2 pr-3 font-medium">Factura</th>
                    <th className="py-2 px-3 font-medium">Cliente</th>
                    <th className="py-2 px-3 font-medium">Sede</th>
                    <th className="py-2 px-3 font-medium">Vence</th>
                    <th className="py-2 px-3 font-medium text-right">Días vencida</th>
                    <th className="py-2 px-3 font-medium text-right">Saldo</th>
                    <th className="py-2 pl-3 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {candidatas.map((f) => (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{f.name}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[260px] truncate">{f.partnerName}</td>
                      <td className="py-2.5 px-3 text-slate-500">{COMPANY_MAP[f.companyId] || f.companyName}</td>
                      <td className="py-2.5 px-3 text-slate-500">{formatDate(f.invoiceDateDue)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600">{diasVencida(f.invoiceDateDue) || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-800">{formatCurrency(f.saldo)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        {f.estado === "disponible" ? (
                          <button
                            onClick={() => { setAccion({ tipo: "marcar", factura: f }); setTexto(""); }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-100 transition"
                          >
                            <Ban size={12} /> Marcar incobrable
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">{f.estado === "marcada" ? "Ya marcada" : "Incobrable automática (antes de 2025)"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : cargandoRegistro ? (
          <div className="text-center py-10 text-slate-400 text-sm">Cargando...</div>
        ) : registro.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">Todavía no se ha marcado ninguna factura.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 px-3 font-medium">Factura / Cliente</th>
                  <th className="py-2 px-3 font-medium text-right">Saldo al marcar</th>
                  <th className="py-2 px-3 font-medium text-right">Saldo hoy</th>
                  <th className="py-2 px-3 font-medium">Justificación</th>
                  <th className="py-2 px-3 font-medium">Marcado por</th>
                  <th className="py-2 pl-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {registro.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 align-top">
                    <td className="py-2.5 pr-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${r.activo ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                        {r.activo ? "Vigente" : "Revertida"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-slate-800">{r.moveName}</p>
                      <p className="text-xs text-slate-500 max-w-[240px] truncate">{r.partnerName} · {COMPANY_MAP[r.companyId] || r.companyId}</p>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{formatCurrency(r.saldoAlMarcar)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">{r.saldoHoy === null ? "—" : formatCurrency(r.saldoHoy)}</td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[320px]">
                      <p className="whitespace-pre-wrap break-words">{r.justificacion}</p>
                      {!r.activo && (
                        <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap break-words">
                          Revertida por {r.revertidoPor} el {formatDateTime(r.revertidoEn)}: {r.motivoReversion}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-500">
                      <p className="text-slate-700">{r.marcadoPor}</p>
                      <p>{formatDateTime(r.marcadoEn)}</p>
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {r.activo && (
                        <button
                          onClick={() => { setAccion({ tipo: "revertir", registro: r }); setTexto(""); }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 transition"
                        >
                          <Undo2 size={12} /> Revertir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {accion && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => !guardando && setAccion(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg">
              {accion.tipo === "marcar" ? "Marcar como incobrable" : "Revertir incobrable"}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {accion.tipo === "marcar"
                ? <>{accion.factura.name} · {accion.factura.partnerName} · saldo {formatCurrency(accion.factura.saldo)}</>
                : <>{accion.registro.moveName} · {accion.registro.partnerName}</>}
            </p>
            <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">
              {accion.tipo === "marcar" ? "Justificación (obligatoria)" : "Motivo de la reversión (obligatorio)"}
            </label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              maxLength={2000}
              autoFocus
              placeholder={accion.tipo === "marcar" ? "Ej.: cliente cerró operaciones, sin respuesta a gestiones desde mayo..." : "Ej.: el cliente retomó los pagos..."}
              className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 mt-1">
              Mínimo {MIN_TEXTO} caracteres. Queda registrado con tu usuario y la fecha.
              {accion.tipo === "marcar" && " La factura saldrá de los KPIs de cobranza."}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setAccion(null)} disabled={guardando} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={guardando || texto.trim().length < MIN_TEXTO}
                className={`px-3 py-1.5 text-sm rounded-lg text-white disabled:opacity-50 ${accion.tipo === "marcar" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {guardando ? "Guardando..." : accion.tipo === "marcar" ? "Marcar incobrable" : "Revertir"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
