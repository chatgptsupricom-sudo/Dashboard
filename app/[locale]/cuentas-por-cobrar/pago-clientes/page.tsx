"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  RefreshCw, Download, Search, AlertTriangle, DollarSign, Banknote, Receipt, ChevronLeft, ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";

type Row = {
  id: number;
  fecha: string | null;
  fechaRegistro: string | null;
  numeroPago: string;
  referencia: string;
  cliente: string;
  rif: string;
  sede: string;
  banco: string;
  vendedor: string;
  moneda: "USD" | "Bs";
  montoOriginal: number;
  montoBs: number | null;
  montoUsd: number;
  tasa: number | null;
  tasaRegistrada: number | null;
  tasaCustom: boolean;
  igtf: number;
  montoTotal: number;
  descripcion: string;
  estado: string;
  conciliado: boolean;
  facturasAplicadas: string;
  facturasCount: number;
  revisar: boolean;
};

type Resumen = {
  pagos: number;
  totalUsd: number;
  totalBs: number;
  totalIgtf: number;
  porRevisar: number;
  porMoneda: { USD: number; Bs: number };
  porSede: { sede: string; pagos: number; totalUsd: number }[];
};

const PAGE_SIZE = 25;

const primerDiaMes = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
};
const hoy = () => new Date().toISOString().split("T")[0];

const fmtNum = (n: number | null, dec = 2) =>
  n == null ? "—" : n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtFecha = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
};

