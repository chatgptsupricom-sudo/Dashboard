"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  describirMetodo,
  esDeLaSede,
  evaluarRutaGratis,
  METODOS_RETIRO,
  nombreImpuesto,
  type FilaMetodo,
  type MetodoRetiro as Metodo,
} from "@/lib/ventas/metodoRetiroTipos";
import {
  borradorDe,
  cuerpoBorrador,
  errorBorrador,
  ICONO_METODO,
  MetodoRetiroCampos,
  type Borrador,
  type Opcion,
} from "@/components/ventas/MetodoRetiroCampos";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type Pedido = {
  sale_id: number;
  pedido: string;
  cliente: string;
  vendedor_uid: number | null;
  vendedor: string;
  fecha: string | null;
  total: number;
  /** Total sin IVA: decide si la ruta es gratis. */
  base: number;
  company_id: number | null;
  moneda: string;
  /** Facturado sin IVA (facturas menos notas de crédito); null = sin factura. */
  facturado: number | null;
  /** Con lo que se decide la ruta gratis (montoRutaGratis en el servidor). */
  monto_ruta: number;
  moneda_ruta: string;
  estado_cliente: string | null;
  ordenes: { id: number; nombre: string; estado: string }[];
  facturas: { numero: string; fecha: string | null }[];
  en_despacho: boolean;
  metodo: FilaMetodo | null;
};

type Estado = "todos" | "pendientes" | "con_metodo" | "en_despacho";
type Facturacion = "todas" | "facturados" | "sin_facturar";
type Orden = "antiguos" | "recientes" | "monto";

const POR_PAGINA = 20;
const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fecha(v: string | null) {
  if (!v) return "—";
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
}

function estadoDe(p: Pedido): Exclude<Estado, "todos"> {
  if (p.en_despacho) return "en_despacho";
  return p.metodo ? "con_metodo" : "pendientes";
}

/**
 * Sección "Método de retiro" (lib/ventas/metodoRetiro.ts): el vendedor indica
 * cómo recibe el cliente cada pedido (retiro en sucursal, ruta, encomienda o
 * transporte externo, con la compañía y una descripción opcional).
 * El Asistente de Ventas ve los de todos los vendedores y lo carga por ellos.
 * Almacén no registra el egreso de un pedido sin método.
 */
