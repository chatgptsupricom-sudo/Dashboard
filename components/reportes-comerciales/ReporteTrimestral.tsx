"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatTrimestre,
  trimestresDisponibles,
  trimestreActual,
} from "@/lib/reportes-comerciales/trimestres";
import {
  BarChart3,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FilaRanking {
  nombre: string;
  venta: number;
  unidades: number;
  partnerId?: number | null;
}
interface EppCalculada {
  id: number;
  clienteNombre: string;
  odooPartnerId: number | null;
  metaAnual: number;
  metaTrimestre: number;
  realTrimestre: number;
  cumplimiento: number;
}
interface Reporte {
  periodo: {
    trimestre: string;
    desde: string;
    hasta: string;
    marca: string;
    marcasDisponibles: string[];
  };
  totales: { venta: number; unidades: number; facturas: number; clientes: number };
  comparativo: {
    trimestre: string;
    venta: number;
    unidades: number;
    variacionVentaPct: number | null;
  };
  rankingClientes: FilaRanking[];
  rankingProductos: FilaRanking[];
  porDepartamento: FilaRanking[];
  porVendedor: FilaRanking[];
  porMarca: FilaRanking[];
  epp: EppCalculada[];
  anio: number;
}
type Tab = "resumen" | "epp";

const API = "/api/reportes-comerciales/trimestral";

function money(n: number): string {
  return (n || 0).toLocaleString("es-PA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function num(n: number): string {
  return Math.round(n || 0).toLocaleString("es-PA");
}
function pct(n: number): string {
  return `${Math.round((n || 0) * 100)}%`;
}
function colorCumplimiento(c: number): string {
  if (c >= 1) return "text-emerald-700 bg-emerald-100";
  if (c >= 0.6) return "text-blue-700 bg-blue-100";
  if (c >= 0.3) return "text-amber-700 bg-amber-100";
  return "text-red-700 bg-red-100";
}
function barColor(i: number): string {
  return ["#2563eb", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#ca8a04"][i % 7];
}

/* Buscador de cliente: solo muestra sugerencias cuando se escribe algo. */
function ClienteCombo({
  clientes,
  value,
  onSelect,
}: {
  clientes: { id: number; nombre: string }[];
  value: string;
  onSelect: (c: { id: number; nombre: string }) => void;
}) {
  const [q, setQ] = useState(value);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => setQ(value), [value]);

  const seleccionValida = clientes.some((c) => c.nombre === value);

  const sugerencias = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return clientes
      .filter((c) => c.nombre.toLowerCase().includes(t))
      .slice(0, 40);
  }, [q, clientes]);

  return (
    <div className="relative mt-1">
      <input
        type="text"
        autoComplete="off"
        placeholder={clientes.length ? "Escribe para buscar el cliente…" : "Cargando clientes…"}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm">
          {sugerencias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(c);
                  setQ(c.nombre);
                  setAbierto(false);
                }}
                className="block w-full text-left px-3 py-2 hover:bg-blue-50"
              >
                {c.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && q.trim().length >= 2 && sugerencias.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2 text-xs text-slate-400">
          Sin coincidencias
        </div>
      )}
      {value ? (
        seleccionValida ? (
          <span className="text-[11px] text-emerald-600 mt-1 block">✓ Cliente vinculado</span>
        ) : (
          <span className="text-[11px] text-amber-600 mt-1 block">
            Elige un cliente de la lista para que el cruce sea exacto.
          </span>
        )
      ) : null}
    </div>
  );
}

