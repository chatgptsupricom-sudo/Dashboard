"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  animate, AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring,
} from "framer-motion";
import {
  AlertTriangle, CalendarRange, Check, ChevronLeft, ChevronRight, Download, Loader2, MapPin, Move3d,
  Plus, Route, Save, Sun, Sunset, Tags, Target, Trash2, Users, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import EscenaSemana3D from "./EscenaSemana3D";
import type { DiaEscena, VisitaEscena } from "@/lib/visitas/escena3d";

type Bloque = "manana" | "tarde";
type Estado = "planificada" | "realizada" | "no_realizada";
interface FilaMatriz { clave: string; candidatos: string; puntaje: string; estatus: string }
interface Item {
  id?: number;
  fecha: string;
  bloque: Bloque;
  zona: string;
  cliente: string;
  tema: string;
  objetivo: string;
  foranea: boolean;
  estado: Estado;
  nota: string;
}
interface Plan {
  id?: number;
  userId: number;
  vendedor: string;
  semanaInicio: string;
  semanaNumero: number;
  zonaRuta: string;
  marcasPriorizadas: string;
  matriz: FilaMatriz[];
  items: Item[];
  actualizadoPor?: string | null;
  actualizadoEl?: string | null;
}
interface Asesor { userId: number; nombre: string }
interface Resumen {
  userId: number;
  vendedor: string;
  planes: number;
  planificadas: number;
  foraneasPlanificadas: number;
  foraneasVencidas: number;
  foraneasRealizadas: number;
  realizadas: number;
  noRealizadas: number;
  cobertura: number | null;
}

// Mismos criterios que lib/visitas/planificacion.ts (formato PL-CAP-01).
const CRITERIOS = [
  { clave: "baja_rotacion", criterio: "Prioridad 1: Baja rotación / Inventario detenido", peso: 35 },
  { clave: "producto_nuevo", criterio: "Prioridad 2: Producto nuevo / Entrante", peso: 25 },
  { clave: "necesidad_cliente", criterio: "Prioridad 3: Necesidad detectada en clientes", peso: 20 },
  { clave: "complejidad_tecnica", criterio: "Complejidad técnica: Demostración / Configuración", peso: 10 },
  { clave: "marcas_clave", criterio: "Importancia estratégica: Marcas clave", peso: 10 },
];
const META_SEMANA = 7;
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DIAS_CORTOS = ["LUN", "MAR", "MIÉ", "JUE", "VIE"];
const BLOQUES: { v: Bloque; label: string }[] = [{ v: "manana", label: "Mañana" }, { v: "tarde", label: "Tarde" }];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const sumarDias = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const lunesDe = (s: string) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const corta = (s: string) => parse(s).toLocaleDateString("es-VE", { day: "numeric", month: "short" });
const hoy = () => ymd(new Date());
const clave = (fecha: string, bloque: Bloque) => `${fecha}|${bloque}`;

const itemVacio = (fecha: string, bloque: Bloque): Item => ({ fecha, bloque, zona: "", cliente: "", tema: "", objetivo: "", foranea: true, estado: "planificada", nota: "" });

const ESTADO_UI: Record<Estado, { label: string; cls: string; barra: string; punto: string }> = {
  planificada: { label: "Planificada", cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200", barra: "bg-blue-500", punto: "bg-blue-500" },
  realizada: { label: "Realizada", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", barra: "bg-emerald-500", punto: "bg-emerald-500" },
  no_realizada: { label: "No realizada", cls: "bg-red-50 text-red-700 ring-1 ring-red-200", barra: "bg-red-500", punto: "bg-red-500" },
};

const colorCobertura = (c: number | null) =>
  c == null ? "#94a3b8" : c >= 100 ? "#10b981" : c >= 70 ? "#f59e0b" : "#ef4444";

/**
 * Planificación de rutas y visitas (PL-CAP-01): el asesor arma su plan de la
 * semana; la gerencia lo revisa, marca las visitas realizadas y ve la
 * cobertura territorial del mes por asesor. La semana se ve en 3D
 * (EscenaSemana3D) y en un tablero; cada puesto se edita en el panel lateral.
 */
export default function PlanificacionVisitas() {
  const [semana, setSemana] = useState(() => lunesDe(hoy()));
  const [userId, setUserId] = useState<number | null>(null);
  const [rol, setRol] = useState<"vendedor" | "gerencia" | "lectura">("vendedor");
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cambios, setCambios] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tab, setTab] = useState<"plan" | "resumen">("plan");
  const [resumen, setResumen] = useState<Resumen[] | null>(null);
  const [marcando, setMarcando] = useState<number | null>(null);
  const [sel, setSel] = useState<{ fecha: string; bloque: Bloque } | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);

  const mesDeSemana = semana.slice(0, 7);
  const editable = rol !== "lectura";

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ semana });
      if (userId) p.set("user_id", String(userId));
      const r = await fetch(`/api/visitas/planificacion?${p}`, { credentials: "include" });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error(json?.error || "No se pudo cargar el plan");
      setRol(json.data.rol);
      setAsesores(json.data.asesores || []);
      setPlan(json.data.plan);
      if (json.data.plan && !userId) setUserId(json.data.plan.userId);
      setCambios(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [semana, userId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/visitas/planificacion/resumen?mes=${mesDeSemana}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => { if (!cancelado && j?.success) setResumen(j.data.asesores || []); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [mesDeSemana, plan?.id, marcando]);

  // Aviso antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!cambios) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cambios]);

  const cambiarSemana = (delta: number) => {
    if (cambios && !confirm("Hay cambios sin guardar. ¿Salir de esta semana igual?")) return;
    setSel(null);
    setSemana((s) => sumarDias(s, delta * 7));
  };
  const cambiarAsesor = (id: number) => {
    if (cambios && !confirm("Hay cambios sin guardar. ¿Cambiar de asesor igual?")) return;
    setSel(null);
    setUserId(id);
  };

  const editar = (fn: (p: Plan) => Plan) => { setPlan((p) => (p ? fn(p) : p)); setCambios(true); };
  const itemDe = (fecha: string, bloque: Bloque) => plan?.items.find((i) => i.fecha === fecha && i.bloque === bloque);
  const editarItem = (fecha: string, bloque: Bloque, campo: keyof Item, valor: any) =>
    editar((p) => {
      const existe = p.items.some((i) => i.fecha === fecha && i.bloque === bloque);
      const items = existe
        ? p.items.map((i) => (i.fecha === fecha && i.bloque === bloque ? { ...i, [campo]: valor } : i))
        : [...p.items, { ...itemVacio(fecha, bloque), [campo]: valor }];
      return { ...p, items };
    });
  // Al guardar, un puesto sin cliente se borra del plan (lib/visitas/planificacion.ts).
  const vaciarItem = (fecha: string, bloque: Bloque) =>
    editar((p) => ({
      ...p,
      items: p.items.map((i) => (i.fecha === fecha && i.bloque === bloque ? { ...i, zona: "", cliente: "", tema: "", objetivo: "" } : i)),
    }));
  const editarMatriz = (clave: string, campo: keyof FilaMatriz, valor: string) =>
    editar((p) => ({ ...p, matriz: p.matriz.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)) }));

  const guardar = async () => {
    if (!plan) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/visitas/planificacion", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error(json?.error || "No se pudo guardar");
      setPlan(json.data.plan);
      setCambios(false);
      setAviso("Plan guardado");
      setTimeout(() => setAviso(null), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  /** `nota` viene del panel lateral; desde el tablero se pide con prompt. */
  const marcar = async (item: Item, estado: Estado, notaPanel?: string) => {
    if (!item.id) return;
    let nota = notaPanel ?? item.nota;
    if (estado === "no_realizada" && notaPanel === undefined) {
      const n = prompt("¿Por qué no se realizó? (opcional)", item.nota || "");
      if (n === null) return;
      nota = n;
    }
    setMarcando(item.id);
    try {
      const r = await fetch("/api/visitas/planificacion/marcar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, estado, nota }),
      });
      if (!r.ok) throw new Error();
      setPlan((p) => (p ? { ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, estado, nota } : i)) } : p));
    } catch {
      setError("No se pudo marcar la visita");
    } finally {
      setMarcando(null);
    }
  };

  const items = plan?.items || [];
  const conCliente = items.filter((i) => i.cliente.trim());
  const planificadas = conCliente.length;
  const realizadasSemana = conCliente.filter((i) => i.estado === "realizada").length;
  const noRealizadasSemana = conCliente.filter((i) => i.estado === "no_realizada").length;
  const foraneasSemana = conCliente.filter((i) => i.foranea).length;
  const miResumen = resumen?.find((r) => r.userId === plan?.userId);

  const diasEscena = useMemo<DiaEscena[]>(() => {
    if (!plan) return [];
    const h = hoy();
    return DIAS_CORTOS.map((nombre, d) => {
      const fecha = sumarDias(plan.semanaInicio, d);
      return { fecha, nombre, fechaCorta: corta(fecha), hoy: fecha === h, pasado: fecha < h };
    });
  }, [plan?.semanaInicio]);
  const visitasEscena = useMemo<VisitaEscena[]>(
    () => items.map((i) => ({ fecha: i.fecha, bloque: i.bloque, cliente: i.cliente, zona: i.zona, foranea: i.foranea, estado: i.estado })),
    [items],
  );

  const descargarExcel = async () => {
    if (!plan) return;
    const XLSX = await import("xlsx");
    const filas: any[][] = [
      ["FORMATO DE PLANIFICACIÓN DE RUTAS Y VISITAS (PL-CAP-01)"],
      ["Asesor:", plan.vendedor, "", "Semana N°:", plan.semanaNumero],
      ["Zona / Ruta:", plan.zonaRuta, "", "Fecha:", `${corta(plan.semanaInicio)} – ${corta(sumarDias(plan.semanaInicio, 4))}`],
      ["Marcas priorizadas:", plan.marcasPriorizadas],
      [],
      ["1. MATRIZ DE PONDERACIÓN DE SELECCIÓN DE PRODUCTOS"],
      ["Criterio de selección", "Peso (%)", "Marcas / Productos candidatos", "Puntaje obtenido", "Estatus"],
      ...CRITERIOS.map((c) => {
        const f = plan.matriz.find((m) => m.clave === c.clave);
        return [c.criterio, `${c.peso}%`, f?.candidatos || "", f?.puntaje || "", f?.estatus || ""];
      }),
      [],
      [`2. CRONOGRAMA Y RUTA GEOGRÁFICA SEMANAL (META: >= ${META_SEMANA} VISITAS)`],
      ["Día / Bloque", "Zona / Ciudad", "Cliente objetivo", "Tema / Producto a capacitar", "Objetivo de la visita", "Foránea", "Estado"],
      ...DIAS.flatMap((dia, d) => BLOQUES.map((b) => {
        const it = itemDe(sumarDias(plan.semanaInicio, d), b.v);
        return [`${dia} (${b.label})`, it?.zona || "", it?.cliente || "", it?.tema || "", it?.objetivo || "",
          it?.cliente ? (it.foranea ? "Sí" : "No") : "", it?.cliente ? ESTADO_UI[it.estado].label : ""];
      })),
    ];
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws["!cols"] = [{ wch: 48 }, { wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 44 }, { wch: 9 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PL-CAP-01");
    XLSX.writeFile(wb, `PL-CAP-01_${plan.vendedor.replace(/\s+/g, "_")}_semana_${plan.semanaNumero}.xlsx`);
  };

  // Puestos en orden (lunes mañana → viernes tarde) para moverse en el panel.
  const puestos = plan ? DIAS.flatMap((_, d) => BLOQUES.map((b) => ({ fecha: sumarDias(plan.semanaInicio, d), bloque: b.v }))) : [];
  const indiceSel = sel ? puestos.findIndex((p) => p.fecha === sel.fecha && p.bloque === sel.bloque) : -1;
  const moverSel = (delta: number) => {
    const n = puestos[indiceSel + delta];
    if (n) setSel(n);
  };

  const glass = "border border-white/10 bg-white/[0.06] backdrop-blur-md";

  return (
    <div className="space-y-5">
      {/* Encabezado + escena 3D */}
      <section className="relative overflow-clip rounded-3xl bg-gradient-to-b from-[#0a1229] via-[#0b1630] to-[#0b1630] text-white shadow-[0_30px_60px_-25px_rgba(15,23,42,0.6)]">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-blue-600/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-4 px-4 pt-5 md:px-6">
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ rotateY: -40, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 14 }}
              className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-[0_10px_25px_-5px_rgba(59,130,246,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]"
            >
              <MapPin className="w-6 h-6 text-white drop-shadow" />
            </motion.div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight">Planificación de rutas y visitas</h1>
              <p className="text-sm text-blue-100/70">Formato PL-CAP-01 · meta ≥ {META_SEMANA} visitas por semana</p>
            </div>
          </div>
          {rol === "gerencia" && (
            <div className={`relative inline-flex rounded-xl p-1 ${glass}`}>
              {(["plan", "resumen"] as const).map((tb) => (
                <button
                  key={tb}
                  onClick={() => setTab(tb)}
                  className={`relative px-4 h-8 rounded-lg text-sm font-semibold transition-colors ${tab === tb ? "text-white" : "text-blue-100/70 hover:text-white"}`}
                >
                  {tab === tb && (
                    <motion.span layoutId="tab-visitas" className="absolute inset-0 rounded-lg bg-blue-600 shadow-lg shadow-blue-900/50" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                  )}
                  <span className="relative">{tb === "plan" ? "Plan semanal" : "Resumen del mes"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === "plan" || rol !== "gerencia" ? (
          <>
            {/* Controles */}
            <div className="relative mt-4 flex flex-wrap items-center gap-2 px-4 md:px-6">
              {rol !== "vendedor" && asesores.length > 0 && (
                <select
                  value={userId ?? ""}
                  onChange={(e) => cambiarAsesor(Number(e.target.value))}
                  className={`h-9 px-3 rounded-lg text-sm font-semibold text-white ${glass} [&>option]:text-slate-900`}
                >
                  {asesores.map((a) => <option key={a.userId} value={a.userId}>{a.nombre}</option>)}
                </select>
              )}
              <div className={`flex items-center rounded-lg ${glass}`}>
                <button onClick={() => cambiarSemana(-1)} className="p-2 hover:bg-white/10 rounded-l-lg" aria-label="Semana anterior"><ChevronLeft size={16} /></button>
                <span className="px-2 text-sm font-semibold whitespace-nowrap">
                  <CalendarRange size={14} className="inline mr-1.5 -mt-0.5 text-blue-200/70" />
                  Semana {plan?.semanaNumero ?? "–"} · {corta(plan?.semanaInicio ?? semana)} – {corta(sumarDias(plan?.semanaInicio ?? semana, 4))}
                </span>
                <button onClick={() => cambiarSemana(1)} className="p-2 hover:bg-white/10 rounded-r-lg" aria-label="Semana siguiente"><ChevronRight size={16} /></button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <AnimatePresence>
                  {aviso && (
                    <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-semibold text-emerald-300">
                      {aviso}
                    </motion.span>
                  )}
                </AnimatePresence>
                {cambios && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" /> Cambios sin guardar
                  </span>
                )}
                <button
                  onClick={descargarExcel}
                  disabled={!plan}
                  className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium hover:bg-white/10 disabled:opacity-40 ${glass}`}
                >
                  <Download size={15} /> Excel
                </button>
                {editable && (
                  <BotonGuardar onClick={guardar} disabled={!plan || !cambios || guardando} guardando={guardando} />
                )}
              </div>
            </div>

            {/* Escena */}
            <div className="relative mt-3">
              {plan ? (
                <>
                  <EscenaSemana3D
                    dias={diasEscena}
                    visitas={visitasEscena}
                    seleccion={sel ? clave(sel.fecha, sel.bloque) : null}
                    resaltado={resaltado}
                    onSeleccion={(fecha, bloque) => setSel({ fecha, bloque })}
                    onEncima={setResaltado}
                    className="h-[320px] sm:h-[360px] lg:h-[420px]"
                  />
                  <div className="pointer-events-none absolute left-4 top-3 md:left-6 hidden sm:flex items-center gap-2 text-[11px] text-blue-100/70">
                    <Move3d size={14} /> Arrastra para girar · toca un puesto para editarlo
                  </div>
                  {/* En el teléfono va debajo de la escena: encima tapaba un tercio. */}
                  <div className="pointer-events-none flex flex-wrap items-end justify-between gap-2 px-4 pb-4 pt-1 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-[#0b1630] sm:via-[#0b1630]/70 sm:to-transparent sm:pt-10 md:px-6">
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                      {(["planificada", "realizada", "no_realizada"] as Estado[]).map((e) => (
                        <span key={e} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${glass}`}>
                          <span className={`h-2 w-2 rounded-full ${ESTADO_UI[e].punto}`} /> {ESTADO_UI[e].label}
                        </span>
                      ))}
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${glass}`}>
                        <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-400" /> Foránea
                      </span>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs ${glass}`}>
                      <Route size={14} className="text-cyan-300" />
                      <span><b className="tabular-nums">{planificadas}</b> paradas · <b className="tabular-nums">{foraneasSemana}</b> foráneas</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[300px] sm:h-[360px] flex items-center justify-center text-sm text-blue-100/60">
                  {cargando ? <Loader2 className="animate-spin" /> : rol === "vendedor" ? "Tu usuario no está registrado como asesor de esta sede." : "No hay asesores activos en esta sede."}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-6" />
        )}
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {tab === "resumen" && rol === "gerencia" ? (
        <ResumenMes resumen={resumen} mes={mesDeSemana} onVer={(id) => { setUserId(id); setSel(null); setTab("plan"); }} />
      ) : plan ? (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Tilt>
              <Indicador
                titulo="Visitas planificadas esta semana"
                valor={planificadas / META_SEMANA}
                color={planificadas >= META_SEMANA ? "#10b981" : "#f59e0b"}
                centro={<><Contador valor={planificadas} /><span className="text-xs text-slate-400">/{META_SEMANA}</span></>}
                pie={planificadas >= META_SEMANA ? "Meta de la semana cumplida" : `${META_SEMANA - planificadas === 1 ? "Falta" : "Faltan"} ${META_SEMANA - planificadas} para la meta`}
                icono={<Target size={14} />}
              />
            </Tilt>
            <Tilt>
              <Indicador
                titulo="Foráneas realizadas en el mes"
                valor={miResumen?.foraneasVencidas ? (miResumen.foraneasRealizadas / miResumen.foraneasVencidas) : 0}
                color="#06b6d4"
                centro={<><Contador valor={miResumen?.foraneasRealizadas ?? 0} /><span className="text-xs text-slate-400">/{miResumen?.foraneasVencidas ?? 0}</span></>}
                pie="realizadas / planificadas a la fecha"
                icono={<Route size={14} />}
              />
            </Tilt>
            <Tilt>
              <Indicador
                titulo="Cobertura territorial del mes"
                valor={(miResumen?.cobertura ?? 0) / 100}
                color={colorCobertura(miResumen?.cobertura ?? null)}
                marca={0.7}
                centro={miResumen?.cobertura == null ? <span className="text-slate-400">–</span> : <><Contador valor={miResumen.cobertura} /><span className="text-xs text-slate-400">%</span></>}
                pie="foráneas realizadas ÷ planificadas · mínimo 70%"
                icono={<MapPin size={14} />}
              />
            </Tilt>
            <Tilt>
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Check size={14} /> Estado de la semana</p>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-3xl font-black text-emerald-600 tabular-nums"><Contador valor={realizadasSemana} /></span>
                  <span className="text-sm text-slate-500">realizadas</span>
                  <span className="ml-auto text-sm font-semibold text-red-600 tabular-nums">{noRealizadasSemana} no</span>
                </div>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                  {[
                    { n: realizadasSemana, c: "bg-emerald-500" },
                    { n: noRealizadasSemana, c: "bg-red-500" },
                    { n: planificadas - realizadasSemana - noRealizadasSemana, c: "bg-blue-400" },
                  ].map((s, i) => (
                    <motion.div key={i} className={s.c} initial={{ width: 0 }} animate={{ width: planificadas ? `${(s.n / planificadas) * 100}%` : 0 }} transition={{ duration: 0.8, delay: 0.1 * i }} />
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{planificadas - realizadasSemana - noRealizadasSemana} pendientes de marcar</p>
              </div>
            </Tilt>
          </div>

          {/* Datos generales */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CampoGeneral icono={<Route size={16} />} etiqueta="Zona / Ruta" valor={plan.zonaRuta} placeholder="Ej.: Maracay – La Victoria"
              disabled={!editable} onChange={(v) => editar((p) => ({ ...p, zonaRuta: v }))} />
            <CampoGeneral icono={<Tags size={16} />} etiqueta="Marcas priorizadas" valor={plan.marcasPriorizadas} placeholder="Ej.: BLUETTI – FORZA"
              disabled={!editable} onChange={(v) => editar((p) => ({ ...p, marcasPriorizadas: v }))} />
          </section>

          {/* Cronograma: tablero de la semana */}
          <section className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 md:p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Cronograma y ruta semanal <span className="font-normal text-slate-500">· meta ≥ {META_SEMANA} visitas</span>
              </h2>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.max(META_SEMANA, planificadas) }).map((_, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 18 }}
                    className={`h-2.5 w-2.5 rounded-full ${i < planificadas ? (planificadas >= META_SEMANA ? "bg-emerald-500" : "bg-blue-500") : "bg-slate-200"}`}
                  />
                ))}
              </div>
            </div>
            <div className="-mx-4 px-4 md:mx-0 md:px-0 grid grid-flow-col auto-cols-[minmax(230px,82%)] sm:auto-cols-[minmax(230px,45%)] md:grid-flow-row md:auto-cols-auto md:grid-cols-5 gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-2 md:pb-0">
              {DIAS.map((dia, d) => {
                const fecha = sumarDias(plan.semanaInicio, d);
                const esHoy = fecha === hoy();
                const delDia = BLOQUES.filter((b) => itemDe(fecha, b.v)?.cliente.trim()).length;
                return (
                  <motion.div
                    key={fecha}
                    initial={{ opacity: 0, y: 24, rotateX: -12 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ delay: d * 0.06, type: "spring", stiffness: 140, damping: 18 }}
                    style={{ transformPerspective: 900 }}
                    className={`snap-start rounded-2xl p-2.5 ${esHoy ? "bg-blue-600/[0.06] ring-2 ring-blue-500/40" : "bg-slate-100/70"}`}
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <div>
                        <p className={`text-sm font-bold ${esHoy ? "text-blue-700" : "text-slate-800"}`}>{dia}</p>
                        <p className="text-[11px] text-slate-500">{corta(fecha)}</p>
                      </div>
                      {esHoy ? (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow shadow-blue-300">HOY</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{delDia}/2</span>
                      )}
                    </div>
                    <div className="space-y-2.5">
                      {BLOQUES.map((b) => {
                        const it = itemDe(fecha, b.v) || itemVacio(fecha, b.v);
                        const k = clave(fecha, b.v);
                        return (
                          <TarjetaPuesto
                            key={k}
                            item={it}
                            bloque={b}
                            editable={editable && it.estado !== "realizada"}
                            elegido={!!sel && sel.fecha === fecha && sel.bloque === b.v}
                            resaltado={resaltado === k}
                            puedeMarcar={rol === "gerencia" && !!it.id && !cambios}
                            marcando={marcando === it.id}
                            onAbrir={() => setSel({ fecha, bloque: b.v })}
                            onEncima={(on) => setResaltado(on ? k : null)}
                            onMarcar={(e) => marcar(it, e)}
                          />
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Matriz */}
          <section className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Matriz de ponderación de selección de productos</h2>
            <div className="space-y-2.5">
              {CRITERIOS.map((c, i) => {
                const f = plan.matriz.find((m) => m.clave === c.clave) || { clave: c.clave, candidatos: "", puntaje: "", estatus: "" };
                const inp = "w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500 transition";
                return (
                  <motion.div
                    key={c.clave}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,1fr)] gap-2 lg:gap-3 items-center rounded-2xl border border-slate-100 bg-slate-50/60 p-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.criterio}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${(c.peso / 35) * 100}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.9, delay: 0.1 + i * 0.05 }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs font-bold text-blue-700 tabular-nums">{c.peso}%</span>
                      </div>
                    </div>
                    <input aria-label="Marcas / productos candidatos" placeholder="Marcas / productos candidatos" className={inp} disabled={!editable} value={f.candidatos} onChange={(e) => editarMatriz(c.clave, "candidatos", e.target.value)} />
                    <input aria-label="Puntaje obtenido" placeholder="Puntaje" className={inp} disabled={!editable} value={f.puntaje} onChange={(e) => editarMatriz(c.clave, "puntaje", e.target.value)} />
                    <input aria-label="Estatus" placeholder="Estatus" className={inp} disabled={!editable} value={f.estatus} onChange={(e) => editarMatriz(c.clave, "estatus", e.target.value)} />
                  </motion.div>
                );
              })}
            </div>
          </section>

          <p className="text-[11px] leading-relaxed text-slate-400">
            {rol === "gerencia"
              ? "Guarda el plan antes de marcar visitas. Al marcar una visita como realizada queda registrada también en las visitas del Stoplight; una visita realizada ya no se puede editar ni borrar del plan."
              : "La gerencia marca las visitas realizadas. Una visita realizada ya no se puede editar ni borrar del plan."}
            {" "}Cobertura territorial = visitas foráneas realizadas ÷ foráneas planificadas hasta hoy.
            {plan.actualizadoPor && plan.actualizadoEl && ` Último cambio: ${plan.actualizadoPor}, ${new Date(plan.actualizadoEl).toLocaleString("es-VE")}.`}
          </p>

          <EditorPuesto
            abierto={!!sel}
            onCerrar={() => setSel(null)}
            item={sel ? (itemDe(sel.fecha, sel.bloque) || itemVacio(sel.fecha, sel.bloque)) : null}
            dia={sel ? DIAS[Math.round((parse(sel.fecha).getTime() - parse(plan.semanaInicio).getTime()) / 864e5)] : ""}
            editable={editable}
            esGerencia={rol === "gerencia"}
            marcando={marcando}
            cambios={cambios}
            guardando={guardando}
            onEditar={(campo, valor) => sel && editarItem(sel.fecha, sel.bloque, campo, valor)}
            onVaciar={() => sel && vaciarItem(sel.fecha, sel.bloque)}
            onMarcar={(it, e, nota) => marcar(it, e, nota)}
            onGuardar={guardar}
            onAnterior={indiceSel > 0 ? () => moverSel(-1) : undefined}
            onSiguiente={indiceSel >= 0 && indiceSel < puestos.length - 1 ? () => moverSel(1) : undefined}
          />
        </>
      ) : cargando ? (
        <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
      ) : null}
    </div>
  );
}

// ── Piezas ─────────────────────────────────────────────────────────────────

function BotonGuardar({ onClick, disabled, guardando }: { onClick: () => void; disabled: boolean; guardando: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-b from-blue-500 to-blue-700 text-white text-sm font-semibold shadow-[0_6px_16px_-4px_rgba(37,99,235,0.7),inset_0_1px_0_rgba(255,255,255,0.3)] disabled:opacity-40 disabled:shadow-none"
    >
      {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
    </motion.button>
  );
}

/** Inclina la tarjeta hacia el puntero, con un brillo que lo sigue. */
function Tilt({ children, fuerza = 8, className = "" }: { children: ReactNode; fuerza?: number; className?: string }) {
  const reducido = useReducedMotion();
  const rx = useSpring(0, { stiffness: 220, damping: 18 });
  const ry = useSpring(0, { stiffness: 220, damping: 18 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const brillo = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.55), transparent 55%)`;
  const [encima, setEncima] = useState(false);

  if (reducido) return <div className={`h-full ${className}`}>{children}</div>;
  return (
    <motion.div
      className={`relative h-full ${className}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry.set((px - 0.5) * fuerza * 2);
        rx.set(-(py - 0.5) * fuerza * 2);
        gx.set(px * 100);
        gy.set(py * 100);
      }}
      onPointerEnter={() => setEncima(true)}
      onPointerLeave={() => { rx.set(0); ry.set(0); setEncima(false); }}
      whileHover={{ scale: 1.015 }}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl mix-blend-soft-light"
        style={{ background: brillo, opacity: encima ? 1 : 0, transition: "opacity .25s" }}
      />
    </motion.div>
  );
}

