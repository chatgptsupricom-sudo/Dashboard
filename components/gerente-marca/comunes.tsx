"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, MapPin, RefreshCw, UserRound } from "lucide-react";
import { useLocale } from "next-intl";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  etiquetaAsignacion,
  nombreSedeGerente,
  SEDES_GERENTE,
  TRAMOS,
  type Asignacion,
  type ProductoGerente,
  type SedeProducto,
  type Tramo,
} from "@/lib/gerente-marca/tipos";

/**
 * Piezas comunes de las pantallas del Gerente de Marca: filtro de sede (las
 * dos o una), selector de gerente (solo el SuperAdmin), tarjetas, formato y
 * la suma de las dos sedes por producto.
 */

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export const dinero = (n: number) =>
  `$${(Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dineroCorto = (n: number) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("es-VE", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1_000).toLocaleString("es-VE", { maximumFractionDigits: 1 })} k`;
  return dinero(v);
};

export const unidades = (n: number) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 2 });

export const porcentaje = (n: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${n.toLocaleString("es-VE", { maximumFractionDigits: 1 })} %`;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fecha(dia: string | null | undefined, conAnio = true) {
  if (!dia) return "—";
  const [y, m, d] = dia.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}${conAnio ? ` ${y}` : ""}`;
}

export function nombreMes(mes: string) {
  const [y, m] = mes.split("-");
  const n = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${n[Number(m) - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Suma de las sedes por producto
// ---------------------------------------------------------------------------

export interface Combinado {
  p: ProductoGerente;
  fisico: number;
  reservado: number;
  disponible: number;
  transito: number;
  /** Existencia × costo de cada sede. */
  valor: number;
  /** valor ÷ existencia; sin existencia, el costo más alto de las sedes. */
  costo: number;
  tramos: Partial<Record<Tramo, number>>;
  entradaMasVieja: string | null;
  diasPromedio: number | null;
  /** Unidades con fecha de entrada de la carga inicial de Odoo. */
  inicial: number;
  vendidasMes: number;
  vendidas6m: number;
  ultimaVenta: string | null;
  porSede: Map<number, SedeProducto>;
}

export function combinar(p: ProductoGerente): Combinado {
  const c: Combinado = {
    p, fisico: 0, reservado: 0, disponible: 0, transito: 0, valor: 0, costo: 0, tramos: {},
    entradaMasVieja: null, diasPromedio: null, inicial: 0, vendidasMes: 0, vendidas6m: 0, ultimaVenta: null,
    porSede: new Map(),
  };
  let sumaDias = 0;
  let conEdad = 0;
  for (const s of p.sedes) {
    c.porSede.set(s.companyId, s);
    c.fisico += s.fisico;
    c.reservado += s.reservado;
    c.disponible += s.disponible;
    c.transito += s.transito;
    c.valor += s.fisico * s.costo;
    c.vendidasMes += s.vendidasMes;
    c.vendidas6m += s.vendidas6m;
    if (s.ultimaVenta && (!c.ultimaVenta || s.ultimaVenta > c.ultimaVenta)) c.ultimaVenta = s.ultimaVenta;
    if (s.entradaMasVieja && (!c.entradaMasVieja || s.entradaMasVieja < c.entradaMasVieja)) c.entradaMasVieja = s.entradaMasVieja;
    let u = 0;
    for (const [t, n] of Object.entries(s.tramos) as [Tramo, number][]) {
      c.tramos[t] = (c.tramos[t] ?? 0) + n;
      u += n;
    }
    if (s.diasPromedio != null && u > 0) {
      sumaDias += s.diasPromedio * u;
      conEdad += u;
    }
  }
  c.inicial = c.tramos.inicial ?? 0;
  c.diasPromedio = conEdad > 0 ? Math.round(sumaDias / conEdad) : null;
  c.costo = c.fisico > 0 ? c.valor / c.fisico : Math.max(0, ...p.sedes.map((s) => s.costo));
  c.valor = Math.round(c.valor * 100) / 100;
  return c;
}

/** Días desde la entrada más vieja ("200+" si es de la carga inicial: no se sabe cuánto más). */
export function textoAntiguedad(c: Pick<Combinado, "entradaMasVieja" | "inicial">, hoy: string) {
  if (!c.entradaMasVieja) return "—";
  const dias = Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${c.entradaMasVieja}T00:00:00Z`)) / 86_400_000));
  return c.inicial > 0 ? `${dias}+` : String(dias);
}

export const COLOR_TRAMO: Record<Tramo, string> = {
  "0-30": "#10b981",
  "31-60": "#84cc16",
  "61-90": "#eab308",
  "91-180": "#f97316",
  "180+": "#ef4444",
  inicial: "#64748b",
};

export const etiquetaTramo = (t: Tramo) => TRAMOS.find((x) => x.id === t)?.label ?? t;

// ---------------------------------------------------------------------------
// Filtros: sede y gerente
// ---------------------------------------------------------------------------

const leerSesion = (k: string) => {
  try { return sessionStorage.getItem(k) || ""; } catch { return ""; }
};
const guardarSesion = (k: string, v: string) => {
  try { sessionStorage.setItem(k, v); } catch { /* sin storage: no se recuerda */ }
};

export function useEsSuperAdmin() {
  const { user } = useAuthStore();
  return String((user as any)?.role || "").toLowerCase().trim() === "superadmin";
}

/** Sede ("ambas" / "9" / "10") y gerente elegidos; se recuerdan al pasar de una pantalla a otra. */
export function useFiltros() {
  const esSuper = useEsSuperAdmin();
  const [sede, setSedeEstado] = useState("ambas");
  const [gerente, setGerenteEstado] = useState("");
  useEffect(() => {
    setSedeEstado(leerSesion("gm-sede") || "ambas");
    setGerenteEstado(leerSesion("gm-gerente"));
  }, []);
  const setSede = (v: string) => { setSedeEstado(v); guardarSesion("gm-sede", v); };
  const setGerente = (v: string) => { setGerenteEstado(v); guardarSesion("gm-gerente", v); };
  const qs = new URLSearchParams({ sede });
  if (esSuper && gerente) qs.set("gerente", gerente);
  return { esSuper, sede, setSede, gerente: esSuper ? gerente : "", setGerente, query: qs.toString() };
}

export function SelectorSede({ sede, setSede }: { sede: string; setSede: (v: string) => void }) {
  return (
    <div className="bg-white border rounded-xl p-1.5 flex items-center gap-1 shadow-sm">
      <MapPin size={16} className="text-slate-400 ml-2" />
      <select
        value={sede}
        onChange={(e) => setSede(e.target.value)}
        aria-label="Sede"
        className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer outline-none pr-2"
      >
        <option value="ambas">Valencia y Caracas</option>
        {SEDES_GERENTE.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
      </select>
    </div>
  );
}

/** El SuperAdmin mira lo de un gerente o lo de todos juntos. */
export function SelectorGerente({ gerente, setGerente }: { gerente: string; setGerente: (v: string) => void }) {
  const [lista, setLista] = useState<{ email: string; nombre: string }[]>([]);
  useEffect(() => {
    fetch("/api/gerente-marca/asignaciones")
      .then((r) => r.json())
      .then((j) => setLista(Array.isArray(j?.gerentes) ? j.gerentes : []))
      .catch(() => setLista([]));
  }, []);
  return (
    <div className="bg-white border rounded-xl p-1.5 flex items-center gap-1 shadow-sm">
      <UserRound size={16} className="text-slate-400 ml-2" />
      <select
        value={gerente}
        onChange={(e) => setGerente(e.target.value)}
        aria-label="Gerente de marca"
        className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer outline-none pr-2 max-w-[220px]"
      >
        <option value="">Todos los gerentes</option>
        {lista.map((g) => <option key={g.email} value={g.email}>{g.nombre}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------------------

/** GET a una API del gerente con su query; `recargar()` vuelve a pedirla. */
export function useDatos<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const ultima = useRef(0);
  useEffect(() => {
    if (!url) return;
    const n = ++ultima.current;
    setCargando(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (n !== ultima.current) return;
        if (r.ok && j?.success) setData(j.data as T);
        else setError(j?.error || "No se pudieron cargar los datos");
      })
      .catch(() => { if (n === ultima.current) setError("No se pudieron cargar los datos"); })
      .finally(() => { if (n === ultima.current) setCargando(false); });
  }, [url, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { data, cargando, error, recargar };
}

// ---------------------------------------------------------------------------
// Piezas de pantalla
// ---------------------------------------------------------------------------

export function Encabezado({
  icono: Icono, titulo, subtitulo, children,
}: { icono: typeof MapPin; titulo: string; subtitulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="p-3 bg-blue-50 rounded-2xl shrink-0"><Icono className="text-blue-600" size={24} /></div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">{titulo}</h1>
          <p className="text-sm text-slate-500">{subtitulo}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function BotonRecargar({ onClick, cargando }: { onClick: () => void; cargando: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={cargando}
      className="h-10 w-10 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      aria-label="Actualizar desde Odoo"
      title="Actualizar desde Odoo"
    >
      <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
    </button>
  );
}

export function BotonExcel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-4 h-10 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
    >
      <Download size={16} /> Excel
    </button>
  );
}

export function Tarjeta({
  icono: Icono, titulo, valor, pie, acento,
}: { icono: typeof MapPin; titulo: string; valor: ReactNode; pie?: ReactNode; acento?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${acento ?? "bg-slate-100 text-slate-600"}`}>
          <Icono size={15} />
        </span>
        {titulo}
      </div>
      <div className="text-2xl font-black tracking-tight text-slate-900 tabular-nums truncate">{valor}</div>
      {pie && <div className="text-xs text-slate-500 leading-relaxed">{pie}</div>}
    </div>
  );
}

export function Aviso({ error, onReintentar }: { error: string; onReintentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
      <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
      <button onClick={onReintentar} className="font-semibold underline">Reintentar</button>
    </div>
  );
}

export function Cargando({ texto }: { texto: string }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> {texto}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
      <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
    </div>
  );
}

