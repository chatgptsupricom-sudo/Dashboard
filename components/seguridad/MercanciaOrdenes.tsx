"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  CarFront,
  Clock,
  FileText,
  type LucideIcon,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  Truck,
} from "lucide-react";
import { fechaCorta } from "@/lib/fecha";
import { PageHeader, EmptyState, Buscador, normalizar } from "./mercancia-ui";
import { describirMetodo, METODOS_RETIRO, type FilaMetodo, type MetodoRetiro } from "@/lib/ventas/metodoRetiroTipos";

/**
 * Ordenes de despacho (stock.picking) de Odoo, "Listas" o ya validadas desde
 * CORTE_VALIDADAS_ODOO, con la orden de venta facturada, que Almacen todavia
 * no proceso como egreso.
 * Vienen ordenadas por fecha de factura, la mas vieja primero: es el orden en
 * que le llegaron a Almacen (issue #298).
 *
 * Antes de esto, para registrar un egreso habia que saber de memoria el
 * numero exacto de la orden y escribirlo en el buscador. Esta pantalla
 * existe para navegar en vez de adivinar.
 *
 * Arriba, las cifras del dia (cuantas hay, cuantas esperan al vendedor,
 * cuantas llevan dias facturadas): cada una filtra la lista con un toque.
 *
 * Grid y no lista: esta pantalla puede traer decenas de ordenes, y se ve en
 * todo — telefono, tablet, monitor, hasta un televisor de sala. Una lista de
 * una sola columna se ve razonable en un telefono y ridicula (una tira
 * angosta en medio de una pantalla enorme) en una pantalla grande.
 */

type Orden = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  contraparte: string;
  estado: string;
  origen: string | null;
  fecha: string | null;
  facturas: { numero: string; fecha: string | null }[];
  /** Método de retiro que cargó el vendedor; sin él no se registra el egreso. */
  metodo_retiro?: FilaMetodo | null;
};

/** "todas", un método de retiro, o "sin_metodo" (el vendedor todavía no lo cargó). */
const FILTROS = ["todas", ...METODOS_RETIRO, "sin_metodo"] as const;
type Filtro = (typeof FILTROS)[number];

/** Filtros rápidos de las cifras de arriba, además del método. */
type Rapido = "alerta" | "demoradas" | null;

// Días facturada sin despachar a partir de los cuales una orden se marca.
const DIAS_AVISO = 3;
const DIAS_DEMORADA = 7;

const ANCHO = "max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8";
const GRILLA = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3";

const ICONO_METODO: Record<MetodoRetiro, LucideIcon> = {
  sucursal: Store,
  ruta: Truck,
  encomienda: Package,
  transporte: CarFront,
};

