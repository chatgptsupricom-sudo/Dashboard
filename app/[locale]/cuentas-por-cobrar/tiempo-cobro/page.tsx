"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { descargarExcel } from "@/lib/excel";
import { Building2, Calendar, RefreshCw, Clock, X, Download, Search } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ColumnHeader } from "@/components/compras/column-header";

// Tiempo de cobro: días desde la emisión hasta el pago completo de las
// facturas a crédito que se terminaron de pagar en el mes (lib/cxc/tiempoCobro.ts).

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type Grupo = { clave: string; facturas: number; monto: number; promedioDias: number; plazoPromedio: number; promedioPonderado: number; aTiempoPct: number };
type Factura = { id: number; name: string; partnerId: number; cliente: string; vendedor: string; emision: string; pagada: string; dias: number; plazo: number; monto: number };
type Data = {
  resumen: Grupo & { mediana: number };
  tramos: { label: string; facturas: number; monto: number; pct: number }[];
  porPlazo: (Grupo & { plazo: number })[];
  clientes: (Grupo & { partnerId: number })[];
  vendedores: Grupo[];
  facturas: Factura[];
  filters: { desde: string; hasta: string };
  updatedAt: string;
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const formatDate = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("es-VE") : "—");
const dias = (n: number) => `${n.toLocaleString("es-VE", { maximumFractionDigits: 2 })} días`;

const AYUDA = {
  promedio:
    "Promedio por factura: se suman los días que tardó cada factura y se divide entre la cantidad de facturas (cada una pesa igual).",
  ponderado:
    "Promedio ponderado por monto: cada factura pesa según su monto, así que las grandes mandan. " +
    "Ej.: una de $76.000 pagada en 15 días y tres más pequeñas en 28-29 días dan 25 días por factura, pero ~21 ponderado. " +
    "Si el ponderado es menor que el promedio, el dinero grande entra más rápido que las facturas chicas.",
  plazo: "Días de crédito que dio la factura: fecha de vencimiento − fecha de emisión (no el nombre del término de pago en Odoo). Promedio por factura.",
  aTiempo: "% de facturas que se terminaron de pagar en o antes de su fecha de vencimiento.",
};

/** Verde si paga dentro del plazo, ámbar hasta 1,5× el plazo, rojo más allá. */
function tono(real: number, plazo: number) {
  if (real <= plazo) return "text-emerald-600";
  if (real <= plazo * 1.5) return "text-amber-600";
  return "text-red-600";
}

// ── Excel ──
const filaGrupo = (titulo: string) => (g: Grupo) => ({
  [titulo]: g.clave,
  "Tarda en pagar (días, promedio por factura)": g.promedioDias,
  "Tarda en pagar (días, ponderado por monto)": g.promedioPonderado,
  "Plazo promedio (días)": g.plazoPromedio,
  "Pagadas a tiempo (%)": g.aTiempoPct,
  Facturas: g.facturas,
  "Monto (con IVA)": g.monto,
});
const filaFactura = (f: Factura) => ({
  Factura: f.name,
  Cliente: f.cliente,
  Vendedor: f.vendedor,
  "Fecha de emisión": f.emision,
  "Fecha de pago completo": f.pagada,
  "Días en pagar": f.dias,
  "Plazo (días)": f.plazo,
  "Días de atraso": Math.max(0, f.dias - f.plazo),
  "Monto (con IVA)": f.monto,
});
function descargar(nombre: string, hojas: { nombre: string; filas: Record<string, unknown>[] }[]) {
  descargarExcel(nombre, hojas);
}