/** Las marcas que se están viendo ("FORZA, APC, HP · Cómputo Corporativo"). */
export function MarcasEnVista({ asignaciones, sedes, esSuper }: { asignaciones: Asignacion[]; sedes: number[]; esSuper: boolean }) {
  const locale = useLocale();
  if (asignaciones.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
        {esSuper
          ? <>Todavía no hay marcas asignadas. Asígnalas en <a href={`/${locale}/gerente_marca/configuracion`} className="font-semibold underline">Configuración</a>.</>
          : "Todavía no tienes marcas asignadas. Pídele al SuperAdmin que te las asigne."}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-slate-500">Marcas:</span>
      {asignaciones.map((a) => (
        <span key={a.marcaId} className="rounded-full bg-slate-900 text-white px-2.5 py-1 font-semibold">{etiquetaAsignacion(a)}</span>
      ))}
      <span className="text-slate-400">· {sedes.map(nombreSedeGerente).join(" y ")}</span>
    </div>
  );
}

export const lineaDeMarca = (asignaciones: Asignacion[], marcaId: number) =>
  asignaciones.find((a) => a.marcaId === marcaId);

// ---------------------------------------------------------------------------
// Tablas ordenables
// ---------------------------------------------------------------------------

export type Orden<K extends string> = { col: K; desc: boolean };

