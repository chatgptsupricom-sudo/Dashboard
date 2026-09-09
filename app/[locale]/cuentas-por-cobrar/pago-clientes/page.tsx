"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  RefreshCw, Download, Search, AlertTriangle, DollarSign, Banknote, Receipt, ChevronLeft, ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";

type Tipo = "cobro" | "ajuste";

type Row = {
  id: number;
  fechaPago: string | null;
  fechaConfirmacion: string | null;
  numeroPago: string;
  referencia: string;
  cliente: string;
  rif: string;
  sede: string;
  banco: string;
  vendedor: string;
  tipo: Tipo;
  esAsistente: boolean;
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
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function PagoClientesPage() {
  // Rango por fecha de confirmación (registro en Odoo) — el principal.
  const [desdeConf, setDesdeConf] = useState(primerDiaMes());
  const [hastaConf, setHastaConf] = useState(hoy());
  // Rango por fecha de pago (fecha valor) — opcional, vacío por defecto.
  const [desdePago, setDesdePago] = useState("");
  const [hastaPago, setHastaPago] = useState("");
  const [empresa, setEmpresa] = useState("todas");
  const [estado, setEstado] = useState("posted");
  const [search, setSearch] = useState("");
  const [soloRevisar, setSoloRevisar] = useState(false);
  const [excluirAsistentes, setExcluirAsistentes] = useState(true);
  const [tab, setTab] = useState<Tipo>("cobro");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // La búsqueda y los filtros de tipo/asistente son locales: el fetch (pesado,
  // va a Odoo) solo se rehace al cambiar los rangos / sede / estado.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ empresa, estado });
      if (desdeConf && hastaConf) { params.set("desdeConf", desdeConf); params.set("hastaConf", hastaConf); }
      if (desdePago && hastaPago) { params.set("desdePago", desdePago); params.set("hastaPago", hastaPago); }
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/pagos-clientes?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo cargar");
      setRows(json.data.rows);
      setPage(1);
    } catch (e: any) {
      setError(e?.message || "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [desdeConf, hastaConf, desdePago, hastaPago, empresa, estado]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, soloRevisar, excluirAsistentes, tab]);

  const countCobros = useMemo(
    () => rows.filter((r) => r.tipo === "cobro" && (!excluirAsistentes || !r.esAsistente)).length,
    [rows, excluirAsistentes],
  );
  const countAjustes = useMemo(
    () => rows.filter((r) => r.tipo === "ajuste" && (!excluirAsistentes || !r.esAsistente)).length,
    [rows, excluirAsistentes],
  );

  // Rows del tab actual (sin búsqueda) — base del resumen.
  const enTab = useMemo(
    () => rows.filter((r) => r.tipo === tab && (!excluirAsistentes || !r.esAsistente)),
    [rows, tab, excluirAsistentes],
  );

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enTab.filter((r) => {
      if (soloRevisar && !r.revisar) return false;
      if (!q) return true;
      return [r.cliente, r.rif, r.numeroPago, r.referencia, r.vendedor, r.banco, r.descripcion, r.facturasAplicadas]
        .some((c) => (c || "").toLowerCase().includes(q));
    });
  }, [enTab, soloRevisar, search]);

  const resumen = useMemo(() => {
    const base = search.trim() ? visibles : enTab;
    return {
      pagos: base.length,
      totalUsd: r2(base.reduce((s, r) => s + r.montoUsd, 0)),
      totalBs: r2(base.reduce((s, r) => s + (r.montoBs || 0), 0)),
      porRevisar: enTab.filter((r) => r.revisar).length,
    };
  }, [enTab, visibles, search]);

  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pageRows = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportarExcel = () => {
    const data = visibles.map((r) => ({
      "Fecha de confirmación": fmtFecha(r.fechaConfirmacion),
      "Fecha de pago": fmtFecha(r.fechaPago),
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
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 34 }, { wch: 14 }, { wch: 10 },
      { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
      { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 45 },
      { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 9 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === "cobro" ? "Cobros" : "Retenciones y ajustes");
    const rango = (desdePago && hastaPago) ? `pago_${desdePago}_${hastaPago}` : `conf_${desdeConf}_${hastaConf}`;
    XLSX.writeFile(wb, `Pagos_Clientes_${tab}_${rango}.xlsx`);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Pago de Clientes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pagos recibidos de clientes desde Odoo: monto en bolívares y en dólares, tasa aplicada, banco,
          vendedor y descripción. Filtrable por fecha y exportable a Excel.
        </p>
      </div>

      {/* Tabs cobro / ajuste */}
      <div className="flex flex-wrap gap-2">
        {([
          ["cobro", "Cobros", countCobros],
          ["ajuste", "Retenciones y ajustes", countAjustes],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              tab === key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label} <span className={tab === key ? "text-slate-300" : "text-slate-400"}>({n.toLocaleString("es-VE")})</span>
          </button>
        ))}
      </div>

      {tab === "ajuste" && (
        <p className="text-xs text-slate-500 -mt-1 sm:-mt-2">
          Diarios que no son un cobro de dinero: IVA / ISLR / ITBMS / IGTF retenido por el cliente, descuentos y
          devoluciones locales, operaciones varias y facturas de cliente.
        </p>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto rounded-lg border border-slate-300 bg-slate-50/60 p-2">
          <div className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-2">
            Fecha de confirmación <span className="font-normal text-slate-400">(principal)</span>
            {(desdeConf || hastaConf) && (
              <button onClick={() => { setDesdeConf(""); setHastaConf(""); }} className="text-[10px] text-slate-400 hover:text-slate-600 underline">limpiar</button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <input type="date" value={desdeConf} onChange={(e) => setDesdeConf(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm" />
            <span className="hidden sm:inline text-slate-400 text-xs">a</span>
            <input type="date" value={hastaConf} onChange={(e) => setHastaConf(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="w-full sm:w-auto rounded-lg border border-slate-200 p-2">
          <div className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-2">
            Fecha de pago
            {(desdePago || hastaPago) && (
              <button onClick={() => { setDesdePago(""); setHastaPago(""); }} className="text-[10px] text-slate-400 hover:text-slate-600 underline">limpiar</button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <input type="date" value={desdePago} onChange={(e) => setDesdePago(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm" />
            <span className="hidden sm:inline text-slate-400 text-xs">a</span>
            <input type="date" value={hastaPago} onChange={(e) => setHastaPago(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex-1 sm:flex-none min-w-[120px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Sede</label>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}
            className="w-full sm:w-auto border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="todas">Todas</option>
            <option value="valencia">Valencia</option>
            <option value="caracas">Caracas</option>
            <option value="panama">Panamá</option>
          </select>
        </div>
        <div className="flex-1 sm:flex-none min-w-[140px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}
            className="w-full sm:w-auto border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="posted">Confirmados</option>
            <option value="todos">Todos (incl. borrador / anulados)</option>
          </select>
        </div>
        <div className="w-full lg:flex-1 lg:min-w-[200px]">
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
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={excluirAsistentes}
            onChange={(e) => setExcluirAsistentes(e.target.checked)} className="rounded border-slate-300" />
          Excluir asistentes de ventas
        </label>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={fetchData} disabled={loading}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
          <button onClick={exportarExcel} disabled={loading || visibles.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download size={14} /> <span className="whitespace-nowrap">Exportar a Excel</span>
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card icon={<Receipt size={16} className="text-slate-500" />} label={tab === "cobro" ? "Cobros" : "Ajustes"} value={resumen.pagos.toLocaleString("es-VE")} />
        <Card icon={<DollarSign size={16} className="text-emerald-600" />} label="Total USD" value={`$ ${fmtNum(resumen.totalUsd)}`} />
        <Card icon={<Banknote size={16} className="text-indigo-600" />} label="Total Bs" value={`Bs ${fmtNum(resumen.totalBs)}`} />
        <button
          type="button"
          onClick={() => setSoloRevisar((v) => !v)}
          className={`text-left rounded-xl border p-3 transition-colors ${
            soloRevisar ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <AlertTriangle size={16} className="text-amber-500" /> A revisar
          </div>
          <div className="text-lg font-bold text-slate-900 mt-0.5">{resumen.porRevisar.toLocaleString("es-VE")}</div>
          <div className="text-[10px] text-slate-400">{soloRevisar ? "mostrando solo estas — tocá para ver todas" : "tocá para filtrar"}</div>
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* Tabla (lg+) */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] uppercase tracking-wide text-slate-500 text-left">
                <th className="p-3">Fecha<span className="normal-case font-normal text-slate-400"> (confirm. / pago)</span></th>
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
                <tr><td colSpan={17} className="p-10 text-center text-slate-400">Sin registros en el rango seleccionado.</td></tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id} className={`border-b hover:bg-slate-50/60 ${r.revisar ? "bg-amber-50/40" : ""}`}>
                    <td className="p-3 whitespace-nowrap">
                      <div className="text-slate-800">{fmtFecha(r.fechaConfirmacion)}</div>
                      {r.fechaPago && r.fechaPago !== r.fechaConfirmacion && (
                        <div className="text-[10px] text-slate-400">pago: {fmtFecha(r.fechaPago)}</div>
                      )}
                    </td>
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
                    <td className="p-3 max-w-[160px] truncate text-slate-600" title={r.vendedor}>
                      {r.vendedor}
                      {r.esAsistente && <span className="ml-1 text-[9px] text-slate-400" title="Asistente de ventas">·asist</span>}
                    </td>
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
        {visibles.length > PAGE_SIZE && (
          <Paginacion page={page} totalPages={totalPages} total={visibles.length} setPage={setPage} />
        )}
      </div>

      {/* Tarjetas (< lg) */}
      <div className="lg:hidden space-y-2.5">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">Cargando…</div>
        ) : pageRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">Sin registros en el rango seleccionado.</div>
        ) : (
          <>
            {pageRows.map((r) => <PagoCard key={r.id} r={r} />)}
            {visibles.length > PAGE_SIZE && (
              <div className="bg-white rounded-xl border border-slate-200">
                <Paginacion page={page} totalPages={totalPages} total={visibles.length} setPage={setPage} />
              </div>
            )}
          </>
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
      <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums break-words">{value}</div>
    </div>
  );
}

function Paginacion({ page, totalPages, total, setPage }: {
  page: number; totalPages: number; total: number; setPage: (fn: (p: number) => number) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t text-sm text-slate-500">
      <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total.toLocaleString("es-VE")}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={16} /></button>
        <span className="px-2">{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

function PagoCard({ r }: { r: Row }) {
  return (
    <div className={`bg-white rounded-xl border p-3 ${r.revisar ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 flex-wrap">
            {r.numeroPago}
            {r.estado !== "posted" && (
              <span className="text-[10px] px-1 py-px rounded bg-slate-200 text-slate-600">{r.estado}</span>
            )}
            {r.revisar && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded bg-amber-100 text-amber-700">
                <AlertTriangle size={10} /> revisar
              </span>
            )}
          </div>
          <div className="text-sm text-slate-700 truncate mt-0.5" title={r.cliente}>{r.cliente}</div>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.moneda === "USD" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
          {r.moneda}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-right">
        <div>
          <div className="text-[10px] text-slate-400 text-left">Bs</div>
          <div className="tabular-nums text-slate-700 text-sm">{fmtNum(r.montoBs)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 text-left">USD</div>
          <div className="tabular-nums font-semibold text-slate-900 text-sm">{fmtNum(r.montoUsd)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 text-left">Tasa</div>
          <div className="tabular-nums text-slate-600 text-sm">
            {r.tasa == null ? "—" : fmtNum(r.tasa)}
            {r.tasaCustom && <span className="ml-0.5 text-[9px] text-amber-600">✎</span>}
          </div>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
        <div><span className="text-slate-400">Confirm.:</span> {fmtFecha(r.fechaConfirmacion)}</div>
        <div><span className="text-slate-400">Pago:</span> {fmtFecha(r.fechaPago)}</div>
        <div className="truncate"><span className="text-slate-400">Sede:</span> {r.sede}</div>
        <div className="truncate" title={r.banco}><span className="text-slate-400">Banco:</span> {r.banco}</div>
        <div className="truncate col-span-2" title={r.vendedor}>
          <span className="text-slate-400">Vendedor:</span> {r.vendedor || "—"}
          {r.esAsistente && <span className="ml-1 text-[9px] text-slate-400">·asist</span>}
        </div>
        {r.rif && <div className="truncate"><span className="text-slate-400">RIF:</span> {r.rif}</div>}
        {r.referencia && <div className="truncate"><span className="text-slate-400">Oper.:</span> {r.referencia}</div>}
        {r.igtf > 0 && <div><span className="text-slate-400">IGTF:</span> {fmtNum(r.igtf)}</div>}
        {r.facturasAplicadas && (
          <div className="truncate col-span-2" title={r.facturasAplicadas}><span className="text-slate-400">Facturas:</span> {r.facturasAplicadas}</div>
        )}
        {r.descripcion && (
          <div className="col-span-2 text-slate-500"><span className="text-slate-400">Desc.:</span> {r.descripcion}</div>
        )}
      </div>
    </div>
  );
}
