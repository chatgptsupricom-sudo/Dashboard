"use client";

// Centro de gráficas del SuperAdmin (/superadmin/graficas): todas las áreas que
// se pueden medir en un solo tablero. Cada área es una llamada aparte
// (GET /api/superadmin/graficas/<area>), así la que tarda o falla no frena a
// las demás. Datos y reglas en lib/graficas/.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, HandCoins, LayoutGrid, Loader2, Maximize, Minimize,
  Play, RefreshCw, ShoppingCart, Square, Users, Wrench,
} from "lucide-react";
import { AREAS, NOMBRE_AREA, type Area, type DatosArea, type Kpi } from "@/lib/graficas/tipos";
import { Grafica } from "./Grafica";
import { TarjetaGrafica, type PedirDetalle } from "./TarjetaGrafica";
import { fmt, fmtDelta } from "./formato";

type Estado = { estado: "cargando" | "listo" | "error"; datos?: DatosArea; error?: string };
type Pestana = "resumen" | Area;

const ICONO: Record<Pestana, typeof Boxes> = {
  resumen: LayoutGrid,
  ventas: ShoppingCart,
  cobranza: HandCoins,
  inventario: Boxes,
  rma: Wrench,
  rrhh: Users,
};
const PESTANAS: Pestana[] = ["resumen", ...AREAS];
const NOMBRE_PESTANA: Record<Pestana, string> = { resumen: "Resumen", ...NOMBRE_AREA, rma: "RMA", inventario: "Inventario" };
/** Tono de cada área en el resumen (solo el acento del ícono). */
const ACENTO: Record<Area, string> = {
  ventas: "bg-blue-50 text-blue-600",
  cobranza: "bg-emerald-50 text-emerald-600",
  inventario: "bg-amber-50 text-amber-600",
  rma: "bg-violet-50 text-violet-600",
  rrhh: "bg-pink-50 text-pink-600",
};
/** Los indicadores del pulso de arriba, uno o dos por área. */
const PULSO: [Area, string][] = [
  ["ventas", "venta_mes"],
  ["cobranza", "cobrado_mes"],
  ["cobranza", "pct_vencido"],
  ["inventario", "valor"],
  ["rma", "vencidos"],
  ["rrhh", "puntualidad"],
];

const SEDES = [
  { id: "todas", nombre: "Todas" },
  { id: "valencia", nombre: "Valencia" },
  { id: "caracas", nombre: "Caracas" },
  { id: "panama", nombre: "Panamá" },
];

const ROTACION_MS = 20_000;

function hoyMes(): string {
  return new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 7);
}

