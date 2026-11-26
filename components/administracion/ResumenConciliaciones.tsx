"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Aviso } from "@/components/administracion/comunes";
import type { CeldaResumen, EstadoResumen, ResumenConciliaciones as Resumen } from "@/lib/administracion/bancos";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileX, Loader2, Lock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const mesCorto = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1)).toLocaleDateString("es-VE", { month: "short", timeZone: "UTC" }).replace(".", "");
const mesLargo = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1)).toLocaleDateString("es-VE", { month: "long", year: "numeric", timeZone: "UTC" });
const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Color, icono y nombre de cada estado: los mismos en tarjetas, celdas y leyenda. */
const ESTADO: Record<EstadoResumen, { nombre: string; corto: string; celda: string; punto: string; icono: typeof Lock }> = {
  cerrado: { nombre: "Cerrado", corto: "Cerrado", celda: "bg-emerald-500 text-white border-emerald-500", punto: "bg-emerald-500", icono: Lock },
  listo: { nombre: "Listo para cerrar", corto: "Listo", celda: "bg-sky-50 text-sky-800 border-sky-300", punto: "bg-sky-400", icono: CheckCircle2 },
  pendiente: { nombre: "Con pendientes", corto: "Falta", celda: "bg-amber-50 text-amber-900 border-amber-300", punto: "bg-amber-400", icono: AlertTriangle },
  sin_estado: { nombre: "Sin estado de cuenta", corto: "Sin estado", celda: "bg-gray-50 text-gray-500 border-dashed border-gray-300", punto: "bg-gray-300", icono: FileX },
  en_curso: { nombre: "Mes en curso", corto: "En curso", celda: "bg-white text-gray-500 border-gray-200", punto: "bg-white border border-gray-300", icono: Clock },
};
const ORDEN_TARJETAS: EstadoResumen[] = ["cerrado", "listo", "pendiente", "sin_estado"];

/**
 * Resumen de las conciliaciones bancarias de la sede: cada cuenta, mes por mes desde el
 * corte a Odoo. Arriba el avance; en el medio la matriz cuenta × mes (tocar un mes muestra
 * su detalle abajo, con el botón para abrirlo en Conciliar); abajo la lista de lo que falta.
 */
