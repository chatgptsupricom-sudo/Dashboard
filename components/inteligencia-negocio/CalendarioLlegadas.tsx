"use client";

import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { Box, CalendarX, ChevronLeft, ChevronRight, Clock, LayoutGrid, Move3d, RotateCcw, Sparkles } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Calendario de llegadas de Por llegar (rol Inteligencia de Negocio): cada
 * día es un bloque que sube según las unidades que llegan ese día. El tablero
 * se gira arrastrando (3D hecho con CSS: perspective + preserve-3d, sin
 * three.js) y en el celular pasa a una vista plana. Al tocar un día, abajo
 * salen sus productos.
 */

export interface LlegadaCal {
  clave: string;
  fecha: string | null;
  producto: string;
  codigo: string;
  marca: string;
  cantidad: number;
  vendido: boolean;
  stock: number;
  unidades12m: number;
  documentos: string;
  proveedor: string;
  sedeNombre: string;
}

type Seleccion = string | "atrasados" | "sin_fecha" | null;

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const VISTA_INICIAL = { x: 50, z: -24 };

const fechaUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDe = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const nombreMes = (a: number, m: number) =>
  inicial(new Date(Date.UTC(a, m, 15)).toLocaleDateString("es-VE", { month: "long", year: "numeric", timeZone: "UTC" }));
