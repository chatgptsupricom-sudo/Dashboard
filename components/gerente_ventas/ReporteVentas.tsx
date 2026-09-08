"use client";

/**
 * Reporte de Ventas del Gerente de Ventas (equivalente a la vista de Smartbitt).
 *
 * Pestaña "Desglose": tabla Vendedor / Cliente / Marca / Producto / Cantidad /
 * Precio de Venta / Total ($) — todo neto (sin IVA) — filtrable por vendedor,
 * cliente, marca y rango de fechas, con exportación a Excel.
 *
 * Pestaña "Clientes inactivos": la cartera asignada a cada vendedor que no
 * registra compras en los últimos 3 o 6 meses.
 *
 * Todo sale de `/api/gerente_venta/reporte-ventas` (solo lectura sobre Odoo).
 */

import { useAuthStore } from "@/lib/stores/auth.store";
import {
  BarChart3,
  Download,
  Loader2,
  MapPin,
  Search,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

const MARCA_TODAS = "TODAS";

interface VendedorOpt {
  userId: number;
  nombre: string;
}
interface ClienteOpt {
  id: number;
  nombre: string;
  vendedorUserId: number | null;
}
interface Sede {
  id: number;
  name: string;
}
interface FilaDesglose {
  vendedor: string;
  cliente: string;
  marca: string;
  producto: string;
  cantidad: number;
  precioVenta: number;
  total: number;
}
interface ClienteInactivo {
  clienteId: number;
  cliente: string;
  vendedor: string;
  ultimaCompra: string | null;
  diasSinComprar: number | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const num = (n: number) =>
  new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(n || 0);

function primerDiaMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReporteVentas() {
  const { user } = useAuthStore();
  const isSuperAdmin =
    user?.role?.toLowerCase().trim() === "superadmin" ||
    user?.role?.toLowerCase().trim() === "super admin";

  const [tab, setTab] = useState<"desglose" | "inactivos">("desglose");

  // Filtros
  const [sede, setSede] = useState<string>("all");
  const [desde, setDesde] = useState<string>(primerDiaMes());
  const [hasta, setHasta] = useState<string>(hoy());
  const [vendedor, setVendedor] = useState<string>("");
  const [cliente, setCliente] = useState<string>("");
  const [marca, setMarca] = useState<string>(MARCA_TODAS);
  const [meses, setMeses] = useState<3 | 6>(3);
  const [buscaCliente, setBuscaCliente] = useState("");

  // Opciones
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [vendedores, setVendedores] = useState<VendedorOpt[]>([]);
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);

  // Datos
  const [filas, setFilas] = useState<FilaDesglose[]>([]);
  const [totales, setTotales] = useState<{
    cantidad: number;
    total: number;
    lineas: number;
    clientes: number;
  } | null>(null);
  const [inactivos, setInactivos] = useState<ClienteInactivo[]>([]);

  const [cargandoFiltros, setCargandoFiltros] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sedeQS = isSuperAdmin && sede !== "all" ? `&sede=${sede}` : "";

  // ── Filtros ──
  useEffect(() => {
    setCargandoFiltros(true);
    fetch(`/api/gerente_venta/reporte-ventas?tipo=filtros${sedeQS}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setError(j.error);
          setSedes(j.sedes || []);
          return;
        }
        setError(null);
        setSedes(j.sedes || []);
        setVendedores(j.vendedores || []);
        setClientes(j.clientes || []);
        setMarcas(j.marcas || []);
        // Reset selecciones que quizás ya no aplican a la sede
        setVendedor("");
        setCliente("");
        setMarca(MARCA_TODAS);
      })
      .catch(() => setError("No se pudieron cargar los filtros"))
      .finally(() => setCargandoFiltros(false));
  }, [sedeQS]);

  // Clientes visibles según el vendedor elegido
  const clientesFiltrados = useMemo(() => {
    let lista = clientes;
    if (vendedor) {
      const uid = parseInt(vendedor, 10);
      lista = lista.filter((c) => c.vendedorUserId === uid);
    }
    const q = buscaCliente.trim().toLowerCase();
    if (q) lista = lista.filter((c) => c.nombre.toLowerCase().includes(q));
    return lista.slice(0, 300);
  }, [clientes, vendedor, buscaCliente]);

  // Si cambia el vendedor y el cliente elegido ya no pertenece, límpialo
  useEffect(() => {
    if (!cliente) return;
    const uid = vendedor ? parseInt(vendedor, 10) : null;
    const c = clientes.find((x) => String(x.id) === cliente);
    if (uid && c && c.vendedorUserId !== uid) setCliente("");
  }, [vendedor, cliente, clientes]);

  // ── Consulta principal ──
  const consultar = useCallback(() => {
    setCargando(true);
    setError(null);
    if (tab === "desglose") {
      const qs = new URLSearchParams({ tipo: "desglose", desde, hasta });
      if (vendedor) qs.set("vendedor", vendedor);
      if (cliente) qs.set("cliente", cliente);
      if (marca && marca !== MARCA_TODAS) qs.set("marca", marca);
      if (sedeQS) qs.set("sede", sede);
      fetch(`/api/gerente_venta/reporte-ventas?${qs.toString()}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.error) {
            setError(j.error);
            setFilas([]);
            setTotales(null);
            return;
          }
          setFilas(j.filas || []);
          setTotales(j.totales || null);
        })
        .catch(() => setError("Error al consultar el desglose"))
        .finally(() => setCargando(false));
    } else {
      const qs = new URLSearchParams({ tipo: "inactivos", meses: String(meses) });
      if (vendedor) qs.set("vendedor", vendedor);
      if (sedeQS) qs.set("sede", sede);
      fetch(`/api/gerente_venta/reporte-ventas?${qs.toString()}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.error) {
            setError(j.error);
            setInactivos([]);
            return;
          }
          setInactivos(j.clientes || []);
        })
        .catch(() => setError("Error al consultar clientes inactivos"))
        .finally(() => setCargando(false));
    }
  }, [tab, desde, hasta, vendedor, cliente, marca, meses, sede, sedeQS]);

  // Primera carga y cuando cambia de pestaña / sede
  useEffect(() => {
    if (!cargandoFiltros) consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sedeQS, cargandoFiltros]);

  // ── Export ──
  const exportar = () => {
    if (tab === "desglose") {
      const rows = filas.map((f) => ({
        Vendedor: f.vendedor,
        Cliente: f.cliente,
        Marca: f.marca,
        Producto: f.producto,
        Cantidad: f.cantidad,
        "Precio de Venta": f.precioVenta,
        "Total ($)": f.total,
      }));
      rows.push({
        Vendedor: "",
        Cliente: "",
        Marca: "",
        Producto: "TOTAL",
        Cantidad: totales?.cantidad ?? 0,
        "Precio de Venta": 0,
        "Total ($)": totales?.total ?? 0,
      } as any);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Desglose");
      XLSX.writeFile(wb, `reporte_ventas_${desde}_a_${hasta}.xlsx`);
    } else {
      const rows = inactivos.map((c) => ({
        Vendedor: c.vendedor,
        Cliente: c.cliente,
        "Última compra": c.ultimaCompra || "Sin compras",
        "Días sin comprar": c.diasSinComprar ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Inactivos ${meses}m`);
      XLSX.writeFile(wb, `clientes_inactivos_${meses}m_${hoy()}.xlsx`);
    }
  };

  const selectCls =
    "text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none";

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-50">
            <BarChart3 className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              Reporte de Ventas
            </h1>
            <p className="text-sm text-slate-500">
              Desglose por vendedor, cliente, marca y producto
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isSuperAdmin && sedes.length > 0 && (
            <div className="bg-white border rounded-xl p-2 flex items-center gap-2 shadow-sm">
              <MapPin size={16} className="text-slate-400 ml-2" />
              <select
                value={sede}
                onChange={(e) => setSede(e.target.value)}
                className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer"
              >
                <option value="all">Todas las Sedes</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={exportar}
            disabled={
              cargando ||
              (tab === "desglose" ? filas.length === 0 : inactivos.length === 0)
            }
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all duration-300 font-bold text-xs uppercase tracking-widest active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download size={16} />
            Excel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { id: "desglose", label: "Desglose" },
          { id: "inactivos", label: "Clientes inactivos" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as "desglose" | "inactivos")}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Vendedor
            </label>
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              className={selectCls}
              disabled={cargandoFiltros}
            >
              <option value="">Todos</option>
              {vendedores.map((v) => (
                <option key={v.userId} value={v.userId}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>

          {tab === "desglose" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Cliente
                </label>
                <div className="flex flex-col gap-1">
                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={buscaCliente}
                      onChange={(e) => setBuscaCliente(e.target.value)}
                      placeholder="Buscar…"
                      className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-blue-400"
                    />
                  </div>
                  <select
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    className={selectCls}
                    disabled={cargandoFiltros}
                  >
                    <option value="">Todos</option>
                    {clientesFiltrados.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Marca
                </label>
                <select
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  className={selectCls}
                  disabled={cargandoFiltros}
                >
                  <option value={MARCA_TODAS}>Todas</option>
                  {marcas.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Rango de fechas
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className={selectCls + " flex-1"}
                  />
                  <span className="text-slate-400 text-xs">a</span>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className={selectCls + " flex-1"}
                  />
                </div>
              </div>
            </>
          )}

          {tab === "inactivos" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Sin compras desde hace
              </label>
              <div className="flex gap-2">
                {([3, 6] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMeses(m)}
                    className={`flex-1 text-sm font-bold rounded-lg px-3 py-2 border transition-colors ${
                      meses === m
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    {m} meses
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={consultar}
            disabled={cargando || cargandoFiltros}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl shadow-sm hover:bg-blue-700 transition-all font-bold text-xs uppercase tracking-widest active:scale-95 disabled:opacity-50"
          >
            {cargando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            Consultar
          </button>
        </div>
      </div>

      {/* Resultados */}
      {tab === "desglose" ? (
        <DesgloseTable
          filas={filas}
          totales={totales}
          cargando={cargando}
        />
      ) : (
        <InactivosTable
          filas={inactivos}
          cargando={cargando}
          meses={meses}
        />
      )}
    </div>
  );

  function DesgloseTable({
    filas,
    totales,
    cargando,
  }: {
    filas: FilaDesglose[];
    totales: { cantidad: number; total: number; lineas: number; clientes: number } | null;
    cargando: boolean;
  }) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {totales && (
          <div className="flex flex-wrap gap-6 px-5 py-4 border-b border-slate-100 bg-slate-50/50 text-sm">
            <div>
              <span className="text-slate-400 text-xs uppercase font-bold">Total</span>
              <p className="font-black text-slate-900">{money(totales.total)}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase font-bold">Unidades</span>
              <p className="font-black text-slate-900">{num(totales.cantidad)}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase font-bold">Clientes</span>
              <p className="font-black text-slate-900">{totales.clientes}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase font-bold">Filas</span>
              <p className="font-black text-slate-900">{filas.length}</p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3 font-bold">Vendedor</th>
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold">Marca</th>
                <th className="px-4 py-3 font-bold">Producto</th>
                <th className="px-4 py-3 font-bold text-right">Cantidad</th>
                <th className="px-4 py-3 font-bold text-right">Precio Venta</th>
                <th className="px-4 py-3 font-bold text-right">Total ($)</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                    <Loader2 className="inline animate-spin mr-2" size={18} />
                    Consultando Odoo…
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                    Sin resultados para los filtros elegidos
                  </td>
                </tr>
              ) : (
                filas.map((f, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-50 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2.5 text-slate-600">{f.vendedor}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{f.cliente}</td>
                    <td className="px-4 py-2.5 text-slate-600">{f.marca}</td>
                    <td className="px-4 py-2.5 text-slate-600">{f.producto}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(f.cantidad)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {money(f.precioVenta)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                      {money(f.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filas.length > 0 && totales && (
              <tfoot>
                <tr className="bg-slate-50 font-black text-slate-900">
                  <td className="px-4 py-3" colSpan={4}>
                    TOTAL
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(totales.cantidad)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{money(totales.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }

  function InactivosTable({
    filas,
    cargando,
    meses,
  }: {
    filas: ClienteInactivo[];
    cargando: boolean;
    meses: number;
  }) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <UserX size={16} className="text-rose-500" />
          <p className="text-sm text-slate-600">
            <span className="font-black text-slate-900">{filas.length}</span>{" "}
            clientes de la cartera sin compras en {meses} meses o más
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3 font-bold">Vendedor</th>
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold">Última compra</th>
                <th className="px-4 py-3 font-bold text-right">Días sin comprar</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-slate-400">
                    <Loader2 className="inline animate-spin mr-2" size={18} />
                    Consultando Odoo…
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-slate-400">
                    Ningún cliente inactivo con este criterio
                  </td>
                </tr>
              ) : (
                filas.map((c) => (
                  <tr
                    key={c.clienteId}
                    className="border-b border-slate-50 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2.5 text-slate-600">{c.vendedor}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{c.cliente}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {c.ultimaCompra || (
                        <span className="text-rose-500 font-medium">Sin compras</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.diasSinComprar ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}