function Contador({ valor }: { valor: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previo = useRef(0);
  useEffect(() => {
    const c = animate(previo.current, valor, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => { if (ref.current) ref.current.textContent = String(Math.round(v)); },
    });
    previo.current = valor;
    return () => c.stop();
  }, [valor]);
  return <span ref={ref} className="tabular-nums">{valor}</span>;
}

/** Anillo de avance; `marca` dibuja una muesca (p. ej. el mínimo de 70%). */
function Anillo({ valor, color, marca, children }: { valor: number; color: string; marca?: number; children: ReactNode }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(1, valor || 0));
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={R} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <motion.circle
          cx="38" cy="38" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - v) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
        />
        {marca != null && (
          <line
            x1={38 + (R - 6) * Math.cos(marca * 2 * Math.PI)} y1={38 + (R - 6) * Math.sin(marca * 2 * Math.PI)}
            x2={38 + (R + 6) * Math.cos(marca * 2 * Math.PI)} y2={38 + (R + 6) * Math.sin(marca * 2 * Math.PI)}
            stroke="#334155" strokeWidth="2" strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-900">{children}</div>
    </div>
  );
}

function Indicador({ titulo, valor, color, centro, pie, icono, marca }: {
  titulo: string; valor: number; color: string; centro: ReactNode; pie: string; icono: ReactNode; marca?: number;
}) {
  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icono} {titulo}</p>
      <div className="mt-2 flex items-center gap-4">
        <Anillo valor={valor} color={color} marca={marca}>{centro}</Anillo>
        <p className="text-xs leading-snug text-slate-500">{pie}</p>
      </div>
    </div>
  );
}