export function ReporteTrimestral() {
  const opcionesTrimestre = useMemo(() => trimestresDisponibles(), []);
  const [trimestre, setTrimestre] = useState(() => formatTrimestre(trimestreActual()));
  const [marca, setMarca] = useState("EZVIZ");
  const [tab, setTab] = useState<Tab>("resumen");

  const [data, setData] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 110_000);
    setLoading(true);
    setError(null);
    fetch(`${API}?trimestre=${trimestre}&marca=${encodeURIComponent(marca)}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || `Error ${r.status}`);
        return r.json();
      })
      .then((json: Reporte) => setData(json))
      .catch((e: any) => {
        if (e.name === "AbortError") setError("La consulta tardo demasiado. Reintenta.");
        else setError(e.message || "No se pudo cargar el reporte");
      })
      .finally(() => {
        clearTimeout(t);
        setLoading(false);
      });
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimestre, marca]);

  useEffect(() => cargar(), [cargar]);

  const exportar = async () => {
    setExportando(true);
    try {
      const r = await fetch(
        `${API}/export?trimestre=${trimestre}&marca=${encodeURIComponent(marca)}`,
      );
      if (!r.ok) throw new Error((await r.json()).error || "Error al exportar");
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="(.+?)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] || `reporte_${trimestre}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setAviso(e.message || "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-50">
            <BarChart3 className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              Reporte de Ventas Trimestral
            </h1>
            <p className="text-sm text-slate-500">
              Panamá · marca {data?.periodo.marca || marca} ·{" "}
              {data ? `${data.periodo.desde} a ${data.periodo.hasta}` : trimestre}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            className="bg-white border rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm cursor-pointer"
          >
            {(data?.periodo.marcasDisponibles || ["TODAS", "EZVIZ"]).map((m) => (
              <option key={m} value={m}>
                {m === "TODAS" ? "Todas las marcas" : m}
              </option>
            ))}
          </select>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(e.target.value)}
            className="bg-white border rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm cursor-pointer"
          >
            {opcionesTrimestre.map((t) => {
              const v = formatTrimestre(t);
              return (
                <option key={v} value={v}>
                  {v}
                </option>
              );
            })}
          </select>
          <button
            onClick={cargar}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border rounded-xl shadow-sm hover:bg-slate-50 font-bold text-xs uppercase tracking-widest"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={exportar}
            disabled={exportando || !data}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-40"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>Excel</span>
          </button>
        </div>
      </div>

      {aviso && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm px-4 py-2 flex justify-between">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="font-bold">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ["resumen", "Resumen"],
            ["epp", "Cuentas EPP"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-3" />
          <p className="text-sm font-semibold text-slate-500">Consultando Odoo…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center">
          <p className="text-sm font-bold text-red-700 mb-3">{error}</p>
          <button
            onClick={cargar}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {tab === "resumen" && <TabResumen data={data} />}
          {tab === "epp" && <TabEpp data={data} marca={marca} onCambio={cargar} />}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Tab Resumen ─────────────────────────── */

function KpiCard({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardContent className="p-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {label}
        </span>
        <p className="text-xl font-black text-slate-900 mt-1">{value}</p>
        {extra}
      </CardContent>
    </Card>
  );
}

function RankingTabla({
  titulo,
  filas,
  campo,
  formato,
  top = 15,
}: {
  titulo: string;
  filas: FilaRanking[];
  campo: "venta" | "unidades";
  formato: (n: number) => string;
  top?: number;
}) {
  const datos = filas.slice(0, top);
  const max = Math.max(1, ...datos.map((f) => f[campo]));
  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
      <CardHeader className="bg-slate-50/80 border-b border-slate-100 pb-3">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {datos.map((f, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-4 py-2 text-xs font-bold text-slate-400 w-8">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold text-slate-800 text-xs truncate max-w-[280px]">
                      {f.nombre}
                    </div>
                    <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(f[campo] / max) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-black text-xs text-slate-900 whitespace-nowrap">
                    {formato(f[campo])}
                  </td>
                </tr>
              ))}
              {datos.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-xs text-slate-400" colSpan={3}>
                    Sin datos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function GraficoBarras({ titulo, filas }: { titulo: string; filas: FilaRanking[] }) {
  const datos = filas.slice(0, 12).map((f) => ({ name: f.nombre.split("(")[0].trim(), venta: f.venta }));
  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
              width={120}
            />
            <Tooltip
              formatter={(v: number) => [`$${money(v)}`, "Venta"]}
              contentStyle={{ borderRadius: 12, border: "none", fontSize: 12 }}
            />
            <Bar dataKey="venta" radius={[0, 6, 6, 0]} barSize={16}>
              {datos.map((_, i) => (
                <Cell key={i} fill={barColor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function TabResumen({ data }: { data: Reporte }) {
  const v = data.comparativo.variacionVentaPct;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Venta del trimestre"
          value={`$${money(data.totales.venta)}`}
          extra={
            v != null ? (
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  v >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                }`}
              >
                {v >= 0 ? "▲" : "▼"} {Math.abs(v)}% vs {data.comparativo.trimestre}
              </span>
            ) : (
              <span className="text-xs text-slate-400">sin trimestre previo</span>
            )
          }
        />
        <KpiCard label="Unidades" value={num(data.totales.unidades)} />
        <KpiCard label="Facturas" value={num(data.totales.facturas)} />
        <KpiCard label="Clientes" value={num(data.totales.clientes)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTabla
          titulo="Ranking de clientes (por venta)"
          filas={data.rankingClientes}
          campo="venta"
          formato={(n) => `$${money(n)}`}
        />
        <RankingTabla
          titulo="Ranking de productos (por unidades)"
          filas={data.rankingProductos}
          campo="unidades"
          formato={num}
        />
        <GraficoBarras titulo="Venta por departamento" filas={data.porDepartamento} />
        <GraficoBarras titulo="Venta por vendedor" filas={data.porVendedor} />
        <DonutProductos filas={data.rankingProductos} />
        {data.porMarca.length > 0 && (
          <GraficoBarras titulo="Venta por marca" filas={data.porMarca} />
        )}
      </div>
    </div>
  );
}

function DonutProductos({ filas }: { filas: FilaRanking[] }) {
  const top = filas.slice(0, 8);
  const otros = filas.slice(8).reduce((s, f) => s + f.unidades, 0);
  const datos = [
    ...top.map((f) => ({ name: f.nombre, value: f.unidades })),
    ...(otros > 0 ? [{ name: "Otros", value: Math.round(otros) }] : []),
  ];
  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Productos por unidades (top 8)
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={datos}
              dataKey="value"
              nameKey="name"
              cx="40%"
              cy="50%"
              innerRadius={45}
              outerRadius={90}
              paddingAngle={2}
            >
              {datos.map((_, i) => (
                <Cell key={i} fill={barColor(i)} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => [num(v), "Unidades"]} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 10, maxWidth: 180 }}
              formatter={(val: string) => (val.length > 32 ? val.slice(0, 32) + "…" : val)}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── Tab EPP ─────────────────────────── */

interface EppRow {
  id: number;
  cliente_nombre: string;
  odoo_partner_id: number | null;
  meta_anual: number;
  activo: number;
}

function BarEpp({
  rows,
  realPorId,
  trimestre,
}: {
  rows: EppRow[];
  realPorId: Map<number, EppCalculada>;
  trimestre: string;
}) {
  const datos = rows
    .map((r) => {
      const calc = realPorId.get(r.id);
      const metaTrim = (Number(r.meta_anual) || 0) / 4;
      return {
        name: r.cliente_nombre.split("(")[0].trim(),
        meta: Math.round(metaTrim),
        real: Math.round(calc?.realTrimestre ?? 0),
      };
    })
    .sort((a, b) => b.meta - a.meta);
  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Meta del trimestre vs real por cuenta ({trimestre})
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ left: 0, right: 12, top: 8, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              angle={-40}
              textAnchor="end"
              interval={0}
              tick={{ fontSize: 9, fill: "#64748b" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
            />
            <Tooltip formatter={(v: number) => `$${money(v)}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="meta" name="Meta trimestre" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="real" name="Real" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function TabEpp({
  data,
  marca,
  onCambio,
}: {
  data: Reporte;
  marca: string;
  onCambio: () => void;
}) {
  const puedeEditar = true;
  const [anio, setAnio] = useState(data.anio);
  const [rows, setRows] = useState<EppRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Partial<EppRow> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([]);

  useEffect(() => {
    fetch(`${API}/clientes`)
      .then((r) => r.json())
      .then((j) => setClientes(j.clientes || []))
      .catch(() => {});
  }, []);

  const cargarEpp = useCallback(() => {
    setCargando(true);
    fetch(`${API}/epp?anio=${anio}&marca=${encodeURIComponent(marca)}`)
      .then((r) => r.json())
      .then((j) => setRows(j.cuentas || []))
      .finally(() => setCargando(false));
  }, [anio, marca]);

  useEffect(() => cargarEpp(), [cargarEpp]);

  // real/cumplimiento del trimestre en curso salen del reporte ya calculado
  const realPorId = useMemo(() => {
    const m = new Map<number, EppCalculada>();
    data.epp.forEach((e) => m.set(e.id, e));
    return m;
  }, [data.epp]);

  const accion = async (body: any) => {
    setMsg(null);
    const r = await fetch(`${API}/epp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, marca, anio }),
    });
    if (!r.ok) {
      setMsg((await r.json()).error || "Error");
      return;
    }
    setEditando(null);
    cargarEpp();
    onCambio();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Año</span>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="bg-white border rounded-lg px-2 py-1.5 text-sm font-bold"
          >
            {[data.anio - 1, data.anio, data.anio + 1].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {puedeEditar && (
          <div className="flex gap-2">
            <button
              onClick={() => accion({ accion: "copiar_anio", desde: anio - 1, hacia: anio })}
              className="flex items-center gap-2 px-3 py-2 bg-white border rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-50"
            >
              <RefreshCw size={14} /> Copiar de {anio - 1}
            </button>
            <button
              onClick={() => setEditando({ cliente_nombre: "", meta_anual: 0, odoo_partner_id: null })}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-700"
            >
              <Plus size={14} /> Agregar cuenta
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2">
          {msg}
        </div>
      )}

      {rows.length > 0 && <BarEpp rows={rows} realPorId={realPorId} trimestre={data.periodo.trimestre} />}

      <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-right">Meta anual</th>
                  <th className="px-4 py-3 text-right">Meta trimestre</th>
                  <th className="px-4 py-3 text-right">Real ({data.periodo.trimestre})</th>
                  <th className="px-4 py-3 text-center">Cumplimiento</th>
                  {puedeEditar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </td>
                  </tr>
                )}
                {!cargando && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                      Sin cuentas para {anio}. Agrega una o copia del año anterior.
                    </td>
                  </tr>
                )}
                {!cargando &&
                  rows.map((row) => {
                    const calc = realPorId.get(row.id);
                    const metaTrim = (Number(row.meta_anual) || 0) / 4;
                    const real = calc?.realTrimestre ?? 0;
                    const cumpl = metaTrim > 0 ? real / metaTrim : 0;
                    return (
                      <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-semibold text-slate-800 text-xs">
                          {row.cliente_nombre}
                          {row.activo === 0 && (
                            <span className="ml-2 text-[9px] text-slate-400 uppercase">inactivo</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-700">
                          ${money(Number(row.meta_anual))}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                          ${money(metaTrim)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-black text-slate-900">
                          ${money(real)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`text-[11px] font-black px-2 py-0.5 rounded-full ${colorCumplimiento(
                              cumpl,
                            )}`}
                          >
                            {pct(cumpl)}
                          </span>
                        </td>
                        {puedeEditar && (
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => setEditando(row)}
                              className="p-1.5 text-slate-400 hover:text-blue-600"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar ${row.cliente_nombre}?`))
                                  accion({ accion: "eliminar", id: row.id });
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar cuenta" : "Nueva cuenta EPP"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-500">Cliente (Panamá)</span>
              <ClienteCombo
                clientes={clientes}
                value={editando?.cliente_nombre || ""}
                onSelect={(c) =>
                  setEditando((s) => ({
                    ...s,
                    cliente_nombre: c.nombre,
                    odoo_partner_id: c.id,
                  }))
                }
              />
            </div>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Meta anual (USD)</span>
              <input
                type="number"
                value={editando?.meta_anual ?? 0}
                onChange={(e) =>
                  setEditando((s) => ({ ...s, meta_anual: Number(e.target.value) }))
                }
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              />
            </label>
            {editando?.id != null && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(editando?.activo ?? 1) === 1}
                  onChange={(e) =>
                    setEditando((s) => ({ ...s, activo: e.target.checked ? 1 : 0 }))
                  }
                />
                <span className="text-xs font-bold text-slate-500">Activo</span>
              </label>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setEditando(null)}
              className="px-4 py-2 text-sm font-bold text-slate-500"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const match = clientes.find(
                  (c) => c.nombre === editando?.cliente_nombre,
                );
                if (!match) {
                  setMsg("Selecciona un cliente de la lista de Panamá.");
                  return;
                }
                accion(
                  editando?.id != null
                    ? {
                        accion: "editar",
                        id: editando.id,
                        cliente_nombre: match.nombre,
                        meta_anual: editando.meta_anual,
                        odoo_partner_id: match.id,
                        activo: editando.activo ?? 1,
                      }
                    : {
                        accion: "crear",
                        cliente_nombre: match.nombre,
                        meta_anual: editando?.meta_anual,
                        odoo_partner_id: match.id,
                      },
                )
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold"
            >
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

