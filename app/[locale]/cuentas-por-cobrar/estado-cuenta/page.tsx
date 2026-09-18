"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

/**
 * Estado de Cuenta por cliente (rol Cuentas por Cobrar).
 *
 * Dos vistas en una sola pagina: el listado de clientes con saldo y, al
 * entrar en uno, su movimiento completo con saldo corrido. Se queda en una
 * pagina con estado local en vez de una ruta anidada porque volver al
 * listado tiene que conservar el filtro escrito, que es lo que se hace todo
 * el dia cuando se cobran veinte clientes seguidos.
 */

type Cliente = {
  partnerId: number;
  nombre: string;
  vendedor: string;
  sede: string;
  saldo: number;
  vencido: number;
  documentos: number;
  diasMax: number;
};

type Movimiento = {
  transaccion: string;
  documento: string;
  fecha: string | null;
  divisa: number;
  moneda: string;
  cargo: number;
  abono: number;
  saldo: number;
  diasAtraso: number;
  vendedor: string;
};

type Estado = {
  cliente: { id: number; nombre: string; vat: string };
  movimientos: Movimiento[];
  totales: { cargo: number; abono: number; saldo: number };
};

const API = "/api/superadmin/cuentas-por-cobrar/estado-cuenta";

function monto(v: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function fechaCorta(v: string | null) {
  if (!v) return "—";
  const [y, m, d] = v.split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

const COLOR_TRANSACCION: Record<string, string> = {
  Factura: "bg-blue-50 text-blue-700",
  "Recibo de Caja": "bg-emerald-50 text-emerald-700",
  "Nota de Crédito": "bg-amber-50 text-amber-700",
};

export default function EstadoCuentaCxCPage() {
  const [empresa, setEmpresa] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState("");
  const [cargandoLista, setCargandoLista] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const cargarClientes = useCallback(async () => {
    setCargandoLista(true);
    setError(null);
    try {
      const qs = empresa ? `?empresa=${empresa}` : "";
      const res = await fetch(`${API}${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo cargar");
      setClientes(json.clientes || []);
    } catch (e: any) {
      setError(e.message || "Error al cargar los clientes");
      setClientes([]);
    }
    setCargandoLista(false);
  }, [empresa]);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  const abrir = useCallback(
    async (cliente: Cliente) => {
      setSeleccionado(cliente);
      setEstado(null);
      setCargandoEstado(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ partner_id: String(cliente.partnerId) });
        if (empresa) qs.set("empresa", empresa);
        const res = await fetch(`${API}?${qs}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "No se pudo cargar");
        setEstado(json);
      } catch (e: any) {
        setError(e.message || "Error al cargar el estado de cuenta");
      }
      setCargandoEstado(false);
    },
    [empresa],
  );

  const descargar = useCallback(async () => {
    if (!seleccionado) return;
    setDescargando(true);
    try {
      const qs = new URLSearchParams({
        partner_id: String(seleccionado.partnerId),
        formato: "xlsx",
      });
      if (empresa) qs.set("empresa", empresa);
      const res = await fetch(`${API}?${qs}`);
      if (!res.ok) throw new Error("No se pudo generar el Excel");
      const blob = await res.blob();
      // El nombre real viene en el Content-Disposition que arma el servidor;
      // se lee de ahi para que el archivo descargado se llame igual que la
      // hoja ("EC" + RIF) y no haya que repetir esa regla en el cliente.
      const cd = res.headers.get("Content-Disposition") || "";
      const nombre =
        /filename="([^"]+)"/.exec(cd)?.[1] ||
        `EC${seleccionado.partnerId}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Error al descargar");
    }
    setDescargando(false);
  }, [seleccionado, empresa]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.vendedor.toLowerCase().includes(q),
    );
  }, [clientes, filtro]);

  const totalCartera = useMemo(
    () => filtrados.reduce((s, c) => s + c.saldo, 0),
    [filtrados],
  );

  // ── Detalle de un cliente ──
  if (seleccionado) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSeleccionado(null);
                setEstado(null);
              }}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              <ArrowLeft size={18} className="text-slate-500" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {estado?.cliente.nombre || seleccionado.nombre}
              </h1>
              <p className="text-sm text-slate-500">
                {estado?.cliente.vat ? `RIF ${estado.cliente.vat} · ` : ""}
                {seleccionado.sede} · Vendedor: {seleccionado.vendedor}
              </p>
            </div>
          </div>
          <button
            onClick={descargar}
            disabled={descargando || !estado}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            <Download size={16} className={descargando ? "animate-pulse" : ""} />
            Descargar Excel
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {cargandoEstado && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw size={28} className="animate-spin text-blue-500" />
          </div>
        )}

        {estado && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Cargos
                </p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {monto(estado.totales.cargo)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Abonos
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {monto(estado.totales.abono)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Saldo Actual
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    estado.totales.saldo > 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {monto(estado.totales.saldo)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="text-left px-4 py-2.5 font-medium">Transacción</th>
                      <th className="text-left px-4 py-2.5 font-medium">Documento</th>
                      <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cargo</th>
                      <th className="text-right px-4 py-2.5 font-medium">Abono</th>
                      <th className="text-right px-4 py-2.5 font-medium">Divisa</th>
                      <th className="text-right px-4 py-2.5 font-medium">Saldo</th>
                      <th className="text-right px-4 py-2.5 font-medium">Días Atraso</th>
                      <th className="text-left px-4 py-2.5 font-medium">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.movimientos.map((m, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              COLOR_TRANSACCION[m.transaccion] ||
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {m.transaccion}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-700">{m.documento}</td>
                        <td className="px-4 py-2 text-slate-500">
                          {fechaCorta(m.fecha)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-700">
                          {monto(m.cargo)}
                        </td>
                        <td className="px-4 py-2 text-right text-emerald-600">
                          {monto(m.abono)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600 whitespace-nowrap">
                          {monto(m.divisa)}
                          {m.moneda ? (
                            <span className="ml-1 text-[11px] text-slate-400">
                              {m.moneda}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">
                          {monto(m.saldo)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {m.diasAtraso > 0 ? (
                            <span
                              className={
                                m.diasAtraso > 90
                                  ? "text-red-600 font-bold"
                                  : m.diasAtraso > 30
                                    ? "text-orange-600 font-semibold"
                                    : "text-amber-600"
                              }
                            >
                              {m.diasAtraso}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{m.vendedor}</td>
                      </tr>
                    ))}
                    {estado.movimientos.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-10 text-center text-slate-400"
                        >
                          Este cliente no tiene movimientos de cuentas por cobrar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {estado.movimientos.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-slate-800">
                        <td className="px-4 py-2.5" colSpan={3}>
                          Totales
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {monto(estado.totales.cargo)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {monto(estado.totales.abono)}
                        </td>
                        {/* Divisa no se totaliza: son monedas distintas por fila. */}
                        <td />
                        <td className="px-4 py-2.5 text-right">
                          {monto(estado.totales.saldo)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Listado de clientes ──
  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Estado de Cuenta</h1>
          <p className="text-sm text-slate-500 mt-1">
            Clientes con saldo abierto. Entra en uno para ver su movimiento y
            descargarlo en Excel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
            <Building2 size={14} className="text-slate-400" />
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="text-sm bg-transparent border-none outline-none text-slate-700"
            >
              <option value="">Todas las sedes</option>
              <option value="caracas">Caracas</option>
              <option value="valencia">Valencia</option>
              <option value="panama">Panamá</option>
            </select>
          </div>
          <button
            onClick={cargarClientes}
            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
          >
            <RefreshCw size={14} className={cargandoLista ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <Users size={20} className="text-blue-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Clientes
            </p>
            <p className="text-xl font-bold text-slate-800">{filtrados.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <FileSpreadsheet size={20} className="text-blue-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cartera listada
            </p>
            <p className="text-xl font-bold text-slate-800">{monto(totalCartera)}</p>
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por cliente o vendedor…"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargandoLista ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <RefreshCw size={28} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2.5 font-medium">Vendedor</th>
                  <th className="text-left px-4 py-2.5 font-medium">Sede</th>
                  <th className="text-right px-4 py-2.5 font-medium">Docs.</th>
                  <th className="text-right px-4 py-2.5 font-medium">Vencido</th>
                  <th className="text-right px-4 py-2.5 font-medium">Días</th>
                  <th className="text-right px-4 py-2.5 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.partnerId}
                    onClick={() => abrir(c)}
                    className="border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {c.nombre}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{c.vendedor}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.sede}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {c.documentos}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {c.vencido !== 0 ? (
                        <span className="text-red-600 font-medium">
                          {monto(c.vencido)}
                        </span>
                      ) : (
                        <span className="text-emerald-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={
                          c.diasMax > 90
                            ? "text-red-600 font-bold"
                            : c.diasMax > 30
                              ? "text-orange-600 font-semibold"
                              : "text-slate-500"
                        }
                      >
                        {c.diasMax}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                      {monto(c.saldo)}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Sin clientes con saldo para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
