"use client";

import { DetalleNota } from "@/components/notas-credito/DetalleNota";
import { FILTROS_VACIOS, FiltrosNC, type EstadoFiltro, type Filtros, type OrigenFiltro } from "@/components/notas-credito/FiltrosNC";
import { NuevaNota } from "@/components/notas-credito/NuevaNota";
import { Responsables } from "@/components/notas-credito/Responsables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AnteriorNC } from "@/lib/notas-credito/anteriores";
import type { NotaOdooMes } from "@/lib/notas-credito/odoo";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_ETAPA,
  ETIQUETA_VISTA,
  etapasDe,
  formatoMonto,
  NOMBRE_SEDE,
  PASO_DEL_ESTADO,
  SEDES,
  veOdooDeLaSede,
  veTodoLaSede,
  vistasDe,
  type EtapaNC,
  type PasoNC,
  type SolicitudNC,
  type VistaNC,
} from "@/lib/notas-credito/tipos";
import { ExternalLink, FileCheck2, FileText, Loader2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type NotaOdoo = NotaOdooMes & { solicitud_id: number | null };

/**
 * Una fila de la lista: una solicitud del panel (con su NC de Odoo si ya la
 * tiene), una NC de Odoo sin solicitud, o una solicitud de RMA de antes del
 * flujo. Una NC que salió de una solicitud es UNA fila.
 */
type Fila =
  | { tipo: "sol"; clave: string; fecha: string; sede: number; sol: SolicitudNC; odoo?: NotaOdoo }
  | { tipo: "odoo"; clave: string; fecha: string; sede: number; odoo: NotaOdoo }
  | { tipo: "ant"; clave: string; fecha: string; sede: number; ant: AnteriorNC };

const ESTADO_ANTERIOR: Record<string, { t: string; c: string }> = {
  pendiente: { t: "Pendiente, fuera del flujo", c: "bg-amber-100 text-amber-800 border-amber-200" },
  aprobada: { t: "Registrada antes del flujo", c: "bg-slate-100 text-slate-600 border-slate-200" },
  rechazada: { t: "Rechazada (antes del flujo)", c: "bg-rose-100 text-rose-800 border-rose-200" },
};

const ESTADO_ODOO: Record<string, { t: string; c: string }> = {
  posted: { t: "Publicada en Odoo", c: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  draft: { t: "Borrador en Odoo", c: "bg-amber-100 text-amber-800 border-amber-200" },
  cancel: { t: "Anulada en Odoo", c: "bg-slate-100 text-slate-500 border-slate-200" },
};

const TZ = "America/Caracas";
const fecha = (v: string | null | undefined) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }) : "";
/** YYYY-MM de una fecha (o de un YYYY-MM-DD) en hora de Caracas. */
const mesDe = (v: string | null | undefined) =>
  !v ? "" : v.length === 10 ? v.slice(0, 7) : new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(v));
const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date());
/** Para ordenar: YYYY-MM-DD o ISO, lo más nuevo primero. */
const orden = (v: string) => (v.length === 10 ? `${v}T12:00:00` : v);
const porFecha = (x: Fila, y: Fila) => orden(y.fecha).localeCompare(orden(x.fecha));

/** Estado de una fila para el filtro (une los del panel, los de Odoo y los anteriores). */
function estadoFila(f: Fila): EstadoFiltro {
  if (f.tipo === "odoo") return f.odoo.estado === "posted" ? "publicada" : f.odoo.estado === "draft" ? "borrador" : "anulada";
  if (f.tipo === "ant") return f.ant.estado === "pendiente" ? "fuera_flujo" : f.ant.estado === "rechazada" ? "rechazada" : "anterior";
  if (f.sol.estado === "aprobada" && (f.odoo?.estado === "draft" || f.sol.odoo_estado === "draft")) return "borrador";
  if (f.odoo?.estado === "cancel") return "anulada";
  return f.sol.estado === "procesada" ? "publicada" : f.sol.estado;
}

