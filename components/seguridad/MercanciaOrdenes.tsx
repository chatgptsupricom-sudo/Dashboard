"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, FileText, Search, X } from "lucide-react";
import { fechaCorta } from "@/lib/fecha";
import { PageHeader, EmptyState, inputClases } from "./mercancia-ui";
import { describirMetodo, METODOS_RETIRO, type FilaMetodo } from "@/lib/ventas/metodoRetiroTipos";

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

/** Sin acentos ni mayúsculas: "panama" encuentra "Panamá". */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

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

export default function MercanciaOrdenes() {
  const to = useTranslations("seguridad.mercancia.ordenes");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [sinFacturar, setSinFacturar] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  // Los chips cuentan sobre lo que deja la búsqueda, y solo se muestran los
  // métodos que tienen alguna orden.
  const { visibles, chips } = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    const porTexto = palabras.length
      ? ordenes.filter((o) => {
          const texto = textoBuscable(o);
          return palabras.every((p) => texto.includes(p));
        })
      : ordenes;
    const deFiltro = (o: Orden, f: Filtro) =>
      f === "todas" || (f === "sin_metodo" ? !o.metodo_retiro : o.metodo_retiro?.metodo === f);
    return {
      visibles: porTexto.filter((o) => deFiltro(o, filtro)),
      chips: FILTROS.map((id) => ({ id, n: porTexto.filter((o) => deFiltro(o, id)).length })).filter(
        (c) => c.id === "todas" || c.id === filtro || ordenes.some((o) => deFiltro(o, c.id)),
      ),
    };
  }, [ordenes, busqueda, filtro]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/seguridad/mercancia/pendientes");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "fetch failed");
      setOrdenes(json.ordenes || []);
      setSinFacturar(Number(json.sin_facturar) || 0);
    } catch (e: any) {
      // El backend ya trae la causa concreta ([odoo]/[mysql] + el mensaje
      // real) — mostrarla en vez de un generico ayuda a diagnosticar sin
      // acceso a los logs del servidor.
      setError(e?.message || to("error"));
    } finally {
      setCargando(false);
    }
  }, [to]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={FileText} titulo={to("titulo")} subtitulo={to("subtitulo")} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Las listas sin facturar no se arman, pero Almacen tiene que saber que
            existen: si no, "no la veo" parece un error del panel. */}
        {!cargando && !error && sinFacturar > 0 && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            {to("sin_facturar", { n: sinFacturar })}
          </p>
        )}
        {cargando ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        ) : ordenes.length === 0 ? (
          <EmptyState icon={FileText} texto={to("vacio")} />
        ) : (
          <>
          <div className="mb-4 space-y-3">
            <div className="relative sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={to("buscar")}
                aria-label={to("buscar")}
                className={`${inputClases} pl-10 pr-10`}
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  aria-label={to("limpiar")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
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
            {visibles.length !== ordenes.length && (
              <p className="text-xs text-slate-500">{to("mostrando", { n: visibles.length, total: ordenes.length })}</p>
            )}
          </div>
          {visibles.length === 0 ? (
            <EmptyState icon={Search} texto={to("sin_resultados")} />
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {visibles.map((o) => (
              <Link
                key={o.odoo_picking_id}
                // Con el id: el nombre se repite entre compañias (ver lib/seguridad/mercancia).
                href={`/${locale}/seguridad/mercancia/ordenes/${encodeURIComponent(o.odoo_picking_name)}?id=${o.odoo_picking_id}`}
                className="group relative flex flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.1)] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between">
                  <span className="w-10 h-10 rounded-xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center shrink-0">
                    <FileText className="w-[18px] h-[18px]" />
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-400 shrink-0 transition-colors" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {o.odoo_picking_name}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
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
              </Link>
            ))}
          </div>
          )}
          </>
        )}
      </main>
    </div>
  );
}
