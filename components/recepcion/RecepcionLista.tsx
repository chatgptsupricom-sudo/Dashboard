"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Container,
  PackageOpen,
  Plus,
  Timer,
  Truck,
  X,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";
import { SUCURSALES, duracion, formatearDuracion, type Etapa } from "@/lib/recepcion/flujo";
import type { AvisoRecepcion } from "@/lib/recepcion/servidor";
import { useRecepcionEnVivo } from "@/lib/recepcion/useRecepcionEnVivo";
import { PageHeader, EmptyState, BotonPrimario } from "@/components/seguridad/mercancia-ui";

/**
 * Listado de packing lists, compartido por Compras (/compras/packing-list)
 * y Almacen (/seguridad/mercancia/recepcion). Mismo dato, distinto trabajo:
 * Compras carga y sigue el avance; Almacen recibe y verifica.
 */

type Fila = {
  id: number;
  cids: number;
  proveedor: string;
  referencia: string;
  contenedor: string | null;
  oc_referencia: string | null;
  fecha_estimada: string | null;
  etapa: Etapa;
  resultado: "conforme" | "con_novedades" | null;
  total_items: number;
  contenedores_total: number;
  contenedores_llegados: number;
  /** Numeros de contenedor separados por coma. */
  contenedores: string | null;
  items_contados: number;
  created_at: string;
  cerrado_at: string | null;
  /** Primera foto del contenedor al llegar: desde ahi corre el tiempo. */
  inicio_at: string | null;
};

type Filtro = Etapa | "todos";