const fechaLarga = (iso: string) =>
  inicial(fechaUTC(iso).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
/** Solo la primera letra en mayúscula ("octubre de 2026" → "Octubre de 2026"). */
const inicial = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

interface Dia {
  filas: LlegadaCal[];
  unidades: number;
  nuevos: number;
}

/** Colores del bloque: atrasado (la fecha ya pasó), hoy y próximo. */
const TONOS = {
  atrasado: { arriba: "linear-gradient(135deg,#fbbf24,#f97316)", lado: "#ea7a17", frente: "#c2620f", texto: "text-amber-950", plano: "bg-amber-400" },
  hoy: { arriba: "linear-gradient(135deg,#38bdf8,#2563eb)", lado: "#2563eb", frente: "#1d4ed8", texto: "text-white", plano: "bg-sky-500" },
  proximo: { arriba: "linear-gradient(135deg,#a78bfa,#6366f1)", lado: "#5b5bd6", frente: "#4338ca", texto: "text-white", plano: "bg-indigo-500" },
};
type Tono = keyof typeof TONOS;

function Prisma({ alto, tono, elegido, retraso, children }: { alto: number; tono: Tono; elegido: boolean; retraso: number; children: ReactNode }) {
  const c = TONOS[tono];
  const transicion = `all .7s cubic-bezier(.2,.8,.2,1) ${retraso}ms`;
  const cara: CSSProperties = { position: "absolute", transition: transicion };
  return (
    <div className="absolute inset-[14%]" style={{ transformStyle: "preserve-3d" }}>
      {/* Arriba */}
      <div
        className={`flex flex-col items-center justify-center rounded-[6px] ${c.texto} ${elegido ? "ring-4 ring-white/90" : ""}`}
        style={{ ...cara, inset: 0, transform: `translateZ(${alto}px)`, background: c.arriba, boxShadow: "inset 0 1px 0 rgba(255,255,255,.45)" }}
      >
        {children}
      </div>
      {/* Lados: frente (borde de abajo), atrás, izquierda y derecha */}
      <div style={{ ...cara, left: 0, width: "100%", top: "100%", height: alto, transformOrigin: "top", transform: "rotateX(90deg)", background: c.frente }} />
      <div style={{ ...cara, left: 0, width: "100%", bottom: "100%", height: alto, transformOrigin: "bottom", transform: "rotateX(-90deg)", background: c.frente }} />
      <div style={{ ...cara, top: 0, height: "100%", left: "100%", width: alto, transformOrigin: "left", transform: "rotateY(-90deg)", background: c.lado }} />
      <div style={{ ...cara, top: 0, height: "100%", right: "100%", width: alto, transformOrigin: "right", transform: "rotateY(90deg)", background: c.lado }} />
    </div>
  );
}

export function CalendarioLlegadas<T extends LlegadaCal>({
  filas,
  hoy,
  accion,
}: {
  filas: T[];
  /** YYYY-MM-DD en Caracas. */
  hoy: string;
  /** Botón de cada producto en el detalle del día (ej. Ver ventas). */
  accion?: (f: T) => ReactNode;
}) {
  // Días con llegadas, atrasados y sin fecha.
  const { porDia, atrasados, sinFecha } = useMemo(() => {
    const porDia = new Map<string, Dia>();
    const atrasados: T[] = [];
    const sinFecha: T[] = [];
    for (const f of filas) {
      if (!f.fecha) {
        sinFecha.push(f);
        continue;
      }
      if (f.fecha < hoy) atrasados.push(f);
      const d = porDia.get(f.fecha) ?? { filas: [], unidades: 0, nuevos: 0 };
      d.filas.push(f);
      d.unidades += f.cantidad;
      if (!f.vendido) d.nuevos++;
      porDia.set(f.fecha, d);
    }
    return { porDia, atrasados, sinFecha };
  }, [filas, hoy]);

  // Mes inicial: el de la próxima llegada (o el actual).
  const [mes, setMes] = useState(() => {
    const proxima = [...porDia.keys()].filter((f) => f >= hoy).sort()[0] ?? hoy;
    const d = fechaUTC(proxima);
    return { a: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [encima, setEncima] = useState<string | null>(null);
  const [vista, setVista] = useState<"3d" | "plano">("3d");
  const [rot, setRot] = useState(VISTA_INICIAL);
  const [arrastrando, setArrastrando] = useState(false);
  const [crecido, setCrecido] = useState(false);
  // Solo al crecer los bloques salen escalonados; después responden al instante.
  const [entrando, setEntrando] = useState(false);
  const arrastre = useRef<{ x: number; y: number; rot: typeof VISTA_INICIAL; movio: boolean } | null>(null);

  // En el celular el tablero 3D queda chico: vista plana.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setVista("plano");
  }, []);

  // Los bloques crecen desde el tablero cada vez que cambia el mes o la vista.
  useEffect(() => {
    setCrecido(false);
    setEntrando(true);
    const t = setTimeout(() => setCrecido(true), 60);
    const fin = setTimeout(() => setEntrando(false), 1600);
    return () => {
      clearTimeout(t);
      clearTimeout(fin);
    };
  }, [mes, vista]);

  const celdas = useMemo(() => {
    const primero = new Date(Date.UTC(mes.a, mes.m, 1));
    const offset = (primero.getUTCDay() + 6) % 7;
    const diasMes = new Date(Date.UTC(mes.a, mes.m + 1, 0)).getUTCDate();
    const lista: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= diasMes; d++) lista.push(isoDe(mes.a, mes.m, d));
    while (lista.length % 7) lista.push(null);
    return lista;
  }, [mes]);

  const delMes = useMemo(() => {
    let unidades = 0;
    let productos = 0;
    let max = 0;
    for (const c of celdas) {
      const d = c ? porDia.get(c) : undefined;
      if (!d) continue;
      unidades += d.unidades;
      productos += d.filas.length;
      max = Math.max(max, d.unidades);
    }
    return { unidades, productos, max };
  }, [celdas, porDia]);

  const altoDe = (u: number) => (delMes.max > 0 ? 10 + 86 * Math.sqrt(u / delMes.max) : 0);
  const tonoDe = (dia: string): Tono => (dia < hoy ? "atrasado" : dia === hoy ? "hoy" : "proximo");

  const moverMes = (paso: number) => {
    setSeleccion(null);
    setMes(({ a, m }) => {
      const d = new Date(Date.UTC(a, m + paso, 1));
      return { a: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  // Girar el tablero arrastrando; un arrastre no cuenta como clic en un día.
  const alBajar = (e: ReactPointerEvent) => {
    arrastre.current = { x: e.clientX, y: e.clientY, rot, movio: false };
  };
  const alMover = (e: ReactPointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.movio && Math.hypot(dx, dy) < 5) return;
    if (!a.movio) {
      a.movio = true;
      setArrastrando(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setRot({
      x: Math.min(68, Math.max(0, a.rot.x - dy * 0.25)),
      z: Math.min(40, Math.max(-70, a.rot.z + dx * 0.3)),
    });
  };
  const alSoltar = () => {
    setArrastrando(false);
    // El clic llega después del pointerup: se limpia en el siguiente ciclo.
    setTimeout(() => (arrastre.current = null), 0);
  };
  const elegir = (dia: string) => {
    if (arrastre.current?.movio) return;
    setSeleccion((s) => (s === dia ? null : dia));
  };

  const elegidos: T[] =
    seleccion === "atrasados" ? atrasados : seleccion === "sin_fecha" ? sinFecha : seleccion ? (porDia.get(seleccion)?.filas as T[]) ?? [] : [];
  const tituloElegidos =
    seleccion === "atrasados"
      ? "Con la fecha ya pasada"
      : seleccion === "sin_fecha"
        ? "Sin fecha prevista"
        : seleccion
          ? fechaLarga(seleccion)
          : "";
  const infoEncima = encima ? porDia.get(encima) : undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-gradient-to-b from-slate-50 to-white overflow-hidden">
        {/* Barra: mes, resumen y vista */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 sm:p-4 border-b bg-white/70 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moverMes(-1)} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${mes.a}-${mes.m}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="min-w-[170px] text-center"
              >
                <p className="text-base font-semibold text-slate-900">{nombreMes(mes.a, mes.m)}</p>
                <p className="text-[11px] text-slate-500">
                  {n(delMes.productos)} productos · {n(delMes.unidades)} unidades
                </p>
              </motion.div>
            </AnimatePresence>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moverMes(1)} aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {atrasados.length > 0 && (
              <button
                onClick={() => setSeleccion((s) => (s === "atrasados" ? null : "atrasados"))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${seleccion === "atrasados" ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"}`}
              >
                <Clock className="h-3.5 w-3.5" /> Fecha pasada ({n(atrasados.length)})
              </button>
            )}
            {sinFecha.length > 0 && (
              <button
                onClick={() => setSeleccion((s) => (s === "sin_fecha" ? null : "sin_fecha"))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${seleccion === "sin_fecha" ? "bg-slate-700 text-white border-slate-700" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}
              >
                <CalendarX className="h-3.5 w-3.5" /> Sin fecha ({n(sinFecha.length)})
              </button>
            )}
            <div className="inline-flex rounded-lg border bg-white p-0.5">
              <button
                onClick={() => setVista("3d")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${vista === "3d" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                <Box className="h-3.5 w-3.5" /> 3D
              </button>
              <button
                onClick={() => setVista("plano")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${vista === "plano" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Plano
              </button>
            </div>
          </div>
        </div>

        {vista === "3d" ? (
          <div
            className={`relative h-[560px] select-none touch-none ${arrastrando ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ perspective: "1500px", perspectiveOrigin: "50% 30%" }}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerLeave={alSoltar}
          >
            {/* Fondo con brillo suave */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(99,102,241,0.12),transparent_60%)]" />

            <div
              className="absolute left-1/2 top-[47%] w-[640px]"
              style={{
                transformStyle: "preserve-3d",
                transform: `translate(-50%,-50%) rotateX(${rot.x}deg) rotateZ(${rot.z}deg)`,
                transition: arrastrando ? "none" : "transform .6s cubic-bezier(.2,.8,.2,1)",
              }}
            >
              <div className="grid grid-cols-7 gap-2 mb-2" style={{ transformStyle: "preserve-3d" }}>
                {DIAS_SEMANA.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div
                className="grid grid-cols-7 gap-2 rounded-2xl bg-slate-200/60 p-2 shadow-[0_40px_60px_-30px_rgba(30,41,59,0.45)]"
                style={{ transformStyle: "preserve-3d" }}
              >
                {celdas.map((dia, i) => {
                  if (!dia) return <div key={`v${i}`} className="aspect-square" />;
                  const d = porDia.get(dia);
                  const elegido = seleccion === dia;
                  const resalta = encima === dia;
                  const alto = d && crecido ? altoDe(d.unidades) + (resalta || elegido ? 10 : 0) : 0;
                  return (
                    <div
                      key={dia}
                      onClick={() => d && elegir(dia)}
                      onPointerEnter={() => setEncima(dia)}
                      onPointerLeave={() => setEncima((e) => (e === dia ? null : e))}
                      className={`relative aspect-square rounded-xl border transition-colors ${
                        dia === hoy ? "bg-sky-50 border-sky-300" : "bg-white/90 border-white"
                      } ${d ? "cursor-pointer" : ""}`}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      <span className={`absolute left-1.5 top-1 text-[11px] font-semibold ${dia === hoy ? "text-sky-700" : "text-slate-400"}`}>
                        {fechaUTC(dia).getUTCDate()}
                      </span>
                      {d && (
                        <div style={{ transformStyle: "preserve-3d" }} className="absolute inset-0">
                          <Prisma alto={alto} tono={tonoDe(dia)} elegido={elegido} retraso={entrando ? (i % 7) * 25 + Math.floor(i / 7) * 45 : 0}>
                            <span className="text-[13px] font-bold leading-none tabular-nums">{n(d.unidades)}</span>
                            <span className="text-[9px] opacity-80 leading-none mt-0.5">und</span>
                            {d.nuevos > 0 && (
                              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white shadow">
                                {d.nuevos}
                              </span>
                            )}
                          </Prisma>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lo que hay en el día bajo el puntero */}
            <AnimatePresence>
              {infoEncima && encima && (
                <motion.div
                  key={encima}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  className="pointer-events-none absolute right-3 top-3 w-64 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur"
                >
                  <p className="text-xs font-semibold text-slate-900">{fechaLarga(encima)}</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {n(infoEncima.filas.length)} productos · {n(infoEncima.unidades)} unidades
                    {infoEncima.nuevos > 0 && <span className="text-emerald-700"> · {infoEncima.nuevos} nunca vendidos</span>}
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {[...infoEncima.filas]
                      .sort((a, b) => b.cantidad - a.cantidad)
                      .slice(0, 4)
                      .map((f) => (
                        <li key={f.clave} className="flex justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-700">{f.producto}</span>
                          <span className="shrink-0 tabular-nums text-slate-500">{n(f.cantidad)}</span>
                        </li>
                      ))}
                  </ul>
                  {infoEncima.filas.length > 4 && <p className="mt-1 text-[10px] text-slate-400">y {infoEncima.filas.length - 4} más · toca para ver todo</p>}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute left-3 bottom-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Move3d className="h-3.5 w-3.5" /> Arrastra para girar
              </span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Próximo</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Hoy</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Fecha pasada</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Nunca vendidos</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="absolute right-3 bottom-3 h-8 bg-white/80"
              onClick={() => setRot(VISTA_INICIAL)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Vista inicial
            </Button>
          </div>
        ) : (
          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="text-center text-[10px] sm:text-[11px] font-semibold uppercase text-slate-400">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {celdas.map((dia, i) => {
                if (!dia) return <div key={`v${i}`} />;
                const d = porDia.get(dia);
                const tono = TONOS[tonoDe(dia)];
                return (
                  <motion.button
                    key={dia}
                    type="button"
                    disabled={!d}
                    onClick={() => d && elegir(dia)}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.01 }}
                    whileHover={d ? { y: -3 } : undefined}
                    className={`relative min-h-[64px] sm:min-h-[84px] rounded-xl border p-1.5 text-left transition-shadow ${
                      seleccion === dia ? "ring-2 ring-indigo-500 shadow-md" : d ? "hover:shadow-md" : ""
                    } ${dia === hoy ? "bg-sky-50 border-sky-300" : "bg-white"}`}
                  >
                    <span className={`text-[11px] font-semibold ${dia === hoy ? "text-sky-700" : "text-slate-400"}`}>{fechaUTC(dia).getUTCDate()}</span>
                    {d && (
                      <>
                        <p className="mt-0.5 text-xs sm:text-sm font-bold tabular-nums text-slate-900">{n(d.unidades)}</p>
                        <p className="hidden sm:block text-[10px] text-slate-500">{d.filas.length} prod.</p>
                        <div className="absolute inset-x-1.5 bottom-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${tono.plano}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(8, Math.sqrt(d.unidades / (delMes.max || 1)) * 100)}%` }}
                            transition={{ duration: 0.6, delay: i * 0.01 }}
                          />
                        </div>
                        {d.nuevos > 0 && (
                          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                            {d.nuevos}
                          </span>
                        )}
                      </>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Productos del día elegido */}
      <AnimatePresence mode="wait">
        {seleccion && (
          <motion.div
            key={seleccion}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {tituloElegidos}
                <span className="ml-2 font-normal text-slate-500">
                  {n(elegidos.length)} productos · {n(elegidos.reduce((s, f) => s + f.cantidad, 0))} unidades
                </span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSeleccion(null)}>
                Cerrar
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[...elegidos]
                .sort((a, b) => Number(a.vendido) - Number(b.vendido) || b.cantidad - a.cantidad)
                .map((f, i) => (
                  <motion.div
                    key={f.clave}
                    initial={{ opacity: 0, y: 10, rotateX: -12 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.035 }}
                    whileHover={{ y: -3 }}
                    style={{ transformPerspective: 800 }}
                    className="rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug text-slate-900 line-clamp-2">{f.producto}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {f.codigo} · {f.marca}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xl font-bold tabular-nums text-indigo-700">{n(f.cantidad)}</p>
                        <p className="text-[10px] text-slate-500">por llegar</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {f.vendido ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Ya se vendió</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                          <Sparkles className="h-3 w-3" /> Nuevo en {f.sedeNombre}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Stock {n(f.stock)}</span>
                      {f.vendido && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{n(f.unidades12m)} vendidas en 12 m</span>}
                    </div>
                    <p className="mt-2 truncate text-[11px] text-slate-500" title={`${f.documentos} · ${f.proveedor}`}>
                      {f.sedeNombre} · {f.documentos}
                      {f.proveedor ? ` · ${f.proveedor}` : ""}
                    </p>
                    {accion && <div className="mt-2">{accion(f)}</div>}
                  </motion.div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
