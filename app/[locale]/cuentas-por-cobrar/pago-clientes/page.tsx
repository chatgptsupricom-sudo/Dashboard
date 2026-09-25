"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  RefreshCw, Download, Search, AlertTriangle, DollarSign, Banknote, Receipt, ChevronLeft, ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// La sede la impone el backend a partir del token; esto solo evita ofrecer en
// el selector una sede que devolveria 403.
const SEDES = [
  { value: "valencia", label: "Valencia", cids: 9 },
  { value: "caracas", label: "Caracas", cids: 10 },
  { value: "panama", label: "Panamá", cids: 7 },
];

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
  esRetencion: boolean;
  es25Iva: boolean;
  esAsistente: boolean;
  moneda: "USD" | "Bs";
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
  /** Parte del pago aplicada a facturas (lo que suma "Cobrado" en Contado/Crédito). */
  aplicadoFacturas: number;
  /** Parte de lo aplicado que fue a facturas de vendedores excluidos. */
  aplicadoExcluido: number;
  /** Parte aún sin aplicar (anticipo / saldo a favor). */
  sinAplicar: number;
  facturasAplicadas: string;
  facturasCount: number;
  revisar: boolean;
};

const PAGE_SIZE = 25;

const primerDiaMes = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
};
// Fecha local, no UTC: con toISOString, después de las 20:00 en Caracas el
// "hasta" por defecto saltaba al día siguiente.
const hoy = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

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
  const { user } = useAuthStore();
  const sedes = useMemo(() => {
    const propia = SEDES.filter((s) => s.cids === user?.cids);
    const esSuperadmin = String(user?.role || "").toLowerCase().trim() === "superadmin";
    return esSuperadmin || propia.length === 0 ? SEDES : propia;
  }, [user?.role, user?.cids]);
  const [empresa, setEmpresa] = useState("todas");
  const [estado, setEstado] = useState("posted");
  const [search, setSearch] = useState("");
  const [soloRevisar, setSoloRevisar] = useState(false);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [bancoFiltro, setBancoFiltro] = useState("");
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [excluirAsistentes, setExcluirAsistentes] = useState(true);
  const [excluirRetenciones, setExcluirRetenciones] = useState(true);
  const [excluirIva25, setExcluirIva25] = useState(true);
  const [tab, setTab] = useState<Tipo>("cobro");
  // Usuario de una sola sede: el selector queda fijo en la suya.
  useEffect(() => { if (sedes.length === 1) setEmpresa(sedes[0].value); }, [sedes]);

  const [rows, setRows] = useState<Row[]>([]);
  // Rango que el servidor aplicó de verdad: sin fechas cae al mes en curso, y
  // antes la pantalla no lo decía en ningún lado.
  const [rangoConf, setRangoConf] = useState<{ desde: string | null; hasta: string | null } | null>(null);
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
      setRangoConf(json.data.filtros?.confirmacion ?? null);
      setPage(1);
    } catch (e: any) {
      setError(e?.message || "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [desdeConf, hastaConf, desdePago, hastaPago, empresa, estado]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, soloRevisar, excluirAsistentes, excluirRetenciones, excluirIva25, tab, vendedorFiltro, bancoFiltro]);

  // Opciones de los selectores: todo lo que vino del servidor, para que la
  // lista no se vacíe a medida que se filtra.
  const vendedores = useMemo(() => [...new Set(rows.map((r) => r.vendedor).filter(Boolean))].sort(), [rows]);
  const bancos = useMemo(() => [...new Set(rows.map((r) => r.banco).filter(Boolean))].sort(), [rows]);
  const pasaFiltros = useCallback(
    (r: Row) => (!vendedorFiltro || r.vendedor === vendedorFiltro) && (!bancoFiltro || r.banco === bancoFiltro),
    [vendedorFiltro, bancoFiltro],
  );

  // Con los dos checks marcados (default) es la regla de Contado/Crédito
  // (lib/cxc/cobros.ts). Desmarcar uno pasa esos pagos de "Retenciones y
  // ajustes" a Cobros; un pago que es las dos cosas necesita ambos desmarcados.
  const tipoDe = useCallback(
    (r: Row): Tipo =>
      (r.esRetencion && excluirRetenciones) || (r.es25Iva && excluirIva25) ? "ajuste" : "cobro",
    [excluirRetenciones, excluirIva25],
  );

  // "Excluir asistentes" se aplica como en Contado/Crédito: por el vendedor de
  // la FACTURA a la que se aplicó el pago. Un pago aplicado en parte a
  // facturas de vendedores excluidos solo pierde esa parte. Lo que no está
  // aplicado a ninguna factura se juzga por el vendedor del pago.
  const conciliadoVisible = useCallback(
    (r: Row) => (r.aplicadoFacturas || 0) - (excluirAsistentes ? r.aplicadoExcluido || 0 : 0),
    [excluirAsistentes],
  );
  const sinConciliarVisible = useCallback(
    (r: Row) => (excluirAsistentes && r.esAsistente ? 0 : Math.max(0, r.montoUsd - (r.aplicadoFacturas || 0))),
    [excluirAsistentes],
  );
  const incluida = useCallback(
    (r: Row) => !excluirAsistentes || conciliadoVisible(r) > 0.005 || sinConciliarVisible(r) > 0.005 || (!r.esAsistente && (r.aplicadoFacturas || 0) === 0),
    [excluirAsistentes, conciliadoVisible, sinConciliarVisible],
  );

  const countCobros = useMemo(
    () => rows.filter((r) => tipoDe(r) === "cobro" && incluida(r) && pasaFiltros(r)).length,
    [rows, incluida, tipoDe, pasaFiltros],
  );
  const countAjustes = useMemo(
    () => rows.filter((r) => tipoDe(r) === "ajuste" && incluida(r) && pasaFiltros(r)).length,
    [rows, incluida, tipoDe, pasaFiltros],
  );

  // Rows del tab actual (sin búsqueda) — base del resumen.
  const enTab = useMemo(
    () => rows.filter((r) => tipoDe(r) === tab && incluida(r) && pasaFiltros(r)),
    [rows, tab, incluida, tipoDe, pasaFiltros],
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
    // Los totales cuentan solo lo CONCILIADO (aplicado a facturas), igual que
    // "Cobrado" en Contado/Crédito. Lo recibido que todavía no se aplicó va
    // aparte, en "Sin conciliar", para que las dos pantallas cuadren.
    const totalUsd = base.reduce((s, r) => s + conciliadoVisible(r), 0);
    const sinConciliar = base.reduce((s, r) => s + sinConciliarVisible(r), 0);
    const recibidoUsd = totalUsd + sinConciliar;
    // Bs conciliados: la parte del monto en Bs proporcional a lo aplicado
    // (misma tasa del pago con la que Odoo convirtió lo aplicado a USD).
    const totalBs = base.reduce((s, r) => {
      if (!r.montoBs || r.montoUsd <= 0) return s;
      return s + r.montoBs * Math.min(1, conciliadoVisible(r) / r.montoUsd);
    }, 0);
    return {
      pagos: base.length,
      totalUsd: r2(totalUsd),
      totalBs: r2(totalBs),
      recibidoUsd: r2(recibidoUsd),
      sinConciliar: r2(sinConciliar),
      porRevisar: enTab.filter((r) => r.revisar).length,
    };
  }, [enTab, visibles, search, conciliadoVisible, sinConciliarVisible]);

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
      // Pagos en Bs: su conversión va en "Equiv. USD", no en "Monto USD",
      // para que sumar "Monto USD" dé solo los dólares que entraron.
      "Monto Bs": r.montoBs,
      "Equiv. USD": r.moneda === "Bs" ? r.montoUsd : null,
      "Monto USD": r.moneda === "USD" ? r.montoUsd : null,
      "Tasa (Bs/USD)": r.tasa,
      "Tasa registrada": r.tasaRegistrada,
      "Tasa personalizada": r.tasaCustom ? "Sí" : "No",
      "IGTF": r.igtf,
      "Monto total": r.montoTotal,
      "Descripción": r.descripcion,
      "Facturas aplicadas": r.facturasAplicadas,
      "Estado": r.estado,
      "Conciliado": r.conciliado ? "Sí" : "No",
      "Conciliado USD": r2(conciliadoVisible(r)),
      "Sin conciliar USD": r2(sinConciliarVisible(r)),
      "Revisar": r.revisar ? "Sí" : "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 34 }, { wch: 14 }, { wch: 10 },
      { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
      { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 45 },
      { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 9 },
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
          <p className="mt-1 text-[10px] text-slate-500">
            {!rangoConf
              ? "Sin filtro de confirmación"
              : !rangoConf.desde
                ? `Hasta ${fmtFecha(rangoConf.hasta)}`
                : !rangoConf.hasta
                  ? `Desde ${fmtFecha(rangoConf.desde)}`
                  : `${fmtFecha(rangoConf.desde)} a ${fmtFecha(rangoConf.hasta)}`}
          </p>
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
            disabled={sedes.length === 1}
            className="w-full sm:w-auto border rounded-lg px-3 py-1.5 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500">
            {sedes.length > 1 && <option value="todas">Todas</option>}
            {sedes.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
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
        <div className="flex-1 sm:flex-none min-w-[140px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Vendedor</label>
          <select value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}
            className="w-full sm:w-auto sm:max-w-[200px] border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Todos</option>
            {vendedores.map((v) => (<option key={v} value={v}>{v}</option>))}
          </select>
        </div>
        <div className="flex-1 sm:flex-none min-w-[140px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Banco / Diario</label>
          <select value={bancoFiltro} onChange={(e) => setBancoFiltro(e.target.value)}
            className="w-full sm:w-auto sm:max-w-[200px] border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Todos</option>
            {bancos.map((b) => (<option key={b} value={b}>{b}</option>))}
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
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-1.5 cursor-pointer select-none"
          title="Diarios que no son banco/caja o dicen «retenido» (IVA/ISLR retenido, descuentos, devoluciones…)">
          <input type="checkbox" checked={excluirRetenciones}
            onChange={(e) => setExcluirRetenciones(e.target.checked)} className="rounded border-slate-300" />
          Excluir retenciones
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-1.5 cursor-pointer select-none"
          title="Pagos del 25% de IVA: somos agentes de retención, no es cobro">
          <input type="checkbox" checked={excluirIva25}
            onChange={(e) => setExcluirIva25(e.target.checked)} className="rounded border-slate-300" />
          Excluir 25% de IVA
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
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-2 sm:gap-3">
        <Card icon={<Receipt size={16} className="text-slate-500" />} label={tab === "cobro" ? "Cobros" : "Ajustes"} value={resumen.pagos.toLocaleString("es-VE")} />
        <Card icon={<DollarSign size={16} className="text-emerald-600" />} label="Total USD" value={`$ ${fmtNum(resumen.totalUsd)}`} hint="Cobrado del período, conciliado con facturas (= Cobrado de Contado/Crédito con los mismos checks)" />
        <Card icon={<Banknote size={16} className="text-indigo-600" />} label="Total Bs" value={`Bs ${fmtNum(resumen.totalBs)}`} hint="Conciliado con facturas" />
        <Card
          icon={<DollarSign size={16} className="text-slate-400" />}
          label="Sin conciliar"
          value={`$ ${fmtNum(resumen.sinConciliar)}`}
          hint={`Recibido $ ${fmtNum(resumen.recibidoUsd)}. Pagos aún no aplicados a facturas (anticipos o saldo a favor): no suman al total, igual que en Contado/Crédito.`}
        />
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
                <th className="p-3 text-right">Monto Bs</th>
                <th className="p-3 text-right">Equiv. USD</th>
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
                <tr><td colSpan={16} className="p-10 text-center text-slate-400">Cargando…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={16} className="p-10 text-center text-slate-400">Sin registros en el rango seleccionado.</td></tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id} onClick={() => setDetalleId(r.id)} className={`border-b cursor-pointer hover:bg-slate-50/60 ${r.revisar ? "bg-amber-50/40" : ""}`}>
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
                    <td className="p-3 text-right tabular-nums text-slate-700">{fmtNum(r.montoBs)}</td>
                    <td className="p-3 text-right tabular-nums text-slate-500">{fmtNum(r.moneda === "Bs" ? r.montoUsd : null)}</td>
                    <td className="p-3 text-right tabular-nums font-medium text-slate-900">{fmtNum(r.moneda === "USD" ? r.montoUsd : null)}</td>
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
            {pageRows.map((r) => <PagoCard key={r.id} r={r} onClick={() => setDetalleId(r.id)} />)}
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

      <DetallePago id={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}

type Detalle = {
  id: number; numeroPago: string; estado: string; tipoPago: string; cliente: string;
  importe: number; moneda: "USD" | "Bs"; monedaOdoo: string; tasaCustom: boolean;
  fechaPago: string | null; fechaConfirmacion: string | null; tasa: number | null;
  importeLocal: number; memo: string; diario: string; metodoPago: string; cuentaBancaria: string;
  descripcion: string; igtf: number; montoTotal: number; vendedor: string;
  adjuntos: { id: number; nombre: string; mimetype: string }[];
};

// Ficha del pago como la muestra Odoo, con el comprobante adjunto al lado.
function DetallePago({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjunto, setAdjunto] = useState(0);

  useEffect(() => {
    if (id == null) return;
    let vigente = true;
    setD(null); setError(null); setAdjunto(0);
    fetch(`/api/superadmin/cuentas-por-cobrar/pagos-clientes/detalle?id=${id}`)
      .then((r) => r.json())
      .then((j) => { if (vigente) j.success ? setD(j.data) : setError(j.error || "Error al cargar el pago"); })
      .catch(() => { if (vigente) setError("Error al cargar el pago"); });
    return () => { vigente = false; };
  }, [id]);

  const a = d?.adjuntos[adjunto];
  const urlAdjunto = a ? `/api/superadmin/cuentas-por-cobrar/pagos-clientes/detalle?id=${d!.id}&adjunto=${a.id}` : "";
  const campo = (label: string, valor: ReactNode) => (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 break-words">{valor || "—"}</span>
    </div>
  );

  return (
    <Dialog open={id != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {d?.numeroPago || "Pago"}
            {d && d.estado !== "posted" && (
              <span className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{d.estado}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !d ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <div className={`grid gap-6 ${d.adjuntos.length ? "lg:grid-cols-2" : ""}`}>
            <div>
              {campo("Tipo de pago", d.tipoPago)}
              {campo("Cliente", d.cliente)}
              {campo("Importe", `${d.moneda === "USD" ? "$" : "Bs"} ${fmtNum(d.importe)}`)}
              {campo("Tasa personalizada", d.tasaCustom ? "Sí" : "No")}
              {campo("Fecha", fmtFecha(d.fechaPago))}
              {campo("Fecha de registro (confirmación)", fmtFecha(d.fechaConfirmacion))}
              {d.moneda === "Bs" && campo("Tasa", fmtNum(d.tasa, 4))}
              {campo("Importe local", `$ ${fmtNum(d.importeLocal)}`)}
              {campo("Memo", d.memo)}
              {campo("Diario", d.diario)}
              {campo("Método de pago", d.metodoPago)}
              {campo("Cuenta bancaria", d.cuentaBancaria)}
              {campo("Vendedor", d.vendedor)}
              {d.igtf > 0 && campo("IGTF", fmtNum(d.igtf))}
              {campo("Descripción", d.descripcion)}
            </div>
            {d.adjuntos.length > 0 && a && (
              <div className="min-w-0">
                {d.adjuntos.length > 1 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {d.adjuntos.map((x, i) => (
                      <button key={x.id} onClick={() => setAdjunto(i)}
                        className={`text-xs px-2 py-1 rounded border truncate max-w-[180px] ${i === adjunto ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>
                        {x.nombre}
                      </button>
                    ))}
                  </div>
                )}
                {a.mimetype.startsWith("image/") ? (
                  <a href={urlAdjunto} target="_blank" rel="noreferrer">
                    <img src={urlAdjunto} alt={a.nombre} className="w-full rounded border border-slate-200" />
                  </a>
                ) : a.mimetype === "application/pdf" ? (
                  <iframe src={urlAdjunto} title={a.nombre} className="w-full h-[60vh] rounded border border-slate-200" />
                ) : (
                  <a href={urlAdjunto} className="text-sm text-blue-600 underline">Descargar {a.nombre}</a>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Card({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon} {label}</div>
      <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums break-words">{value}</div>
      {hint && <div className="text-[10px] leading-snug text-slate-400 mt-0.5">{hint}</div>}
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

function PagoCard({ r, onClick }: { r: Row; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`cursor-pointer bg-white rounded-xl border p-3 ${r.revisar ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
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
          <div className="text-[10px] text-slate-400 text-left">{r.moneda === "Bs" ? "Equiv. USD" : "USD"}</div>
          <div className={`tabular-nums text-sm ${r.moneda === "Bs" ? "text-slate-500" : "font-semibold text-slate-900"}`}>{fmtNum(r.montoUsd)}</div>
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