/** Todo lo que se ve en la tarjeta, más el pedido de origen. */
function textoBuscable(o: Orden): string {
  return normalizar(
    [
      o.odoo_picking_name,
      o.contraparte,
      o.origen,
      ...o.facturas.map((f) => f.numero),
      o.metodo_retiro ? describirMetodo(o.metodo_retiro) : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Días desde la factura, contados en la fecha de Caracas (donde están los
 * almacenes). Se toma el trozo de fecha del ISO, como `fechaCorta`.
 */
function diasDesde(fecha: string | null | undefined, ahora: number): number | null {
  const iso = String(fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const caracas = new Date(ahora - 4 * 60 * 60 * 1000);
  const hoy = Date.UTC(caracas.getUTCFullYear(), caracas.getUTCMonth(), caracas.getUTCDate());
  const dias = Math.round((hoy - Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))) / 86_400_000);
  return dias >= 0 ? dias : null;
}

export default function MercanciaOrdenes() {
  const to = useTranslations("seguridad.mercancia.ordenes");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [sinFacturar, setSinFacturar] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [rapido, setRapido] = useState<Rapido>(null);
  // Llegan de la más vieja a la más nueva; se puede invertir.
  const [recientesPrimero, setRecientesPrimero] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/seguridad/mercancia/pendientes");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "fetch failed");
      setOrdenes(json.ordenes || []);
      setSinFacturar(Number(json.sin_facturar) || 0);
      setAhora(Date.now());
    } catch (e: any) {
      // El backend ya trae la causa concreta ([odoo]/[mysql] + el mensaje
      // real) — mostrarla en vez de un generico ayuda a diagnosticar sin
      // acceso a los logs del servidor.
      setError(e?.message || to("error"));
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, [to]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const dias = useCallback((o: Orden) => diasDesde(o.facturas[0]?.fecha, ahora), [ahora]);

  // Las cifras de arriba, sobre todas las órdenes (no cambian al filtrar).
  const cifras = useMemo(
    () => ({
      sinMetodo: ordenes.filter((o) => !o.metodo_retiro).length,
      alerta: ordenes.filter((o) => o.metodo_retiro?.alerta).length,
      demoradas: ordenes.filter((o) => (dias(o) ?? 0) >= DIAS_DEMORADA).length,
    }),
    [ordenes, dias],
  );

  // Los chips cuentan sobre lo que deja la búsqueda, y solo se muestran los
  // métodos que tienen alguna orden.
  const { visibles, chips } = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    const deRapido = (o: Orden) =>
      rapido === "alerta" ? !!o.metodo_retiro?.alerta : rapido === "demoradas" ? (dias(o) ?? 0) >= DIAS_DEMORADA : true;
    const base = ordenes.filter((o) => {
      if (!deRapido(o)) return false;
      if (palabras.length === 0) return true;
      const texto = textoBuscable(o);
      return palabras.every((p) => texto.includes(p));
    });
    const deFiltro = (o: Orden, f: Filtro) =>
      f === "todas" || (f === "sin_metodo" ? !o.metodo_retiro : o.metodo_retiro?.metodo === f);
    const lista = base.filter((o) => deFiltro(o, filtro));
    return {
      visibles: recientesPrimero ? [...lista].reverse() : lista,
      chips: FILTROS.map((id) => ({ id, n: base.filter((o) => deFiltro(o, id)).length })).filter(
        (c) => c.id === "todas" || c.id === filtro || ordenes.some((o) => deFiltro(o, c.id)),
      ),
    };
  }, [ordenes, busqueda, filtro, rapido, recientesPrimero, dias]);

  const filtrando = visibles.length !== ordenes.length;
  const quitarFiltros = () => {
    setBusqueda("");
    setFiltro("todas");
    setRapido(null);
  };

  const tarjetas: Array<{
    id: string;
    icon: LucideIcon;
    valor: number;
    etiqueta: string;
    tono: string;
    activa: boolean;
    onClick?: () => void;
  }> = [
    {
      id: "total",
      icon: FileText,
      valor: ordenes.length,
      etiqueta: to("cifra_total"),
      tono: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]",
      activa: !filtrando,
      onClick: quitarFiltros,
    },
    {
      id: "sin_metodo",
      icon: AlertTriangle,
      valor: cifras.sinMetodo,
      etiqueta: to("cifra_sin_metodo"),
      tono: "bg-amber-50 text-amber-600",
      activa: filtro === "sin_metodo" && rapido === null,
      onClick: () => {
        setRapido(null);
        setFiltro(filtro === "sin_metodo" ? "todas" : "sin_metodo");
      },
    },
    {
      id: "demoradas",
      icon: Clock,
      valor: cifras.demoradas,
      etiqueta: to("cifra_demoradas", { dias: DIAS_DEMORADA }),
      tono: "bg-red-50 text-red-600",
      activa: rapido === "demoradas",
      onClick: () => {
        setFiltro("todas");
        setRapido(rapido === "demoradas" ? null : "demoradas");
      },
    },
    ...(cifras.alerta > 0
      ? [
          {
            id: "alerta",
            icon: AlertTriangle,
            valor: cifras.alerta,
            etiqueta: to("cifra_alerta"),
            tono: "bg-rose-50 text-rose-600",
            activa: rapido === "alerta",
            onClick: () => {
              setFiltro("todas");
              setRapido(rapido === "alerta" ? null : "alerta");
            },
          },
        ]
      : []),
    // Las listas sin facturar no se arman, pero Almacen tiene que saber que
    // existen: si no, "no la veo" parece un error del panel.
    {
      id: "sin_facturar",
      icon: ReceiptText,
      valor: sinFacturar,
      etiqueta: to("cifra_sin_facturar"),
      tono: "bg-slate-100 text-slate-500",
      activa: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={FileText}
        titulo={to("titulo")}
        subtitulo={to("subtitulo")}
        ancho={ANCHO}
        accion={
          <button
            type="button"
            onClick={() => {
              setActualizando(true);
              void cargar();
            }}
            disabled={cargando || actualizando}
            title={to("actualizar")}
            aria-label={to("actualizar")}
            className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${actualizando ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{to("actualizar")}</span>
          </button>
        }
      />

      <main className={`${ANCHO} py-6 sm:py-8`}>
        {cargando ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[76px] rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
              ))}
            </div>
            <div className={GRILLA}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-36 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
              ))}
            </div>
          </>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        ) : (
          <>
            {/* Cifras: cada una filtra la lista. */}
            <div
              className={`grid grid-cols-2 gap-3 mb-5 ${tarjetas.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
            >
              {tarjetas.map((c) => {
                const Etiqueta = c.onClick ? "button" : "div";
                return (
                  <Etiqueta
                    key={c.id}
                    {...(c.onClick ? { type: "button" as const, onClick: c.onClick, "aria-pressed": c.activa } : {})}
                    title={c.id === "sin_facturar" && sinFacturar > 0 ? to("sin_facturar", { n: sinFacturar }) : undefined}
                    className={`flex items-center gap-3 rounded-2xl border bg-white p-3.5 text-left transition-all last:odd:col-span-2 lg:last:odd:col-span-1 ${
                      c.onClick ? "hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)] cursor-pointer" : ""
                    } ${
                      c.activa && c.id !== "total"
                        ? "border-[color:var(--portal-primary,#741DFE)] ring-2 ring-violet-100"
                        : "border-slate-200/80"
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.tono}`}>
                      <c.icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xl font-semibold tabular-nums leading-tight text-slate-900">{c.valor}</span>
                      <span className="block text-[11px] font-medium text-slate-500 truncate">{c.etiqueta}</span>
                    </span>
                  </Etiqueta>
                );
              })}
            </div>

            {sinFacturar > 0 && (
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                <ReceiptText className="w-4 h-4 shrink-0" />
                {to("sin_facturar", { n: sinFacturar })}
              </p>
            )}

            {ordenes.length === 0 ? (
              <EmptyState icon={FileText} texto={to("vacio")} />
            ) : (
              <>
                <div className="mb-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Buscador
                      valor={busqueda}
                      onChange={setBusqueda}
                      placeholder={to("buscar")}
                      limpiar={to("limpiar")}
                      className="sm:w-96"
                    />
                    <button
                      type="button"
                      onClick={() => setRecientesPrimero((v) => !v)}
                      className="inline-flex items-center justify-center gap-2 h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors sm:ml-auto"
                    >
                      <ArrowDownUp className="w-4 h-4 text-slate-400" />
                      {to(recientesPrimero ? "orden_recientes" : "orden_antiguas")}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist">
                    {chips.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={filtro === c.id}
                        onClick={() => setFiltro(c.id)}
                        className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors ${
                          filtro === c.id
                            ? "bg-[color:var(--portal-primary,#741DFE)] text-white"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {to(`filtro_${c.id}`)}
                        <span className={`tabular-nums ${filtro === c.id ? "text-white/80" : "text-slate-400"}`}>{c.n}</span>
                      </button>
                    ))}
                  </div>
                  {filtrando && (
                    <p className="text-xs text-slate-500">
                      {to("mostrando", { n: visibles.length, total: ordenes.length })}
                      {" · "}
                      <button
                        type="button"
                        onClick={quitarFiltros}
                        className="font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75"
                      >
                        {to("quitar_filtros")}
                      </button>
                    </p>
                  )}
                </div>

                {visibles.length === 0 ? (
                  <EmptyState icon={Search} texto={to("sin_resultados")} />
                ) : (
                  <div className={GRILLA}>
                    {visibles.map((o) => {
                      const d = dias(o);
                      const Icono = o.metodo_retiro ? ICONO_METODO[o.metodo_retiro.metodo] || FileText : FileText;
                      return (
                        <Link
                          key={o.odoo_picking_id}
                          // Con el id: el nombre se repite entre compañias (ver lib/seguridad/mercancia).
                          href={`/${locale}/seguridad/mercancia/ordenes/${encodeURIComponent(o.odoo_picking_name)}?id=${o.odoo_picking_id}`}
                          className="group relative flex flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:shadow-[0_6px_18px_rgba(116,29,254,0.12)] hover:-translate-y-0.5 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                o.metodo_retiro
                                  ? "bg-violet-50 text-[color:var(--portal-primary,#741DFE)] group-hover:bg-[color:var(--portal-primary,#741DFE)] group-hover:text-white"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              <Icono className="w-[18px] h-[18px]" />
                            </span>
                            {d !== null && (
                              <span
                                title={to("dias_titulo")}
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                                  d >= DIAS_DEMORADA
                                    ? "bg-red-50 text-red-700"
                                    : d >= DIAS_AVISO
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {to("dias", { n: d })}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{o.odoo_picking_name}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5" title={o.contraparte || undefined}>
                              {o.contraparte || "—"}
                            </p>
                            {o.facturas[0] && (
                              <p className="text-[11px] text-slate-500 mt-1.5 truncate">
                                <span className="font-mono">{o.facturas.map((f) => f.numero).join(", ")}</span>
                                <span className="text-slate-400"> · {fechaCorta(o.facturas[0].fecha)}</span>
                              </p>
                            )}
                            {o.metodo_retiro ? (
                              <>
                                <span className="mt-2 inline-flex max-w-full truncate rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--portal-primary,#741DFE)]">
                                  {describirMetodo(o.metodo_retiro)}
                                </span>
                                {/* Ruta gratis recalculada con lo facturado, o ruta que no es la del cliente. */}
                                {o.metodo_retiro.alerta && (
                                  <span
                                    title={o.metodo_retiro.alerta}
                                    className="mt-1 block rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 line-clamp-3"
                                  >
                                    ⚠ {o.metodo_retiro.alerta}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="mt-2 inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                {to("sin_metodo")}
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 transition-colors group-hover:text-[color:var(--portal-primary,#741DFE)]">
                            {to("ver_detalle")}
                            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
