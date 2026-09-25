"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Package,
  Plus,
  XCircle,
} from "lucide-react";
import { fechaCorta } from "@/lib/fecha";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  RESPONSABLE,
  TIPOS_ENTREGA,
  esEtapa,
  esTipoEntrega,
  type TipoEntrega,
} from "@/lib/seguridad/egresoFlujo";
import { useMercanciaEnVivo } from "@/lib/seguridad/useMercanciaEnVivo";
import AvisosMercancia from "./AvisosMercancia";
import { PageHeader, EmptyState, BotonPrimario, BotonSecundario } from "./mercancia-ui";

/**
 * Listado de movimientos de mercancia, compartido por ingresos y egresos.
 *
 * Los dos muestran lo mismo y cambian el titulo y el filtro; duplicar la
 * pantalla seria mantener dos veces la misma tabla.
 *
 * Grid y no lista: se ve en telefono, tablet, monitor y hasta television de
 * sala — una sola columna angosta desperdicia el ancho en cualquier pantalla
 * que no sea un telefono.
 */

type Movimiento = {
  id: number;
  tipo: "ingreso" | "egreso";
  fecha: string;
  odoo_picking_name: string | null;
  contraparte: string | null;
  almacenista_nombre: string;
  almacenistas: string[];
  chofer_nombre: string | null;
  placa_vehiculo: string | null;
  estado: "pendiente" | "conforme" | "descuadre";
  total_items: number;
  items_con_diferencia: number;
  /** Egreso por etapas; null en ingresos y egresos del flujo anterior. */
  etapa: string | null;
  tipo_entrega: string | null;
  aprobado: number | null;
  despachado: number | null;
};

type Filtro = "para_mi" | "en_proceso" | "cerrados" | "todos";

