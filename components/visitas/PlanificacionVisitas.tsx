"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CalendarRange, Check, ChevronLeft, ChevronRight, Download, Loader2, MapPin, Save, X,
} from "lucide-react";

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
const BLOQUES: { v: Bloque; label: string }[] = [{ v: "manana", label: "Mañana" }, { v: "tarde", label: "Tarde" }];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const sumarDias = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const lunesDe = (s: string) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const corta = (s: string) => parse(s).toLocaleDateString("es-VE", { day: "numeric", month: "short" });
const hoy = () => ymd(new Date());

const itemVacio = (fecha: string, bloque: Bloque): Item => ({ fecha, bloque, zona: "", cliente: "", tema: "", objetivo: "", foranea: true, estado: "planificada", nota: "" });

const ESTADO_UI: Record<Estado, { label: string; cls: string }> = {
  planificada: { label: "Planificada", cls: "bg-slate-100 text-slate-600" },
  realizada: { label: "Realizada", cls: "bg-emerald-100 text-emerald-700" },
  no_realizada: { label: "No realizada", cls: "bg-red-100 text-red-700" },
};

/**
 * Planificación de rutas y visitas (PL-CAP-01): el asesor arma su plan de la
 * semana; la gerencia lo revisa, marca las visitas realizadas y ve la
 * cobertura territorial del mes por asesor.
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
    setSemana((s) => sumarDias(s, delta * 7));
  };
  const cambiarAsesor = (id: number) => {
    if (cambios && !confirm("Hay cambios sin guardar. ¿Cambiar de asesor igual?")) return;
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

  const marcar = async (item: Item, estado: Estado) => {
    if (!item.id) return;
    let nota = item.nota;
    if (estado === "no_realizada") {
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

  const planificadas = (plan?.items || []).filter((i) => i.cliente.trim()).length;
  const miResumen = resumen?.find((r) => r.userId === plan?.userId);

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

  const inp = "w-full h-8 px-2 text-sm rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Planificación de rutas y visitas</h1>
            <p className="text-sm text-slate-500">Formato PL-CAP-01 · meta ≥ {META_SEMANA} visitas por semana</p>
          </div>
        </div>
        {rol === "gerencia" && (
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {(["plan", "resumen"] as const).map((tb) => (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={`px-4 h-8 rounded-lg text-sm font-semibold ${tab === tb ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {tb === "plan" ? "Plan semanal" : "Resumen del mes"}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "resumen" && rol === "gerencia" ? (
        <ResumenMes resumen={resumen} mes={mesDeSemana} onVer={(id) => { setUserId(id); setTab("plan"); }} />
      ) : (
        <>
          {/* Controles */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            {rol !== "vendedor" && asesores.length > 0 && (
              <select
                value={userId ?? ""}
                onChange={(e) => cambiarAsesor(Number(e.target.value))}
                className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-medium bg-white"
              >
                {asesores.map((a) => <option key={a.userId} value={a.userId}>{a.nombre}</option>)}
              </select>
            )}
            <div className="flex items-center rounded-lg border border-slate-200">
              <button onClick={() => cambiarSemana(-1)} className="p-2 hover:bg-slate-50 rounded-l-lg" aria-label="Semana anterior"><ChevronLeft size={16} /></button>
              <span className="px-3 text-sm font-semibold text-slate-700 whitespace-nowrap">
                <CalendarRange size={14} className="inline mr-1.5 -mt-0.5 text-slate-400" />
                Semana {plan?.semanaNumero ?? "–"} · {corta(plan?.semanaInicio ?? semana)} – {corta(sumarDias(plan?.semanaInicio ?? semana, 4))}
              </span>
              <button onClick={() => cambiarSemana(1)} className="p-2 hover:bg-slate-50 rounded-r-lg" aria-label="Semana siguiente"><ChevronRight size={16} /></button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {aviso && <span className="text-xs font-medium text-emerald-600">{aviso}</span>}
              {cambios && <span className="text-xs text-amber-600">Cambios sin guardar</span>}
              <button
                onClick={descargarExcel}
                disabled={!plan}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download size={15} /> Excel
              </button>
              {editable && (
                <button
                  onClick={guardar}
                  disabled={!plan || !cambios || guardando}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
                >
                  {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {cargando && !plan ? (
            <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
          ) : !plan ? (
            <div className="py-16 text-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
              {rol === "vendedor" ? "Tu usuario no está registrado como asesor de esta sede." : "No hay asesores activos en esta sede."}
            </div>
          ) : (
            <>
              {/* Indicadores */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Visitas planificadas esta semana</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${planificadas >= META_SEMANA ? "text-emerald-700" : "text-amber-600"}`}>
                    {planificadas}<span className="text-base font-medium text-slate-400"> / {META_SEMANA}</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Foráneas realizadas en el mes</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                    {miResumen?.foraneasRealizadas ?? 0}<span className="text-base font-medium text-slate-400"> / {miResumen?.foraneasVencidas ?? 0} a la fecha</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Cobertura territorial del mes</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${miResumen?.cobertura == null ? "text-slate-400" : miResumen.cobertura >= 100 ? "text-emerald-700" : miResumen.cobertura >= 70 ? "text-amber-600" : "text-red-700"}`}>
                    {miResumen?.cobertura == null ? "–" : `${miResumen.cobertura}%`}
                  </p>
                  <p className="text-[11px] text-slate-400">foráneas realizadas ÷ planificadas · mínimo 70%</p>
                </div>
              </div>

              {/* Datos generales */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-500">Zona / Ruta
                  <input className={`${inp} mt-1`} disabled={!editable} value={plan.zonaRuta} placeholder="Ej.: Maracay – La Victoria"
                    onChange={(e) => editar((p) => ({ ...p, zonaRuta: e.target.value }))} />
                </label>
                <label className="text-xs font-medium text-slate-500">Marcas priorizadas
                  <input className={`${inp} mt-1`} disabled={!editable} value={plan.marcasPriorizadas} placeholder="Ej.: BLUETTI – FORZA"
                    onChange={(e) => editar((p) => ({ ...p, marcasPriorizadas: e.target.value }))} />
                </label>
              </section>

              {/* 1. Matriz */}
              <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <h2 className="px-4 py-3 text-sm font-bold text-slate-800 border-b border-slate-100">1. Matriz de ponderación de selección de productos</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left">Criterio de selección</th>
                        <th className="px-3 py-2 text-right w-20">Peso</th>
                        <th className="px-3 py-2 text-left">Marcas / Productos candidatos</th>
                        <th className="px-3 py-2 text-left w-32">Puntaje obtenido</th>
                        <th className="px-3 py-2 text-left w-44">Estatus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {CRITERIOS.map((c) => {
                        const f = plan.matriz.find((m) => m.clave === c.clave) || { clave: c.clave, candidatos: "", puntaje: "", estatus: "" };
                        return (
                          <tr key={c.clave}>
                            <td className="px-3 py-2 text-slate-700">{c.criterio}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.peso}%</td>
                            <td className="px-3 py-2"><input className={inp} disabled={!editable} value={f.candidatos} onChange={(e) => editarMatriz(c.clave, "candidatos", e.target.value)} /></td>
                            <td className="px-3 py-2"><input className={inp} disabled={!editable} value={f.puntaje} onChange={(e) => editarMatriz(c.clave, "puntaje", e.target.value)} /></td>
                            <td className="px-3 py-2"><input className={inp} disabled={!editable} value={f.estatus} onChange={(e) => editarMatriz(c.clave, "estatus", e.target.value)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 2. Cronograma */}
              <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <h2 className="px-4 py-3 text-sm font-bold text-slate-800 border-b border-slate-100">
                  2. Cronograma y ruta geográfica semanal <span className="font-normal text-slate-500">(meta: ≥ {META_SEMANA} visitas)</span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1100px]">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left w-40">Día / Bloque</th>
                        <th className="px-3 py-2 text-left">Zona / Ciudad</th>
                        <th className="px-3 py-2 text-left">Cliente objetivo</th>
                        <th className="px-3 py-2 text-left">Tema / Producto a capacitar</th>
                        <th className="px-3 py-2 text-left">Objetivo de la visita</th>
                        <th className="px-3 py-2 text-center w-20">Foránea</th>
                        <th className="px-3 py-2 text-left w-52">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {DIAS.map((dia, d) => {
                        const fecha = sumarDias(plan.semanaInicio, d);
                        return BLOQUES.map((b, bi) => {
                          const it = itemDe(fecha, b.v) || itemVacio(fecha, b.v);
                          const bloqueado = !editable || it.estado === "realizada";
                          const tieneCliente = !!it.cliente.trim();
                          return (
                            <tr key={`${fecha}-${b.v}`} className={bi === 0 ? "border-t-2 border-slate-100" : ""}>
                              <td className="px-3 py-2">
                                {bi === 0 && <p className="font-semibold text-slate-800">{dia} <span className="font-normal text-slate-400">{corta(fecha)}</span></p>}
                                <p className="text-xs text-slate-500">{b.label}</p>
                              </td>
                              <td className="px-3 py-2"><input className={inp} disabled={bloqueado} value={it.zona} onChange={(e) => editarItem(fecha, b.v, "zona", e.target.value)} /></td>
                              <td className="px-3 py-2"><input className={inp} disabled={bloqueado} value={it.cliente} onChange={(e) => editarItem(fecha, b.v, "cliente", e.target.value)} /></td>
                              <td className="px-3 py-2"><input className={inp} disabled={bloqueado} value={it.tema} onChange={(e) => editarItem(fecha, b.v, "tema", e.target.value)} /></td>
                              <td className="px-3 py-2"><input className={inp} disabled={bloqueado} value={it.objetivo} onChange={(e) => editarItem(fecha, b.v, "objetivo", e.target.value)} /></td>
                              <td className="px-3 py-2 text-center">
                                <input type="checkbox" className="h-4 w-4 rounded" disabled={bloqueado} checked={it.foranea}
                                  onChange={(e) => editarItem(fecha, b.v, "foranea", e.target.checked)} />
                              </td>
                              <td className="px-3 py-2">
                                {!tieneCliente ? (
                                  <span className="text-xs text-slate-300">–</span>
                                ) : rol === "gerencia" && it.id && !cambios ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => marcar(it, it.estado === "realizada" ? "planificada" : "realizada")}
                                      disabled={marcando === it.id}
                                      title={it.estado === "realizada" ? "Desmarcar" : "Marcar realizada"}
                                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium ${it.estado === "realizada" ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-emerald-50"}`}
                                    >
                                      <Check size={13} /> Realizada
                                    </button>
                                    <button
                                      onClick={() => marcar(it, it.estado === "no_realizada" ? "planificada" : "no_realizada")}
                                      disabled={marcando === it.id}
                                      title={it.nota || (it.estado === "no_realizada" ? "Desmarcar" : "Marcar no realizada")}
                                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium ${it.estado === "no_realizada" ? "bg-red-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-red-50"}`}
                                    >
                                      <X size={13} /> No
                                    </button>
                                  </div>
                                ) : (
                                  <span title={it.nota || undefined} className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${ESTADO_UI[it.estado].cls}`}>
                                    {ESTADO_UI[it.estado].label}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <p className="text-[11px] leading-relaxed text-slate-400">
                {rol === "gerencia"
                  ? "Guarda el plan antes de marcar visitas. Al marcar una visita como realizada queda registrada también en las visitas del Stoplight; una visita realizada ya no se puede editar ni borrar del plan."
                  : "La gerencia marca las visitas realizadas. Una visita realizada ya no se puede editar ni borrar del plan."}
                {" "}Cobertura territorial = visitas foráneas realizadas ÷ foráneas planificadas hasta hoy.
                {plan.actualizadoPor && plan.actualizadoEl && ` Último cambio: ${plan.actualizadoPor}, ${new Date(plan.actualizadoEl).toLocaleString("es-VE")}.`}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ResumenMes({ resumen, mes, onVer }: { resumen: Resumen[] | null; mes: string; onVer: (userId: number) => void }) {
  const [y, m] = mes.split("-").map(Number);
  const etiqueta = new Date(y, m - 1, 1).toLocaleDateString("es-VE", { month: "long", year: "numeric" });
  // "septiembre de 2026" (sin mayúsculas en "de").
  if (!resumen) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
      <p className="px-4 py-3 text-sm font-bold text-slate-800 border-b border-slate-100">Cobertura territorial · {etiqueta}</p>
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">Asesor</th>
            <th className="px-3 py-2 text-right">Semanas con plan</th>
            <th className="px-3 py-2 text-right">Visitas planificadas</th>
            <th className="px-3 py-2 text-right">Foráneas a la fecha</th>
            <th className="px-3 py-2 text-right">Realizadas</th>
            <th className="px-3 py-2 text-right">No realizadas</th>
            <th className="px-3 py-2 text-right">Cobertura</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {resumen.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Ningún asesor cargó planes este mes.</td></tr>
          )}
          {resumen.map((r) => (
            <tr key={r.userId} className="hover:bg-blue-50/40 cursor-pointer" onClick={() => onVer(r.userId)}>
              <td className="px-3 py-2 font-medium text-slate-800">{r.vendedor}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.planes}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.planificadas}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.foraneasVencidas}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.foraneasRealizadas}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.noRealizadas}</td>
              <td className="px-3 py-2 text-right">
                <span className={`inline-flex min-w-[52px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${r.cobertura == null ? "bg-slate-50 text-slate-400" : r.cobertura >= 100 ? "bg-emerald-50 text-emerald-700" : r.cobertura >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                  {r.cobertura == null ? "–" : `${r.cobertura}%`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