export default function PagoClientesPage() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [empresa, setEmpresa] = useState("todas");
  const [estado, setEstado] = useState("posted");
  const [search, setSearch] = useState("");
  const [soloRevisar, setSoloRevisar] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // La búsqueda es local: el fetch (pesado, va a Odoo) solo se rehace al
  // cambiar rango / sede / estado.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ desde, hasta, empresa, estado });
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/pagos-clientes?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo cargar");
      setRows(json.data.rows);
      setResumen(json.data.resumen);
      setPage(1);
    } catch (e: any) {
      setError(e?.message || "Error");
      setRows([]);
      setResumen(null);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, empresa, estado]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, soloRevisar]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (soloRevisar && !r.revisar) return false;
      if (!q) return true;
      return [r.cliente, r.rif, r.numeroPago, r.referencia, r.vendedor, r.banco, r.descripcion, r.facturasAplicadas]
        .some((c) => (c || "").toLowerCase().includes(q));
    });
  }, [rows, soloRevisar, search]);

  // Resumen recalculado sobre lo que se está viendo (respeta búsqueda / filtro).
  // "A revisar" siempre muestra el total del período — es el botón de ese filtro.
  const resumenView = useMemo(() => {
    if (!resumen) return null;
    if (!search.trim() && !soloRevisar) return resumen;
    return {
      ...resumen,
      pagos: visibles.length,
      totalUsd: Math.round(visibles.reduce((s, r) => s + r.montoUsd, 0) * 100) / 100,
      totalBs: Math.round(visibles.reduce((s, r) => s + (r.montoBs || 0), 0) * 100) / 100,
      porRevisar: rows.filter((r) => r.revisar).length,
    };
  }, [resumen, rows, visibles, search, soloRevisar]);
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pageRows = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportarExcel = () => {
    const data = visibles.map((r) => ({
      "Fecha": fmtFecha(r.fecha),
      "N° Pago": r.numeroPago,
      "N° Operación / Ref.": r.referencia,
      "Cliente": r.cliente,
      "RIF": r.rif,
      "Sede": r.sede,
      "Banco / Diario": r.banco,
      "Vendedor": r.vendedor,
      "Moneda": r.moneda,
      "Monto (moneda original)": r.montoOriginal,
      "Monto Bs": r.montoBs,
      "Monto USD": r.montoUsd,
      "Tasa (Bs/USD)": r.tasa,
      "Tasa registrada": r.tasaRegistrada,
      "Tasa personalizada": r.tasaCustom ? "Sí" : "No",
      "IGTF": r.igtf,
      "Monto total": r.montoTotal,
      "Descripción": r.descripcion,
      "Facturas aplicadas": r.facturasAplicadas,
      "Estado": r.estado,
      "Conciliado": r.conciliado ? "Sí" : "No",
      "Revisar": r.revisar ? "Sí" : "",
      "Fecha registro": fmtFecha(r.fechaRegistro),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 34 }, { wch: 14 }, { wch: 10 },
      { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
      { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 45 },
      { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pagos de Clientes");
    XLSX.writeFile(wb, `Pagos_Clientes_${desde}_a_${hasta}.xlsx`);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pago de Clientes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Todos los pagos recibidos de clientes desde Odoo: monto en bolívares y en dólares, tasa aplicada,
          banco, vendedor y descripción. Filtrable por fecha y exportable a Excel.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Sede</label>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="todas">Todas</option>
            <option value="valencia">Valencia</option>
            <option value="caracas">Caracas</option>
            <option value="panama">Panamá</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="posted">Confirmados</option>
            <option value="todos">Todos (incl. borrador / anulados)</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, RIF, N° pago, operación, vendedor, banco…"
              className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
        <button onClick={exportarExcel} disabled={loading || visibles.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          <Download size={14} /> Exportar a Excel
        </button>
      </div>

      {/* Resumen */}
      {resumenView && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={<Receipt size={16} className="text-slate-500" />} label="Pagos" value={resumenView.pagos.toLocaleString("es-VE")} />
          <Card icon={<DollarSign size={16} className="text-emerald-600" />} label="Total USD" value={`$ ${fmtNum(resumenView.totalUsd)}`} />
          <Card icon={<Banknote size={16} className="text-indigo-600" />} label="Total Bs" value={`Bs ${fmtNum(resumenView.totalBs)}`} />
          <button
            type="button"
            onClick={() => { setSoloRevisar((v) => !v); setPage(1); }}
            className={`text-left rounded-xl border p-3 transition-colors ${
              soloRevisar ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <AlertTriangle size={16} className="text-amber-500" /> A revisar
            </div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{resumenView.porRevisar.toLocaleString("es-VE")}</div>
            <div className="text-[10px] text-slate-400">{soloRevisar ? "mostrando solo estas — clic para ver todas" : "clic para filtrar"}</div>
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] uppercase tracking-wide text-slate-500 text-left">
                <th className="p-3">Fecha</th>
                <th className="p-3">N° Pago</th>
                <th className="p-3">N° Operación</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">RIF</th>
                <th className="p-3">Sede</th>
                <th className="p-3">Banco / Diario</th>
                <th className="p-3">Vendedor</th>
                <th className="p-3 text-center">Mon.</th>
                <th className="p-3 text-right">Monto original</th>
                <th className="p-3 text-right">Monto Bs</th>
                <th className="p-3 text-right">Monto USD</th>
                <th className="p-3 text-right">Tasa</th>
                <th className="p-3 text-right">IGTF</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Facturas</th>
                <th className="p-3 text-center">Concil.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={17} className="p-10 text-center text-slate-400">Cargando…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={17} className="p-10 text-center text-slate-400">Sin pagos en el rango seleccionado.</td></tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id} className={`border-b hover:bg-slate-50/60 ${r.revisar ? "bg-amber-50/40" : ""}`}>
                    <td className="p-3 whitespace-nowrap text-slate-700">{fmtFecha(r.fecha)}</td>
                    <td className="p-3 whitespace-nowrap font-medium text-slate-800">
                      {r.numeroPago}
                      {r.estado !== "posted" && (
                        <span className="ml-1.5 text-[10px] px-1 py-px rounded bg-slate-200 text-slate-600">{r.estado}</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-600">{r.referencia || "—"}</td>
                    <td className="p-3 max-w-[240px] truncate" title={r.cliente}>{r.cliente}</td>
                    <td className="p-3 whitespace-nowrap text-slate-600">{r.rif || "—"}</td>
                    <td className="p-3 whitespace-nowrap text-slate-600">{r.sede}</td>
                    <td className="p-3 max-w-[180px] truncate text-slate-600" title={r.banco}>{r.banco}</td>
                    <td className="p-3 max-w-[160px] truncate text-slate-600" title={r.vendedor}>{r.vendedor}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.moneda === "USD" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                        {r.moneda}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-700">{fmtNum(r.montoOriginal)}</td>
                    <td className="p-3 text-right tabular-nums text-slate-700">{fmtNum(r.montoBs)}</td>
                    <td className="p-3 text-right tabular-nums font-medium text-slate-900">{fmtNum(r.montoUsd)}</td>
                    <td className="p-3 text-right tabular-nums text-slate-600">
                      {r.tasa == null ? "—" : fmtNum(r.tasa)}
                      {r.tasaCustom && <span className="ml-1 text-[9px] text-amber-600" title="Tasa personalizada">✎</span>}
                      {r.revisar && <AlertTriangle size={12} className="inline ml-1 text-amber-500" />}
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-500">{r.igtf ? fmtNum(r.igtf) : "—"}</td>
                    <td className="p-3 max-w-[280px] truncate text-slate-500" title={r.descripcion}>{r.descripcion || "—"}</td>
                    <td className="p-3 max-w-[160px] truncate text-slate-500" title={r.facturasAplicadas}>{r.facturasAplicadas || "—"}</td>
                    <td className="p-3 text-center">{r.conciliado ? "✓" : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {visibles.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-slate-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibles.length)} de {visibles.length.toLocaleString("es-VE")}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="px-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        <AlertTriangle size={12} className="inline mr-1 text-amber-500" />
        Una fila marcada <em>a revisar</em> es un pago donde la tasa registrada en Odoo y la que se
        desprende de los montos no coinciden (&gt;5 %), o el equivalente en USD quedó en cero — conviene
        verificarla en Odoo.
      </p>
    </div>
  );
}

function Card({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon} {label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
