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
  MAX_PEDIDOS_GRUPO,
  METODOS_RETIRO,
  nombreImpuesto,
  type FilaMetodo,
  type MetodoRetiro as Metodo,
} from "@/lib/ventas/metodoRetiroTipos";
import {
  borradorDe,
  cuerpoConAutorizacion,
  errorBorrador,
  ICONO_METODO,
  MetodoRetiroCampos,
  type Borrador,
  type Opcion,
} from "@/components/ventas/MetodoRetiroCampos";
import { VerAutorizacion } from "@/components/ventas/AutorizacionTransporte";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Inbox,
  Link2,
  Loader2,
  Lock,
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
  /** Empresa del cliente (commercial_partner_id): agrupa sus pedidos. */
  cliente_id: number | null;
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

/** Los pedidos pendientes de un cliente. */
type Cliente = { clave: string; nombre: string; pedidos: Pedido[] };

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

const claveCliente = (p: Pedido) => (p.cliente_id ? `c${p.cliente_id}` : `n${p.cliente}`);

/** Los mismos datos de método (para saber si los elegidos ya van igual). */
const firmaMetodo = (m: FilaMetodo | null) => (m ? `${m.metodo}|${m.ruta_id ?? ""}|${m.agencia ?? ""}` : "");

/**
 * Sección "Método de retiro" (lib/ventas/metodoRetiro.ts): el vendedor indica
 * cómo recibe el cliente sus pedidos (retiro en sucursal, ruta, encomienda o
 * transporte externo, con la compañía, una descripción opcional y la foto de
 * la autorización del cliente).
 *
 * Va por cliente: se eligen varios de sus pedidos y se les pone el mismo
 * método de una vez. Muchas veces se factura por separado lo que sale en un
 * solo viaje; guardados juntos, la ruta gratis se decide con la suma.
 *
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

  // Por cliente: los pedidos elegidos y el formulario.
  const [seleccion, setSeleccion] = useState<Record<string, number[]>>({});
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardados, setGuardados] = useState<Record<string, boolean>>({});

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
        setSeleccion({});
        setBorradores({});
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

  const delVendedor = useMemo(
    () => pedidos.filter((p) => vendedor === "todos" || String(p.vendedor_uid) === vendedor),
    [pedidos, vendedor],
  );

  // Todos los filtros menos el de estado: sobre esto se cuentan las tarjetas.
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return delVendedor.filter((p) => {
      if (filtroMetodo !== "todos" && p.metodo?.metodo !== filtroMetodo) return false;
      if (facturacion === "facturados" && p.facturas.length === 0) return false;
      if (facturacion === "sin_facturar" && p.facturas.length > 0) return false;
      if (
        q &&
        ![p.pedido, p.cliente, ...p.ordenes.map((o) => o.nombre), ...p.facturas.map((f) => f.numero)].some((x) =>
          String(x || "").toLowerCase().includes(q),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [delVendedor, busqueda, filtroMetodo, facturacion]);

  const conteo = useMemo(() => {
    const c = { todos: base.length, pendientes: 0, con_metodo: 0, en_despacho: 0 };
    for (const p of base) c[estadoDe(p)]++;
    return c;
  }, [base]);

  // Los clientes con algún pedido que pasa los filtros. Adentro se ven todos
  // sus pedidos (del vendedor elegido), para poder juntarlos.
  const clientes = useMemo(() => {
    const pasan = new Set(base.filter((p) => estado === "todos" || estadoDe(p) === estado).map((p) => p.sale_id));
    const porClave = new Map<string, Cliente>();
    for (const p of delVendedor) {
      const clave = claveCliente(p);
      const c = porClave.get(clave) || { clave, nombre: p.cliente, pedidos: [] };
      c.pedidos.push(p);
      porClave.set(clave, c);
    }
    const f = (p: Pedido) => String(p.fecha || "");
    const lista = [...porClave.values()].filter(
      // Uno recién guardado sigue a la vista (con su "Guardado") aunque ya no
      // sea de la pestaña en que estaba.
      (c) => c.pedidos.some((p) => pasan.has(p.sale_id)) || guardados[c.clave],
    );
    for (const c of lista) {
      c.pedidos.sort((a, b) => Number(!!a.metodo) - Number(!!b.metodo) || f(a).localeCompare(f(b)));
    }
    const masViejo = (c: Cliente) => c.pedidos.map(f).sort()[0] || "";
    const masNuevo = (c: Cliente) => c.pedidos.map(f).sort().reverse()[0] || "";
    const suma = (c: Cliente) => c.pedidos.reduce((t, p) => t + p.total, 0);
    return lista.sort((a, b) =>
      orden === "monto"
        ? suma(b) - suma(a)
        : orden === "recientes"
          ? masNuevo(b).localeCompare(masNuevo(a))
          : masViejo(a).localeCompare(masViejo(b)),
    );
  }, [base, delVendedor, estado, orden, guardados]);

  const hayFiltros =
    busqueda.trim() !== "" || filtroMetodo !== "todos" || facturacion !== "todas" || vendedor !== "todos" || orden !== "antiguos";
  const limpiar = () => {
    setBusqueda("");
    setFiltroMetodo("todos");
    setFacturacion("todas");
    setVendedor("todos");
    setOrden("antiguos");
  };

  // Elegidos de entrada: los que todavía no tienen método.
  const elegidos = (c: Cliente): number[] =>
    seleccion[c.clave] ?? c.pedidos.filter((p) => !p.metodo && !p.en_despacho).map((p) => p.sale_id);

  // El formulario parte del método que ya tienen los elegidos, si es el mismo.
  const borrador = (c: Cliente): Borrador => {
    if (borradores[c.clave]) return borradores[c.clave];
    const ps = c.pedidos.filter((p) => elegidos(c).includes(p.sale_id));
    const comun = ps.length && ps.every((p) => firmaMetodo(p.metodo) === firmaMetodo(ps[0].metodo)) ? ps[0].metodo : null;
    return borradorDe(comun, agencias, ps[0]?.company_id ?? null);
  };

  const elegir = (c: Cliente, saleId: number, si: boolean) => {
    const actuales = elegidos(c);
    setSeleccion((prev) => ({
      ...prev,
      [c.clave]: si ? [...new Set([...actuales, saleId])] : actuales.filter((x) => x !== saleId),
    }));
    setGuardados((prev) => ({ ...prev, [c.clave]: false }));
  };
  const elegirTodos = (c: Cliente, si: boolean) => {
    setSeleccion((prev) => ({ ...prev, [c.clave]: si ? c.pedidos.filter((p) => !p.en_despacho).map((p) => p.sale_id) : [] }));
    setGuardados((prev) => ({ ...prev, [c.clave]: false }));
  };
  const cambiar = (c: Cliente, cambio: Partial<Borrador>) => {
    setBorradores((prev) => ({ ...prev, [c.clave]: { ...borrador(c), ...cambio } }));
    setGuardados((prev) => ({ ...prev, [c.clave]: false }));
  };
  const cancelar = (c: Cliente) => {
    setBorradores((prev) => {
      const n = { ...prev };
      delete n[c.clave];
      return n;
    });
    setSeleccion((prev) => ({ ...prev, [c.clave]: [] }));
    setErrores((prev) => ({ ...prev, [c.clave]: "" }));
  };

  const guardar = async (c: Cliente) => {
    const ids = elegidos(c);
    const b = borrador(c);
    const falta = ids.length === 0 ? "error_elegir" : errorBorrador(b);
    setErrores((prev) => ({ ...prev, [c.clave]: falta ? t(falta) : "" }));
    if (falta) return;
    setGuardando(c.clave);
    try {
      // Transporte externo: la foto nueva de la autorización se sube primero.
      const cuerpo = await cuerpoConAutorizacion(b, t("error_guardar"));
      const r = await fetch("/api/ventas/metodo-retiro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_ids: ids, ...cuerpo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || t("error_guardar"));
      const nuevos = new Map<number, FilaMetodo>(((j.metodos || [j.metodo]) as FilaMetodo[]).map((m) => [m.odoo_sale_id, m]));
      // Los que antes iban en el mismo grupo que estos cambian su suma: se
      // recarga en segundo plano para que la ruta gratis de todos quede al día.
      const tocaOtros = c.pedidos.some((p) => !nuevos.has(p.sale_id) && p.metodo?.grupo);
      setPedidos((prev) => prev.map((x) => (nuevos.has(x.sale_id) ? { ...x, metodo: nuevos.get(x.sale_id)! } : x)));
      cancelar(c);
      setGuardados((prev) => ({ ...prev, [c.clave]: true }));
      if (tocaOtros) void cargarSilencioso();
    } catch (e: any) {
      setErrores((prev) => ({ ...prev, [c.clave]: e?.message || t("error_guardar") }));
    } finally {
      setGuardando(null);
    }
  };

  const cargarSilencioso = async () => {
    try {
      const r = await fetch("/api/ventas/metodo-retiro");
      const j = await r.json();
      if (j.success) setPedidos(j.pedidos || []);
    } catch {
      // La próxima recarga lo pone al día.
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

      {/* Resumen: cada tarjeta filtra por estado (cuenta pedidos) */}
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
            <span>{t("mostrando_clientes", { n: Math.min(limite, clientes.length), total: clientes.length })}</span>
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
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : clientes.length === 0 ? (
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
        <div className="space-y-4">
          {clientes.slice(0, limite).map((c) => {
            const ids = elegidos(c);
            const elegidosP = c.pedidos.filter((p) => ids.includes(p.sale_id));
            const b = borrador(c);
            const sinMetodo = c.pedidos.filter((p) => !p.metodo && !p.en_despacho).length;
            const libres = c.pedidos.filter((p) => !p.en_despacho);
            const todosElegidos = libres.length > 0 && libres.every((p) => ids.includes(p.sale_id));
            const companyId = c.pedidos[0]?.company_id ?? null;
            const imp = nombreImpuesto(companyId);
            const rutasC = rutas.filter((r) => esDeLaSede(r.cids, companyId));
            const agenciasC = agencias.filter((a) => esDeLaSede(a.cids, companyId));
            const vendedoresC = [...new Set(c.pedidos.map((p) => p.vendedor).filter(Boolean))];
            const franja = sinMetodo ? "before:bg-amber-400" : c.pedidos.every((p) => p.en_despacho) ? "before:bg-sky-400" : "before:bg-violet-500";
            return (
              <section
                key={c.clave}
                className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 ${franja}`}
              >
                {/* Cliente */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 pl-4 sm:px-5 sm:pl-6 border-b border-slate-100">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 break-words">
                      <Building2 className="w-4 h-4 shrink-0 text-slate-400" />
                      {c.nombre}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{t("n_pedidos", { n: c.pedidos.length })}</span>
                      {sinMetodo > 0 && <span className="font-medium text-amber-700">{t("n_sin_metodo", { n: sinMetodo })}</span>}
                      {porVendedor && vendedoresC.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="w-3.5 h-3.5" />
                          {vendedoresC.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {libres.length > 1 && (
                    <button
                      type="button"
                      onClick={() => elegirTodos(c, !todosElegidos)}
                      className="self-start sm:self-auto text-xs font-medium text-violet-600 hover:text-violet-700"
                    >
                      {todosElegidos ? t("quitar_todos") : t("elegir_todos")}
                    </button>
                  )}
                </div>

                {/* Pedidos del cliente */}
                <ul className="divide-y divide-slate-100">
                  {c.pedidos.map((p) => {
                    const est = estadoDe(p);
                    const marcado = ids.includes(p.sale_id);
                    const Icono = p.metodo ? ICONO_METODO[p.metodo.metodo] : null;
                    return (
                      <li key={p.sale_id} className={`px-3 pl-4 sm:px-5 sm:pl-6 py-3 ${marcado ? "bg-violet-50/50" : ""}`}>
                        <label className={`flex items-start gap-3 ${p.en_despacho ? "cursor-not-allowed" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={p.en_despacho}
                            onChange={(e) => elegir(c, p.sale_id, e.target.checked)}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-violet-600"
                            aria-label={t("elegir_pedido", { pedido: p.pedido })}
                          />
                          <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-900">{p.pedido}</span>
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
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="w-3.5 h-3.5" />
                                  {fecha(p.fecha)}
                                </span>
                                {p.facturas.length > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" />
                                    {p.facturas.map((f) => f.numero).join(", ")}
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
                            <div className="sm:text-right whitespace-nowrap">
                              <p className="text-sm font-bold text-slate-900 tabular-nums">
                                {usd(p.total)} <span className="text-[11px] font-semibold text-slate-500">{p.moneda}</span>
                              </p>
                              <p className="text-[11px] text-slate-400 tabular-nums">{t("sin_iva", { monto: usd(p.base), imp })}</p>
                              {p.facturado !== null && (
                                <p className="text-[11px] font-semibold text-slate-600 tabular-nums">{t("facturado", { monto: usd(p.facturado), imp })}</p>
                              )}
                            </div>
                          </div>
                        </label>

                        {/* Método que ya tiene */}
                        {p.metodo && Icono && (
                          <div className="mt-2 ml-7 rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 space-y-1.5">
                            <div className="flex items-start gap-2">
                              <Icono className="w-4 h-4 mt-0.5 shrink-0 text-violet-600" />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-violet-900 break-words">{describirMetodo(p.metodo)}</p>
                                {!!p.metodo.grupo_pedidos?.length && (
                                  <p className="flex items-center gap-1 text-xs text-violet-800/90">
                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                    {t("junto_con", { pedidos: p.metodo.grupo_pedidos.join(", ") })}
                                    {p.metodo.monto_grupo != null && ` · ${t("suman", { monto: usd(Number(p.metodo.monto_grupo)), imp })}`}
                                  </p>
                                )}
                                {p.metodo.nota && <p className="text-xs text-violet-800/80 break-words">{p.metodo.nota}</p>}
                                {p.metodo.registrado_por && (
                                  <p className="text-[11px] text-slate-400">{t("indicado_por", { quien: p.metodo.registrado_por })}</p>
                                )}
                              </div>
                            </div>
                            {p.metodo.metodo === "transporte" && p.metodo.autorizacion_id && (
                              <VerAutorizacion id={p.metodo.autorizacion_id} />
                            )}
                            {p.metodo.alerta && (
                              <p className="flex items-start gap-1.5 text-xs text-rose-700">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                {p.metodo.alerta}
                              </p>
                            )}
                          </div>
                        )}
                        {p.en_despacho && (
                          <p className="mt-1.5 ml-7 flex items-center gap-1.5 text-xs text-slate-500">
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            {t("en_despacho")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {guardados[c.clave] && ids.length === 0 && (
                  <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 sm:px-6 py-2.5 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t("guardado")}
                  </p>
                )}

                {/* Método para los elegidos */}
                {ids.length > 0 && (
                  <div className="border-t border-violet-100 bg-slate-50/70 p-3 pl-4 sm:p-5 sm:pl-6 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {t("metodo_para", { n: ids.length })}{" "}
                      <span className="font-normal text-slate-500">{elegidosP.map((p) => p.pedido).join(", ")}</span>
                    </p>
                    {ids.length > 1 && <p className="text-xs text-slate-500">{t("juntos_ayuda")}</p>}
                    {ids.length > MAX_PEDIDOS_GRUPO && (
                      <p className="text-xs text-red-600">{t("demasiados", { n: MAX_PEDIDOS_GRUPO })}</p>
                    )}

                    <MetodoRetiroCampos valor={b} onChange={(cambio) => cambiar(c, cambio)} rutas={rutasC} agencias={agenciasC} />

                    {b.metodo === "ruta" && b.ruta_id && (() => {
                      const ruta = rutasC.find((r) => String(r.id) === b.ruta_id)?.nombre;
                      // El mismo monto que usa el servidor: la suma de lo
                      // facturado (o del pedido mientras se factura por partes).
                      const monto = Math.round(elegidosP.reduce((t, p) => t + p.monto_ruta, 0) * 100) / 100;
                      const otra = elegidosP.find((p) => !["USD", "PAB"].includes(String(p.moneda_ruta).toUpperCase()));
                      const ev = evaluarRutaGratis({
                        companyId,
                        rutaNombre: ruta,
                        monto,
                        moneda: otra ? otra.moneda_ruta : "USD",
                        estadoCliente: elegidosP.find((p) => p.estado_cliente)?.estado_cliente,
                      });
                      // gratis null (pedido en otra moneda, sin facturar): no hay
                      // veredicto, pero el aviso de por qué sí se muestra.
                      if (ev.minimo === null) return null;
                      const varios = elegidosP.length > 1;
                      return (
                        <div className="space-y-1.5">
                          {ev.gratis === 1 ? (
                            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                              {t(varios ? "ruta_gratis_varios" : "ruta_gratis", { base: usd(monto), minimo: usd(ev.minimo), imp, n: elegidosP.length })}
                            </p>
                          ) : ev.gratis === 0 ? (
                            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              {t(varios ? "ruta_flete_varios" : "ruta_flete", {
                                base: usd(monto),
                                minimo: usd(ev.minimo),
                                falta: usd(ev.minimo - monto),
                                imp,
                                n: elegidosP.length,
                              })}
                            </p>
                          ) : null}
                          {ev.alerta && (
                            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{ev.alerta}</p>
                          )}
                          {elegidosP.some((p) => p.facturado === null) && <p className="text-[11px] text-slate-400">{t("se_recalcula")}</p>}
                        </div>
                      );
                    })()}

                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                      {errores[c.clave] && <span className="text-xs text-red-600 sm:mr-auto">{errores[c.clave]}</span>}
                      <Button variant="ghost" size="sm" onClick={() => cancelar(c)} className="w-full sm:w-auto rounded-lg">
                        {t("cancelar")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => guardar(c)}
                        disabled={guardando === c.clave || !b.metodo || ids.length > MAX_PEDIDOS_GRUPO}
                        className="w-full sm:w-auto rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {guardando === c.clave && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t("guardar_n", { n: ids.length })}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {clientes.length > limite && (
            <Button
              variant="outline"
              onClick={() => setLimite((l) => l + POR_PAGINA)}
              className="w-full rounded-xl h-11 border-dashed"
            >
              {t("ver_mas_clientes", { n: clientes.length - limite })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