function origenFila(f: Fila): OrigenFiltro {
  if (f.tipo === "odoo") return f.odoo.solicitud_id ? "directa" : "odoo";
  if (f.tipo === "ant") return "rma";
  return f.sol.origen;
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Todo el texto por el que se puede buscar una fila. */
function textoFila(f: Fila): string {
  const partes =
    f.tipo === "odoo"
      ? [f.odoo.nombre, f.odoo.cliente, f.odoo.factura, f.odoo.ref, f.odoo.creado_por, f.odoo.solicitud_id ? `NC-${f.odoo.solicitud_id}` : ""]
      : f.tipo === "ant"
        ? [f.ant.case_number, `RMA ${f.ant.case_number}`, f.ant.cliente, f.ant.factura, f.ant.producto, f.ant.serial, f.ant.motivo, f.ant.creado_por]
        : [
            `NC-${f.sol.id}`, f.sol.case_number ? `RMA ${f.sol.case_number}` : "", f.sol.cliente, f.sol.factura_nombre, f.sol.producto,
            f.sol.serial, f.sol.motivo, f.sol.creado_por, f.sol.preaprobado_por, f.sol.aprobado_por, f.sol.odoo_move_nombre, f.odoo?.nombre,
            ...(f.sol.lineas ?? []).flatMap((l) => [l.producto, l.codigo, l.marca, ...l.seriales]),
          ];
  return sinAcentos(partes.filter(Boolean).join(" "));
}

/** Estados que tiene sentido filtrar en cada pestaña (con uno solo no se muestra el filtro). */
const ESTADOS_VISTA: Partial<Record<VistaNC, EstadoFiltro[]>> = {
  mis_creadas: ["por_preaprobar", "por_aprobar", "aprobada", "borrador", "publicada", "rechazada"],
  procesar: ["aprobada", "borrador", "fuera_flujo"],
  rma: ["por_preaprobar", "por_aprobar", "aprobada", "borrador", "publicada", "rechazada"],
  flujo: ["por_preaprobar", "por_aprobar", "aprobada", "borrador", "publicada", "rechazada", "fuera_flujo", "anterior"],
  odoo: ["por_preaprobar", "por_aprobar", "aprobada", "borrador", "publicada", "rechazada", "anulada", "fuera_flujo", "anterior"],
};

const VACIO: Record<VistaNC, string> = {
  preaprobar: "No hay solicitudes de RMA esperando tu preaprobación.",
  mis_creadas: "Todavía no has creado, preaprobado ni rechazado notas de crédito.",
  aprobar: "Nada esperando tu aprobación.",
  procesar: "No hay notas de crédito aprobadas por hacer.",
  procesadas: "Todavía no hay notas de crédito procesadas.",
  rma: "No hay solicitudes de RMA.",
  flujo: "No hay notas de crédito en esta etapa.",
  odoo: "No hay notas de crédito este mes.",
  responsables: "",
};

/**
 * Pantalla de notas de crédito (/notas-credito). Cada quien ve lo de su paso
 * (vistasDe en lib/notas-credito/tipos.ts; el servidor ya filtra lo que no le
 * toca): quien preaprueba, las de RMA por preaprobar y las suyas; quien
 * aprueba, lo que espera su aprobación; quien procesa, lo aprobado por hacer y
 * lo procesado. El SuperAdmin y quien aprueba tienen además "Todo el flujo",
 * filtrado por etapa (RMA, Preaprueba, Aprueba, Procesados).
 */
export function NotasCredito() {
  const router = useRouter();
  const sp = useSearchParams();
  const abierta = Number(sp.get("id")) || null;
  const [notas, setNotas] = useState<SolicitudNC[]>([]);
  const [anteriores, setAnteriores] = useState<AnteriorNC[]>([]);
  const [borradores, setBorradores] = useState<NotaOdoo[]>([]);
  const [pasos, setPasos] = useState<Record<number, PasoNC[]>>({});
  const [superadmin, setSuperadmin] = useState(false);
  const [yo, setYo] = useState<{ nombre: string; email: string }>({ nombre: "", email: "" });
  const [sedesActivas, setSedesActivas] = useState<number[]>([]);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorOdoo, setErrorOdoo] = useState("");
  const [vista, setVista] = useState<VistaNC | null>(null);
  const [etapa, setEtapa] = useState<EtapaNC | "">("");
  const [nueva, setNueva] = useState(false);
  const [pasando, setPasando] = useState<number | null>(null);
  const [avisoAnterior, setAvisoAnterior] = useState<{ id: number; texto: string } | null>(null);
  // NC de Odoo: mes
  const [mes, setMes] = useState(mesActual);
  const [odooMes, setOdooMes] = useState<NotaOdoo[]>([]);
  const [cargandoMes, setCargandoMes] = useState(false);

  const vistas = useMemo(() => vistasDe(pasos, superadmin), [pasos, superadmin]);
  const veAlgoDeOdoo = vistas.includes("odoo");

  const cargar = useCallback(async () => {
    let odoo = false;
    try {
      const r = await fetch("/api/notas-credito");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo cargar");
      setNotas(j.notas || []);
      setAnteriores(j.anteriores || []);
      setPasos(j.pasos || {});
      setSuperadmin(!!j.superadmin);
      setYo(j.yo || { nombre: "", email: "" });
      setSedesActivas(j.sedes_activas || []);
      setError("");
      odoo = vistasDe(j.pasos || {}, !!j.superadmin).includes("odoo");
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar");
    } finally {
      setCargando(false);
    }
    if (!odoo) return;
    try {
      const r = await fetch("/api/notas-credito/odoo?borradores=1");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo leer Odoo");
      setBorradores(j.notas || []);
      setErrorOdoo("");
    } catch (e: any) {
      setErrorOdoo(e?.message || "No se pudo leer Odoo");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Primera pestaña: la de su paso.
  useEffect(() => {
    if (!cargando && (!vista || !vistas.includes(vista))) setVista(vistas[0] ?? null);
  }, [cargando, vistas, vista]);

  useEffect(() => {
    if (vista !== "odoo" || !/^\d{4}-\d{2}$/.test(mes)) return;
    const ctrl = new AbortController();
    setCargandoMes(true);
    fetch(`/api/notas-credito/odoo?mes=${mes}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "No se pudo leer Odoo");
        setOdooMes(j.notas || []);
        setErrorOdoo("");
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setErrorOdoo(e?.message || "No se pudo leer Odoo");
      })
      .finally(() => setCargandoMes(false));
    return () => ctrl.abort();
  }, [vista, mes]);

  const tiene = useCallback((sede: number, paso: PasoNC) => (pasos[sede] ?? []).includes(paso), [pasos]);

  /** Lo que espera a la sesión (resaltado en la lista). */
  const esMia = useCallback(
    (n: SolicitudNC) => {
      const paso = PASO_DEL_ESTADO[n.estado];
      return !!paso && tiene(n.company_id, paso) && !(n.estado === "aprobada" && n.odoo_estado === "posted");
    },
    [tiene],
  );

  const sedesVisibles = superadmin ? SEDES : Object.keys(pasos).map(Number);
  // Crea quien preaprueba en la sede (o el SuperAdmin), solo en sedes con el flujo activo.
  const sedesQueCrean = (superadmin ? SEDES : Object.entries(pasos).filter(([, p]) => p.includes("preaprueba")).map(([s]) => Number(s))).filter((s) =>
    sedesActivas.includes(s),
  );

  const filaSol = (s: SolicitudNC, odoo?: NotaOdoo): Fila => ({
    tipo: "sol",
    clave: `s${s.id}`,
    fecha: odoo?.fecha || s.created_at,
    sede: s.company_id,
    sol: s,
    odoo,
  });
  const filaAnt = (a: AnteriorNC): Fila => ({ tipo: "ant", clave: `a${a.rma_nota_id}`, fecha: a.created_at, sede: a.company_id, ant: a });
  const filaOdoo = (o: NotaOdoo): Fila => ({ tipo: "odoo", clave: `o${o.id}`, fecha: o.fecha || "", sede: o.company_id, odoo: o });

  const porMove = useMemo(() => new Map(borradores.map((b) => [b.id, b])), [borradores]);
  const conOdoo = useCallback((s: SolicitudNC) => filaSol(s, s.odoo_move_id ? porMove.get(s.odoo_move_id) : undefined), [porMove]);

  const soyYo = useCallback(
    (s: SolicitudNC) =>
      (!!yo.email && (s.creado_email || "").toLowerCase().trim() === yo.email) ||
      (!!yo.nombre && (s.preaprobado_por === yo.nombre || (s.rechazado_paso === "preaprueba" && s.rechazado_por === yo.nombre))),
    [yo],
  );

  /** Las filas de cada pestaña. */
  const filasDe = useCallback(
    (v: VistaNC): Fila[] => {
      switch (v) {
        case "preaprobar":
          return notas.filter((s) => s.estado === "por_preaprobar" && tiene(s.company_id, "preaprueba")).map((s) => filaSol(s));
        case "mis_creadas":
          return notas.filter((s) => tiene(s.company_id, "preaprueba") && s.estado !== "por_preaprobar" && soyYo(s)).map(conOdoo);
        case "aprobar":
          return notas.filter((s) => s.estado === "por_aprobar" && tiene(s.company_id, "aprueba")).map((s) => filaSol(s));
        case "procesar": {
          const vinculadas = new Set(notas.map((s) => s.odoo_move_id).filter(Boolean) as number[]);
          return [
            ...notas.filter((s) => s.estado === "aprobada" && tiene(s.company_id, "procesa")).map(conOdoo),
            ...anteriores.filter((a) => a.puede_pasar && tiene(a.company_id, "procesa")).map(filaAnt),
            // NC en borrador en Odoo hechas sin solicitud: también son de quien las termina.
            ...borradores.filter((b) => !vinculadas.has(b.id) && !b.solicitud_id && tiene(b.company_id, "procesa")).map(filaOdoo),
          ].sort(porFecha);
        }
        case "procesadas":
          return notas.filter((s) => s.estado === "procesada" && tiene(s.company_id, "procesa")).map((s) => filaSol(s));
        case "rma":
          return notas.filter((s) => s.origen === "rma" && tiene(s.company_id, "rma")).map(conOdoo);
        case "flujo": {
          const ve = (sede: number) => veTodoLaSede(pasos[sede], superadmin);
          const filas: Fila[] = notas.filter((s) => ve(s.company_id) && (!etapa || etapasDe(s).includes(etapa))).map(conOdoo);
          if (!etapa || etapa === "rma") filas.push(...anteriores.filter((a) => ve(a.company_id)).map(filaAnt));
          return filas.sort(porFecha);
        }
        case "odoo": {
          const porSolicitud = new Map(notas.map((s) => [s.id, s]));
          const enOdoo = new Set<number>();
          const filas: Fila[] = [];
          for (const o of odooMes) {
            const s = o.solicitud_id ? porSolicitud.get(o.solicitud_id) : undefined;
            if (s) {
              enOdoo.add(s.id);
              filas.push(filaSol(s, o));
            } else {
              filas.push(filaOdoo(o));
            }
          }
          // Solicitudes del mes que no están (o todavía no) entre las NC de Odoo del mes.
          for (const s of notas) {
            if (!enOdoo.has(s.id) && mesDe(s.created_at) === mes && veOdooDeLaSede(pasos[s.company_id], superadmin)) filas.push(filaSol(s));
          }
          for (const a of anteriores) if (mesDe(a.created_at) === mes) filas.push(filaAnt(a));
          return filas.sort(porFecha);
        }
        default:
          return [];
      }
    },
    [notas, anteriores, borradores, odooMes, mes, etapa, pasos, superadmin, tiene, soyYo, conOdoo],
  );

  const base: Fila[] = useMemo(() => (vista ? filasDe(vista) : []), [vista, filasDe]);
  const visibles = useMemo(() => {
    const q = sinAcentos(filtros.q.trim());
    const palabras = q ? q.split(/\s+/) : [];
    return base.filter((f) => {
      if (filtros.sede && f.sede !== filtros.sede) return false;
      if (filtros.estado && estadoFila(f) !== filtros.estado) return false;
      if (filtros.origen && origenFila(f) !== filtros.origen) return false;
      if (palabras.length) {
        const t = textoFila(f);
        if (!palabras.every((p) => t.includes(p))) return false;
      }
      return true;
    });
  }, [base, filtros]);

  /** Cuántas hay en cada etapa del filtro de "Todo el flujo". */
  const porEtapa = useMemo(() => {
    const n: Record<EtapaNC, number> = { rma: 0, preaprueba: 0, aprueba: 0, procesados: 0 };
    for (const s of notas) {
      if (!veTodoLaSede(pasos[s.company_id], superadmin)) continue;
      for (const e of etapasDe(s)) n[e]++;
    }
    n.rma += anteriores.filter((a) => veTodoLaSede(pasos[a.company_id], superadmin)).length;
    return n;
  }, [notas, anteriores, pasos, superadmin]);

  const sinSolicitud = (f: Fila) => f.tipo === "odoo" && f.odoo.estado !== "cancel" && !f.odoo.solicitud_id;
  const resumen = useMemo(() => {
    const filas = vista === "odoo" ? visibles : [];
    const vigentes = filas.filter((f) => f.tipo !== "ant" && !(f.tipo === "odoo" && f.odoo.estado === "cancel"));
    const total = new Map<string, number>();
    for (const f of filas) {
      const o = f.tipo === "odoo" ? f.odoo : f.tipo === "sol" ? f.odoo : undefined;
      if (o?.estado === "posted") total.set(o.moneda, (total.get(o.moneda) || 0) + o.total);
    }
    return {
      enOdoo: filas.filter((f) => (f.tipo === "odoo" || (f.tipo === "sol" && f.odoo)) && (f.tipo === "odoo" ? f.odoo.estado : f.odoo?.estado) !== "cancel").length,
      sin: filas.filter(sinSolicitud).length,
      porHacer: vigentes.filter((f) => f.tipo === "sol" && !f.odoo && ["por_preaprobar", "por_aprobar", "aprobada"].includes(f.sol.estado)).length,
      total: [...total.entries()],
    };
  }, [visibles, vista]);

  const abrir = (id: number | null) => router.replace(id ? `?id=${id}` : "?", { scroll: false });

  const pasarAlFlujo = async (a: AnteriorNC) => {
    setPasando(a.rma_nota_id);
    setAvisoAnterior(null);
    try {
      const r = await fetch("/api/notas-credito/anteriores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rma_nota_id: a.rma_nota_id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo pasar al flujo");
      await cargar();
      abrir(j.id);
    } catch (e: any) {
      setAvisoAnterior({ id: a.rma_nota_id, texto: e?.message || "No se pudo pasar al flujo" });
    } finally {
      setPasando(null);
    }
  };

  /** Contador de cada pestaña: solo las que esperan a la sesión. */
  const contador = (v: VistaNC) => (["preaprobar", "aprobar", "procesar"].includes(v) ? filasDe(v).length : 0);

  /** Si la NC ya está en Odoo: lo que más importa en "Procesados". */
  const estadoNC = (n: SolicitudNC, o?: NotaOdoo) => {
    if (n.estado !== "aprobada" && n.estado !== "procesada") return null;
    const estado = o?.estado || n.odoo_estado;
    if (!n.odoo_move_id) return <Badge className="border border-rose-200 bg-rose-50 text-[11px] text-rose-700">NC sin crear</Badge>;
    if (estado === "posted") return <Badge className={`${ESTADO_ODOO.posted.c} border text-[11px]`}>NC creada · {o?.nombre || n.odoo_move_nombre}</Badge>;
    return <Badge className={`${ESTADO_ODOO.draft.c} border text-[11px]`}>NC creada en borrador</Badge>;
  };

  const tarjeta = (f: Fila) => {
    if (f.tipo === "sol") {
      const n = f.sol;
      const productos = n.lineas?.length
        ? n.lineas.map((l) => `${l.cantidad > 1 ? `${l.cantidad} × ` : ""}${l.producto}${l.seriales.length ? ` (${l.seriales.join(", ")})` : ""}`).join(" · ")
        : n.producto;
      return (
        <button key={f.clave} type="button" onClick={() => abrir(n.id)} className="block w-full text-left">
          <Card className={`rounded-3xl border-none shadow-sm transition hover:shadow-md ${esMia(n) ? "ring-2 ring-orange-300" : ""}`}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900">{f.odoo?.estado === "posted" ? f.odoo.nombre : `NC-${n.id}`}</span>
                  {f.odoo?.estado === "posted" && <span className="text-xs text-slate-400">NC-{n.id}</span>}
                  <Badge className={`${COLOR_ESTADO[n.estado]} border text-[11px]`}>{ETIQUETA_ESTADO[n.estado]}</Badge>
                  {estadoNC(n, f.odoo)}
                  <Badge variant="outline" className="text-[11px]">
                    {n.origen === "rma" ? `RMA N.º ${n.case_number}` : n.origen === "cliente" ? "Cliente (portal)" : "Directa"}
                  </Badge>
                  <span className="text-xs text-slate-400">{NOMBRE_SEDE[n.company_id] || n.company_id}</span>
                </div>
                <p className="truncate text-sm text-slate-700">
                  {n.cliente || "—"}
                  {n.factura_nombre ? <span className="text-slate-400"> · Factura {n.factura_nombre}</span> : null}
                </p>
                {productos && <p className="line-clamp-1 text-sm text-slate-600">{productos}</p>}
                <p className="line-clamp-1 text-sm text-slate-500">{n.motivo}</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="font-bold text-slate-900">
                  {f.odoo ? formatoMonto(f.odoo.total, f.odoo.moneda) : n.monto != null ? formatoMonto(n.monto, n.moneda) : "—"}
                </p>
                <p className="text-xs text-slate-400">
                  {n.creado_por} · {fecha(f.odoo?.fecha || n.created_at)}
                </p>
              </div>
            </CardContent>
          </Card>
        </button>
      );
    }
    if (f.tipo === "odoo") {
      const o = f.odoo;
      return (
        <a key={f.clave} href={o.url} target="_blank" rel="noreferrer" className="block">
          <Card className={`rounded-3xl border-none shadow-sm transition hover:shadow-md ${o.estado === "cancel" ? "opacity-60" : ""}`}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-bold text-slate-900">
                    {o.nombre} <ExternalLink className="h-3 w-3 text-slate-400" />
                  </span>
                  <Badge className={`${ESTADO_ODOO[o.estado]?.c || ""} border text-[11px]`}>{ESTADO_ODOO[o.estado]?.t || o.estado}</Badge>
                  {o.solicitud_id ? (
                    <Badge variant="outline" className="text-[11px]">NC-{o.solicitud_id}</Badge>
                  ) : o.estado !== "cancel" ? (
                    <Badge className="border border-orange-200 bg-orange-50 text-[11px] text-orange-700">Hecha en Odoo, sin solicitud</Badge>
                  ) : null}
                  <span className="text-xs text-slate-400">{NOMBRE_SEDE[o.company_id] || o.company_id}</span>
                </div>
                <p className="truncate text-sm text-slate-700">
                  {o.cliente || "—"}
                  {o.factura ? <span className="text-slate-400"> · Factura {o.factura}</span> : null}
                </p>
                {o.ref && <p className="line-clamp-1 text-sm text-slate-500">{o.ref}</p>}
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="font-bold text-slate-900">{formatoMonto(o.total, o.moneda)}</p>
                <p className="text-xs text-slate-400">
                  {o.creado_por} · {fecha(o.fecha)}
                </p>
              </div>
            </CardContent>
          </Card>
        </a>
      );
    }
    const a = f.ant;
    return (
      <Card key={f.clave} className={`rounded-3xl border-none shadow-sm ${a.puede_pasar ? "ring-2 ring-orange-300" : ""}`}>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">RMA N.º {a.case_number}</span>
              <Badge className={`${ESTADO_ANTERIOR[a.estado]?.c || ""} border text-[11px]`}>{ESTADO_ANTERIOR[a.estado]?.t || a.estado}</Badge>
              <span className="text-xs text-slate-400">{NOMBRE_SEDE[a.company_id] || a.company_id}</span>
            </div>
            <p className="truncate text-sm text-slate-700">
              {a.cliente || "—"}
              {a.factura ? <span className="text-slate-400"> · Factura {a.factura}</span> : null}
              {a.producto ? <span className="text-slate-400"> · {a.producto}</span> : null}
            </p>
            <p className="line-clamp-2 text-sm text-slate-500">{a.motivo}</p>
            {avisoAnterior?.id === a.rma_nota_id && <p className="text-sm text-rose-700">{avisoAnterior.texto}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <p className="text-xs text-slate-400">
              {a.creado_por} · {fecha(a.created_at)}
            </p>
            {a.puede_pasar ? (
              <Button size="sm" disabled={pasando === a.rma_nota_id} onClick={() => pasarAlFlujo(a)}>
                {pasando === a.rma_nota_id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Pasar al flujo
              </Button>
            ) : a.estado === "pendiente" ? (
              <p className="max-w-[16rem] text-xs text-slate-400 sm:text-right">
                {superadmin || tiene(a.company_id, "procesa")
                  ? "La sede no tiene el flujo activo: completa sus responsables."
                  : "La pasa al flujo el SuperAdmin o quien hace la nota."}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const etapas: (EtapaNC | "")[] = ["", "rma", "preaprueba", "aprueba", "procesados"];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-3">
            <FileCheck2 className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Notas de crédito</h1>
            <p className="text-sm text-slate-500">Cada quien ve lo que le toca en el flujo de aprobación.</p>
          </div>
        </div>
        {sedesQueCrean.length > 0 && (
          <Button className="bg-purple-600 text-white hover:bg-purple-700" onClick={() => setNueva(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva nota de crédito
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {vistas.map((v) => {
          const n = contador(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                setVista(v);
                setFiltros(FILTROS_VACIOS);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${vista === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"}`}
            >
              {ETIQUETA_VISTA[v]}
              {n ? <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 text-[11px] text-white">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {errorOdoo && veAlgoDeOdoo && (vista === "odoo" || vista === "procesar") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No se pudo leer Odoo ({errorOdoo}): faltan las notas de crédito que están allá.
        </div>
      )}

      {vista === "flujo" && (
        <div className="flex flex-wrap gap-2">
          {etapas.map((e) => (
            <button
              key={e || "todas"}
              type="button"
              onClick={() => setEtapa(e)}
              className={`rounded-xl border px-3 py-1.5 text-sm ${etapa === e ? "border-purple-500 bg-purple-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-purple-300"}`}
            >
              {e ? ETIQUETA_ETAPA[e] : "Todo"}
              {e ? <span className={`ml-1.5 text-xs ${etapa === e ? "text-purple-100" : "text-slate-400"}`}>{porEtapa[e]}</span> : null}
            </button>
          ))}
        </div>
      )}

      {vista && vista !== "responsables" && (
        <FiltrosNC
          filtros={filtros}
          onCambio={setFiltros}
          sedes={sedesVisibles}
          estados={ESTADOS_VISTA[vista] ?? []}
          conOrigen={vista === "flujo" || vista === "odoo" || vista === "procesar"}
          total={base.length}
          coinciden={visibles.length}
          {...(vista === "odoo" ? { mes, onMes: setMes } : {})}
        />
      )}

      {vista === "odoo" && !cargandoMes && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">En Odoo</p>
            <p className="text-2xl font-bold text-slate-900">{resumen.enOdoo}</p>
            <p className="text-xs text-slate-400">sin contar anuladas</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Sin solicitud</p>
            <p className={`text-2xl font-bold ${resumen.sin ? "text-orange-600" : "text-slate-900"}`}>{resumen.sin}</p>
            <p className="text-xs text-slate-400">hechas en Odoo sin pasar por la aprobación</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Todavía no en Odoo</p>
            <p className="text-2xl font-bold text-slate-900">{resumen.porHacer}</p>
            <p className="text-xs text-slate-400">solicitudes del mes en el flujo</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Total publicado</p>
            {resumen.total.length ? (
              resumen.total.map(([mon, t]) => (
                <p key={mon} className="text-lg font-bold text-slate-900">
                  {formatoMonto(t, mon)}
                </p>
              ))
            ) : (
              <p className="text-2xl font-bold text-slate-900">—</p>
            )}
          </div>
        </div>
      )}

      {vista === "responsables" ? (
        <Responsables />
      ) : cargando || (vista === "odoo" && cargandoMes) ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : visibles.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="py-12 text-center text-slate-400">
            <FileText className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>{vista ? VACIO[vista] : "No tienes un paso en el flujo de notas de crédito."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">{visibles.map(tarjeta)}</div>
      )}

      {abierta && <DetalleNota id={abierta} onCerrar={() => abrir(null)} onCambio={cargar} />}
      {nueva && (
        <NuevaNota
          sedes={sedesQueCrean}
          onCerrar={() => setNueva(false)}
          onCreada={(id) => {
            setNueva(false);
            cargar();
            abrir(id);
          }}
        />
      )}
    </div>
  );
}
