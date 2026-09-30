"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Calendar,
  RefreshCw,
  Wallet,
  CreditCard,
  Users,
  X,
  ArrowLeft,
  FileText,
  Package,
  Clock,
  DollarSign,
  Search,
  UserRound,
  Landmark,
  AlertTriangle,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useAuthStore } from "@/lib/stores/auth.store";

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const PIE_COLORS = ["#10b981", "#3b82f6"];
const BAR_COLOR = "#3b82f6";
const BAR_COLOR_ANTERIORES = "#f59e0b";
const BANCO_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f43f5e", "#84cc16"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

function Modal({ open, onClose, onBack, title, children, wide }: { open: boolean; onClose: () => void; onBack?: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  // Bloquea el scroll de la pagina de fondo mientras el modal esta activo
  // (mismo patron que components/superadmin/ComprasDetailModal.tsx).
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col tabular-nums ${wide ? "w-full max-w-4xl" : "w-full max-w-2xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100 transition" title="Volver">
                <ArrowLeft size={18} className="text-slate-500" />
              </button>
            )}
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition" title="Cerrar">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

type ClienteDetalle = { partnerId: number; partnerName: string; monto: number; facturas: number };
type Acumulado = { monto: number; pct: number; facturas: number; clientes: number; clientesDetalle: ClienteDetalle[] };
type Bucket = Acumulado & { dias: number; montoDelMes: number; montoAnteriores: number };
type Detalle = {
  factura: string; partnerId: number; cliente: string; fecha: string | null; plazo: number | null;
  monto: number; vendedor: string; delMes: boolean; journalId: number | null; banco: string;
};
type FilaAparte = { id: number; documento: string; referencia: string; cliente: string; fecha: string | null; vence?: string | null; diario?: string; monto: number };
type TipoAparte = "incobrables" | "sin_aplicar";
type Banco = Acumulado & { journalId: number; journalName: string };
type Parcial = { monto: number; pct: number; facturas: number };
type Vendedor = { id: number; name: string };
type TramoCuadre = { monto: number; facturas: number };
type Cuadre = { vencidasAlInicio: TramoCuadre; vencenEnPeriodo: TramoCuadre; adelantado: TramoCuadre; internos: TramoCuadre };
type ContadoCreditoData = {
  totalFacturado: number;
  contado: Acumulado;
  credito: Acumulado;
  delMes: Parcial;
  mesesAnteriores: Parcial;
  /** Solo en "cobrado": el total repartido en los tramos que usan los KPIs. */
  cuadre: Cuadre | null;
  /** Solo en "por_cobrar": corte y lo que queda fuera del reparto (sinAplicar solo si el corte es hoy). */
  porCobrar?: { corte: string; incobrables: number; relacionadas: number; sinAplicar: number | null } | null;
  buckets: Bucket[];
  /** Cada factura / abono detrás de las tarjetas (para los Excel). */
  detalle?: Detalle[];
  bancos: Banco[];
  vendedores: Vendedor[];
  bancosDisponibles: Vendedor[];
  updatedAt: string;
};
type FacturaCliente = { id: number; name: string; invoiceDate: string | null; moveType: string; amountTotal: number; paymentTermName: string };
type Modo = "facturado" | "cobrado" | "por_cobrar";
type Filtro = { tipo?: "contado" | "credito"; dias?: number; journalId?: number };

export default function ContadoCreditoPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ContadoCreditoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  // Facturado: lo emitido ese mes. Cobrado: dinero que efectivamente entro
  // el mes (fecha de CONFIRMACION del pago, no fecha de la factura) --
  // misma fuente que Integracion de Pagos, Efectividad y Recuperacion
  // (lib/cxc/cobros.ts), asi que los totales cuadran entre pantallas.
  const [modo, setModo] = useState<Modo>("facturado");
  const esCobrado = modo === "cobrado";
  // Por cobrar: saldo abierto al cierre del mes (= CxC inicial del mes
  // siguiente), repartido igual por plazo (lib/cxc/porCobrar.ts).
  const esPorCobrar = modo === "por_cobrar";

  // Toggle para incluir/excluir "Asistente de Ventas" (y demas vendedores
  // internos/de prueba). Cada modo recuerda su propio estado por separado
  // porque tienen defaults distintos: Facturado lo excluye por default
  // (para coincidir con "Ventas del Mes"), Cobrado no (coincide con el
  // numero real que usa cobranza).
  const [excluirAsistente, setExcluirAsistente] = useState<Record<Modo, boolean>>({ facturado: true, cobrado: false, por_cobrar: false });
  const excluirAsistenteActual = excluirAsistente[modo];
  // Solo en Cobrado: marcados (default) es la regla de lib/cxc/cobros.ts,
  // retenciones y pagos del 25% de IVA no cuentan como cobro.
  const [excluirRetenciones, setExcluirRetenciones] = useState(true);
  const [excluirIva25, setExcluirIva25] = useState(true);

  // Filtros adicionales, iguales a los que ya tiene "Integracion de Pagos"
  // en Odoo -- todos opcionales, sin tocar el default de lo que ya habia
  // (vacios = sin filtrar, mismo comportamiento de siempre).
  const [vendedorId, setVendedorId] = useState("");
  const [search, setSearch] = useState("");
  // La busqueda se debounce antes de disparar el fetch -- modo "cobrado"
  // es una consulta pesada (15-20s), no se puede relanzar por cada tecla.
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 500);
    return () => clearTimeout(t);
  }, [search]);
  const [bancoId, setBancoId] = useState("");
  // Rango de fechas personalizado, alternativa a Mes/Ano.
  const [usarRangoFechas, setUsarRangoFechas] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const userCids = (user as any)?.cids;

  // Modal 1: clientes de un grupo (contado / credito / bucket / banco).
  // filtro viaja hasta el modal de cobros para que "Cobros -- Cliente X" solo
  // muestre los abonos de ESA card, no todo el mes del cliente mezclado
  // (antes: entrar desde la card de "21 dias" mostraba tambien sus abonos
  // a 30 dias, porque el modal de cobros no sabia de que card venia).
  const [clientesModal, setClientesModal] = useState<{ open: boolean; titulo: string; clientes: ClienteDetalle[]; filtro: Filtro }>({ open: false, titulo: "", clientes: [], filtro: {} });

  // Modal 2: facturas del mes de un cliente
  const [facturasModal, setFacturasModal] = useState<{ open: boolean; partnerId: number; partnerName: string }>({ open: false, partnerId: 0, partnerName: "" });
  const [facturasData, setFacturasData] = useState<FacturaCliente[]>([]);
  const [facturasLoading, setFacturasLoading] = useState(false);

  // Modal 3: detalle de una factura
  const [invoiceModal, setInvoiceModal] = useState<{ open: boolean; invoiceId: number }>({ open: false, invoiceId: 0 });
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // "cobrado_dinero" es una consulta bastante mas pesada que las otras dos
  // (trae todas las conciliaciones sin filtro de dominio en Odoo) -- si el
  // usuario cambia de modo rapido, una respuesta vieja mas lenta podia
  // llegar despues y pisar los datos del modo que quedo seleccionado. Este
  // ref guarda cual fue el ultimo fetch disparado; solo ese puede escribir
  // en el estado.
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      if (usarRangoFechas && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else {
        params.set("month", String(selectedMonth));
        params.set("year", String(selectedYear));
      }
      params.set("modo", modo);
      params.set("excluirAsistente", String(excluirAsistenteActual));
      if (esCobrado) {
        params.set("excluirRetenciones", String(excluirRetenciones));
        params.set("excluirIva25", String(excluirIva25));
      }
      if (vendedorId) params.set("vendedorId", vendedorId);
      if (searchDebounced) params.set("search", searchDebounced);
      if (esCobrado && bancoId) params.set("bancoId", bancoId);
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/contado-credito?${params}`);
      const json = await res.json();
      if (fetchId !== fetchIdRef.current) return;
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Error:", e);
    }
    if (fetchId === fetchIdRef.current) setLoading(false);
  }, [empresa, userCids, selectedMonth, selectedYear, modo, excluirAsistenteActual, excluirRetenciones, excluirIva25, vendedorId, searchDebounced, bancoId, usarRangoFechas, startDate, endDate, esCobrado]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openClientes = (titulo: string, clientes: ClienteDetalle[], filtro: Filtro = {}) => {
    setBusquedaModal("");
    setClientesModal({ open: true, titulo, clientes, filtro });
  };
  // Buscador compartido por el modal de clientes y el de Pagos sin aplicar / Incobrables.
  const [busquedaModal, setBusquedaModal] = useState("");
  const qModal = busquedaModal.trim().toLowerCase();
  const clientesVisibles = clientesModal.clientes.filter((c) => !qModal || c.partnerName.toLowerCase().includes(qModal));

  const facturasFetchIdRef = useRef(0);

  const openFacturasCliente = useCallback(async (partnerId: number, partnerName: string, filtro: Filtro) => {
    const fetchId = ++facturasFetchIdRef.current;
    setClientesModal((prev) => ({ ...prev, open: false }));
    setFacturasModal({ open: true, partnerId, partnerName });
    setFacturasLoading(true);
    setFacturasData([]);
    try {
      const params = new URLSearchParams({ partnerId: String(partnerId) });
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      if (usarRangoFechas && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else {
        params.set("month", String(selectedMonth));
        params.set("year", String(selectedYear));
      }
      params.set("modo", modo);
      params.set("excluirAsistente", String(excluirAsistenteActual));
      if (esCobrado) {
        params.set("excluirRetenciones", String(excluirRetenciones));
        params.set("excluirIva25", String(excluirIva25));
      }
      if (vendedorId) params.set("vendedorId", vendedorId);
      if (esCobrado && bancoId) params.set("bancoId", bancoId);
      if (filtro.journalId !== undefined) params.set("journalId", String(filtro.journalId));
      else if (filtro.dias !== undefined) params.set("dias", String(filtro.dias));
      else if (filtro.tipo) params.set("tipo", filtro.tipo);
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/contado-credito/facturas-cliente?${params}`);
      const json = await res.json();
      if (fetchId !== facturasFetchIdRef.current) return;
      if (json.success) setFacturasData(json.data.facturas || []);
    } catch (e) {
      console.error(e);
    }
    if (fetchId === facturasFetchIdRef.current) setFacturasLoading(false);
  }, [empresa, userCids, selectedMonth, selectedYear, modo, excluirAsistenteActual, excluirRetenciones, excluirIva25, vendedorId, bancoId, usarRangoFechas, startDate, endDate, esCobrado]);

  // X: cierra toda la cadena de modales. Flecha: vuelve un nivel atras
  // (mismos datos ya cargados, sin volver a pedirlos).
  // Detalle de lo que "Por cobrar" deja fuera (Incobrables / Pagos sin aplicar).
  const [aparteModal, setAparteModal] = useState<{ open: boolean; tipo: TipoAparte; loading: boolean; filas: FilaAparte[] }>({ open: false, tipo: "incobrables", loading: false, filas: [] });
  const openAparte = async (tipo: TipoAparte) => {
    setBusquedaModal("");
    setAparteModal({ open: true, tipo, loading: true, filas: [] });
    try {
      const params = new URLSearchParams({ tipo });
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      if (usarRangoFechas && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else {
        params.set("month", String(selectedMonth));
        params.set("year", String(selectedYear));
      }
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/contado-credito/aparte?${params}`);
      const json = await res.json();
      setAparteModal({ open: true, tipo, loading: false, filas: json.success ? json.data.filas : [] });
    } catch (e) {
      console.error("Error:", e);
      setAparteModal({ open: true, tipo, loading: false, filas: [] });
    }
  };

  // ── Excel ──
  const periodoTxt = usarRangoFechas && startDate && endDate ? `${startDate}_a_${endDate}` : `${MONTHS[selectedMonth - 1]}_${selectedYear}`;
  const etiquetaModo = esPorCobrar ? "Por_cobrar" : esCobrado ? "Cobrado" : "Facturado";
  const colMonto = esPorCobrar ? "Saldo por cobrar (con IVA)" : esCobrado ? "Cobrado" : "Monto (sin IVA)";
  const colFecha = esCobrado ? "Fecha de abono" : "Fecha de emisión";
  const libro = (nombre: string, hojas: { nombre: string; filas: Record<string, unknown>[] }[]) => {
    const wb = XLSX.utils.book_new();
    for (const h of hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ "": "Sin registros" }]), h.nombre.slice(0, 31));
    XLSX.writeFile(wb, `${nombre.replace(/[^\w-]+/g, "_")}.xlsx`);
  };
  const exportarClientes = () => {
    const f = clientesModal.filtro;
    const filas = (data?.detalle || [])
      .filter((d) => f.journalId !== undefined ? d.journalId === f.journalId
        : f.dias !== undefined ? d.plazo === f.dias
        : f.tipo === "contado" ? d.plazo === null
        : f.tipo === "credito" ? d.plazo !== null
        : true)
      .sort((a, b) => a.cliente.localeCompare(b.cliente, "es") || (a.fecha || "").localeCompare(b.fecha || ""));
    libro(`${etiquetaModo}_${clientesModal.titulo}_${periodoTxt}`, [
      { nombre: "Clientes", filas: clientesVisibles.map((c) => ({ Cliente: c.partnerName, Facturas: c.facturas, [colMonto]: c.monto })) },
      {
        nombre: "Detalle",
        filas: filas.map((d) => ({
          Cliente: d.cliente,
          Factura: d.factura,
          [colFecha]: d.fecha || "",
          Plazo: d.plazo === null ? "Contado" : `${d.plazo} días`,
          ...(esCobrado ? { Banco: d.banco } : {}),
          ...(esPorCobrar ? { Origen: d.delMes ? "Facturada en el mes" : "Meses anteriores" } : {}),
          Vendedor: d.vendedor,
          [colMonto]: d.monto,
        })),
      },
    ]);
  };
  const exportarAparte = () => {
    const incob = aparteModal.tipo === "incobrables";
    libro(`${incob ? "Incobrables" : "Pagos_sin_aplicar"}_${periodoTxt}`, [{
      nombre: incob ? "Incobrables" : "Pagos sin aplicar",
      filas: filasAparte.map((f) => ({
        Documento: f.documento,
        Referencia: f.referencia,
        Cliente: f.cliente,
        Fecha: f.fecha || "",
        ...(incob ? { Vence: f.vence || "" } : { Diario: f.diario || "" }),
        [incob ? "Saldo" : "Sin aplicar"]: f.monto,
      })),
    }]);
  };

  const filasAparte = aparteModal.filas.filter((f) =>
    !qModal || [f.cliente, f.documento, f.referencia, f.diario || ""].some((v) => v.toLowerCase().includes(qModal)));

  const closeAllModals = () => {
    setAparteModal((prev) => ({ ...prev, open: false }));
    setClientesModal((prev) => ({ ...prev, open: false }));
    setFacturasModal({ open: false, partnerId: 0, partnerName: "" });
    setInvoiceModal({ open: false, invoiceId: 0 });
  };

  const backToClientes = () => {
    setFacturasModal((prev) => ({ ...prev, open: false }));
    setClientesModal((prev) => ({ ...prev, open: true }));
  };

  const openInvoiceDetail = useCallback(async (invoiceId: number) => {
    setFacturasModal((prev) => ({ ...prev, open: false }));
    setInvoiceModal({ open: true, invoiceId });
    setInvoiceLoading(true);
    setInvoiceDetail(null);
    try {
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/invoice/${invoiceId}`);
      const json = await res.json();
      if (json.success) setInvoiceDetail(json.data);
    } catch (e) {
      console.error(e);
    }
    setInvoiceLoading(false);
  }, []);

  const backToFacturas = () => {
    setInvoiceModal({ open: false, invoiceId: 0 });
    setFacturasModal((prev) => ({ ...prev, open: true }));
  };

  const bucketLabel = (b: Bucket) => `${b.dias} días`;

  const tituloTotal = esPorCobrar
    ? "Por cobrar al cierre del mes"
    : esCobrado ? "Total Cobrado del Mes" : "Total Facturado del Mes";
  const tituloFacturasModal = esCobrado ? "Cobros" : esPorCobrar ? "Facturas abiertas" : "Facturas";
  const etiquetaColFecha = esCobrado ? "Fecha de abono" : "Fecha";

  const pieData = data ? [
    { name: "Contado", value: data.contado.monto },
    { name: "Crédito", value: data.credito.monto },
  ] : [];

  const barData = data ? data.buckets.map((b) => ({
    label: `${b.dias}d`,
    fullLabel: bucketLabel(b),
    monto: b.monto,
    montoDelMes: b.montoDelMes,
    montoAnteriores: b.montoAnteriores,
  })) : [];

  const bancoPieData = data ? data.bancos.map((b) => ({ name: b.journalName, value: b.monto })) : [];

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto tabular-nums">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contado / Crédito</h1>
          <p className="text-sm text-slate-500 mt-1">
            Supricom — {usarRangoFechas && startDate && endDate ? `${startDate} a ${endDate}` : `${MONTHS[selectedMonth - 1]} ${selectedYear}`}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          )}
          {userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          )}
          {!usarRangoFechas ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Calendar size={14} className="text-slate-400" />
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
                {MONTHS.map((m, i) => {
                  const isFuture = selectedYear === now.getFullYear() && i > now.getMonth();
                  return <option key={i} value={i + 1} disabled={isFuture}>{m}</option>;
                })}
              </select>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700 ml-1">
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
              <button onClick={() => setUsarRangoFechas(true)} className="text-xs text-blue-600 hover:underline ml-1" title="Usar un rango de fechas especifico en vez de mes/año">
                Rango
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Calendar size={14} className="text-slate-400" />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700" />
              <span className="text-slate-300">–</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700" />
              <button onClick={() => setUsarRangoFechas(false)} className="text-xs text-blue-600 hover:underline ml-1" title="Volver a filtrar por mes/año">
                Mes/Año
              </button>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <UserRound size={14} className="text-slate-400" />
            <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700 max-w-[160px]">
              <option value="">Todos los vendedores</option>
              {(data?.vendedores || []).map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          {esCobrado && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Landmark size={14} className="text-slate-400" />
              <select value={bancoId} onChange={(e) => setBancoId(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700 max-w-[160px]">
                <option value="">Todos los bancos</option>
                {(data?.bancosDisponibles || []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente o factura..."
              className="text-sm bg-transparent border-none outline-none text-slate-700 w-32"
            />
          </div>
          <button onClick={fetchData} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1">
          <button
            onClick={() => setModo("facturado")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${modo === "facturado" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Facturado
          </button>
          <button
            onClick={() => setModo("cobrado")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${esCobrado ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Cobrado
          </button>
          <button
            onClick={() => setModo("por_cobrar")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${esPorCobrar ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            title="Saldo abierto al cierre del mes (CxC inicial del mes siguiente)"
          >
            Por cobrar
          </button>
        </div>
        <label className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={excluirAsistenteActual}
            onChange={(e) => setExcluirAsistente((prev) => ({ ...prev, [modo]: e.target.checked }))}
            className="accent-blue-600"
          />
          Excluir Asistente de Ventas
        </label>
        {esCobrado && (
          <>
            <label
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 cursor-pointer select-none"
              title="Diarios que no son banco/caja o dicen «retenido» (IVA/ISLR retenido, descuentos, devoluciones…)"
            >
              <input
                type="checkbox"
                checked={excluirRetenciones}
                onChange={(e) => setExcluirRetenciones(e.target.checked)}
                className="accent-blue-600"
              />
              Excluir retenciones
            </label>
            <label
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 cursor-pointer select-none"
              title="Pagos del 25% de IVA: somos agentes de retención, no es cobro"
            >
              <input
                type="checkbox"
                checked={excluirIva25}
                onChange={(e) => setExcluirIva25(e.target.checked)}
                className="accent-blue-600"
              />
              Excluir 25% de IVA
            </label>
          </>
        )}
      </div>

      {loading && data && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <RefreshCw size={14} className="animate-spin" />
          {esCobrado
            ? "Recalculando con los pagos del mes... esta vista puede tardar 15-20 segundos."
            : "Actualizando..."}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Cargando...</div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Sin datos para este período</div>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {/* Total facturado / cobrado */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{tituloTotal}</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{formatCurrency(data.totalFacturado)}</p>
            {esPorCobrar && data.porCobrar && (
              <p className="text-xs text-slate-500 mt-1">
                Saldo con IVA al {data.porCobrar.corte}{data.porCobrar.sinAplicar !== null ? " (hoy, el mes no ha cerrado)" : ""} — es la CxC con la que arranca el mes siguiente.
              </p>
            )}
            {esCobrado || esPorCobrar ? (
              <>
                <div className="mt-4 h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="h-full bg-blue-500" style={{ width: `${data.delMes.pct}%` }} title={`Facturas del mes: ${data.delMes.pct}%`} />
                  <div className="h-full bg-amber-500" style={{ width: `${data.mesesAnteriores.pct}%` }} title={`Meses anteriores: ${data.mesesAnteriores.pct}%`} />
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                    Facturas del mes: <span className="font-semibold text-slate-700">{formatCurrency(data.delMes.monto)}</span> ({data.delMes.pct}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    Meses anteriores: <span className="font-semibold text-slate-700">{formatCurrency(data.mesesAnteriores.monto)}</span> ({data.mesesAnteriores.pct}%)
                  </span>
                </div>
                {esPorCobrar && data.porCobrar && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">Fuera de este total, igual que en los KPIs del Dashboard</p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {[
                        { label: "Incobrables", hint: "Antes de 2025 o marcadas · click para ver", monto: data.porCobrar.incobrables, tipo: "incobrables" as TipoAparte },
                        // Solo en la sede donde tiene saldo (Panamá).
                        ...(Math.abs(data.porCobrar.relacionadas) > 0.005
                          ? [{ label: "SUPER TECHNO LLC", hint: "Empresa relacionada del grupo", monto: data.porCobrar.relacionadas, tipo: undefined }]
                          : []),
                        ...(data.porCobrar.sinAplicar !== null
                          ? [{ label: "Pagos sin aplicar", hint: "Entraron pero no están aplicados a una factura · click para ver", monto: data.porCobrar.sinAplicar, tipo: "sin_aplicar" as TipoAparte }]
                          : []),
                      ].map((x) => x.tipo ? (
                        <button key={x.label} onClick={() => openAparte(x.tipo!)} className="text-left rounded-xl bg-slate-50 p-3 min-w-0 hover:bg-slate-100 hover:shadow-sm transition cursor-pointer">
                          <p className="text-[11px] text-slate-500">{x.label}</p>
                          <p className="text-base font-semibold text-slate-800 tabular-nums break-words">{formatCurrency(x.monto)}</p>
                          <p className="text-[10px] text-slate-400">{x.hint}</p>
                        </button>
                      ) : (
                        <div key={x.label} className="rounded-xl bg-slate-50 p-3 min-w-0">
                          <p className="text-[11px] text-slate-500">{x.label}</p>
                          <p className="text-base font-semibold text-slate-800 tabular-nums break-words">{formatCurrency(x.monto)}</p>
                          <p className="text-[10px] text-slate-400">{x.hint}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.cuadre && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">
                      Cómo se reparte este total, según cuándo vencía cada factura — cuadra con los KPIs del Dashboard
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {[
                        { label: "Vencidas al inicio", hint: "= Recuperado (Recuperación)", t: data.cuadre.vencidasAlInicio },
                        { label: "Vencen en el período", hint: "= \"en el mes\" de Efectividad", t: data.cuadre.vencenEnPeriodo },
                        { label: "Vencen después", hint: "Cobro adelantado", t: data.cuadre.adelantado },
                        { label: "Internos (Supricom)", hint: "Fuera de los KPIs", t: data.cuadre.internos },
                      ].map((x) => (
                        <div key={x.label} className="rounded-xl bg-slate-50 p-3 min-w-0">
                          <p className="text-[11px] text-slate-500">{x.label}</p>
                          <p className="text-base font-semibold text-slate-800 tabular-nums break-words">{formatCurrency(x.t.monto)}</p>
                          <p className="text-[10px] text-slate-400">{x.hint} · {x.t.facturas} abonos</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${data.contado.pct}%` }} title={`Contado: ${data.contado.pct}%`} />
                <div className="h-full bg-blue-500" style={{ width: `${data.credito.pct}%` }} title={`Crédito: ${data.credito.pct}%`} />
              </div>
            )}
          </div>

          {/* Contado vs Credito + grafica de torta */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {esPorCobrar ? (
              // En "Por cobrar" el contado no es un plazo más: debió cobrarse al
              // facturar. Si queda saldo es una anomalía (pago sin aplicar o
              // venta sin cobrar), así que se muestra como aviso para depurar.
              <button
                onClick={() => openClientes(`Contado sin cobrar`, data.contado.clientesDetalle, { tipo: "contado" })}
                className="text-left bg-amber-50 border border-amber-300 rounded-2xl p-5 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle size={18} />
                  <p className="text-sm font-semibold">Contado sin cobrar</p>
                </div>
                <p className="text-3xl font-bold text-amber-800 mt-2">{formatCurrency(data.contado.monto)}</p>
                <p className="text-xs text-amber-900 mt-2">
                  Debió cobrarse al facturar. Revisar si el pago no está aplicado a la factura o si de verdad no se cobró.
                </p>
                <p className="text-xs text-amber-700 mt-2">{data.contado.facturas} facturas · {data.contado.clientes} clientes (click para ver)</p>
              </button>
            ) : (
            <button
              onClick={() => openClientes(`Clientes — Contado`, data.contado.clientesDetalle, { tipo: "contado" })}
              className="text-left bg-white border border-emerald-200 bg-emerald-50/30 rounded-2xl p-5 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-center gap-2 text-emerald-700">
                <Wallet size={18} />
                <p className="text-sm font-semibold">Contado</p>
              </div>
              <p className="text-3xl font-bold text-emerald-700 mt-2">{data.contado.pct}%</p>
              <p className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(data.contado.monto)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.contado.facturas} facturas · {data.contado.clientes} clientes (click para ver)</p>
            </button>
            )}
            <button
              onClick={() => openClientes(`Clientes — Crédito`, data.credito.clientesDetalle, { tipo: "credito" })}
              className="text-left bg-white border border-blue-200 bg-blue-50/30 rounded-2xl p-5 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-center gap-2 text-blue-700">
                <CreditCard size={18} />
                <p className="text-sm font-semibold">Crédito</p>
              </div>
              <p className="text-3xl font-bold text-blue-700 mt-2">{data.credito.pct}%</p>
              <p className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(data.credito.monto)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.credito.facturas} facturas · {data.credito.clientes} clientes (click para ver)</p>
            </button>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Buckets de credito */}
          {data.buckets.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <p className="text-sm font-semibold text-slate-700 mb-3">Distribución del crédito por plazo</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.buckets.map((b) => (
                    <button
                      key={String(b.dias)}
                      onClick={() => openClientes(`Clientes — ${bucketLabel(b)}`, b.clientesDetalle, { dias: b.dias })}
                      className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition cursor-pointer"
                    >
                      <p className="text-xs text-slate-500 uppercase tracking-wide">{bucketLabel(b)}</p>
                      <p className="text-xl font-bold text-slate-800 mt-1">{b.pct}%</p>
                      <p className="text-xs text-slate-600 mt-1">{formatCurrency(b.monto)}</p>
                      {esPorCobrar && (
                        <div className="mt-2 space-y-0.5 text-[11px]">
                          <p className="flex items-center gap-1.5 text-slate-600">
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                            Del mes: <span className="font-semibold">{formatCurrency(b.montoDelMes)}</span>
                          </p>
                          <p className="flex items-center gap-1.5 text-slate-600">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                            Anteriores: <span className="font-semibold">{formatCurrency(b.montoAnteriores)}</span>
                          </p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                        <Users size={12} />
                        {b.clientes} cliente{b.clientes !== 1 ? "s" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <p className="text-xs font-semibold text-slate-500 mb-1 px-2 pt-1">Monto por plazo</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""} />
                    {/* Lista y no Fragment: Recharts 2 no busca las <Bar> dentro de un Fragment y no las dibuja. */}
                    {esPorCobrar ? [
                      <Bar key="mes" dataKey="montoDelMes" name="Facturado del mes" stackId="pc" fill={BAR_COLOR} />,
                      <Bar key="ant" dataKey="montoAnteriores" name="Meses anteriores" stackId="pc" fill={BAR_COLOR_ANTERIORES} radius={[0, 4, 4, 0]} />,
                    ] : (
                      <Bar dataKey="monto" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Cobrado por banco -- solo tiene sentido en modo Cobrado, el
              "banco" es el diario del pago, y facturado no tiene pago. */}
          {esCobrado && data.bancos.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <p className="text-sm font-semibold text-slate-700 mb-3">Cobrado por banco</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.bancos.map((b, i) => (
                    <button
                      key={b.journalId}
                      onClick={() => openClientes(`Clientes — ${b.journalName}`, b.clientesDetalle, { journalId: b.journalId })}
                      className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: BANCO_COLORS[i % BANCO_COLORS.length] }} />
                        <p className="text-xs text-slate-500 uppercase tracking-wide truncate">{b.journalName}</p>
                      </div>
                      <p className="text-xl font-bold text-slate-800 mt-1">{b.pct}%</p>
                      <p className="text-xs text-slate-600 mt-1">{formatCurrency(b.monto)}</p>
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                        <Users size={12} />
                        {b.clientes} cliente{b.clientes !== 1 ? "s" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={bancoPieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {bancoPieData.map((_, i) => <Cell key={i} fill={BANCO_COLORS[i % BANCO_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detalle de Incobrables / Pagos sin aplicar ("Por cobrar") */}
      <Modal
        open={aparteModal.open}
        onClose={closeAllModals}
        title={aparteModal.tipo === "incobrables" ? "Incobrables — vencidas antes de 2025 o marcadas" : "Pagos sin aplicar"}
        wide
      >
        {!aparteModal.loading && aparteModal.filas.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busquedaModal}
                  onChange={(e) => setBusquedaModal(e.target.value)}
                  placeholder="Buscar cliente, documento o diario..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 w-64"
                />
              </div>
            <button onClick={exportarAparte} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition">
              <Download size={13} /> Excel
            </button>
          </div>
        )}
        {aparteModal.loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : aparteModal.filas.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Sin registros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {aparteModal.tipo === "incobrables" ? "Vence" : "Diario"}
                  </th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {aparteModal.tipo === "incobrables" ? "Saldo" : "Sin aplicar"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasAparte.map((f) => (
                  <tr key={f.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-slate-700">
                      {f.documento}
                      {f.referencia && <span className="block text-[10px] text-slate-400">{f.referencia}</span>}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-[220px] truncate">{f.cliente}</td>
                    <td className="py-2.5 px-4 text-slate-500">{formatDate(f.fecha)}</td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {aparteModal.tipo === "incobrables" ? formatDate(f.vence ?? null) : f.diario}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(f.monto)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={4} className="py-2.5 px-4 font-semibold text-slate-600">{filasAparte.length} registros</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-800">
                    {formatCurrency(filasAparte.reduce((s, f) => s + f.monto, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal 1: clientes del grupo */}
      <Modal open={clientesModal.open} onClose={closeAllModals} title={clientesModal.titulo}>
        {clientesModal.clientes.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busquedaModal}
                  onChange={(e) => setBusquedaModal(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 w-64"
                />
              </div>
            <button onClick={exportarClientes} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition">
              <Download size={13} /> Excel con el detalle
            </button>
          </div>
        )}
        {clientesModal.clientes.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Sin clientes</div>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Facturas</th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto</th>
                </tr>
              </thead>
              <tbody>
                {clientesVisibles.map((c) => (
                  <tr key={c.partnerId} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <button onClick={() => openFacturasCliente(c.partnerId, c.partnerName, clientesModal.filtro)} className="font-semibold text-blue-600 hover:underline text-left">
                        {c.partnerName}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{c.facturas}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal 2: facturas del cliente ese mes */}
      <Modal open={facturasModal.open} onClose={closeAllModals} onBack={backToClientes} title={`${tituloFacturasModal} — ${facturasModal.partnerName}`}>
        {facturasLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : facturasData.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Sin {tituloFacturasModal.toLowerCase()} este mes</div>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Factura</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{etiquetaColFecha}</th>
                  <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plazo</th>
                  <th className="text-right py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto</th>
                </tr>
              </thead>
              <tbody>
                {facturasData.map((f, idx) => (
                  // key con indice, no solo f.id: en modo "cobrado" el id es
                  // el de la factura, y una misma factura puede tener mas de
                  // un abono (fila) el mismo mes -- el id solo no es unico ahi.
                  <tr key={`${f.id}-${idx}`} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <button onClick={() => openInvoiceDetail(f.id)} className="font-semibold text-blue-600 hover:underline">
                        {f.name || `#${f.id}`}
                      </button>
                      {f.moveType === "out_refund" && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">NC</span>}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{formatDate(f.invoiceDate)}</td>
                    <td className="py-2.5 px-4 text-slate-500">{f.paymentTermName}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(f.amountTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal 3: detalle de factura */}
      <Modal open={invoiceModal.open} onClose={closeAllModals} onBack={backToFacturas} title={`Factura ${invoiceDetail?.name || ""}`} wide>
        {invoiceLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : !invoiceDetail ? (
          <div className="text-center py-8 text-slate-400">Error al cargar</div>
        ) : (
          <div className="space-y-5">
            {(() => {
              const isPaid = invoiceDetail.paymentState === "paid" || invoiceDetail.amountResidual <= 0;
              const isPartial = !isPaid && (invoiceDetail.paymentState === "partial" || (invoiceDetail.amountPaid > 0 && invoiceDetail.amountResidual > 0));
              return (
                <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${isPaid ? "bg-emerald-50 border-emerald-200" : isPartial ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isPaid ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-red-500"}`} />
                    <span className="text-sm font-bold text-slate-800">{isPaid ? "Factura Pagada" : isPartial ? "Pago Parcial" : "Pendiente de Pago"}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{invoiceDetail.moveType === "out_refund" ? "Nota de Crédito" : "Factura de Venta"}</span>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cliente</span>
                <p className="text-sm font-bold text-slate-800">{invoiceDetail.partnerName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sede</span>
                <p className="text-sm font-bold text-slate-800">{invoiceDetail.companyName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vendedor</span>
                <p className="text-sm font-medium text-slate-700">{invoiceDetail.invoiceUserName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Moneda</span>
                <p className="text-sm font-medium text-slate-700">{invoiceDetail.currencyName || "USD"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar size={14} className="text-blue-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Emisión</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(invoiceDetail.invoiceDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock size={14} className="text-amber-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Vencimiento</span>
                  <p className="text-xs font-bold text-slate-800">{formatDate(invoiceDetail.invoiceDateDue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-purple-600" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Diario</span>
                  <p className="text-xs font-medium text-slate-700">{invoiceDetail.journalName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <DollarSign size={14} className="text-slate-500" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Ref. Pago</span>
                  <p className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{invoiceDetail.paymentReference || "—"}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Subtotal", value: invoiceDetail.totals.subtotal, bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-100" },
                { label: "Impuesto", value: invoiceDetail.totals.tax, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100" },
                { label: "Total", value: invoiceDetail.totals.total, bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-100" },
                { label: "Pagado", value: invoiceDetail.totals.paid, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
                { label: "Pendiente", value: invoiceDetail.totals.residual, bg: "bg-red-50", text: "text-red-700", border: "border-red-100" },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl p-3 text-center`}>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{item.label}</span>
                  <span className={`text-sm font-bold ${item.text}`}>{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>

            {invoiceDetail.lines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={14} className="text-slate-400" />
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle de Productos</h4>
                  <span className="text-[10px] text-slate-400 font-medium ml-auto">{invoiceDetail.lines.length} ítems</span>
                </div>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">#</th>
                        <th className="text-left py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cant.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Precio Unit.</th>
                        <th className="text-right py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceDetail.lines.map((line: any, idx: number) => (
                        <tr key={line.id} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                          <td className="py-2.5 px-4 text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-slate-800 text-xs">{line.productName || line.name}</p>
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-700">{line.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{formatCurrency(line.priceUnit)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800">{formatCurrency(line.priceSubtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