function opcionesMes(): { id: string; nombre: string }[] {
  const [a, m] = hoyMes().split("-").map(Number);
  const nombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return { id: d.toISOString().slice(0, 7), nombre: `${nombres[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });
}

/** Cuenta animada hasta el valor (respeta "reducir movimiento"). */
function useCuenta(valor: number | null, ms = 900): number | null {
  const [v, setV] = useState<number | null>(valor);
  const desde = useRef(0);
  useEffect(() => {
    if (valor == null) {
      setV(null);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(valor);
      return;
    }
    const inicio = performance.now();
    const de = desde.current;
    let raf = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(de + (valor - de) * e);
      if (p < 1) raf = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms]);
  return v;
}

function Delta({ kpi }: { kpi: Kpi }) {
  if (kpi.delta == null) return null;
  const sube = kpi.delta > 0;
  const bueno = kpi.delta === 0 ? null : (kpi.mejor ?? "sube") === "sube" ? sube : !sube;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${bueno == null ? "bg-slate-100 text-slate-600" : bueno ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
      title={kpi.referencia}
    >
      <Icono className="h-3 w-3" />
      {fmtDelta(kpi.delta)}
    </span>
  );
}

function TarjetaKpi({ kpi, grande = false, area }: { kpi: Kpi; grande?: boolean; area?: Area }) {
  const v = useCuenta(kpi.valor);
  const Icono = area ? ICONO[area] : null;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white ${grande ? "p-5" : "p-4"}`}>
      {grande && <div className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-gradient-to-br from-slate-100/80 to-transparent" />}
      <div className="relative flex items-center gap-2 text-xs font-medium text-slate-500">
        {Icono && area && (
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${ACENTO[area]}`}>
            <Icono className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="truncate">{kpi.etiqueta}</span>
      </div>
      <div className={`mt-2 font-bold tracking-tight text-slate-900 ${grande ? "text-3xl" : "text-2xl"}`}>
        {fmt(v, kpi.formato, true)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 min-h-[20px]">
        <Delta kpi={kpi} />
        {(kpi.nota || (kpi.delta != null && kpi.referencia)) && (
          <span className="text-[11px] text-slate-400 truncate">{kpi.nota || kpi.referencia}</span>
        )}
      </div>
    </div>
  );
}

function EsqueletoKpis({ n = 5 }: { n?: number }) {
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-[112px] rounded-2xl border border-slate-200/80 bg-white p-4">
          <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
          <div className="mt-3 h-7 w-32 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EsqueletoGraficas() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`rounded-2xl border border-slate-200/80 bg-white p-5 ${i === 0 ? "lg:col-span-2" : ""}`}>
          <div className="h-4 w-40 rounded bg-slate-100 animate-pulse" />
          <div className="mt-4 flex h-[240px] items-end gap-2">
            {Array.from({ length: 14 }).map((__, j) => (
              <div key={j} className="flex-1 rounded-t bg-slate-100 animate-pulse" style={{ height: `${25 + ((j * 37) % 70)}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 space-y-0.5">
      {avisos.map((a, i) => (
        <p key={i} className="flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {a}
        </p>
      ))}
    </div>
  );
}

function VistaArea({ estado, contexto, reintentar, pedirDetalle }: { estado?: Estado; contexto: string; reintentar: () => void; pedirDetalle: PedirDetalle }) {
  if (!estado || estado.estado === "cargando") {
    return (
      <div className="space-y-4">
        <EsqueletoKpis />
        <EsqueletoGraficas />
      </div>
    );
  }
  if (estado.estado === "error" || !estado.datos) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-red-800 font-medium">{estado.error || "No se pudieron leer los datos."}</p>
        <button onClick={reintentar} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-100">
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }
  const d = estado.datos;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        {d.kpis.map((k) => <TarjetaKpi key={k.id} kpi={k} />)}
      </div>
      <Avisos avisos={d.avisos} />
      <p className="text-[11px] text-slate-400">
        Datos de las {new Date(d.generado).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}. Se guardan 10 minutos; «Recargar» (R) trae lo último.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {d.graficas.map((g) => <TarjetaGrafica key={`${g.id}-${contexto}`} grafica={g} contexto={contexto} pedirDetalle={pedirDetalle} />)}
      </div>
    </div>
  );
}

