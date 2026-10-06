"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Forklift,
  Gauge,
  History,
  Loader2,
  type LucideIcon,
  MousePointerClick,
  Plus,
  Search,
  Truck,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { fechaCorta } from "@/lib/fecha";
import {
  DIAS_AVISO_SERVICIO,
  PRIORIDADES,
  TAREAS_SUGERIDAS,
  TIPOS_EQUIPO,
  TIPOS_ORDEN,
  diasParaServicio,
  situacionDe,
  tareasCompletas,
  unidadMedidor,
  type Equipo,
  type Orden,
  type Prioridad,
  type Situacion,
  type TipoEquipo,
  type TipoOrden,
} from "@/lib/mantenimiento/tipos";
import type { VehiculoEscena } from "@/lib/mantenimiento/escena3d";
import {
  PageHeader,
  Card,
  SectionTitle,
  EmptyState,
  BotonPrimario,
  BotonSecundario,
  Buscador,
  inputClases,
  labelClases,
  normalizar,
} from "../mercancia-ui";
import Escena3D from "./Escena3D";

/**
 * Mantenimiento de unidades de Almacén: camiones y montacargas.
 *
 * Arriba, el patio y el taller en 3D: cada vehículo está parado donde va su
 * mantenimiento (patio, por atender, en el taller, listo) y se elige tocándolo.
 * Abajo, la flota en lista (lo mismo, para buscar y para quien no tenga 3D) y
 * la ficha del vehículo elegido, con el paso que toca.
 *
 * El flujo y sus reglas están en lib/mantenimiento/tipos; la API es la que
 * manda en cada paso, esto solo evita mostrar botones que serían rechazados.
 */

const ANCHO = "max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8";

const SITUACIONES: Situacion[] = ["operativo", "reportado", "en_taller", "listo"];

const TONO: Record<Situacion, { punto: string; pastilla: string; texto: string }> = {
  operativo: { punto: "bg-slate-400", pastilla: "bg-slate-100 text-slate-600 ring-slate-200", texto: "text-slate-600" },
  reportado: { punto: "bg-amber-500", pastilla: "bg-amber-50 text-amber-700 ring-amber-200", texto: "text-amber-700" },
  en_taller: {
    punto: "bg-[color:var(--portal-primary,#741DFE)]",
    pastilla: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)] ring-violet-200",
    texto: "text-[color:var(--portal-primary,#741DFE)]",
  },
  listo: { punto: "bg-emerald-500", pastilla: "bg-emerald-50 text-emerald-700 ring-emerald-200", texto: "text-emerald-700" },
};

const TONO_PRIORIDAD: Record<Prioridad, string> = {
  baja: "border-slate-300 bg-slate-50 text-slate-700",
  media: "border-amber-300 bg-amber-50 text-amber-800",
  alta: "border-red-300 bg-red-50 text-red-700",
};

const ICONO_EQUIPO: Record<TipoEquipo, LucideIcon> = { camion: Truck, montacargas: Forklift };

type T = ReturnType<typeof useTranslations>;