/** Totales de un grupo de facturas (mismo cálculo que agrupar() en lib/cxc/tiempoCobro.ts). */
function resumenDe(fs: Factura[]): Omit<Grupo, "clave"> {
  const monto = fs.reduce((s, f) => s + f.monto, 0);
  const prom = (c: "dias" | "plazo") => (fs.length ? fs.reduce((s, f) => s + f[c], 0) / fs.length : 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    facturas: fs.length,
    monto: r2(monto),
    promedioDias: r2(prom("dias")),
    plazoPromedio: r2(prom("plazo")),
    promedioPonderado: r2(monto > 0 ? fs.reduce((s, f) => s + f.dias * f.monto, 0) / monto : 0),
    aTiempoPct: fs.length ? Math.round((fs.filter((f) => f.dias <= f.plazo).length / fs.length) * 1000) / 10 : 0,
  };
}

/** Facturas agrupadas por cliente (para el detalle). */
function agruparPorCliente(fs: Factura[]) {
  const m = new Map<string, Factura[]>();
  for (const f of fs) {
    const k = `${f.partnerId}|${f.cliente}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(f);
  }
  return [...m.entries()]
    .map(([k, lista]) => ({ ...resumenDe(lista), clave: k, cliente: lista[0].cliente, facturas: lista.sort((a, b) => b.dias - a.dias) }))
    .sort((a, b) => b.monto - a.monto);
}

const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ANIO_COMPLETO = 0;
const RANGO = -1;

/** Excel con desglose: hoja resumen (lo que muestra la tabla) + hoja con cada factura detrás. */
function descargarDesglose(nombre: string, resumen: { nombre: string; filas: Record<string, unknown>[] }, facturas: Factura[], agrupador?: { titulo: string; valor: (f: Factura) => string }) {
  const ordenadas = [...facturas].sort((a, b) =>
    (agrupador ? agrupador.valor(a).localeCompare(agrupador.valor(b), "es", { numeric: true }) : 0) ||
    a.cliente.localeCompare(b.cliente, "es") || b.dias - a.dias);
  const porCliente = agruparPorCliente(facturas).map((c) => filaGrupo("Cliente")({ ...c, clave: c.cliente, facturas: c.facturas.length }));
  descargar(nombre, [
    resumen,
    ...(resumen.nombre === "Por cliente" ? [] : [{ nombre: "Por cliente", filas: porCliente }]),
    { nombre: "Facturas", filas: ordenadas.map((f) => ({ ...(agrupador ? { [agrupador.titulo]: agrupador.valor(f) } : {}), ...filaFactura(f) })) },
  ]);
}

function BotonExcel({ onClick, texto = "Excel" }: { onClick: () => void; texto?: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition">
      <Download size={13} />
      {texto}
    </button>
  );
}

function Tabla({ filas, titulo, onClick }: { filas: Grupo[]; titulo: string; onClick?: (g: any, i: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
            <th className="py-2 pr-3 font-medium">{titulo}</th>
            <th className="py-2 px-3 font-medium text-right"><ColumnHeader label="Tarda en pagar" tooltip={AYUDA.promedio} className="justify-end" /></th>
            <th className="py-2 px-3 font-medium text-right"><ColumnHeader label="Ponderado" tooltip={AYUDA.ponderado} className="justify-end" /></th>
            <th className="py-2 px-3 font-medium text-right"><ColumnHeader label="Plazo" tooltip={AYUDA.plazo} className="justify-end" /></th>
            <th className="py-2 px-3 font-medium text-right"><ColumnHeader label="A tiempo" tooltip={AYUDA.aTiempo} className="justify-end" /></th>
            <th className="py-2 px-3 font-medium text-right">Facturas</th>
            <th className="py-2 pl-3 font-medium text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((g, i) => (
            <tr
              key={g.clave + i}
              onClick={onClick ? () => onClick(g, i) : undefined}
              className={`border-b border-slate-50 hover:bg-slate-50/60 ${onClick ? "cursor-pointer" : ""}`}
            >
              <td className={`py-2.5 pr-3 font-medium ${onClick ? "text-blue-600" : "text-slate-800"} max-w-[260px] truncate`}>{g.clave}</td>
              <td className={`py-2.5 px-3 text-right font-semibold ${tono(g.promedioDias, g.plazoPromedio)}`}>{dias(g.promedioDias)}</td>
              <td className="py-2.5 px-3 text-right text-slate-500">{dias(g.promedioPonderado)}</td>
              <td className="py-2.5 px-3 text-right text-slate-500">{dias(g.plazoPromedio)}</td>
              <td className="py-2.5 px-3 text-right text-slate-500">{g.aTiempoPct}%</td>
              <td className="py-2.5 px-3 text-right text-slate-500">{g.facturas}</td>
              <td className="py-2.5 pl-3 text-right text-slate-700">{formatCurrency(g.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TiempoCobroPage() {
  const { user } = useAuthStore();
  const userCids = user?.cids ? Number(user.cids) : undefined;
  const now = new Date();
  const [empresa, setEmpresa] = useState("");
  // mes: 1-12, ANIO_COMPLETO o RANGO (usa rangoDesde/rangoHasta).
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [rangoDesde, setRangoDesde] = useState(fechaLocal(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [rangoHasta, setRangoHasta] = useState(fechaLocal(now));
  const rangoInvalido = mes === RANGO && (!rangoDesde || !rangoHasta || rangoDesde > rangoHasta);
  const [desde, hasta] =
    mes === RANGO ? [rangoDesde, rangoHasta]
    : mes === ANIO_COMPLETO ? [`${anio}-01-01`, `${anio}-12-31`]
    : [fechaLocal(new Date(anio, mes - 1, 1)), fechaLocal(new Date(anio, mes, 0))];
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // agrupar: el detalle se muestra por cliente con sus facturas dentro (por plazo, por vendedor).
  const [detalle, setDetalle] = useState<{ titulo: string; facturas: Factura[]; agrupar?: boolean } | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"clientes" | "vendedores">("clientes");
  const [busqueda, setBusqueda] = useState("");

  const fetchData = useCallback(async () => {
    if (rangoInvalido) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate: desde, endDate: hasta });
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/tiempo-cobro?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar el tiempo de cobro");
      setData(json.data);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa, desde, hasta, rangoInvalido, userCids]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    document.body.style.overflow = detalle ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [detalle]);

  const r = data?.resumen;
  const periodo = mes === RANGO ? `${desde}_a_${hasta}` : mes === ANIO_COMPLETO ? String(anio) : `${MONTHS[mes - 1]}_${anio}`;
  const periodoTexto = mes === RANGO ? `del ${formatDate(desde)} al ${formatDate(hasta)}`
    : mes === ANIO_COMPLETO ? `en ${anio}` : `en ${MONTHS[mes - 1]} ${anio}`;
  const q = busqueda.trim().toLowerCase();
  const clientesFiltrados = useMemo(
    () => (data?.clientes || []).filter((c) => !q || c.clave.toLowerCase().includes(q)),
    [data, q],
  );
  const vendedoresFiltrados = useMemo(
    () => (data?.vendedores || []).filter((v) => !q || v.clave.toLowerCase().includes(q)),
    [data, q],
  );

  const exportarTodo = () => {
    if (!data || !r) return;
    descargar(`Tiempo_de_cobro_${periodo}`, [
      {
        nombre: "Resumen",
        filas: [
          { Indicador: "Tardan en pagar (días, promedio por factura)", Resultado: r.promedioDias },
          { Indicador: "Tardan en pagar (días, ponderado por monto)", Resultado: r.promedioPonderado },
          { Indicador: "Plazo promedio (días)", Resultado: r.plazoPromedio },
          { Indicador: "Factura típica / mediana (días)", Resultado: r.mediana },
          { Indicador: "Pagadas a tiempo (%)", Resultado: r.aTiempoPct },
          { Indicador: "Facturas pagadas", Resultado: r.facturas },
          { Indicador: "Monto pagado (con IVA)", Resultado: r.monto },
          { Indicador: "Período", Resultado: `${data.filters.desde} a ${data.filters.hasta}` },
        ],
      },
      { nombre: "Tramos de días", filas: data.tramos.map((t) => ({ Tramo: t.label, Facturas: t.facturas, "Monto (con IVA)": t.monto, "% del monto": t.pct })) },
      { nombre: "Por plazo", filas: data.porPlazo.map(filaGrupo("Plazo")) },
      { nombre: "Por cliente", filas: data.clientes.map(filaGrupo("Cliente")) },
      { nombre: "Por vendedor", filas: data.vendedores.map(filaGrupo("Vendedor")) },
      { nombre: "Facturas", filas: data.facturas.map(filaFactura) },
    ]);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto tabular-nums">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tiempo de Cobro</h1>
          <p className="text-sm text-slate-500 mt-1">
            Días desde que se emite la factura hasta que el cliente la paga por completo · facturas a crédito pagadas {periodoTexto}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!userCids ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-400" />
            <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              <option value={ANIO_COMPLETO}>Año completo</option>
              <option value={RANGO}>Rango de fechas</option>
            </select>
            {mes === RANGO ? (
              <>
                <input type="date" value={rangoDesde} max={rangoHasta} onChange={(e) => setRangoDesde(e.target.value)} aria-label="Fecha inicio" className="text-sm bg-transparent border-none outline-none text-slate-700" />
                <span className="text-xs text-slate-400">a</span>
                <input type="date" value={rangoHasta} min={rangoDesde} onChange={(e) => setRangoHasta(e.target.value)} aria-label="Fecha fin" className="text-sm bg-transparent border-none outline-none text-slate-700" />
              </>
            ) : (
              <select value={anio} onChange={(e) => setAnio(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
                {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
          {rangoInvalido && <span className="text-xs text-red-600">La fecha inicio debe ser anterior a la fecha fin</span>}
          <button onClick={fetchData} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
          {data && data.resumen.facturas > 0 && (
            <button onClick={exportarTodo} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-emerald-700 transition" title="Resumen, tramos, por plazo, por cliente, por vendedor y todas las facturas">
              <Download size={14} />
              Exportar todo
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>}

      {loading && !data ? (
        <div className="text-center py-20 text-slate-400 text-sm">Cargando...</div>
      ) : data && r ? (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {r.facturas === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm">
              Ninguna factura a crédito se terminó de pagar en este período.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-blue-200 bg-blue-50/30 rounded-2xl p-5 col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Clock size={18} />
                    <ColumnHeader label="Tardan en pagar" tooltip={AYUDA.promedio} className="text-sm font-semibold" />
                  </div>
                  <p className={`text-3xl font-bold mt-2 ${tono(r.promedioDias, r.plazoPromedio)}`}>{dias(r.promedioDias)}</p>
                  <p className="text-xs text-slate-500 mt-2">Promedio por factura · plazo promedio {dias(r.plazoPromedio)}</p>
                  <div className="flex items-center gap-1 text-xs text-slate-600 mt-1">
                    <span>Ponderado por monto: <b>{dias(r.promedioPonderado)}</b></span>
                    <ColumnHeader label="" tooltip={AYUDA.ponderado} />
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-semibold text-slate-600">Factura típica</p>
                  <p className="text-3xl font-bold text-slate-800 mt-2">{dias(r.mediana)}</p>
                  <p className="text-xs text-slate-500 mt-2">Mediana: la mitad paga antes, la mitad después</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-semibold text-slate-600">Pagadas a tiempo</p>
                  <p className="text-3xl font-bold text-slate-800 mt-2">{r.aTiempoPct}%</p>
                  <p className="text-xs text-slate-500 mt-2">Dentro del plazo de la factura</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-semibold text-slate-600">Facturas pagadas</p>
                  <p className="text-3xl font-bold text-slate-800 mt-2">{r.facturas}</p>
                  <p className="text-xs text-slate-500 mt-2">{formatCurrency(r.monto)} con IVA</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h2 className="font-semibold text-slate-800 mb-4">¿En cuántos días pagan?</h2>
                  <div className="space-y-2.5">
                    {data.tramos.map((t) => (
                      <div key={t.label} className="flex items-center gap-3">
                        <span className="w-28 text-xs text-slate-500 shrink-0">{t.label}</span>
                        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${t.pct}%` }} />
                        </div>
                        <span className="w-32 text-right text-xs text-slate-600 shrink-0">
                          {t.pct}% · {t.facturas} fact.
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">% del monto pagado en el período</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-slate-800">Por plazo de la factura</h2>
                      <p className="text-xs text-slate-400">Click para ver sus facturas</p>
                    </div>
                    <BotonExcel onClick={() => descargarDesglose(
                      `Tiempo_de_cobro_por_plazo_${periodo}`,
                      { nombre: "Por plazo", filas: data.porPlazo.map(filaGrupo("Plazo")) },
                      data.facturas,
                      { titulo: "Plazo", valor: (f) => `${f.plazo} días` },
                    )} />
                  </div>
                  <Tabla
                    filas={data.porPlazo}
                    titulo="Plazo"
                    onClick={(g) => { setAbiertos(new Set()); setDetalle({ titulo: `Plazo ${g.clave}`, facturas: data.facturas.filter((f) => f.plazo === g.plazo), agrupar: true }); }}
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center bg-slate-100 rounded-lg p-1">
                    {(["clientes", "vendedores"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTab(t); setBusqueda(""); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === t ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
                      >
                        {t === "clientes" ? `Por cliente (${data.clientes.length})` : `Por vendedor (${data.vendedores.length})`}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder={tab === "clientes" ? "Buscar cliente..." : "Buscar vendedor..."}
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 w-56"
                      />
                    </div>
                    <BotonExcel
                      onClick={() => {
                        if (tab === "clientes") {
                          const ids = new Set(clientesFiltrados.map((c) => c.partnerId));
                          descargarDesglose(`Tiempo_de_cobro_por_cliente_${periodo}`,
                            { nombre: "Por cliente", filas: clientesFiltrados.map(filaGrupo("Cliente")) },
                            data.facturas.filter((f) => ids.has(f.partnerId)));
                        } else {
                          const nombres = new Set(vendedoresFiltrados.map((v) => v.clave));
                          descargarDesglose(`Tiempo_de_cobro_por_vendedor_${periodo}`,
                            { nombre: "Por vendedor", filas: vendedoresFiltrados.map(filaGrupo("Vendedor")) },
                            data.facturas.filter((f) => nombres.has(f.vendedor)),
                            { titulo: "Vendedor", valor: (f) => f.vendedor });
                        }
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">Ordenados por monto pagado · click para ver sus facturas</p>
                {tab === "clientes" ? (
                  <Tabla
                    filas={clientesFiltrados}
                    titulo="Cliente"
                    onClick={(g) => setDetalle({ titulo: g.clave, facturas: data.facturas.filter((f) => f.partnerId === g.partnerId) })}
                  />
                ) : (
                  <Tabla
                    filas={vendedoresFiltrados}
                    titulo="Vendedor"
                    onClick={(g) => { setAbiertos(new Set()); setDetalle({ titulo: g.clave, facturas: data.facturas.filter((f) => f.vendedor === g.clave), agrupar: true }); }}
                  />
                )}
                {(tab === "clientes" ? clientesFiltrados : vendedoresFiltrados).length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-6">Sin resultados para "{busqueda}"</p>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                Cada factura cuenta desde su fecha de emisión hasta la fecha del último pago que la dejó en cero (fecha del pago, no la de registro en Odoo).
                El plazo es fecha de vencimiento − fecha de la factura. Los promedios son por factura (cada una pesa igual).
                Solo crédito; sin Supricom, SUPER TECHNO ni facturas vencidas antes de 2025. Las cerradas solo con nota de crédito no cuentan.
              </p>
            </>
          )}
        </div>
      ) : null}

      {detalle && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] w-full max-w-4xl flex flex-col tabular-nums" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800 truncate">{detalle.titulo} · {detalle.facturas.length} facturas</h3>
                {detalle.agrupar && (
                  <button
                    onClick={() => setAbiertos(abiertos.size ? new Set() : new Set(agruparPorCliente(detalle.facturas).map((c) => c.clave)))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {abiertos.size ? "Contraer todo" : "Expandir todo"} · ordenado por cliente (click para ver sus facturas)
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BotonExcel onClick={() => descargarDesglose(
                  `Tiempo_de_cobro_${detalle.titulo.replace(/[^\w]+/g, "_")}_${periodo}`,
                  { nombre: "Resumen", filas: [filaGrupo("Detalle")({ clave: detalle.titulo, ...resumenDe(detalle.facturas) })] },
                  detalle.facturas,
                )} />
                <button onClick={() => setDetalle(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition" title="Cerrar">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="text-left py-2.5 px-3">Factura</th>
                    <th className="text-left py-2.5 px-3">{detalle.agrupar ? "Cliente / vendedor" : "Cliente"}</th>
                    <th className="text-left py-2.5 px-3">Emitida</th>
                    <th className="text-left py-2.5 px-3">Pagada</th>
                    <th className="text-right py-2.5 px-3">Días</th>
                    <th className="text-right py-2.5 px-3">Plazo</th>
                    <th className="text-right py-2.5 px-3">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.agrupar
                    ? agruparPorCliente(detalle.facturas).map((c) => {
                        const abierto = abiertos.has(c.clave);
                        return [
                          <tr
                            key={c.clave}
                            onClick={() => setAbiertos((prev) => {
                              const n = new Set(prev);
                              if (n.has(c.clave)) n.delete(c.clave); else n.add(c.clave);
                              return n;
                            })}
                            className="border-t border-slate-100 bg-slate-50/70 hover:bg-blue-50/40 cursor-pointer"
                          >
                            <td className="py-2 px-3 font-semibold text-slate-700">{abierto ? "▾" : "▸"} {c.facturas.length} fact.</td>
                            <td className="py-2 px-3 font-semibold text-blue-700 max-w-[260px] truncate" colSpan={3}>{c.cliente}</td>
                            <td className={`py-2 px-3 text-right font-bold ${tono(c.promedioDias, c.plazoPromedio)}`}>{c.promedioDias}</td>
                            <td className="py-2 px-3 text-right text-slate-500">{c.plazoPromedio}</td>
                            <td className="py-2 px-3 text-right font-semibold text-slate-800">{formatCurrency(c.monto)}</td>
                          </tr>,
                          ...(abierto ? c.facturas.map((f) => (
                            <tr key={f.id} className="border-t border-slate-50">
                              <td className="py-2 px-3 pl-8 font-medium text-slate-700">{f.name}</td>
                              <td className="py-2 px-3 text-slate-400">{f.vendedor}</td>
                              <td className="py-2 px-3 text-slate-500">{formatDate(f.emision)}</td>
                              <td className="py-2 px-3 text-slate-500">{formatDate(f.pagada)}</td>
                              <td className={`py-2 px-3 text-right font-semibold ${tono(f.dias, f.plazo)}`}>{f.dias}</td>
                              <td className="py-2 px-3 text-right text-slate-500">{f.plazo}</td>
                              <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(f.monto)}</td>
                            </tr>
                          )) : []),
                        ];
                      })
                    : detalle.facturas.map((f) => (
                    <tr key={f.id} className="border-t border-slate-50">
                      <td className="py-2 px-3 font-medium text-slate-700">{f.name}</td>
                      <td className="py-2 px-3 text-slate-600 max-w-[200px] truncate">{f.cliente}</td>
                      <td className="py-2 px-3 text-slate-500">{formatDate(f.emision)}</td>
                      <td className="py-2 px-3 text-slate-500">{formatDate(f.pagada)}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${tono(f.dias, f.plazo)}`}>{f.dias}</td>
                      <td className="py-2 px-3 text-right text-slate-500">{f.plazo}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(f.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
