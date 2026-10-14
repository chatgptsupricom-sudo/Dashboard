"use client";

import { DetalleNota } from "@/components/notas-credito/DetalleNota";
import { NuevaNota } from "@/components/notas-credito/NuevaNota";
import { Responsables } from "@/components/notas-credito/Responsables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AnteriorNC } from "@/lib/notas-credito/anteriores";
import type { NotaOdooMes } from "@/lib/notas-credito/odoo";
import {
  COLOR_ESTADO,
  ESTADOS_ABIERTOS,
  ETIQUETA_ESTADO,
  formatoMonto,
  NOMBRE_SEDE,
  PASO_DEL_ESTADO,
  SEDES,
  type PasoNC,
  type SolicitudNC,
} from "@/lib/notas-credito/tipos";
import { ExternalLink, FileCheck2, FileText, Loader2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Pestana = "mias" | "abiertas" | "todas" | "responsables";
type NotaOdoo = NotaOdooMes & { solicitud_id: number | null };

/**
 * Una fila de la lista. La lista es una sola: las notas de crédito de Odoo y
 * las solicitudes del panel que todavía no llegan a Odoo. Una NC que salió de
 * una solicitud es UNA fila (la solicitud con su nota de Odoo).
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

/**
 * Pantalla de notas de crédito (/notas-credito). Cada quien ve las de las
 * sedes donde tiene un paso (el SuperAdmin, todas).
 *   Por hacer  lo que espera su decisión (o, a quien hace la nota, las aprobadas).
 *   En curso   solicitudes abiertas del panel + NC en borrador en Odoo.
 *   Todas      las NC de Odoo del mes + las solicitudes del mes que todavía no llegan a Odoo.
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorOdoo, setErrorOdoo] = useState("");
  const [pestana, setPestana] = useState<Pestana>("mias");
  const [nueva, setNueva] = useState(false);
  const [pasando, setPasando] = useState<number | null>(null);
  const [avisoAnterior, setAvisoAnterior] = useState<{ id: number; texto: string } | null>(null);
  // Todas: mes y sede
  const [mes, setMes] = useState(mesActual);
  const [sedeFiltro, setSedeFiltro] = useState(0);
  const [soloSin, setSoloSin] = useState(false);
  const [odooMes, setOdooMes] = useState<NotaOdoo[]>([]);
  const [cargandoMes, setCargandoMes] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/notas-credito");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo cargar");
      setNotas(j.notas || []);
      setAnteriores(j.anteriores || []);
      setPasos(j.pasos || {});
      setSuperadmin(!!j.superadmin);
      setError("");
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar");
    } finally {
      setCargando(false);
    }
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

  useEffect(() => {
    if (pestana !== "todas" || !/^\d{4}-\d{2}$/.test(mes)) return;
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
  }, [pestana, mes]);

  const esMia = useCallback(
    (n: SolicitudNC) => {
      const paso = PASO_DEL_ESTADO[n.estado];
      return !!paso && (pasos[n.company_id] ?? []).includes(paso);
    },
    [pasos],
  );

  const tieneAlgunPaso = Object.keys(pasos).length > 0;
  const sedesVisibles = superadmin ? SEDES : Object.keys(pasos).map(Number);
  const sedesQueCrean = Object.entries(pasos)
    .filter(([, p]) => p.includes("preaprueba"))
    .map(([s]) => Number(s));

  useEffect(() => {
    if (!cargando && !tieneAlgunPaso && pestana === "mias") setPestana("abiertas");
  }, [cargando, tieneAlgunPaso, pestana]);

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

  const filasMias = useMemo<Fila[]>(
    () => [...notas.filter(esMia).map((s) => filaSol(s)), ...anteriores.filter((a) => a.puede_pasar).map(filaAnt)],
    [notas, anteriores, esMia],
  );

  const filasEnCurso = useMemo<Fila[]>(() => {
    const porMove = new Map(borradores.map((b) => [b.id, b]));
    const abiertas = notas.filter((s) => ESTADOS_ABIERTOS.includes(s.estado));
    const vinculadas = new Set(abiertas.map((s) => s.odoo_move_id).filter(Boolean) as number[]);
    return [
      ...abiertas.map((s) => filaSol(s, s.odoo_move_id ? porMove.get(s.odoo_move_id) : undefined)),
      ...anteriores.filter((a) => a.estado === "pendiente").map(filaAnt),
      ...borradores.filter((b) => !vinculadas.has(b.id) && !b.solicitud_id).map(filaOdoo),
    ].sort((x, y) => orden(y.fecha).localeCompare(orden(x.fecha)));
  }, [notas, anteriores, borradores]);

  const filasTodas = useMemo<Fila[]>(() => {
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
    for (const s of notas) if (!enOdoo.has(s.id) && mesDe(s.created_at) === mes) filas.push(filaSol(s));
    for (const a of anteriores) if (mesDe(a.created_at) === mes) filas.push(filaAnt(a));
    return filas
      .filter((f) => !sedeFiltro || f.sede === sedeFiltro)
      .sort((x, y) => orden(y.fecha).localeCompare(orden(x.fecha)));
  }, [notas, anteriores, odooMes, mes, sedeFiltro]);

  const sinSolicitud = (f: Fila) => f.tipo === "odoo" && f.odoo.estado !== "cancel" && !f.odoo.solicitud_id;
  const resumen = useMemo(() => {
    const vigentes = filasTodas.filter((f) => f.tipo !== "ant" && !(f.tipo === "odoo" && f.odoo.estado === "cancel"));
    const total = new Map<string, number>();
    for (const f of filasTodas) {
      const o = f.tipo === "odoo" ? f.odoo : f.tipo === "sol" ? f.odoo : undefined;
      if (o?.estado === "posted") total.set(o.moneda, (total.get(o.moneda) || 0) + o.total);
    }
    return {
      enOdoo: filasTodas.filter((f) => (f.tipo === "odoo" || (f.tipo === "sol" && f.odoo)) && (f.tipo === "odoo" ? f.odoo.estado : f.odoo?.estado) !== "cancel").length,
      sin: filasTodas.filter(sinSolicitud).length,
      porHacer: vigentes.filter((f) => f.tipo === "sol" && !f.odoo && ESTADOS_ABIERTOS.includes(f.sol.estado)).length,
      total: [...total.entries()],
    };
  }, [filasTodas]);

  const visibles =
    pestana === "mias" ? filasMias : pestana === "abiertas" ? filasEnCurso : soloSin ? filasTodas.filter(sinSolicitud) : filasTodas;

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

  const pestanas: { id: Pestana; t: string; n?: number; ver: boolean }[] = [
    { id: "mias", t: "Por hacer", n: filasMias.length, ver: tieneAlgunPaso },
    { id: "abiertas", t: "En curso", n: filasEnCurso.length, ver: true },
    { id: "todas", t: "Todas", ver: true },
    { id: "responsables", t: "Responsables", ver: superadmin },
  ];

  const tarjeta = (f: Fila) => {
    if (f.tipo === "sol") {
      const n = f.sol;
      return (
        <button key={f.clave} type="button" onClick={() => abrir(n.id)} className="block w-full text-left">
          <Card className={`rounded-3xl border-none shadow-sm transition hover:shadow-md ${esMia(n) ? "ring-2 ring-orange-300" : ""}`}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900">{f.odoo ? f.odoo.nombre : `NC-${n.id}`}</span>
                  {f.odoo && <span className="text-xs text-slate-400">NC-{n.id}</span>}
                  <Badge className={`${COLOR_ESTADO[n.estado]} border text-[11px]`}>{ETIQUETA_ESTADO[n.estado]}</Badge>
                  {f.odoo && f.odoo.estado !== "posted" && (
                    <Badge className={`${ESTADO_ODOO[f.odoo.estado]?.c || ""} border text-[11px]`}>{ESTADO_ODOO[f.odoo.estado]?.t || f.odoo.estado}</Badge>
                  )}
                  <Badge variant="outline" className="text-[11px]">
                    {n.origen === "rma" ? `RMA N.º ${n.case_number}` : "Directa"}
                  </Badge>
                  <span className="text-xs text-slate-400">{NOMBRE_SEDE[n.company_id] || n.company_id}</span>
                </div>
                <p className="truncate text-sm text-slate-700">
                  {n.cliente || "—"}
                  {n.factura_nombre ? <span className="text-slate-400"> · Factura {n.factura_nombre}</span> : null}
                  {n.producto ? <span className="text-slate-400"> · {n.producto}</span> : null}
                </p>
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
                {superadmin || (pasos[a.company_id] ?? []).includes("preaprueba")
                  ? "La sede no tiene el flujo activo: completa sus responsables."
                  : "La pasa al flujo el SuperAdmin o quien preaprueba."}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-3">
            <FileCheck2 className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Notas de crédito</h1>
            <p className="text-sm text-slate-500">Las de Odoo y las solicitudes del panel, en una sola lista.</p>
          </div>
        </div>
        {sedesQueCrean.length > 0 && (
          <Button className="bg-purple-600 text-white hover:bg-purple-700" onClick={() => setNueva(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva nota de crédito
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {pestanas
          .filter((p) => p.ver)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${pestana === p.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"}`}
            >
              {p.t}
              {p.n ? <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 text-[11px] text-white">{p.n}</span> : null}
            </button>
          ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {errorOdoo && pestana !== "responsables" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No se pudo leer Odoo ({errorOdoo}): faltan las notas de crédito que están allá.
        </div>
      )}

      {pestana === "todas" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-500">Mes</span>
              <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44 bg-white" />
            </label>
            {sedesVisibles.length > 1 && (
              <label className="space-y-1">
                <span className="block text-xs font-medium text-slate-500">Sede</span>
                <select
                  className="h-9 rounded-md border bg-white px-3 text-sm"
                  value={sedeFiltro}
                  onChange={(e) => setSedeFiltro(Number(e.target.value))}
                >
                  <option value={0}>Todas</option>
                  {sedesVisibles.map((s) => (
                    <option key={s} value={s}>
                      {NOMBRE_SEDE[s] || s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex h-9 items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} />
              Solo las hechas en Odoo sin solicitud
            </label>
          </div>
          {!cargandoMes && (
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
        </div>
      )}

      {pestana === "responsables" ? (
        <Responsables />
      ) : cargando || (pestana === "todas" && cargandoMes) ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : visibles.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="py-12 text-center text-slate-400">
            <FileText className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>
              {pestana === "mias"
                ? "Nada esperando por ti."
                : pestana === "abiertas"
                  ? "No hay notas de crédito en curso."
                  : "No hay notas de crédito este mes."}
            </p>
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