export function ResumenConciliaciones({ sede, abrir }: { sede: number; abrir: (cuenta: number, mes: string) => void }) {
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<{ cuenta: number; mes: string } | null>(null);

  const cargar = useCallback(
    async (refrescar = false) => {
      setCargando(true);
      setError(null);
      try {
        const j = await (await fetch(`/api/administracion/bancos?resumen=1&sede=${sede}${refrescar ? "&refrescar=1" : ""}`)).json();
        if (j.success) setDatos(j.resumen);
        else setError(j.error || "No se pudo armar el resumen");
      } catch {
        setError("No se pudo armar el resumen");
      }
      setCargando(false);
    },
    [sede],
  );
  useEffect(() => {
    setDatos(null);
    setElegida(null);
    cargar();
  }, [cargar]);

  const conEstados = useMemo(() => (datos?.cuentas || []).filter((c) => !c.sinEstados), [datos]);
  const sinEstados = useMemo(() => (datos?.cuentas || []).filter((c) => c.sinEstados), [datos]);
  // Meses que ya terminaron: el mes en curso no cuenta para el avance.
  const terminadas = conEstados.flatMap((c) => Object.values(c.meses)).filter((x) => x.estado !== "en_curso");
  const contar = (e: EstadoResumen) => terminadas.filter((x) => x.estado === e).length;
  const avance = terminadas.length ? Math.round((contar("cerrado") / terminadas.length) * 100) : 0;
  // Lo que falta, del mes más viejo al más nuevo: lo listo primero (solo falta pulsar «Cerrar el mes»).
  const porHacer = conEstados
    .flatMap((c) =>
      (datos?.meses || [])
        .filter((m) => c.meses[m].estado === "listo" || c.meses[m].estado === "pendiente")
        .map((m) => ({ cuenta: c, mes: m, celda: c.meses[m] })),
    )
    .sort((a, b) => (a.celda.estado === b.celda.estado ? a.mes.localeCompare(b.mes) : a.celda.estado === "listo" ? -1 : 1));

  if (!datos) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-gray-500 flex flex-col items-center gap-3 text-center">
          {cargando ? <Loader2 className="h-6 w-6 animate-spin text-gray-400" /> : null}
          {error || "Revisando cada cuenta mes por mes… la primera vez puede tardar hasta un minuto."}
        </CardContent>
      </Card>
    );
  }

  const detalle = elegida && datos.cuentas.find((c) => c.id === elegida.cuenta);
  const celdaElegida = detalle ? detalle.meses[elegida!.mes] : null;

  const celda = (cuenta: number, mes: string, c: CeldaResumen) => {
    const e = ESTADO[c.estado];
    const Icono = e.icono;
    const activa = elegida?.cuenta === cuenta && elegida.mes === mes;
    return (
      <button
        type="button"
        onClick={() => setElegida(activa ? null : { cuenta, mes })}
        title={`${mesLargo(mes)}: ${e.nombre}${c.faltan.length ? ` — falta ${c.faltan.join("; ")}` : ""}`}
        aria-pressed={activa}
        className={`w-full h-14 rounded-lg border px-2 flex flex-col items-center justify-center gap-0.5 text-xs transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${e.celda} ${
          activa ? "ring-2 ring-offset-1 ring-blue-500" : ""
        }`}
      >
        <span className="flex items-center gap-1 font-medium">
          <Icono className="h-3.5 w-3.5" />
          {c.estado === "pendiente" ? `Falta ${c.faltan.length}` : e.corto}
        </span>
        {c.movimientos > 0 && (
          <span className={`tabular-nums text-[11px] ${c.estado === "cerrado" ? "text-emerald-50" : "opacity-80"}`}>
            {c.conciliados}/{c.movimientos}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {/* Avance general */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Avance de las conciliaciones</p>
              <p className="text-3xl font-semibold tabular-nums">
                {avance}% <span className="text-base font-normal text-gray-500">de los meses cerrados</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {contar("cerrado")} de {terminadas.length} meses terminados en {conEstados.length} cuenta{conEstados.length === 1 ? "" : "s"} · calculado{" "}
                {new Date(datos.calculadoEl).toLocaleString("es-VE", { timeStyle: "short", dateStyle: "short" })}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={cargando} onClick={() => cargar(true)}>
              {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Actualizar
            </Button>
          </div>
          {/* Barra apilada: cuanto de lo terminado esta en cada estado. */}
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100" aria-hidden>
            {ORDEN_TARJETAS.map((e) => {
              const n = contar(e);
              return n ? <div key={e} className={ESTADO[e].punto} style={{ width: `${(n / terminadas.length) * 100}%` }} /> : null;
            })}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {ORDEN_TARJETAS.map((e) => {
              const Icono = ESTADO[e].icono;
              return (
                <div key={e} className="rounded-xl border p-3 flex items-center gap-3">
                  <span className={`h-9 w-9 rounded-full flex items-center justify-center ${e === "cerrado" ? "bg-emerald-100 text-emerald-700" : e === "listo" ? "bg-sky-100 text-sky-700" : e === "pendiente" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                    <Icono className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums leading-none">{contar(e)}</p>
                    <p className="text-xs text-gray-500 mt-1">{ESTADO[e].nombre}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Matriz cuenta x mes */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Cuentas mes por mes</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {(Object.keys(ESTADO) as EstadoResumen[]).map((e) => (
                <span key={e} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${ESTADO[e].punto}`} />
                  {ESTADO[e].nombre}
                </span>
              ))}
              <span className="text-gray-400">· n/m = movimientos conciliados</span>
            </div>
          </div>
          {conEstados.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Ninguna cuenta de la sede tiene estado de cuenta cargado todavía.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1.5">
                <thead>
                  <tr className="text-xs text-gray-500">
                    <th className="sticky left-0 z-10 bg-white text-left font-medium pr-3 min-w-[11rem]">Cuenta</th>
                    {datos.meses.map((m) => (
                      <th key={m} className="font-medium capitalize min-w-[5.5rem]">
                        {mesCorto(m)} <span className="text-gray-400">{m.slice(2, 4)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conEstados.map((c) => {
                    const cerrados = Object.values(c.meses).filter((x) => x.estado === "cerrado").length;
                    const term = Object.values(c.meses).filter((x) => x.estado !== "en_curso").length;
                    return (
                      <tr key={c.id}>
                        <td className="sticky left-0 z-10 bg-white pr-3">
                          <p className="text-sm font-medium leading-tight">{c.nombre}</p>
                          <p className="text-xs text-gray-400">
                            {c.moneda} · {cerrados}/{term} cerrados
                          </p>
                        </td>
                        {datos.meses.map((m) => (
                          <td key={m}>
                            {celda(c.id, m, c.meses[m])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Detalle del mes elegido */}
          {detalle && celdaElegida && (
            <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {detalle.nombre} · <span className="capitalize">{mesLargo(elegida!.mes)}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {ESTADO[celdaElegida.estado].nombre}
                    {celdaElegida.cerradoPor && ` por ${celdaElegida.cerradoPor} el ${new Date(celdaElegida.cerradoEl!).toLocaleDateString("es-VE")}`}
                  </p>
                </div>
                <Button size="sm" onClick={() => abrir(detalle.id, elegida!.mes)}>
                  Abrir en Conciliar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg bg-white border p-2">
                  <p className="text-xs text-gray-500">Conciliados</p>
                  <p className="font-semibold tabular-nums">
                    {celdaElegida.conciliados} de {celdaElegida.movimientos}
                  </p>
                </div>
                <div className="rounded-lg bg-white border p-2">
                  <p className="text-xs text-gray-500">Saldo del banco</p>
                  <p className="font-semibold tabular-nums">{celdaElegida.saldoBanco === null ? "—" : `${cifra(celdaElegida.saldoBanco)} ${detalle.moneda}`}</p>
                </div>
                <div className="rounded-lg bg-white border p-2">
                  <p className="text-xs text-gray-500">Saldo en Odoo</p>
                  <p className="font-semibold tabular-nums">{celdaElegida.saldoLibros === null ? "—" : `${cifra(celdaElegida.saldoLibros)} ${detalle.moneda}`}</p>
                </div>
                <div className={`rounded-lg border p-2 ${celdaElegida.diferencia ? "bg-red-50 border-red-200" : "bg-white"}`}>
                  <p className="text-xs text-gray-500">Diferencia</p>
                  <p className={`font-semibold tabular-nums ${celdaElegida.diferencia ? "text-red-700" : ""}`}>
                    {celdaElegida.diferencia === null ? "—" : cifra(celdaElegida.diferencia)}
                  </p>
                </div>
              </div>
              {celdaElegida.faltan.length > 0 && (
                <ul className="text-sm space-y-1">
                  {celdaElegida.faltan.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <span>Falta {f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lo que falta, para ir cerrando */}
      {porHacer.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="font-medium">
              Por cerrar <span className="text-gray-400 font-normal">({porHacer.length})</span>
            </p>
            <ul className="divide-y">
              {porHacer.map(({ cuenta, mes, celda }) => {
                const e = ESTADO[celda.estado];
                const Icono = e.icono;
                return (
                  <li key={`${cuenta.id}-${mes}`} className="py-2.5 flex flex-wrap items-center gap-3">
                    <Icono className={`h-4 w-4 shrink-0 ${celda.estado === "listo" ? "text-sky-600" : "text-amber-600"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {cuenta.nombre} · <span className="capitalize">{mesLargo(mes)}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {celda.estado === "listo" ? "Todo cuadra: solo falta pulsar «Cerrar el mes»" : `Falta ${celda.faltan.join(" · ")}`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => abrir(cuenta.id, mes)}>
                      Abrir
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {sinEstados.length > 0 && (
        <p className="text-xs text-gray-500">
          Sin ningún estado de cuenta cargado:{" "}
          {sinEstados.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <button type="button" className="text-blue-600 hover:underline" onClick={() => abrir(c.id, datos.meses[datos.meses.length - 1])}>
                {c.nombre}
              </button>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}