export default function MercanciaLista({ tipo }: { tipo: "ingreso" | "egreso" }) {
  const tm = useTranslations("seguridad.mercancia");
  const tf = useTranslations("seguridad.mercancia.flujo");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad/mercancia/${tipo}`;
  const { user } = useAuthStore();
  const rol = (user?.role || "").toLowerCase().trim();

  const [items, setItems] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  // null = todavia no se eligio: se arranca en "Para mi" si hay algo que te
  // toque, y si no en "En proceso" (una pestaña vacia al entrar parece que
  // no hay nada).
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  // Filtro por tipo de entrega: va al servidor, asi el Excel sale con el
  // mismo criterio que la lista.
  const [entrega, setEntrega] = useState<TipoEntrega | "">("");
  const [exportando, setExportando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const consulta = new URLSearchParams({ tipo, ...(entrega ? { tipo_entrega: entrega } : {}) }).toString();

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/seguridad/mercancia?${consulta}`);
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.movimientos || []);
    } catch {
      // Se deja lo que haya en pantalla.
    } finally {
      setCargando(false);
    }
  }, [consulta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // En vivo: Almacen guarda una carga o Seguridad la verifica en el porton y
  // este listado se actualiza solo, sin recargar la pagina. Se ignora lo del
  // otro sentido (un ingreso no cambia la lista de egresos).
  useMercanciaEnVivo((aviso) => {
    if (aviso.tipo === tipo) void cargar();
  });

  const esEgreso = tipo === "egreso";
  const meToca = (m: Movimiento) =>
    esEtapa(m.etapa) &&
    m.etapa !== "cerrado" &&
    (rol === "superadmin" || RESPONSABLE[m.etapa] === rol);
  const abierto = (m: Movimiento) =>
    m.etapa ? m.etapa !== "cerrado" : m.estado === "pendiente";
  const cuenta: Record<Filtro, number> = {
    para_mi: items.filter(meToca).length,
    en_proceso: items.filter(abierto).length,
    cerrados: items.filter((m) => !abierto(m)).length,
    todos: items.length,
  };
  const filtroActivo: Filtro = filtro ?? (cuenta.para_mi > 0 ? "para_mi" : "en_proceso");
  const visibles = !esEgreso
    ? items
    : items.filter((m) =>
        filtroActivo === "para_mi"
          ? meToca(m)
          : filtroActivo === "en_proceso"
            ? abierto(m)
            : filtroActivo === "cerrados"
              ? !abierto(m)
              : true,
      );

  // Se baja con fetch y no navegando: si el servidor falla, el error se ve
  // aca y no se pierde la pantalla (ni el filtro elegido).
  const exportarExcel = async () => {
    setErrorExcel(null);
    setExportando(true);
    try {
      const res = await fetch(`/api/seguridad/mercancia/export?${consulta}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || tm("error"));
      }
      const url = URL.createObjectURL(await res.blob());
      const nombre =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] ||
        "egresos-mercancia.xlsx";
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErrorExcel(e?.message || tm("error"));
    } finally {
      setExportando(false);
    }
  };

  // El egreso lo inicia Almacen; Seguridad no ve "Registrar" (la API igual lo
  // rechazaria). El ingreso, al reves, es de Seguridad.
  // El ingreso ya no se registra aca: ahora es por packing list.
  const puedeRegistrar = esEgreso ? rol !== "seguridad" : false;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Package}
        titulo={tm(tipo === "ingreso" ? "ingreso_titulo" : "egreso_titulo")}
        subtitulo={tm(tipo === "ingreso" ? "ingreso_sub" : "egreso_sub")}
        accion={
          puedeRegistrar ? (
            <BotonPrimario href={`${base}/nuevo`} icon={Plus}>
              <span className="hidden sm:inline">{tm("nuevo")}</span>
            </BotonPrimario>
          ) : undefined
        }
      />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {esEgreso && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select
              value={entrega}
              onChange={(e) => setEntrega(esTipoEntrega(e.target.value) ? e.target.value : "")}
              aria-label={tf("tipo_entrega")}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 focus:outline-none"
            >
              <option value="">{tf("entrega_todas")}</option>
              {TIPOS_ENTREGA.map((t) => (
                <option key={t} value={t}>{tf(`entrega.${t}`)}</option>
              ))}
            </select>
            <BotonSecundario
              onClick={() => void exportarExcel()}
              disabled={exportando}
              icon={Download}
              className="ml-auto"
            >
              {tf("exportar_excel")}
            </BotonSecundario>
          </div>
        )}
        {esEgreso && errorExcel && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorExcel}
          </div>
        )}

        {esEgreso && !cargando && items.length > 0 && (
          <div className="flex gap-1.5 mb-5 overflow-x-auto -mx-1 px-1 pb-1" role="tablist">
            {(["para_mi", "en_proceso", "cerrados", "todos"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filtroActivo === f}
                onClick={() => setFiltro(f)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${
                  filtroActivo === f
                    ? "bg-[color:var(--portal-primary,#741DFE)] text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {tf(`filtro.${f}`)}
                <span
                  className={`tabular-nums text-[11px] ${filtroActivo === f ? "text-white/80" : "text-slate-400"}`}
                >
                  {cuenta[f]}
                </span>
              </button>
            ))}
          </div>
        )}

        {cargando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 && !entrega ? (
          <EmptyState icon={Package} texto={tm("vacio")} />
        ) : visibles.length === 0 ? (
          <EmptyState icon={Package} texto={tf("vacio_filtro")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {visibles.map((m) => (
              <Link
                key={m.id}
                href={`${base}/${m.id}`}
                className={`group flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.1)] hover:-translate-y-0.5 transition-all ${
                  meToca(m) ? "border-violet-200" : "border-slate-200/80"
                }`}
              >
                {esEtapa(m.etapa) ? <EtapaBadge m={m} /> : <EstadoBadge estado={m.estado} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {m.odoo_picking_name || tm("sin_factura")}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {m.contraparte || "—"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 truncate">
                    {fechaCorta(m.fecha)} ·{" "}
                    {(m.almacenistas?.length ? m.almacenistas : [m.almacenista_nombre]).join(
                      ", ",
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {esEtapa(m.etapa) && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          meToca(m)
                            ? "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]"
                            : "bg-slate-50 text-slate-500"
                        }`}
                      >
                        {tf(`etapa.${m.etapa}`)}
                      </span>
                    )}
                    {esTipoEntrega(m.tipo_entrega) && (
                      <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md truncate">
                        {tf(`entrega.${m.tipo_entrega}`)}
                      </span>
                    )}
                    {m.placa_vehiculo && (
                      <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">
                        {m.placa_vehiculo}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                      {m.total_items}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 shrink-0 transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Cartel de lo que va entrando mientras la pantalla esta abierta. */}
      <AvisosMercancia tipo={tipo} />
    </div>
  );
}

/**
 * Icono de un egreso por etapas: en curso (reloj), cerrado bien (check),
 * cerrado sin aprobar (alerta) o sin despachar (x).
 */
function EtapaBadge({ m }: { m: Movimiento }) {
  const cerrado = m.etapa === "cerrado" || m.etapa === "por_calificar";
  const conf = !cerrado
    ? { icon: Clock, clase: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]" }
    : Number(m.aprobado) === 1
      ? { icon: CheckCircle2, clase: "bg-emerald-50 text-emerald-600" }
      : Number(m.despachado) === 1
        ? { icon: AlertTriangle, clase: "bg-amber-50 text-amber-600" }
        : { icon: XCircle, clase: "bg-red-50 text-red-600" };
  const Icon = conf.icon;
  return (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.clase}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

function EstadoBadge({ estado }: { estado: "pendiente" | "conforme" | "descuadre" }) {
  const conf = {
    conforme: { icon: CheckCircle2, clase: "bg-emerald-50 text-emerald-600" },
    descuadre: { icon: AlertTriangle, clase: "bg-red-50 text-red-600" },
    pendiente: { icon: Clock, clase: "bg-amber-50 text-amber-600" },
  }[estado];
  const Icon = conf.icon;
  return (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.clase}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}