export default function RecepcionLista({ base }: { base: string }) {
  const t = useTranslations("recepcion");
  const { user } = useAuthStore();
  const rol = (user?.role || "").toLowerCase().trim();
  const esCompras = rol === "compras" || rol === "superadmin";

  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [sucursal, setSucursal] = useState<number | "">("");

  const cargar = useCallback(async () => {
    try {
      const q = sucursal ? `?cids=${sucursal}` : "";
      const res = await fetch(`/api/recepcion${q}`);
      if (!res.ok) return;
      setFilas((await res.json()).recepciones || []);
    } finally {
      setCargando(false);
    }
  }, [sucursal]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Avisos: cada rol ve solo lo que le cambia el trabajo.
  const [avisos, setAvisos] = useState<Array<AvisoRecepcion & { clave: number; texto: string; malo: boolean }>>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useRecepcionEnVivo((a) => {
    void cargar();
    let texto: string | null = null;
    let malo = false;
    if (a.accion === "creado" && (rol === "almacen" || rol === "superadmin")) texto = t("aviso.creado");
    if (a.accion === "llegada" && esCompras) {
      texto = a.contenedor
        ? t("aviso.llegada_contenedor", {
            contenedor: a.contenedor,
            llegados: a.llegados ?? 1,
            total: a.total ?? 1,
          })
        : t("aviso.llegada");
    }
    if (a.accion === "cerrado" && esCompras) {
      malo = a.resultado === "con_novedades";
      texto = t(malo ? "aviso.cerrado_novedades" : "aviso.cerrado_conforme");
    }
    if (!texto) return;
    const clave = Date.now() + Math.random();
    setAvisos((p) => [{ ...a, clave, texto: texto!, malo }, ...p].slice(0, 3));
    timers.current.push(setTimeout(() => setAvisos((p) => p.filter((x) => x.clave !== clave)), 10_000));
  });

  const cuenta: Record<Filtro, number> = {
    por_llegar: filas.filter((f) => f.etapa === "por_llegar").length,
    descargando: filas.filter((f) => f.etapa === "descargando").length,
    cerrado: filas.filter((f) => f.etapa === "cerrado").length,
    todos: filas.length,
  };
  // Se arranca donde hay trabajo: descargando, si no por llegar.
  const activo: Filtro =
    filtro ?? (cuenta.descargando > 0 ? "descargando" : cuenta.por_llegar > 0 ? "por_llegar" : "todos");
  const visibles = activo === "todos" ? filas : filas.filter((f) => f.etapa === activo);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Container}
        titulo={esCompras && rol !== "superadmin" ? t("titulo_compras") : t("titulo")}
        subtitulo={esCompras ? t("sub_compras") : t("sub_almacen")}
        accion={
          esCompras ? (
            <BotonPrimario href={`${base}/nuevo`} icon={Plus}>
              <span className="hidden sm:inline">{t("nuevo")}</span>
            </BotonPrimario>
          ) : undefined
        }
      />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="tablist">
            {(["por_llegar", "descargando", "cerrado", "todos"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={activo === f}
                onClick={() => setFiltro(f)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${
                  activo === f
                    ? "bg-[color:var(--portal-primary,#741DFE)] text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {t(`filtro.${f}`)}
                <span className={`tabular-nums text-[11px] ${activo === f ? "text-white/80" : "text-slate-400"}`}>
                  {cuenta[f]}
                </span>
              </button>
            ))}
          </div>
          {/* Compras carga para las tres sucursales; Almacen ya viene filtrado a la suya. */}
          {esCompras && (
            <select
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value ? Number(e.target.value) : "")}
              className="ml-auto h-9 px-3 rounded-full border border-slate-200 bg-white text-[13px] text-slate-600"
              aria-label={t("sucursal")}
            >
              <option value="">{t("todas")}</option>
              {SUCURSALES.map((s) => (
                <option key={s.cids} value={s.cids}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        {cargando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
            ))}
          </div>
        ) : filas.length === 0 ? (
          <EmptyState icon={Container} texto={t("vacio")} />
        ) : visibles.length === 0 ? (
          <EmptyState icon={Container} texto={t("vacio_filtro")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibles.map((f) => (
              <Link
                key={f.id}
                href={`${base}/${f.id}`}
                className={`group flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:-translate-y-0.5 transition-all ${
                  !esCompras && f.etapa !== "cerrado" ? "border-violet-200" : "border-slate-200/80"
                }`}
              >
                <Icono fila={f} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{f.referencia}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{f.proveedor}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5 truncate">
                    {[
                      f.contenedores || f.contenedor,
                      f.fecha_estimada ? fechaCorta(f.fecha_estimada) : null,
                      esCompras ? SUCURSALES.find((s) => s.cids === Number(f.cids))?.nombre : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        f.etapa === "cerrado"
                          ? f.resultado === "con_novedades"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                          : "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]"
                      }`}
                    >
                      {f.etapa === "cerrado" && f.resultado ? t(`resultado.${f.resultado}`) : t(`etapa.${f.etapa}`)}
                    </span>
                    {f.etapa !== "cerrado" && Number(f.contenedores_total) > 0 && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {t("contenedores_n", {
                          llegados: Number(f.contenedores_llegados),
                          total: Number(f.contenedores_total),
                        })}
                      </span>
                    )}
                    {f.etapa === "descargando" && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {t("contados", { contados: f.items_contados, total: f.total_items })}
                      </span>
                    )}
                    {(() => {
                      const ms = duracion(f.inicio_at, f.etapa === "cerrado" ? f.cerrado_at : null);
                      if (ms === null) return null;
                      return (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 tabular-nums"
                          title={t("tiempo_ayuda")}
                        >
                          <Timer className="w-3 h-3" />
                          {f.etapa === "cerrado"
                            ? formatearDuracion(ms)
                            : t("tiempo_lleva", { tiempo: formatearDuracion(ms) })}
                        </span>
                      );
                    })()}
                    <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                      {t("renglones_n", { count: Number(f.total_items) })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {avisos.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-30 flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
          role="status"
          aria-live="polite"
        >
          {avisos.map((a) => (
            <div
              key={a.clave}
              className={`flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-lg ${
                a.malo ? "border-amber-200" : "border-slate-200"
              }`}
            >
              <span
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  a.malo ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]"
                }`}
              >
                {a.malo ? <AlertTriangle className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{a.texto}</p>
                <p className="text-xs text-slate-500 truncate">
                  {[a.referencia, a.proveedor].filter(Boolean).join(" · ")}
                </p>
                {a.accion !== "eliminado" && (
                  <Link
                    href={`${base}/${a.id}`}
                    className="inline-block mt-1 text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
                  >
                    {t("ver")}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAvisos((p) => p.filter((x) => x.clave !== a.clave))}
                aria-label={t("cerrar_aviso")}
                className="p-1 -m-1 text-slate-300 hover:text-slate-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Icono({ fila }: { fila: Fila }) {
  const conf =
    fila.etapa === "por_llegar"
      ? { icon: Truck, clase: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]" }
      : fila.etapa === "descargando"
        ? { icon: PackageOpen, clase: "bg-sky-50 text-sky-600" }
        : fila.resultado === "con_novedades"
          ? { icon: AlertTriangle, clase: "bg-amber-50 text-amber-600" }
          : { icon: CheckCircle2, clase: "bg-emerald-50 text-emerald-600" };
  const I = conf.icon;
  return (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.clase}`}>
      <I className="w-4 h-4" />
    </span>
  );
}