/** Ordena por la columna elegida; un clic en la misma columna invierte el orden. */
export function useOrden<K extends string>(inicial: Orden<K>) {
  const [orden, setOrden] = useState<Orden<K>>(inicial);
  const alternar = (col: K) => setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: true }));
  const ordenar = <T,>(filas: T[], valor: (f: T, col: K) => number | string) =>
    [...filas].sort((a, b) => {
      const x = valor(a, orden.col);
      const y = valor(b, orden.col);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return orden.desc ? -r : r;
    });
  return { orden, alternar, ordenar };
}

export function Th<K extends string>({
  col, orden, alternar, children, derecha = true, title,
}: { col: K; orden: Orden<K>; alternar: (c: K) => void; children: ReactNode; derecha?: boolean; title?: string }) {
  const activo = orden.col === col;
  return (
    <th
      onClick={() => alternar(col)}
      title={title}
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none ${derecha ? "text-right" : "text-left"} ${activo ? "text-blue-700" : "text-slate-500 hover:text-slate-700"}`}
    >
      {children}{activo ? (orden.desc ? " ↓" : " ↑") : ""}
    </th>
  );
}

/** Número de parte; vacío = el producto no lo tiene cargado en Odoo. */
export function Codigo({ v }: { v: string }) {
  return v ? <>{v}</> : <span className="font-sans text-amber-600" title="Este producto no tiene número de parte (referencia interna) en Odoo">sin código</span>;
}