export function MetodoRetiro() {
  const t = useTranslations("metodoRetiro");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [rutas, setRutas] = useState<Opcion[]>([]);
  const [agencias, setAgencias] = useState<Opcion[]>([]);
  const [porVendedor, setPorVendedor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState("");

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<Estado>("pendientes");
  const [filtroMetodo, setFiltroMetodo] = useState<Metodo | "todos">("todos");
  const [facturacion, setFacturacion] = useState<Facturacion>("todas");
  const [vendedor, setVendedor] = useState("todos");
  const [orden, setOrden] = useState<Orden>("antiguos");
  const [limite, setLimite] = useState(POR_PAGINA);

  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [editando, setEditando] = useState<Record<number, boolean>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [guardados, setGuardados] = useState<Record<number, boolean>>({});

  const cargar = useCallback(
    async (inicial = false) => {
      if (!inicial) setRecargando(true);
      setError("");
      try {
        const r = await fetch("/api/ventas/metodo-retiro");
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        setPedidos(j.pedidos || []);
        setRutas(j.rutas || []);
        setAgencias(j.agencias || []);
        setPorVendedor(!!j.puedeElegirVendedor);
      } catch (e: any) {
        setError(e?.message || t("error_cargar"));
      } finally {
        setLoading(false);
        setRecargando(false);
      }
    },
    [t],
  );

  useEffect(() => {
    cargar(true);
  }, [cargar]);

  // Cada filtro nuevo vuelve a la primera página.
  useEffect(() => setLimite(POR_PAGINA), [busqueda, estado, filtroMetodo, facturacion, vendedor, orden]);

  const vendedores = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pedidos) if (p.vendedor_uid) m.set(p.vendedor_uid, p.vendedor);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pedidos]);

  // Todos los filtros menos el de estado: sobre esto se cuentan las tarjetas.
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (vendedor !== "todos" && String(p.vendedor_uid) !== vendedor) return false;
      if (filtroMetodo !== "todos" && p.metodo?.metodo !== filtroMetodo) return false;
      if (facturacion === "facturados" && p.facturas.length === 0) return false;
      if (facturacion === "sin_facturar" && p.facturas.length > 0) return false;
      if (q && ![p.pedido, p.cliente, ...p.ordenes.map((o) => o.nombre)].some((x) => x.toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [pedidos, busqueda, vendedor, filtroMetodo, facturacion]);

  const conteo = useMemo(() => {
    const c = { todos: base.length, pendientes: 0, con_metodo: 0, en_despacho: 0 };
    for (const p of base) c[estadoDe(p)]++;
    return c;
  }, [base]);

  const visibles = useMemo(() => {
    const lista = base.filter(
      // Uno recién guardado sigue a la vista (con su "Guardado") aunque ya no
      // sea de la pestaña de pendientes.
      (p) => estado === "todos" || estadoDe(p) === estado || (estado === "pendientes" && guardados[p.sale_id]),
    );
    const f = (p: Pedido) => String(p.fecha || "");
    return lista.sort((a, b) =>
      orden === "monto" ? b.total - a.total : orden === "recientes" ? f(b).localeCompare(f(a)) : f(a).localeCompare(f(b)),
    );
  }, [base, estado, orden, guardados]);

  const hayFiltros =
    busqueda.trim() !== "" || filtroMetodo !== "todos" || facturacion !== "todas" || vendedor !== "todos" || orden !== "antiguos";
  const limpiar = () => {
    setBusqueda("");
    setFiltroMetodo("todos");
    setFacturacion("todas");
    setVendedor("todos");
    setOrden("antiguos");
  };

  const borrador = (p: Pedido): Borrador => borradores[p.sale_id] || borradorDe(p.metodo, agencias, p.company_id);
  const cambiar = (p: Pedido, c: Partial<Borrador>) => {
    setBorradores((prev) => ({ ...prev, [p.sale_id]: { ...borrador(p), ...c } }));
    setGuardados((prev) => ({ ...prev, [p.sale_id]: false }));
  };
  const cancelar = (p: Pedido) => {
    setBorradores((prev) => {
      const n = { ...prev };
      delete n[p.sale_id];
      return n;
    });
    setEditando((prev) => ({ ...prev, [p.sale_id]: false }));
    setErrores((prev) => ({ ...prev, [p.sale_id]: "" }));
  };

  const guardar = async (p: Pedido) => {
    const b = borrador(p);
    const falta = errorBorrador(b);
    setErrores((prev) => ({ ...prev, [p.sale_id]: falta ? t(falta) : "" }));
    if (falta) return;
    setGuardando(p.sale_id);
    try {
      const r = await fetch("/api/ventas/metodo-retiro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: p.sale_id, ...cuerpoBorrador(b) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || t("error_guardar"));
      setPedidos((prev) => prev.map((x) => (x.sale_id === p.sale_id ? { ...x, metodo: j.metodo } : x)));
      cancelar(p);
      setGuardados((prev) => ({ ...prev, [p.sale_id]: true }));
    } catch (e: any) {
      setErrores((prev) => ({ ...prev, [p.sale_id]: e?.message || t("error_guardar") }));
    } finally {
      setGuardando(null);
    }
  };

  const tarjetas: { id: Estado; icono: any; color: string; activo: string }[] = [
    { id: "pendientes", icono: AlertTriangle, color: "text-amber-600 bg-amber-100", activo: "ring-amber-400 border-amber-300 bg-amber-50/60" },
    { id: "con_metodo", icono: CheckCircle2, color: "text-violet-600 bg-violet-100", activo: "ring-violet-400 border-violet-300 bg-violet-50/60" },
    { id: "en_despacho", icono: Lock, color: "text-sky-600 bg-sky-100", activo: "ring-sky-400 border-sky-300 bg-sky-50/60" },
    { id: "todos", icono: ClipboardList, color: "text-slate-600 bg-slate-100", activo: "ring-slate-400 border-slate-300 bg-slate-50" },
  ];

  return (
    <div className="px-3 py-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-500/20">
            <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{t("titulo")}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{t(porVendedor ? "desc_asistente" : "desc_vendedor")}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => cargar()}
          disabled={loading || recargando}
          className="shrink-0 rounded-lg"
          aria-label={t("recargar")}
        >
          <RefreshCw className={`w-4 h-4 ${recargando ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline ml-2">{t("recargar")}</span>
        </Button>
      </div>

      {/* Resumen: cada tarjeta filtra por estado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {tarjetas.map(({ id, icono: Icono, color, activo }) => (
          <button
            key={id}
            type="button"
            onClick={() => setEstado(id)}
            aria-pressed={estado === id}
            className={`text-left rounded-2xl border bg-white p-3 sm:p-4 shadow-sm transition-all hover:shadow-md ${
              estado === id ? `ring-2 ${activo}` : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`p-1.5 sm:p-2 rounded-lg ${color}`}>
                <Icono className="w-4 h-4" />
              </span>
              {loading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{conteo[id]}</span>
              )}
            </div>
            <p className="mt-2 text-xs sm:text-sm font-medium text-slate-600 leading-tight">{t(`kpi_${id}`)}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("buscar")}
            className="pl-10 pr-9 h-10 rounded-lg"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              aria-label={t("limpiar")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className={`grid grid-cols-2 gap-2 ${porVendedor ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <Select value={filtroMetodo} onValueChange={(v) => setFiltroMetodo(v as Metodo | "todos")}>
            <SelectTrigger className="w-full h-10 rounded-lg text-[13px] sm:text-sm" aria-label={t("filtro_metodo")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("todos_metodos")}</SelectItem>
              {METODOS_RETIRO.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`metodo_${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={facturacion} onValueChange={(v) => setFacturacion(v as Facturacion)}>
            <SelectTrigger className="w-full h-10 rounded-lg text-[13px] sm:text-sm" aria-label={t("filtro_factura")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("todas_facturas")}</SelectItem>
              <SelectItem value="facturados">{t("facturados")}</SelectItem>
              <SelectItem value="sin_facturar">{t("sin_facturar")}</SelectItem>
            </SelectContent>
          </Select>
          {porVendedor && (
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger className="w-full h-10 rounded-lg text-[13px] sm:text-sm" aria-label={t("vendedor")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">{t("todos_vendedores")}</SelectItem>
                {vendedores.map(([id, nombre]) => (
                  <SelectItem key={id} value={String(id)}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
            <SelectTrigger
              className={`w-full h-10 rounded-lg text-[13px] sm:text-sm ${porVendedor ? "" : "col-span-2 md:col-span-1"}`}
              aria-label={t("orden")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="antiguos">{t("orden_antiguos")}</SelectItem>
              <SelectItem value="recientes">{t("orden_recientes")}</SelectItem>
              <SelectItem value="monto">{t("orden_monto")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!loading && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>{t("mostrando", { n: Math.min(limite, visibles.length), total: visibles.length })}</span>
            {hayFiltros && (
              <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 font-medium text-violet-600 hover:text-violet-700">
                <X className="w-3.5 h-3.5" />
                {t("limpiar")}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-14 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 sm:py-16 px-4 text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            {estado === "pendientes" && !hayFiltros && pedidos.length ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : (
              <Inbox className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <p className="text-sm text-slate-600">
            {hayFiltros
              ? t("sin_resultados")
              : estado === "pendientes" && pedidos.length
                ? t("todo_listo")
                : pedidos.length
                  ? t("sin_resultados")
                  : t("sin_pedidos")}
          </p>
          {hayFiltros && (
            <Button variant="outline" size="sm" onClick={limpiar} className="mt-4 rounded-lg">
              {t("limpiar")}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.slice(0, limite).map((p) => {
            const b = borrador(p);
            const est = estadoDe(p);
            const abierto = !p.en_despacho && (!p.metodo || editando[p.sale_id] || !!borradores[p.sale_id]);
            // Rutas y agencias de la sede del pedido: Panamá tiene las suyas.
            const rutasP = rutas.filter((r) => esDeLaSede(r.cids, p.company_id));
            const agenciasP = agencias.filter((a) => esDeLaSede(a.cids, p.company_id));
            const imp = nombreImpuesto(p.company_id);
            const IconoActual = p.metodo ? ICONO_METODO[p.metodo.metodo] : null;
            const franja =
              est === "pendientes" ? "before:bg-amber-400" : est === "en_despacho" ? "before:bg-sky-400" : "before:bg-violet-500";
            return (
              <div
                key={p.sale_id}
                className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-1 ${franja}`}
              >
                <div className="p-3 pl-4 sm:p-5 sm:pl-6 space-y-4">
                  {/* Datos del pedido */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-base font-bold text-slate-900">{p.pedido}</span>
                        {est === "pendientes" && (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100">{t("sin_metodo")}</Badge>
                        )}
                        {est === "en_despacho" && (
                          <Badge className="bg-sky-100 text-sky-800 border border-sky-200 hover:bg-sky-100">
                            <Lock className="w-3 h-3 mr-1" />
                            {t("kpi_en_despacho")}
                          </Badge>
                        )}
                        {p.facturas.length === 0 && (
                          <Badge className="bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-100">{t("sin_facturar")}</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-700 break-words">{p.cliente}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {fecha(p.fecha)}
                        </span>
                        {porVendedor && p.vendedor && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="w-3.5 h-3.5" />
                            {p.vendedor}
                          </span>
                        )}
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {p.ordenes.map((o) => (
                            <span key={o.id} className="font-mono text-[11px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                              {o.nombre}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-end sm:items-end justify-between gap-x-3 rounded-xl bg-slate-50 sm:bg-transparent px-3 py-2 sm:p-0 sm:text-right whitespace-nowrap">
                      <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                        {usd(p.total)} <span className="text-xs font-semibold text-slate-500">{p.moneda}</span>
                      </p>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-400 tabular-nums">{t("sin_iva", { monto: usd(p.base), imp })}</p>
                        {p.facturado !== null && (
                          <p className="text-[11px] font-semibold text-slate-600 tabular-nums">{t("facturado", { monto: usd(p.facturado), imp })}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Método ya cargado: resumen */}
                  {p.metodo && !abierto && IconoActual && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="shrink-0 p-2 rounded-lg bg-white text-violet-600 shadow-sm">
                          <IconoActual className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-violet-900 break-words">{describirMetodo(p.metodo)}</p>
                          {p.metodo.nota && <p className="text-xs text-violet-800/80 break-words">{p.metodo.nota}</p>}
                          {guardados[p.sale_id] && (
                            <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 mt-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t("guardado")}
                            </p>
                          )}
                        </div>
                      </div>
                      {!p.en_despacho && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditando((prev) => ({ ...prev, [p.sale_id]: true }))}
                          className="w-full sm:w-auto rounded-lg bg-white"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1.5" />
                          {t("cambiar")}
                        </Button>
                      )}
                    </div>
                  )}

                  {p.en_despacho && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      {t("en_despacho")}
                    </p>
                  )}

                  {/* Formulario */}
                  {abierto && (
                    <div className="space-y-3">
                      <MetodoRetiroCampos valor={b} onChange={(c) => cambiar(p, c)} rutas={rutasP} agencias={agenciasP} />

                      {b.metodo === "ruta" && b.ruta_id && (() => {
                        const ruta = rutasP.find((r) => String(r.id) === b.ruta_id)?.nombre;
                        // El mismo monto que usa el servidor: lo facturado, o el
                        // pedido mientras se factura por partes.
                        const monto = p.monto_ruta;
                        const ev = evaluarRutaGratis({ companyId: p.company_id, rutaNombre: ruta, monto, moneda: p.moneda_ruta, estadoCliente: p.estado_cliente });
                        // gratis null (pedido en otra moneda, sin facturar): no hay
                        // veredicto, pero el aviso de por qué sí se muestra.
                        if (ev.minimo === null) return null;
                        return (
                          <div className="space-y-1.5">
                            {ev.gratis === 1 ? (
                              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                {t("ruta_gratis", { base: usd(monto), minimo: usd(ev.minimo), imp })}
                              </p>
                            ) : ev.gratis === 0 ? (
                              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                {t("ruta_flete", { base: usd(monto), minimo: usd(ev.minimo), falta: usd(ev.minimo - monto), imp })}
                              </p>
                            ) : null}
                            {ev.alerta && (
                              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{ev.alerta}</p>
                            )}
                            {p.facturado === null && <p className="text-[11px] text-slate-400">{t("se_recalcula")}</p>}
                          </div>
                        );
                      })()}

                      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                        {errores[p.sale_id] && (
                          <span className="text-xs text-red-600 sm:mr-auto sm:text-right">{errores[p.sale_id]}</span>
                        )}
                        {p.metodo && (
                          <Button variant="ghost" size="sm" onClick={() => cancelar(p)} className="w-full sm:w-auto rounded-lg">
                            {t("cancelar")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => guardar(p)}
                          disabled={guardando === p.sale_id || !b.metodo}
                          className="w-full sm:w-auto rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
                        >
                          {guardando === p.sale_id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          {t(p.metodo ? "actualizar" : "guardar")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {(p.metodo?.alerta || p.metodo?.registrado_por) && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 sm:px-6 py-2 space-y-1.5">
                    {p.metodo?.alerta && (
                      <p className="flex items-start gap-1.5 text-xs text-rose-700">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {p.metodo.alerta}
                      </p>
                    )}
                    {p.metodo?.registrado_por && (
                      <p className="text-[11px] text-slate-400">{t("indicado_por", { quien: p.metodo.registrado_por })}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {visibles.length > limite && (
            <Button
              variant="outline"
              onClick={() => setLimite((l) => l + POR_PAGINA)}
              className="w-full rounded-xl h-11 border-dashed"
            >
              {t("ver_mas", { n: visibles.length - limite })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