function hora(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const miles = (n: number) => new Intl.NumberFormat("es-VE").format(n);

export default function MantenimientoUnidades({ volverA }: { volverA: string }) {
  const t = useTranslations("seguridad.mercancia.mantenimiento");

  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [historial, setHistorial] = useState<Orden[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<"todos" | TipoEquipo>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState<null | "equipo" | "reportar">(null);
  const [ahora] = useState(() => Date.now());

  const aplicar = useCallback((json: any) => {
    if (Array.isArray(json.equipos)) setEquipos(json.equipos);
    if (Array.isArray(json.historial)) setHistorial(json.historial);
    if (typeof json.puede_editar === "boolean") setPuedeEditar(json.puede_editar);
  }, []);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const res = await fetch("/api/seguridad/mercancia/mantenimiento");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("error"));
      aplicar(json);
    } catch (e: any) {
      setErrorCarga(e?.message || t("error"));
    } finally {
      setCargando(false);
    }
  }, [aplicar, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** POST a la API; devuelve si salió bien. Con 409 la pantalla se pone al día sola. */
  const enviar = useCallback(
    async (url: string, cuerpo: Record<string, unknown>): Promise<boolean> => {
      setError(null);
      setEnviando(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok || res.status === 409) aplicar(json);
        if (!res.ok) throw new Error(json.error || t("error"));
        return true;
      } catch (e: any) {
        setError(e?.message || t("error"));
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [aplicar, t],
  );

  const elegido = equipos.find((e) => e.id === seleccion) || null;

  const cuenta = useMemo(() => {
    const c: Record<Situacion, number> = { operativo: 0, reportado: 0, en_taller: 0, listo: 0 };
    for (const e of equipos) c[situacionDe(e)]++;
    return c;
  }, [equipos]);

  const aviso = useCallback(
    (e: Equipo) => {
      const d = diasParaServicio(e.proximo_servicio, ahora);
      return situacionDe(e) === "operativo" && d !== null && d <= DIAS_AVISO_SERVICIO ? d : null;
    },
    [ahora],
  );

  const vehiculos = useMemo<VehiculoEscena[]>(
    () =>
      equipos.map((e) => {
        const tareas = e.orden?.tareas || [];
        return {
          id: e.id,
          tipo: e.tipo,
          codigo: e.codigo,
          situacion: situacionDe(e),
          urgente: e.orden?.prioridad === "alta",
          progreso: tareas.length ? tareas.filter((x) => x.hecha).length / tareas.length : 0,
          aviso: aviso(e) !== null,
        };
      }),
    [equipos, aviso],
  );

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return equipos.filter(
      (e) =>
        (filtro === "todos" || e.tipo === filtro) &&
        (!q || normalizar(`${e.codigo} ${e.descripcion || ""} ${e.orden?.titulo || ""}`).includes(q)),
    );
  }, [equipos, filtro, busqueda]);

  const textosEscena = useMemo(
    () => ({
      patio: t("zona.operativo"),
      reportado: t("zona.reportado"),
      taller: t("zona.en_taller"),
      listo: t("zona.listo"),
    }),
    [t],
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Wrench}
        titulo={t("titulo")}
        subtitulo={t("subtitulo")}
        volverA={volverA}
        ancho={ANCHO}
        accion={
          puedeEditar ? (
            <div className="flex gap-2">
              <BotonSecundario onClick={() => setModal("equipo")} icon={Plus}>
                <span className="hidden sm:inline">{t("agregar_equipo")}</span>
              </BotonSecundario>
              <BotonPrimario onClick={() => setModal("reportar")} icon={Wrench} disabled={equipos.length === 0}>
                <span className="hidden sm:inline">{t("reportar")}</span>
              </BotonPrimario>
            </div>
          ) : undefined
        }
      />

      <main className={`${ANCHO} py-5 sm:py-6 space-y-5 pb-24`}>
        {errorCarga && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0 break-words">{errorCarga}</span>
            <BotonSecundario onClick={() => void cargar()}>{t("reintentar")}</BotonSecundario>
          </div>
        )}
        {!cargando && !puedeEditar && !errorCarga && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">{t("solo_lectura")}</p>
        )}

        {/* El patio y el taller, con las cifras encima. */}
        <section className="relative rounded-3xl border border-slate-200/80 bg-slate-100 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {cargando ? (
            <div className="h-[280px] sm:h-[380px] lg:h-[440px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <Escena3D
              vehiculos={vehiculos}
              seleccion={seleccion}
              onSeleccion={setSeleccion}
              textos={textosEscena}
              className="h-[280px] sm:h-[380px] lg:h-[440px]"
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4 flex flex-wrap gap-2">
            {SITUACIONES.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/85 backdrop-blur px-3 py-1.5 shadow-sm"
              >
                <span className={`w-2 h-2 rounded-full ${TONO[s].punto}`} />
                <span className="text-base font-semibold tabular-nums leading-none text-slate-900">{cuenta[s]}</span>
                <span className="text-[11px] font-medium text-slate-500">{t(`situacion.${s}`)}</span>
              </span>
            ))}
          </div>
          {!cargando && equipos.length > 0 && (
            <p className="pointer-events-none absolute left-3 sm:left-4 bottom-3 inline-flex items-center gap-1.5 rounded-lg bg-white/85 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
              <MousePointerClick className="w-3.5 h-3.5" />
              {t("ayuda_escena")}
            </p>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
          {/* Flota */}
          <Card padded={false} className="overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 flex-1">
                  {t("flota")} <span className="text-slate-400 font-medium tabular-nums">· {equipos.length}</span>
                </h2>
                <Buscador
                  valor={busqueda}
                  onChange={setBusqueda}
                  placeholder={t("buscar")}
                  limpiar={t("limpiar")}
                  className="sm:w-64"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist">
                {(["todos", ...TIPOS_EQUIPO] as const).map((f) => {
                  const n = f === "todos" ? equipos.length : equipos.filter((e) => e.tipo === f).length;
                  return (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={filtro === f}
                      onClick={() => setFiltro(f)}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors ${
                        filtro === f
                          ? "bg-[color:var(--portal-primary,#741DFE)] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {t(`filtro.${f}`)}
                      <span className={`tabular-nums ${filtro === f ? "text-white/80" : "text-slate-400"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-3 sm:p-4">
              {cargando ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[84px] rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : equipos.length === 0 ? (
                <EmptyState icon={Truck} texto={t("vacio")} className="py-10" />
              ) : visibles.length === 0 ? (
                <EmptyState icon={Search} texto={t("sin_resultados")} className="py-10" />
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {visibles.map((e) => (
                    <li key={e.id}>
                      <TarjetaEquipo
                        equipo={e}
                        elegido={e.id === seleccion}
                        dias={aviso(e)}
                        onClick={() => setSeleccion(e.id === seleccion ? null : e.id)}
                        t={t}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Ficha del elegido */}
          <div className="lg:sticky lg:top-24 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
            {elegido ? (
              <Ficha
                key={`${elegido.id}-${elegido.orden?.id ?? 0}-${elegido.orden?.estado ?? "x"}`}
                equipo={elegido}
                historial={historial.filter((o) => o.equipo_id === elegido.id)}
                dias={aviso(elegido)}
                puedeEditar={puedeEditar}
                enviando={enviando}
                onReportar={() => setModal("reportar")}
                onAccion={(cuerpo) =>
                  enviar(`/api/seguridad/mercancia/mantenimiento/${elegido.orden!.id}`, cuerpo)
                }
                t={t}
              />
            ) : (
              <Card className="text-center py-10">
                <span className="mx-auto w-12 h-12 rounded-2xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center">
                  <MousePointerClick className="w-5 h-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-900">{t("elige_titulo")}</p>
                <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">{t("elige_texto")}</p>
              </Card>
            )}
          </div>
        </div>

        {/* Últimos trabajos cerrados */}
        {historial.length > 0 && (
          <Card>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" />
                {t("historial")}
              </span>
            </SectionTitle>
            <ul className="divide-y divide-slate-100 -mx-5">
              {historial.slice(0, 12).map((o) => (
                <li key={o.id} className="px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-slate-900">{o.equipo_codigo}</span>
                  <span className="min-w-0 flex-1 text-sm text-slate-700 truncate">{o.titulo}</span>
                  <span className="text-[11px] font-medium text-slate-400">{t(`tipo_orden.${o.tipo}`)}</span>
                  {o.costo !== null && (
                    <span className="text-xs font-semibold tabular-nums text-slate-700">$ {miles(o.costo)}</span>
                  )}
                  <span className="text-[11px] text-slate-400 tabular-nums">{hora(o.cerrado_at) || "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>

      {modal === "equipo" && (
        <ModalEquipo
          enviando={enviando}
          error={error}
          onCerrar={() => {
            setModal(null);
            setError(null);
          }}
          onGuardar={async (cuerpo) => {
            if (await enviar("/api/seguridad/mercancia/mantenimiento", { accion: "equipo", ...cuerpo })) setModal(null);
          }}
          t={t}
        />
      )}
      {modal === "reportar" && (
        <ModalReportar
          equipos={equipos.filter((e) => situacionDe(e) === "operativo")}
          inicial={elegido && situacionDe(elegido) === "operativo" ? elegido.id : null}
          enviando={enviando}
          error={error}
          onCerrar={() => {
            setModal(null);
            setError(null);
          }}
          onGuardar={async (cuerpo) => {
            if (await enviar("/api/seguridad/mercancia/mantenimiento", { accion: "reportar", ...cuerpo })) {
              setSeleccion(Number(cuerpo.equipo_id));
              setModal(null);
            }
          }}
          t={t}
        />
      )}
    </div>
  );
}

function Pastilla({ situacion, t }: { situacion: Situacion; t: T }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${TONO[situacion].pastilla}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONO[situacion].punto}`} />
      {t(`situacion.${situacion}`)}
    </span>
  );
}

function TarjetaEquipo({
  equipo,
  elegido,
  dias,
  onClick,
  t,
}: {
  equipo: Equipo;
  elegido: boolean;
  /** Días para el próximo servicio, si ya toca avisar. */
  dias: number | null;
  onClick: () => void;
  t: T;
}) {
  const Icono = ICONO_EQUIPO[equipo.tipo];
  const situacion = situacionDe(equipo);
  const tareas = equipo.orden?.tareas || [];
  const hechas = tareas.filter((x) => x.hecha).length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      className={`w-full text-left rounded-xl border bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(116,29,254,0.08)] ${
        elegido ? "border-[color:var(--portal-primary,#741DFE)] ring-2 ring-violet-100" : "border-slate-200/80 hover:border-violet-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            elegido ? "bg-[color:var(--portal-primary,#741DFE)] text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          <Icono className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold tracking-wide text-slate-900 truncate">{equipo.codigo}</p>
          <p className="text-xs text-slate-500 truncate">{equipo.descripcion || t(`tipo_equipo.${equipo.tipo}`)}</p>
        </div>
        <Pastilla situacion={situacion} t={t} />
      </div>
      {equipo.orden && (
        <p className="mt-2.5 text-xs text-slate-600 truncate" title={equipo.orden.titulo}>
          {equipo.orden.titulo}
        </p>
      )}
      {situacion === "en_taller" && tareas.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[color:var(--portal-primary,#741DFE)] transition-all duration-500"
              style={{ width: `${(hechas / tareas.length) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">
            {hechas}/{tareas.length}
          </span>
        </div>
      )}
      {dias !== null && (
        <p className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${dias < 0 ? "text-red-600" : "text-amber-700"}`}>
          <CalendarClock className="w-3.5 h-3.5" />
          {dias < 0 ? t("servicio_vencido", { n: -dias }) : t("servicio_en", { n: dias })}
        </p>
      )}
    </button>
  );
}

/** Las cuatro etapas, con la actual resaltada. */
function Recorrido({ situacion, t }: { situacion: Situacion; t: T }) {
  const pasos: Array<Exclude<Situacion, "operativo">> = ["reportado", "en_taller", "listo"];
  const actual = pasos.indexOf(situacion as (typeof pasos)[number]);
  return (
    <ol className="flex items-center gap-1.5">
      {pasos.map((p, i) => (
        <li key={p} className="flex-1 min-w-0">
          <span
            className={`block h-1.5 rounded-full transition-colors ${
              i < actual ? "bg-emerald-500" : i === actual ? `${TONO[p].punto} animate-pulse` : "bg-slate-200"
            }`}
          />
          <span
            className={`mt-1.5 block text-[10px] font-semibold uppercase tracking-wide truncate ${
              i === actual ? TONO[p].texto : i < actual ? "text-slate-500" : "text-slate-300"
            }`}
          >
            {t(`situacion.${p}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Ficha({
  equipo,
  historial,
  dias,
  puedeEditar,
  enviando,
  onReportar,
  onAccion,
  t,
}: {
  equipo: Equipo;
  historial: Orden[];
  dias: number | null;
  puedeEditar: boolean;
  enviando: boolean;
  onReportar: () => void;
  onAccion: (cuerpo: Record<string, unknown>) => Promise<boolean>;
  t: T;
}) {
  const Icono = ICONO_EQUIPO[equipo.tipo];
  const situacion = situacionDe(equipo);
  const orden = equipo.orden;
  const unidad = unidadMedidor(equipo.tipo);

  const [responsable, setResponsable] = useState("");
  const [nuevaTarea, setNuevaTarea] = useState("");
  const [costo, setCosto] = useState("");
  const [medidor, setMedidor] = useState(orden?.medidor != null ? String(orden.medidor) : "");
  const [proximo, setProximo] = useState("");
  const [notas, setNotas] = useState("");

  const tareas = orden?.tareas || [];
  const hechas = tareas.filter((x) => x.hecha).length;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-br from-violet-50/70 to-white">
        <div className="flex items-center gap-3.5">
          <span className="w-12 h-12 rounded-2xl bg-[color:var(--portal-primary,#741DFE)] text-white flex items-center justify-center shrink-0 shadow-sm">
            <Icono className="w-6 h-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-lg font-bold tracking-wide text-slate-900 truncate">{equipo.codigo}</p>
            <p className="text-xs text-slate-500 truncate">{equipo.descripcion || t(`tipo_equipo.${equipo.tipo}`)}</p>
          </div>
          <Pastilla situacion={situacion} t={t} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/80 border border-slate-200/70 px-3 py-2">
            <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <Gauge className="w-3 h-3" />
              {t(`medidor.${unidad}`)}
            </dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {equipo.medidor !== null ? `${miles(equipo.medidor)} ${unidad}` : "—"}
            </dd>
          </div>
          <div className="rounded-xl bg-white/80 border border-slate-200/70 px-3 py-2">
            <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <CalendarClock className="w-3 h-3" />
              {t("proximo_servicio")}
            </dt>
            <dd className={`text-sm font-semibold tabular-nums ${dias !== null ? (dias < 0 ? "text-red-600" : "text-amber-700") : "text-slate-900"}`}>
              {equipo.proximo_servicio ? fechaCorta(equipo.proximo_servicio) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="p-5 space-y-4">
        {!orden ? (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-900">{t("operativo_texto")}</p>
            </div>
            {puedeEditar && (
              <BotonPrimario onClick={onReportar} icon={Wrench} className="w-full h-12">
                {t("reportar")}
              </BotonPrimario>
            )}
          </>
        ) : (
          <>
            <Recorrido situacion={situacion} t={t} />

            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {t(`tipo_orden.${orden.tipo}`)}
                </span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONO_PRIORIDAD[orden.prioridad]}`}>
                  {t(`prioridad.${orden.prioridad}`)}
                </span>
              </div>
              <p className="mt-2 text-[15px] font-semibold text-slate-900 break-words">{orden.titulo}</p>
              {orden.detalle && <p className="mt-1 text-sm text-slate-600 whitespace-pre-line break-words">{orden.detalle}</p>}
              <p className="mt-2 text-[11px] text-slate-400">
                {t("reportado_por", { quien: orden.reportado_por || "—", cuando: hora(orden.created_at) || "—" })}
                {orden.responsable ? ` · ${t("lo_atiende", { quien: orden.responsable })}` : ""}
              </p>
            </div>

            {/* Tareas: se marcan en el taller. */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                  <ClipboardList className="w-4 h-4 text-slate-400" />
                  {t("tareas")}
                </h3>
                <span className="text-xs font-semibold tabular-nums text-slate-500">
                  {hechas}/{tareas.length}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${tareas.length ? (hechas / tareas.length) * 100 : 0}%` }}
                />
              </div>
              <ul className="space-y-1.5">
                {tareas.map((x, i) => {
                  const editable = puedeEditar && situacion === "en_taller";
                  return (
                    <li key={`${i}-${x.texto}`}>
                      <button
                        type="button"
                        disabled={!editable || enviando}
                        onClick={() => void onAccion({ accion: "tarea", indice: i, hecha: !x.hecha })}
                        title={x.por ? `${x.por} · ${hora(x.at) || ""}` : undefined}
                        className={`group w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                          x.hecha ? "border-emerald-200 bg-emerald-50/60 text-slate-500" : "border-slate-200 bg-white text-slate-800"
                        } ${editable ? "hover:border-violet-200 cursor-pointer" : "cursor-default"}`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            x.hecha ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </span>
                        <span className={`min-w-0 flex-1 break-words ${x.hecha ? "line-through" : ""}`}>{x.texto}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {puedeEditar && situacion === "en_taller" && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={nuevaTarea}
                    onChange={(e) => setNuevaTarea(e.target.value.slice(0, 200))}
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter" || !nuevaTarea.trim()) return;
                      e.preventDefault();
                      if (await onAccion({ accion: "agregar_tarea", texto: nuevaTarea.trim() })) setNuevaTarea("");
                    }}
                    placeholder={t("tarea_nueva")}
                    className={`${inputClases} h-10`}
                  />
                  <BotonSecundario
                    onClick={async () => {
                      if (await onAccion({ accion: "agregar_tarea", texto: nuevaTarea.trim() })) setNuevaTarea("");
                    }}
                    disabled={enviando || !nuevaTarea.trim()}
                    icon={Plus}
                    className="h-10 shrink-0"
                  >
                    {t("agregar")}
                  </BotonSecundario>
                </div>
              )}
            </div>

            {/* El paso que toca */}
            {puedeEditar && situacion === "reportado" && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
                <div>
                  <label className={labelClases}>{t("responsable")} *</label>
                  <input
                    type="text"
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value.slice(0, 200))}
                    placeholder={t("responsable_ph")}
                    className={inputClases}
                  />
                </div>
                <BotonPrimario
                  onClick={() => void onAccion({ accion: "iniciar", responsable: responsable.trim() })}
                  disabled={enviando || !responsable.trim()}
                  icon={Wrench}
                  className="w-full h-12"
                >
                  {t("iniciar")}
                </BotonPrimario>
              </div>
            )}

            {puedeEditar && situacion === "en_taller" && (
              <div className="space-y-2">
                <BotonPrimario
                  onClick={() => void onAccion({ accion: "terminar" })}
                  disabled={enviando || !tareasCompletas(tareas)}
                  icon={CheckCircle2}
                  className="w-full h-12"
                >
                  {t("terminar")}
                </BotonPrimario>
                {!tareasCompletas(tareas) && (
                  <p className="text-[11px] text-slate-500 text-center">{t("faltan_tareas", { n: tareas.length - hechas })}</p>
                )}
              </div>
            )}

            {puedeEditar && situacion === "listo" && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClases}>{t("costo")}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={costo}
                      onChange={(e) => setCosto(e.target.value)}
                      placeholder="0.00"
                      className={inputClases}
                    />
                  </div>
                  <div>
                    <label className={labelClases}>{t(`medidor.${unidad}`)}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={medidor}
                      onChange={(e) => setMedidor(e.target.value)}
                      placeholder={unidad}
                      className={inputClases}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClases}>{t("proximo_servicio")}</label>
                  <input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} className={inputClases} />
                </div>
                <div>
                  <label className={labelClases}>{t("notas")}</label>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value.slice(0, 2000))}
                    rows={2}
                    placeholder={t("notas_ph")}
                    className={`${inputClases} h-auto py-2.5 resize-none`}
                  />
                </div>
                <BotonPrimario
                  onClick={() =>
                    void onAccion({
                      accion: "cerrar",
                      costo: costo === "" ? null : Number(costo),
                      medidor: medidor === "" ? null : Number(medidor),
                      proximo_servicio: proximo || null,
                      notas: notas.trim() || null,
                    })
                  }
                  disabled={enviando}
                  icon={Truck}
                  className="w-full h-12"
                >
                  {t("cerrar")}
                </BotonPrimario>
              </div>
            )}
          </>
        )}

        {historial.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{t("historial_equipo")}</h3>
            <ul className="space-y-2">
              {historial.slice(0, 4).map((o) => (
                <li key={o.id} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="min-w-0 flex-1 text-slate-700 break-words">
                    {o.titulo}
                    <span className="text-slate-400">
                      {" · "}
                      {hora(o.cerrado_at) || "—"}
                      {o.costo !== null ? ` · $ ${miles(o.costo)}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in" />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4">
        <div className="sticky top-0 z-[1] flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-white/95 backdrop-blur">
          <h2 className="flex-1 text-[15px] font-semibold tracking-tight text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Opciones<V extends string>({
  valores,
  valor,
  onChange,
  etiqueta,
  iconos,
}: {
  valores: readonly V[];
  valor: V;
  onChange: (v: V) => void;
  etiqueta: (v: V) => string;
  iconos?: Record<V, LucideIcon>;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${valores.length}, minmax(0, 1fr))` }}>
      {valores.map((v) => {
        const Icono: LucideIcon | undefined = iconos?.[v];
        return (
          <button
            key={v}
            type="button"
            aria-pressed={valor === v}
            onClick={() => onChange(v)}
            className={`inline-flex items-center justify-center gap-2 h-11 px-2 rounded-xl border text-[13px] font-semibold transition-colors ${
              valor === v
                ? "border-[color:var(--portal-primary,#741DFE)] bg-violet-50 text-[color:var(--portal-primary,#741DFE)]"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {Icono && <Icono className="w-4 h-4" />}
            <span className="truncate">{etiqueta(v)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ErrorModal({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-red-600">
      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="min-w-0 break-words">{error}</span>
    </p>
  );
}

function ModalEquipo({
  enviando,
  error,
  onCerrar,
  onGuardar,
  t,
}: {
  enviando: boolean;
  error: string | null;
  onCerrar: () => void;
  onGuardar: (cuerpo: Record<string, unknown>) => void;
  t: T;
}) {
  const [tipo, setTipo] = useState<TipoEquipo>("montacargas");
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [medidor, setMedidor] = useState("");
  const unidad = unidadMedidor(tipo);
  return (
    <Modal titulo={t("agregar_equipo")} onCerrar={onCerrar}>
      <p className="text-xs text-slate-500">{t("equipo_ayuda")}</p>
      <Opciones valores={TIPOS_EQUIPO} valor={tipo} onChange={setTipo} etiqueta={(v) => t(`tipo_equipo.${v}`)} iconos={ICONO_EQUIPO} />
      <div>
        <label className={labelClases}>{t(tipo === "camion" ? "codigo_camion" : "codigo_montacargas")} *</label>
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 50))}
          placeholder={tipo === "camion" ? "A12BC3D" : "MC-01"}
          className={`${inputClases} uppercase font-mono tracking-wider`}
        />
      </div>
      <div>
        <label className={labelClases}>{t("descripcion")}</label>
        <input
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value.slice(0, 200))}
          placeholder={t(tipo === "camion" ? "descripcion_camion_ph" : "descripcion_montacargas_ph")}
          className={inputClases}
        />
      </div>
      <div>
        <label className={labelClases}>{t(`medidor.${unidad}`)}</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={medidor}
          onChange={(e) => setMedidor(e.target.value)}
          placeholder={unidad}
          className={inputClases}
        />
      </div>
      <ErrorModal error={error} />
      <BotonPrimario
        onClick={() =>
          onGuardar({ tipo, codigo: codigo.trim(), descripcion: descripcion.trim() || null, medidor: medidor === "" ? null : Number(medidor) })
        }
        disabled={enviando || !codigo.trim()}
        icon={enviando ? undefined : Plus}
        className="w-full h-12"
      >
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("agregar_equipo")}
      </BotonPrimario>
    </Modal>
  );
}

function ModalReportar({
  equipos,
  inicial,
  enviando,
  error,
  onCerrar,
  onGuardar,
  t,
}: {
  /** Solo los operativos: un equipo tiene una orden abierta a la vez. */
  equipos: Equipo[];
  inicial: number | null;
  enviando: boolean;
  error: string | null;
  onCerrar: () => void;
  onGuardar: (cuerpo: Record<string, unknown>) => void;
  t: T;
}) {
  const [equipoId, setEquipoId] = useState<number | null>(inicial ?? equipos[0]?.id ?? null);
  const [tipo, setTipo] = useState<TipoOrden>("preventivo");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [medidor, setMedidor] = useState("");
  const equipo = equipos.find((e) => e.id === equipoId) || null;
  // Las tareas habituales del servicio; se vuelven a cargar al cambiar de
  // equipo o de tipo, salvo que ya se hayan tocado a mano.
  const [tareas, setTareas] = useState<string[]>(() => (equipo ? TAREAS_SUGERIDAS[equipo.tipo].preventivo : []));
  const [tocadas, setTocadas] = useState(false);
  const [nueva, setNueva] = useState("");

  const sugerir = (e: Equipo | null, tp: TipoOrden) => {
    if (!tocadas && e) setTareas(TAREAS_SUGERIDAS[e.tipo][tp]);
  };
  const agregar = () => {
    const v = nueva.trim();
    if (!v || tareas.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setTareas((p) => [...p, v]);
    setTocadas(true);
    setNueva("");
  };

  if (equipos.length === 0) {
    return (
      <Modal titulo={t("reportar")} onCerrar={onCerrar}>
        <EmptyState icon={Wrench} texto={t("todos_en_mantenimiento")} className="py-8" />
      </Modal>
    );
  }

  const unidad = equipo ? unidadMedidor(equipo.tipo) : "km";
  return (
    <Modal titulo={t("reportar")} onCerrar={onCerrar}>
      <div>
        <label className={labelClases}>{t("equipo")} *</label>
        <select
          value={equipoId ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            setEquipoId(id);
            sugerir(equipos.find((x) => x.id === id) || null, tipo);
          }}
          className={inputClases}
        >
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.codigo} · {e.descripcion || t(`tipo_equipo.${e.tipo}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClases}>{t("tipo")}</label>
        <Opciones
          valores={TIPOS_ORDEN}
          valor={tipo}
          onChange={(v) => {
            setTipo(v);
            sugerir(equipo, v);
          }}
          etiqueta={(v) => t(`tipo_orden.${v}`)}
        />
      </div>
      <div>
        <label className={labelClases}>{t("prioridad_titulo")}</label>
        <Opciones valores={PRIORIDADES} valor={prioridad} onChange={setPrioridad} etiqueta={(v) => t(`prioridad.${v}`)} />
      </div>
      <div>
        <label className={labelClases}>{t("que_hacer")} *</label>
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value.slice(0, 200))}
          placeholder={t(tipo === "preventivo" ? "que_hacer_preventivo_ph" : "que_hacer_correctivo_ph")}
          className={inputClases}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3">
        <div>
          <label className={labelClases}>{t("detalle")}</label>
          <input
            type="text"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value.slice(0, 2000))}
            placeholder={t("detalle_ph")}
            className={inputClases}
          />
        </div>
        <div>
          <label className={labelClases}>{t(`medidor.${unidad}`)}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={medidor}
            onChange={(e) => setMedidor(e.target.value)}
            placeholder={unidad}
            className={inputClases}
          />
        </div>
      </div>
      <div>
        <label className={labelClases}>
          {t("tareas")} <span className="text-slate-400 font-normal tabular-nums">· {tareas.length}</span>
        </label>
        <ul className="space-y-1.5">
          {tareas.map((x) => (
            <li key={x} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="min-w-0 flex-1 break-words">{x}</span>
              <button
                type="button"
                aria-label={t("quitar_tarea")}
                onClick={() => {
                  setTareas((p) => p.filter((y) => y !== x));
                  setTocadas(true);
                }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={nueva}
            onChange={(e) => setNueva(e.target.value.slice(0, 200))}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              agregar();
            }}
            placeholder={t("tarea_nueva")}
            className={`${inputClases} h-10`}
          />
          <BotonSecundario onClick={agregar} disabled={!nueva.trim()} icon={Plus} className="h-10 shrink-0">
            {t("agregar")}
          </BotonSecundario>
        </div>
      </div>
      <ErrorModal error={error} />
      <BotonPrimario
        onClick={() =>
          onGuardar({
            equipo_id: equipoId,
            tipo,
            prioridad,
            titulo: titulo.trim(),
            detalle: detalle.trim() || null,
            medidor: medidor === "" ? null : Number(medidor),
            tareas,
          })
        }
        disabled={enviando || !equipoId || !titulo.trim() || tareas.length === 0}
        icon={enviando ? undefined : Wrench}
        className="w-full h-12"
      >
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("reportar")}
      </BotonPrimario>
    </Modal>
  );
}
