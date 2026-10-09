"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { descargarExcel } from "@/lib/excel";
import { AlertTriangle, Building2, CreditCard, Download, Gauge, RefreshCw, Search, UserX } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ColumnHeader } from "@/components/compras/column-header";

// Sobregiro: uso del límite de crédito de cada cliente, por sede
// (lib/cxc/sobregiro.ts). Es una foto de hoy, no tiene período.

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };

type Estado = "excedido" | "al_limite" | "en_uso" | "sin_uso" | "sin_limite";
type Cliente = {
  partnerId: number;
  cliente: string;
  rif: string;
  companyId: number;
  sede: string;
  vendedor: string;
  plazo: string;
  limite: number;
  usado: number;
  disponible: number;
  usoPct: number | null;
  excedido: number;
  vencido: number;
  diasVencido: number;
  estado: Estado;
};
type Data = {
  clientes: Cliente[];
  resumen: {
    conLimite: number;
    limiteTotal: number;
    usadoTotal: number;
    usoPct: number;
    excedidos: number;
    montoExcedido: number;
    vencidoExcedidos: number;
    alLimite: number;
    enUso: number;
    sinUso: number;
    sinLimite: number;
    usadoSinLimite: number;
  };
  utilizacionAlta: number;
  updatedAt: string;
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const ESTADOS: Record<Estado, { label: string; chip: string; barra: string }> = {
  excedido: { label: "Excedido", chip: "bg-red-50 text-red-700 border-red-200", barra: "bg-red-500" },
  al_limite: { label: "Al límite", chip: "bg-amber-50 text-amber-700 border-amber-200", barra: "bg-amber-500" },
  en_uso: { label: "En uso", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", barra: "bg-emerald-500" },
  sin_uso: { label: "Sin uso", chip: "bg-slate-50 text-slate-600 border-slate-200", barra: "bg-slate-300" },
  sin_limite: { label: "Sin límite", chip: "bg-violet-50 text-violet-700 border-violet-200", barra: "bg-violet-400" },
};

const AYUDA = {
  usado:
    "Saldo por cobrar del cliente en esa sede: facturas abiertas menos notas de crédito y anticipos sin aplicar. " +
    "Es el mismo \"Total por cobrar\" que Odoo compara con el límite.",
  disponible: "Límite − usado. Negativo = el cliente está sobregirado por ese monto.",
  uso: (alta: number) => `Usado ÷ límite. Desde ${alta}% está al límite; más de 100% está excedido.`,
  vencido: "Parte del saldo con fecha de vencimiento anterior a hoy.",
  dias: "Días desde el vencimiento más viejo que sigue sin pagar.",
  sinLimite: "Clientes que deben algo en la sede pero no tienen límite de crédito asignado en Odoo.",
};

type Filtro = "todos" | Estado;
type Columna = "cliente" | "sede" | "vendedor" | "limite" | "usado" | "disponible" | "usoPct" | "excedido" | "vencido" | "diasVencido";

function Tarjeta({ titulo, valor, detalle, icono: Icono, tono, activo, onClick }: {
  titulo: string; valor: string; detalle?: string; icono: any; tono: string; activo?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? activo : undefined}
      className={`text-left bg-white border rounded-xl p-4 transition ${activo ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"} ${onClick ? "hover:border-blue-300 cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{titulo}</span>
        <Icono size={16} className={tono} />
      </div>
      <div className={`text-2xl font-bold mt-2 ${tono}`}>{valor}</div>
      {detalle && <div className="text-xs text-slate-500 mt-1">{detalle}</div>}
    </button>
  );
}

function BarraUso({ pct, estado }: { pct: number | null; estado: Estado }) {
  if (pct == null) return <span className="text-slate-400">—</span>;
  const ancho = Math.max(0, Math.min(pct, 100));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${ESTADOS[estado].barra}`} style={{ width: `${ancho}%` }} />
      </div>
      <span className={`w-14 text-right font-semibold ${estado === "excedido" ? "text-red-600" : estado === "al_limite" ? "text-amber-600" : "text-slate-600"}`}>
        {pct.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%
      </span>
    </div>
  );
}

export default function SobregiroPage() {
  const { user } = useAuthStore();
  const esSuperAdmin = String(user?.role || "").toLowerCase().trim() === "superadmin";
  const userCids = user?.cids ? Number(user.cids) : undefined;
  const eligeSede = esSuperAdmin || !userCids || !COMPANY_MAP[userCids];
  const [empresa, setEmpresa] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("excedido");
  const [busqueda, setBusqueda] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/sobregiro?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar el sobregiro");
      setData(json.data);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const vendedores = useMemo(
    () => Array.from(new Set((data?.clientes || []).map((c) => c.vendedor))).sort((a, b) => a.localeCompare(b, "es")),
    [data],
  );

  const q = busqueda.trim().toLowerCase();
  const filas = useMemo(() => {
    const base = (data?.clientes || []).filter((c) =>
      (filtro === "todos" ? c.estado !== "sin_limite" : c.estado === filtro) &&
      (!vendedor || c.vendedor === vendedor) &&
      (!q || c.cliente.toLowerCase().includes(q) || c.rif.toLowerCase().includes(q)));
    if (!orden) return base;
    const { col, asc } = orden;
    return [...base].sort((a, b) => {
      const va = a[col], vb = b[col];
      const r = typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" })
        : (va ?? -Infinity) - (vb ?? -Infinity);
      return asc ? r : -r;
    });
  }, [data, filtro, vendedor, q, orden]);

  // Texto A→Z; números, de mayor a menor. Otro click invierte.
  const ordenarPor = (col: Columna) =>
    setOrden((o) => (o?.col === col ? { col, asc: !o.asc } : { col, asc: ["cliente", "sede", "vendedor"].includes(col) }));

  const Th = ({ col, label, ayuda, className = "py-2 px-3 text-right" }: { col: Columna; label: string; ayuda?: string; className?: string }) => (
    <th className={`${className} font-medium`} aria-sort={orden?.col === col ? (orden.asc ? "ascending" : "descending") : "none"}>
      <div className={`flex items-center gap-1 ${className.includes("text-right") ? "justify-end" : ""}`}>
        <button type="button" onClick={() => ordenarPor(col)} className={`uppercase tracking-wide hover:text-slate-700 ${orden?.col === col ? "text-slate-700" : ""}`}>
          {label} <span className="inline-block w-2">{orden?.col === col ? (orden.asc ? "▲" : "▼") : ""}</span>
        </button>
        {ayuda && <ColumnHeader label="" tooltip={ayuda} />}
      </div>
    </th>
  );

  const exportar = () => {
    if (!data) return;
    const fila = (c: Cliente) => ({
      Cliente: c.cliente,
      RIF: c.rif,
      Sede: c.sede,
      Vendedor: c.vendedor,
      "Plazo de pago": c.plazo,
      Estado: ESTADOS[c.estado].label,
      "Límite de crédito": c.limite,
      Usado: c.usado,
      Disponible: c.disponible,
      "Uso (%)": c.usoPct ?? "",
      Excedido: c.excedido,
      Vencido: c.vencido,
      "Días vencido": c.diasVencido,
    });
    const r = data.resumen;
    descargarExcel(`Sobregiro_${empresa || "todas"}_${new Date().toISOString().slice(0, 10)}`, [
      {
        nombre: "Resumen",
        filas: [
          { Indicador: "Clientes con límite", Resultado: r.conLimite },
          { Indicador: "Límite total asignado", Resultado: r.limiteTotal },
          { Indicador: "Usado (clientes con límite)", Resultado: r.usadoTotal },
          { Indicador: "Uso global (%)", Resultado: r.usoPct },
          { Indicador: "Clientes excedidos", Resultado: r.excedidos },
          { Indicador: "Monto excedido", Resultado: r.montoExcedido },
          { Indicador: `Clientes al límite (≥ ${data.utilizacionAlta}%)`, Resultado: r.alLimite },
          { Indicador: "Clientes con deuda sin límite", Resultado: r.sinLimite },
          { Indicador: "Deuda de clientes sin límite", Resultado: r.usadoSinLimite },
        ],
      },
      { nombre: "Vista actual", filas: filas.map(fila) },
      { nombre: "Todos", filas: data.clientes.map(fila) },
    ]);
  };

  const r = data?.resumen;
  const filtros: { id: Filtro; label: string; n?: number }[] = [
    { id: "excedido", label: "Excedidos", n: r?.excedidos },
    { id: "al_limite", label: "Al límite", n: r?.alLimite },
    { id: "en_uso", label: "En uso", n: r?.enUso },
    { id: "sin_uso", label: "Sin uso", n: r?.sinUso },
    { id: "todos", label: "Todos con límite", n: r?.conLimite },
    { id: "sin_limite", label: "Deben sin límite", n: r?.sinLimite },
  ];

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto tabular-nums">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sobregiro</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cuánto usa cada cliente de su límite de crédito y quién se pasa · saldo de hoy
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Building2 size={14} className="text-slate-400" />
            {eligeSede ? (
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Sede" className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            ) : (
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids!]}</span>
            )}
          </div>
          <button onClick={fetchData} disabled={loading} className="flex items-center gap-1 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
          <button onClick={exportar} disabled={!data} className="flex items-center gap-1 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50">
            <Download size={14} />
            Excel
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading && !data ? (
        <div className="py-20 text-center text-slate-400">Cargando límites de crédito…</div>
      ) : r && data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <Tarjeta
              titulo="Excedidos"
              valor={String(r.excedidos)}
              detalle={`${formatCurrency(r.montoExcedido)} por encima del límite · ${formatCurrency(r.vencidoExcedidos)} vencido`}
              icono={AlertTriangle}
              tono={r.excedidos > 0 ? "text-red-600" : "text-emerald-600"}
              activo={filtro === "excedido"}
              onClick={() => setFiltro("excedido")}
            />
            <Tarjeta
              titulo={`Al límite (≥ ${data.utilizacionAlta}%)`}
              valor={String(r.alLimite)}
              detalle="Todavía no se pasan, pero les queda poco"
              icono={Gauge}
              tono="text-amber-600"
              activo={filtro === "al_limite"}
              onClick={() => setFiltro("al_limite")}
            />
            <Tarjeta
              titulo="Uso del crédito total"
              valor={`${r.usoPct.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`}
              detalle={`${formatCurrency(r.usadoTotal)} de ${formatCurrency(r.limiteTotal)} · ${r.conLimite} clientes con límite`}
              icono={CreditCard}
              tono="text-blue-600"
              activo={filtro === "todos"}
              onClick={() => setFiltro("todos")}
            />
            <Tarjeta
              titulo="Deben sin límite asignado"
              valor={String(r.sinLimite)}
              detalle={`${formatCurrency(r.usadoSinLimite)} por cobrar sin límite en Odoo`}
              icono={UserX}
              tono="text-violet-600"
              activo={filtro === "sin_limite"}
              onClick={() => setFiltro("sin_limite")}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 rounded-lg p-1" role="group" aria-label="Estado">
                {filtros.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFiltro(f.id)}
                    aria-pressed={filtro === f.id}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${filtro === f.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
                  >
                    {f.label} {f.n != null && <span className="text-slate-400">({f.n})</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Vendedor" className="text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700">
                  <option value="">Todos los vendedores</option>
                  {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                  <Search size={14} className="text-slate-400" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente o RIF" aria-label="Buscar cliente" className="text-sm outline-none bg-transparent w-44" />
                </div>
              </div>
            </div>

            {filtro === "sin_limite" && <p className="text-xs text-slate-500 mb-3">{AYUDA.sinLimite}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <Th col="cliente" label="Cliente" className="py-2 pr-3" />
                    {!empresa && <Th col="sede" label="Sede" className="py-2 px-3" />}
                    <Th col="vendedor" label="Vendedor" className="py-2 px-3" />
                    <Th col="limite" label="Límite" />
                    <Th col="usado" label="Usado" ayuda={AYUDA.usado} />
                    <Th col="disponible" label="Disponible" ayuda={AYUDA.disponible} />
                    <Th col="usoPct" label="Uso" ayuda={AYUDA.uso(data.utilizacionAlta)} />
                    <Th col="excedido" label="Excedido" />
                    <Th col="vencido" label="Vencido" ayuda={AYUDA.vencido} />
                    <Th col="diasVencido" label="Días venc." ayuda={AYUDA.dias} className="py-2 pl-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((c) => (
                    <tr key={`${c.companyId}-${c.partnerId}`} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-2.5 pr-3 max-w-[280px]">
                        <div className="font-medium text-slate-800 truncate" title={c.cliente}>{c.cliente}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {c.rif && <span>{c.rif}</span>}
                          {c.plazo && <span>· {c.plazo}</span>}
                          <span className={`border rounded px-1.5 py-px ${ESTADOS[c.estado].chip}`}>{ESTADOS[c.estado].label}</span>
                        </div>
                      </td>
                      {!empresa && <td className="py-2.5 px-3 text-slate-600">{c.sede}</td>}
                      <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate" title={c.vendedor}>{c.vendedor}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700">{c.limite > 0 ? formatCurrency(c.limite) : "—"}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700">{formatCurrency(c.usado)}</td>
                      <td className={`py-2.5 px-3 text-right ${c.limite > 0 && c.disponible < 0 ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                        {c.limite > 0 ? formatCurrency(c.disponible) : "—"}
                      </td>
                      <td className="py-2.5 px-3"><BarraUso pct={c.usoPct} estado={c.estado} /></td>
                      <td className={`py-2.5 px-3 text-right ${c.excedido > 0 ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                        {c.excedido > 0 ? formatCurrency(c.excedido) : "—"}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${c.vencido > 0 ? "text-orange-600" : "text-slate-400"}`}>
                        {c.vencido > 0 ? formatCurrency(c.vencido) : "—"}
                      </td>
                      <td className={`py-2.5 pl-3 text-right ${c.diasVencido > 30 ? "text-red-600" : c.diasVencido > 0 ? "text-orange-600" : "text-slate-400"}`}>
                        {c.diasVencido > 0 ? c.diasVencido : "—"}
                      </td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        {filtro === "excedido" && !q && !vendedor ? "Ningún cliente se pasa de su límite." : "No hay clientes con ese filtro."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