function VistaResumen({ estados, ir }: { estados: Partial<Record<Area, Estado>>; ir: (a: Area) => void }) {
  const pulso = PULSO.map(([a, id]) => ({ area: a, kpi: estados[a]?.datos?.kpis.find((k) => k.id === id) }));
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Pulso de la empresa</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {pulso.map(({ area, kpi }, i) =>
            kpi ? (
              <button key={i} type="button" onClick={() => ir(area)} className="text-left transition hover:-translate-y-0.5">
                <TarjetaKpi kpi={kpi} grande area={area} />
              </button>
            ) : (
              <div key={i} className="h-[132px] rounded-2xl border border-slate-200/80 bg-white p-5">
                {estados[area]?.estado === "error" ? (
                  <p className="text-xs text-red-600">No cargó {NOMBRE_PESTANA[area]}</p>
                ) : (
                  <>
                    <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
                    <div className="mt-3 h-8 w-28 rounded bg-slate-100 animate-pulse" />
                  </>
                )}
              </div>
            ),
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {AREAS.map((a) => {
          const e = estados[a];
          const Icono = ICONO[a];
          const principal = e?.datos?.graficas.find((g) => g.tipo !== "dona" && g.datos.length > 1) ?? e?.datos?.graficas[0];
          return (
            <div key={a} className="rounded-2xl border border-slate-200/80 bg-white p-5 flex flex-col">
              <div className="flex items-center gap-2.5">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${ACENTO[a]}`}>
                  <Icono className="h-4 w-4" />
                </span>
                <h3 className="font-semibold text-slate-900 flex-1">{NOMBRE_AREA[a]}</h3>
                {e?.estado === "cargando" && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
                <button type="button" onClick={() => ir(a)} className="text-xs font-medium text-blue-600 hover:underline">
                  Ver todo →
                </button>
              </div>
              {e?.estado === "error" && <p className="mt-4 text-sm text-red-600">{e.error}</p>}
              {e?.datos && (
                <>
                  <dl className="mt-4 grid grid-cols-3 gap-3">
                    {e.datos.kpis.slice(0, 3).map((k) => (
                      <div key={k.id} className="min-w-0">
                        <dt className="text-[11px] text-slate-500 truncate" title={k.etiqueta}>{k.etiqueta}</dt>
                        <dd className="text-base font-bold text-slate-900">{fmt(k.valor, k.formato, true)}</dd>
                      </div>
                    ))}
                  </dl>
                  {principal && (
                    <div className="mt-4 flex-1">
                      <p className="mb-1 text-[11px] font-medium text-slate-400">{principal.titulo}</p>
                      <Grafica grafica={principal} alto={150} compacta />
                    </div>
                  )}
                </>
              )}
              {(!e || e.estado === "cargando") && !e?.datos && (
                <div className="mt-4 flex h-[190px] items-end gap-1.5">
                  {Array.from({ length: 12 }).map((_, j) => (
                    <div key={j} className="flex-1 rounded-t bg-slate-100 animate-pulse" style={{ height: `${30 + ((j * 41) % 60)}%` }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function CentroGraficas() {
  const [sede, setSede] = useState("todas");
  const [mes, setMes] = useState(hoyMes);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [estados, setEstados] = useState<Partial<Record<Area, Estado>>>({});
  const [vuelta, setVuelta] = useState(0);
  const [presentando, setPresentando] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [reloj, setReloj] = useState(() => new Date());
  const raiz = useRef<HTMLDivElement>(null);
  const meses = useMemo(opcionesMes, []);

  // "Recargar" (botón o R) pide al servidor que no use lo guardado de los últimos 10 min.
  const refrescar = useRef(false);
  // El reintento de un área tiene su propio controlador: al cambiar de sede o mes también se cancela.
  const reintento = useRef<AbortController | null>(null);
  const cargar = useCallback((areas: readonly Area[], señal: AbortSignal) => {
    const extra = refrescar.current ? "&refrescar=1" : "";
    refrescar.current = false;
    setEstados((prev) => ({ ...prev, ...Object.fromEntries(areas.map((a) => [a, { estado: "cargando" }])) }));
    for (const a of areas) {
      fetch(`/api/superadmin/graficas/${a}?sede=${sede}&mes=${mes}${extra}`, { signal: señal, cache: "no-store" })
        .then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (señal.aborted) return;
          if (!r.ok || !j.success) throw new Error(j.error || `Error ${r.status}`);
          setEstados((prev) => ({ ...prev, [a]: { estado: "listo", datos: j.data } }));
        })
        .catch((e) => {
          // Abortado (cambió la sede o el mes): la respuesta ya no corresponde a lo que se ve.
          if (señal.aborted || e?.name === "AbortError") return;
          setEstados((prev) => ({ ...prev, [a]: { estado: "error", error: e?.message || "No se pudieron leer los datos." } }));
        });
    }
  }, [sede, mes]);

  useEffect(() => {
    const ctrl = new AbortController();
    cargar(AREAS, ctrl.signal);
    return () => {
      ctrl.abort();
      reintento.current?.abort();
    };
  }, [cargar, vuelta]);

  const reintentar = (a: Area) => {
    reintento.current?.abort();
    reintento.current = new AbortController();
    cargar([a], reintento.current.signal);
  };

  const recargar = () => {
    refrescar.current = true;
    setVuelta((v) => v + 1);
  };

  // Un nivel del detalle de una barra (lo arma el servidor; ver nodoDetalle en lib/graficas/tipos.ts).
  const pedirDetalle = useCallback((area: Area): PedirDetalle => async (grafica, alterna, ruta) => {
    const q = new URLSearchParams({ sede, mes, grafica, ruta: JSON.stringify(ruta) });
    if (alterna) q.set("medida", "alterna");
    const r = await fetch(`/api/superadmin/graficas/${area}?${q}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || `Error ${r.status}`);
    return j.data;
  }, [sede, mes]);

  // Reloj del encabezado.
  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Modo presentación: pasa sola de una pestaña a la otra (para una TV).
  useEffect(() => {
    if (!presentando) return;
    const t = setInterval(() => setPestana((p) => PESTANAS[(PESTANAS.indexOf(p) + 1) % PESTANAS.length]), ROTACION_MS);
    // En presentación (una TV todo el día) los datos se vuelven a pedir cada 15 min.
    const datos = setInterval(() => setVuelta((v) => v + 1), 15 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(datos);
    };
  }, [presentando]);

  useEffect(() => {
    const cambio = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);

  // Atajos: 1-6 cambian de pestaña, R recarga, P presenta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || t.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= PESTANAS.length) setPestana(PESTANAS[n - 1]);
      else if (e.key.toLowerCase() === "r") recargar();
      else if (e.key.toLowerCase() === "p") setPresentando((p) => !p);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const alternarPantalla = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await raiz.current?.requestFullscreen();
    } catch {
      /* el navegador no lo permite: sigue normal */
    }
  };

  const cargando = AREAS.filter((a) => estados[a]?.estado === "cargando").length;
  const contexto = `${sede}-${mes}`;
  const nombreMes = meses.find((m) => m.id === mes)?.nombre ?? mes;

  return (
    <div ref={raiz} className={`space-y-5 ${pantallaCompleta ? "overflow-y-auto bg-[#f8fafc] p-8" : ""}`}>
      {/* Encabezado */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white px-6 py-5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:18px_18px]" />
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-100/70 via-emerald-50/50 to-transparent blur-2xl" />
        <div className="relative flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full ${cargando ? "bg-amber-400 animate-ping" : "bg-emerald-400"} opacity-60`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${cargando ? "bg-amber-500" : "bg-emerald-500"}`} />
              </span>
              {cargando ? `Leyendo ${cargando} de ${AREAS.length} áreas…` : "En vivo · Odoo + panel"}
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Centro de mando</h1>
            <p className="text-sm text-slate-500">
              {nombreMes} · {SEDES.find((s) => s.id === sede)?.nombre === "Todas" ? "las tres sedes" : SEDES.find((s) => s.id === sede)?.nombre} · sin intercompañía ·{" "}
              {reloj.toLocaleString("es-VE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="radiogroup" aria-label="Sede">
              {SEDES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={sede === s.id}
                  onClick={() => setSede(s.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${sede === s.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Mes"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
            >
              {meses.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <button
              type="button"
              onClick={recargar}
              title="Recargar (R)"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setPresentando((p) => !p)}
              title="Modo presentación: cambia de área sola cada 20 s (P)"
              className={`h-10 inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition ${presentando ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {presentando ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {presentando ? "Detener" : "Presentar"}
            </button>
            <button
              type="button"
              onClick={alternarPantalla}
              title="Pantalla completa"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              {pantallaCompleta ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Pestañas */}
        <nav className="relative mt-5 -mb-1 flex gap-1 overflow-x-auto" aria-label="Áreas" role="tablist">
          {PESTANAS.map((p, i) => {
            const Icono = ICONO[p];
            const e = p === "resumen" ? undefined : estados[p];
            const activa = pestana === p;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setPestana(p)}
                title={`${NOMBRE_PESTANA[p]} (${i + 1})`}
                className={`relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${activa ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icono className="h-4 w-4" />
                {NOMBRE_PESTANA[p]}
                {e?.estado === "cargando" && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
                {e?.estado === "error" && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                {presentando && activa && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 origin-left rounded bg-white/70 animate-[progreso_20s_linear_forwards]" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <style>{`@keyframes progreso { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>

      {pestana === "resumen" ? (
        <VistaResumen estados={estados} ir={setPestana} />
      ) : (
        <VistaArea estado={estados[pestana]} contexto={`${pestana}-${contexto}`} reintentar={() => reintentar(pestana)} pedirDetalle={pedirDetalle(pestana)} />
      )}
    </div>
  );
}
