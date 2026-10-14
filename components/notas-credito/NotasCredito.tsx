"use client";

import { DetalleNota } from "@/components/notas-credito/DetalleNota";
import { NuevaNota } from "@/components/notas-credito/NuevaNota";
import { Responsables } from "@/components/notas-credito/Responsables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  COLOR_ESTADO,
  ESTADOS_ABIERTOS,
  ETIQUETA_ESTADO,
  formatoMonto,
  NOMBRE_SEDE,
  PASO_DEL_ESTADO,
  type PasoNC,
  type SolicitudNC,
} from "@/lib/notas-credito/tipos";
import { FileCheck2, FileText, Loader2, Plus } from "lucide-react";
import type { AnteriorNC } from "@/lib/notas-credito/anteriores";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Pestana = "mias" | "abiertas" | "todas" | "responsables";

const ESTADO_ANTERIOR: Record<string, { t: string; c: string }> = {
  pendiente: { t: "Pendiente, fuera del flujo", c: "bg-amber-100 text-amber-800 border-amber-200" },
  aprobada: { t: "Registrada antes del flujo", c: "bg-slate-100 text-slate-600 border-slate-200" },
  rechazada: { t: "Rechazada (antes del flujo)", c: "bg-rose-100 text-rose-800 border-rose-200" },
};

const fecha = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Caracas" }) : "";

/**
 * Pantalla de notas de crédito (/notas-credito). Cada quien ve las de las
 * sedes donde tiene un paso; "Por hacer" son las que esperan su decisión o,
 * para quien hace la nota, las aprobadas.
 */
export function NotasCredito() {
  const router = useRouter();
  const sp = useSearchParams();
  const abierta = Number(sp.get("id")) || null;
  const [notas, setNotas] = useState<SolicitudNC[]>([]);
  const [pasos, setPasos] = useState<Record<number, PasoNC[]>>({});
  const [superadmin, setSuperadmin] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState<Pestana>("mias");
  const [nueva, setNueva] = useState(false);
  const [anteriores, setAnteriores] = useState<AnteriorNC[]>([]);
  const [pasando, setPasando] = useState<number | null>(null);
  const [avisoAnterior, setAvisoAnterior] = useState<{ id: number; ok: boolean; texto: string } | null>(null);

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
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const esMia = useCallback(
    (n: SolicitudNC) => {
      const paso = PASO_DEL_ESTADO[n.estado];
      return !!paso && (pasos[n.company_id] ?? []).includes(paso);
    },
    [pasos],
  );

  const mias = useMemo(() => notas.filter(esMia), [notas, esMia]);
  const tieneAlgunPaso = Object.keys(pasos).length > 0;
  const sedesQueCrean = Object.entries(pasos)
    .filter(([, p]) => p.includes("preaprueba"))
    .map(([s]) => Number(s));

  useEffect(() => {
    if (!cargando && !tieneAlgunPaso && pestana === "mias") setPestana("abiertas");
  }, [cargando, tieneAlgunPaso, pestana]);

  const visibles =
    pestana === "mias" ? mias : pestana === "abiertas" ? notas.filter((n) => ESTADOS_ABIERTOS.includes(n.estado)) : notas;

  const abrir = (id: number | null) => router.replace(id ? `?id=${id}` : "?", { scroll: false });

  // Solicitudes de RMA fuera del flujo (anteriores, o de sedes sin flujo activo).
  const anterioresVisibles =
    pestana === "mias"
      ? anteriores.filter((a) => a.puede_pasar)
      : pestana === "abiertas"
        ? anteriores.filter((a) => a.estado === "pendiente")
        : anteriores;
  const nPendientesAnteriores = anteriores.filter((a) => a.estado === "pendiente").length;

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
      setAvisoAnterior({ id: a.rma_nota_id, ok: false, texto: e?.message || "No se pudo pasar al flujo" });
    } finally {
      setPasando(null);
    }
  };

  const pestanas: { id: Pestana; t: string; n?: number; ver: boolean }[] = [
    { id: "mias", t: "Por hacer", n: mias.length + anteriores.filter((a) => a.puede_pasar).length, ver: tieneAlgunPaso },
    {
      id: "abiertas",
      t: "En curso",
      n: notas.filter((n) => ESTADOS_ABIERTOS.includes(n.estado)).length + nPendientesAnteriores,
      ver: true,
    },
    { id: "todas", t: "Todas", ver: true },
    { id: "responsables", t: "Responsables", ver: superadmin },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-3">
            <FileCheck2 className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Notas de crédito</h1>
            <p className="text-sm text-slate-500">Solicitud → preaprobación (RMA) → aprobación → se hace en Odoo.</p>
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

      {pestana === "responsables" ? (
        <Responsables />
      ) : cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : visibles.length === 0 && anterioresVisibles.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="py-12 text-center text-slate-400">
            <FileText className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>{pestana === "mias" ? "Nada esperando por ti." : "No hay notas de crédito."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibles.map((n) => (
            <button key={n.id} type="button" onClick={() => abrir(n.id)} className="block w-full text-left">
              <Card className={`rounded-3xl border-none shadow-sm transition hover:shadow-md ${esMia(n) ? "ring-2 ring-orange-300" : ""}`}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">NC-{n.id}</span>
                      <Badge className={`${COLOR_ESTADO[n.estado]} border text-[11px]`}>{ETIQUETA_ESTADO[n.estado]}</Badge>
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
                    <p className="font-bold text-slate-900">{n.monto != null ? formatoMonto(n.monto, n.moneda) : "—"}</p>
                    <p className="text-xs text-slate-400">
                      {n.creado_por} · {fecha(n.created_at)}
                    </p>
                    {n.odoo_move_nombre && <p className="text-xs text-emerald-700">{n.odoo_move_nombre}</p>}
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}

          {anterioresVisibles.length > 0 && (
            <div className="space-y-3 pt-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Solicitudes de RMA fuera del flujo</h2>
                <p className="text-xs text-slate-400">
                  Las que RMA pidió antes del flujo o en una sede sin sus responsables completos. Las pendientes se pasan al flujo para
                  que sigan preaprobación y aprobación.
                </p>
              </div>
              {anterioresVisibles.map((a) => (
                <Card key={`rma-${a.rma_nota_id}`} className={`rounded-3xl border-none shadow-sm ${a.puede_pasar ? "ring-2 ring-orange-300" : ""}`}>
                  <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">RMA N.º {a.case_number}</span>
                        <Badge className={`${ESTADO_ANTERIOR[a.estado]?.c || ""} border text-[11px]`}>
                          {ESTADO_ANTERIOR[a.estado]?.t || a.estado}
                        </Badge>
                        <span className="text-xs text-slate-400">{NOMBRE_SEDE[a.company_id] || a.company_id}</span>
                      </div>
                      <p className="truncate text-sm text-slate-700">
                        {a.cliente || "—"}
                        {a.factura ? <span className="text-slate-400"> · Factura {a.factura}</span> : null}
                        {a.producto ? <span className="text-slate-400"> · {a.producto}</span> : null}
                      </p>
                      <p className="line-clamp-2 text-sm text-slate-500">{a.motivo}</p>
                      {avisoAnterior?.id === a.rma_nota_id && (
                        <p className={`text-sm ${avisoAnterior.ok ? "text-emerald-700" : "text-rose-700"}`}>{avisoAnterior.texto}</p>
                      )}
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
              ))}
            </div>
          )}
        </div>
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