function CampoGeneral({ icono, etiqueta, valor, placeholder, disabled, onChange }: {
  icono: ReactNode; etiqueta: string; valor: string; placeholder: string; disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <label className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-focus-within:bg-blue-600 group-focus-within:text-white transition-colors">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{etiqueta}</span>
        <input
          className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-300 focus:outline-none disabled:text-slate-500"
          disabled={disabled} value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  );
}

function TarjetaPuesto({ item, bloque, editable, elegido, resaltado, puedeMarcar, marcando, onAbrir, onEncima, onMarcar }: {
  item: Item;
  bloque: { v: Bloque; label: string };
  editable: boolean;
  elegido: boolean;
  resaltado: boolean;
  puedeMarcar: boolean;
  marcando: boolean;
  onAbrir: () => void;
  onEncima: (on: boolean) => void;
  onMarcar: (e: Estado) => void;
}) {
  const tiene = !!item.cliente.trim();
  const Icono = bloque.v === "manana" ? Sun : Sunset;
  const anillo = elegido ? "ring-2 ring-blue-500 shadow-lg shadow-blue-500/20" : resaltado ? "ring-2 ring-blue-300" : "";

  if (!tiene) {
    return (
      <motion.button
        type="button"
        onClick={onAbrir}
        onMouseEnter={() => onEncima(true)}
        onMouseLeave={() => onEncima(false)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className={`flex w-full min-h-[118px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-white/50 text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-white transition-colors ${anillo}`}
      >
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"><Icono size={12} /> {bloque.label}</span>
        {editable ? <span className="flex items-center gap-1 text-sm font-semibold"><Plus size={15} /> Agregar visita</span> : <span className="text-sm">Sin visita</span>}
      </motion.button>
    );
  }

  const ui = ESTADO_UI[item.estado];
  return (
    <Tilt fuerza={6}>
      <div
        role="button"
        tabIndex={0}
        onClick={onAbrir}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        onMouseEnter={() => onEncima(true)}
        onMouseLeave={() => onEncima(false)}
        className={`relative w-full min-h-[118px] cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-4 text-left shadow-[0_8px_20px_-12px_rgba(15,23,42,0.35)] transition-shadow hover:shadow-[0_16px_30px_-14px_rgba(15,23,42,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${anillo}`}
      >
        <span className={`absolute inset-y-0 left-0 w-1.5 ${ui.barra}`} />
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icono size={12} /> {bloque.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.cls}`}>{ui.label}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900">{item.cliente}</p>
        {item.zona && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin size={11} className="shrink-0" /> {item.zona}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {item.foranea && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">Foránea</span>}
          {item.tema && <span className="max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{item.tema}</span>}
        </div>
        {puedeMarcar && (
          <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onMarcar(item.estado === "realizada" ? "planificada" : "realizada")}
              disabled={marcando}
              title={item.estado === "realizada" ? "Desmarcar" : "Marcar realizada"}
              className={`inline-flex flex-1 items-center justify-center gap-1 h-7 rounded-lg text-[11px] font-semibold transition-colors ${item.estado === "realizada" ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"}`}
            >
              {marcando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Realizada
            </button>
            <button
              onClick={() => onMarcar(item.estado === "no_realizada" ? "planificada" : "no_realizada")}
              disabled={marcando}
              title={item.nota || (item.estado === "no_realizada" ? "Desmarcar" : "Marcar no realizada")}
              className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold transition-colors ${item.estado === "no_realizada" ? "bg-red-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700"}`}
            >
              <X size={12} /> No
            </button>
          </div>
        )}
      </div>
    </Tilt>
  );
}

function EditorPuesto({
  abierto, onCerrar, item, dia, editable, esGerencia, marcando, cambios, guardando,
  onEditar, onVaciar, onMarcar, onGuardar, onAnterior, onSiguiente,
}: {
  abierto: boolean;
  onCerrar: () => void;
  item: Item | null;
  dia: string;
  editable: boolean;
  esGerencia: boolean;
  marcando: number | null;
  cambios: boolean;
  guardando: boolean;
  onEditar: (campo: keyof Item, valor: any) => void;
  onVaciar: () => void;
  onMarcar: (it: Item, e: Estado, nota: string) => void;
  onGuardar: () => void;
  onAnterior?: () => void;
  onSiguiente?: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  useEffect(() => { setMotivo(item?.nota || ""); }, [item?.fecha, item?.bloque, item?.nota]);

  const bloqueado = !editable || item?.estado === "realizada";
  // Como en el tablero: se marca sobre lo guardado.
  const puedeMarcar = esGerencia && !cambios;
  const tiene = !!item?.cliente.trim();
  const inp = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500 transition";
  const Icono = item?.bloque === "tarde" ? Sunset : Sun;

  return (
    <Sheet open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        {item && (
          <>
            <div className="relative overflow-clip bg-gradient-to-br from-[#0a1229] to-blue-900 px-5 pb-5 pt-6 text-white">
              <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/20 blur-2xl" />
              <SheetHeader className="relative p-0 text-left">
                <SheetDescription className="flex items-center gap-1.5 text-xs font-medium text-blue-100/80">
                  <Icono size={13} /> {item.bloque === "manana" ? "Mañana" : "Tarde"}
                </SheetDescription>
                <SheetTitle className="text-xl font-black text-white">{dia} {corta(item.fecha)}</SheetTitle>
              </SheetHeader>
              <div className="relative mt-3 flex items-center justify-between">
                {tiene ? <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADO_UI[item.estado].cls}`}>{ESTADO_UI[item.estado].label}</span> : <span className="text-xs text-blue-100/70">Puesto libre</span>}
                <div className="flex gap-1">
                  <button onClick={onAnterior} disabled={!onAnterior} aria-label="Puesto anterior" className="rounded-lg border border-white/15 bg-white/10 p-1.5 hover:bg-white/20 disabled:opacity-30"><ChevronLeft size={16} /></button>
                  <button onClick={onSiguiente} disabled={!onSiguiente} aria-label="Puesto siguiente" className="rounded-lg border border-white/15 bg-white/10 p-1.5 hover:bg-white/20 disabled:opacity-30"><ChevronRight size={16} /></button>
                </div>
              </div>
            </div>

            {/* Sin AnimatePresence: una copia saliendo del formulario anterior se quedaba con el foco. */}
            <motion.div
              key={`${item.fecha}-${item.bloque}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
              className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
            >
              <label className="block text-xs font-semibold text-slate-500">Cliente objetivo
                <input autoFocus={!tiene && !bloqueado} className={inp} disabled={bloqueado} value={item.cliente} placeholder="Nombre del cliente" onChange={(e) => onEditar("cliente", e.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Zona / Ciudad
                <input className={inp} disabled={bloqueado} value={item.zona} placeholder="Ej.: Maracay" onChange={(e) => onEditar("zona", e.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Tema / Producto a capacitar
                <input className={inp} disabled={bloqueado} value={item.tema} placeholder="Ej.: Estaciones BLUETTI" onChange={(e) => onEditar("tema", e.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Objetivo de la visita
                <textarea rows={3} className={`${inp} resize-none`} disabled={bloqueado} value={item.objetivo} placeholder="Qué se quiere lograr" onChange={(e) => onEditar("objetivo", e.target.value)} />
              </label>
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Visita foránea</p>
                  <p className="text-[11px] text-slate-500">Cuenta para la cobertura territorial</p>
                </div>
                <Switch checked={item.foranea} disabled={bloqueado} onCheckedChange={(v) => onEditar("foranea", v)} />
              </div>

              {tiene && puedeMarcar && item.id && (
                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Resultado de la visita</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onMarcar(item, item.estado === "realizada" ? "planificada" : "realizada", motivo)}
                      disabled={marcando === item.id}
                      className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold transition-colors ${item.estado === "realizada" ? "bg-emerald-600 text-white shadow shadow-emerald-300" : "border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"}`}
                    >
                      <Check size={15} /> {item.estado === "realizada" ? "Realizada" : "Marcar realizada"}
                    </button>
                    <button
                      onClick={() => onMarcar(item, item.estado === "no_realizada" ? "planificada" : "no_realizada", motivo)}
                      disabled={marcando === item.id}
                      className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold transition-colors ${item.estado === "no_realizada" ? "bg-red-600 text-white shadow shadow-red-300" : "border border-slate-200 bg-white text-slate-700 hover:bg-red-50 hover:text-red-700"}`}
                    >
                      <X size={15} /> {item.estado === "no_realizada" ? "No realizada" : "No se realizó"}
                    </button>
                  </div>
                  <input className={inp} value={motivo} placeholder="Motivo si no se realizó (opcional)" onChange={(e) => setMotivo(e.target.value)} />
                </div>
              )}
              {tiene && !puedeMarcar && item.nota && (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>Nota:</b> {item.nota}</p>
              )}
              {tiene && esGerencia && cambios && (
                <p className="text-[11px] text-slate-400">Guarda el plan para poder marcar el resultado de las visitas.</p>
              )}
            </motion.div>

            <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-5 py-3">
              {tiene && !bloqueado && (
                <button onClick={onVaciar} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50">
                  <Trash2 size={15} /> Quitar
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={onCerrar} className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">Listo</button>
                {editable && <BotonGuardar onClick={onGuardar} disabled={!cambios || guardando} guardando={guardando} />}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ResumenMes({ resumen, mes, onVer }: { resumen: Resumen[] | null; mes: string; onVer: (userId: number) => void }) {
  const [y, m] = mes.split("-").map(Number);
  // "septiembre de 2026" (sin mayúsculas en "de").
  const mesLargo = new Date(y, m - 1, 1).toLocaleDateString("es-VE", { month: "long", year: "numeric" });
  const etiqueta = mesLargo.charAt(0).toUpperCase() + mesLargo.slice(1);
  if (!resumen) return <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />;

  const total = resumen.reduce(
    (a, r) => ({
      planificadas: a.planificadas + r.planificadas,
      realizadas: a.realizadas + r.realizadas,
      noRealizadas: a.noRealizadas + r.noRealizadas,
      foraneasVencidas: a.foraneasVencidas + r.foraneasVencidas,
      foraneasRealizadas: a.foraneasRealizadas + r.foraneasRealizadas,
    }),
    { planificadas: 0, realizadas: 0, noRealizadas: 0, foraneasVencidas: 0, foraneasRealizadas: 0 },
  );
  const coberturaEquipo = total.foraneasVencidas ? Math.round((total.foraneasRealizadas / total.foraneasVencidas) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">Cobertura territorial · {etiqueta}</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1"><Users size={13} /> {resumen.length} asesores</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1"><b className="tabular-nums">{total.planificadas}</b> planificadas</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"><b className="tabular-nums">{total.realizadas}</b> realizadas</span>
          <span className="rounded-full px-3 py-1 font-semibold text-white" style={{ background: colorCobertura(coberturaEquipo) }}>
            Equipo {coberturaEquipo == null ? "–" : `${coberturaEquipo}%`}
          </span>
        </div>
      </div>

      {resumen.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">Ningún asesor cargó planes este mes.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {resumen.map((r, i) => {
            const pendientes = Math.max(0, r.planificadas - r.realizadas - r.noRealizadas);
            const iniciales = r.vendedor.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
            return (
              <motion.div
                key={r.userId}
                initial={{ opacity: 0, y: 20, rotateX: -10 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 140, damping: 18 }}
                style={{ transformPerspective: 900 }}
              >
                <Tilt>
                  <button
                    onClick={() => onVer(r.userId)}
                    className="h-full w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:shadow-lg transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-sm font-bold text-white shadow-md shadow-blue-300/50">{iniciales}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{r.vendedor}</p>
                        <p className="text-[11px] text-slate-500">{r.planes} {r.planes === 1 ? "semana" : "semanas"} con plan</p>
                      </div>
                      <Anillo valor={(r.cobertura ?? 0) / 100} color={colorCobertura(r.cobertura)} marca={0.7}>
                        <span className="text-sm">{r.cobertura == null ? "–" : `${r.cobertura}%`}</span>
                      </Anillo>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 py-2"><p className="text-lg font-black text-slate-900 tabular-nums">{r.planificadas}</p><p className="text-[10px] text-slate-500">planificadas</p></div>
                      <div className="rounded-xl bg-emerald-50 py-2"><p className="text-lg font-black text-emerald-700 tabular-nums">{r.foraneasRealizadas}<span className="text-xs font-semibold text-emerald-600/60">/{r.foraneasVencidas}</span></p><p className="text-[10px] text-emerald-700/70">foráneas</p></div>
                      <div className="rounded-xl bg-red-50 py-2"><p className="text-lg font-black text-red-600 tabular-nums">{r.noRealizadas}</p><p className="text-[10px] text-red-600/70">no realizadas</p></div>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
                      {[
                        { n: r.realizadas, c: "bg-emerald-500" },
                        { n: r.noRealizadas, c: "bg-red-500" },
                        { n: pendientes, c: "bg-blue-400" },
                      ].map((s, j) => (
                        <motion.div key={j} className={s.c} initial={{ width: 0 }} animate={{ width: r.planificadas ? `${(s.n / r.planificadas) * 100}%` : 0 }} transition={{ duration: 0.8, delay: 0.2 + j * 0.1 }} />
                      ))}
                    </div>
                  </button>
                </Tilt>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
