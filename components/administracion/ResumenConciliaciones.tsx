"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Aviso } from "@/components/administracion/comunes";
import type { CeldaResumen, EstadoResumen, ResumenConciliaciones as Resumen } from "@/lib/administracion/bancos";
import { Loader2, Lock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const nombreMes = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1)).toLocaleDateString("es-VE", { month: "short", year: "2-digit", timeZone: "UTC" });

const ESTILO: Record<EstadoResumen, { clase: string; titulo: string }> = {
  cerrado: { clase: "bg-emerald-50 border-emerald-200 text-emerald-800", titulo: "Cerrado" },
  listo: { clase: "bg-blue-50 border-blue-200 text-blue-800", titulo: "Listo para cerrar" },
  pendiente: { clase: "bg-amber-50 border-amber-200 text-amber-900", titulo: "Falta" },
  sin_estado: { clase: "bg-gray-50 border-gray-200 text-gray-600", titulo: "Sin estado de cuenta" },
  en_curso: { clase: "bg-white border-gray-200 text-gray-500", titulo: "Mes en curso" },
};

/**
 * Resumen de las conciliaciones bancarias de la sede: cada cuenta, mes por mes desde el
 * corte a Odoo, cerrada, lista para cerrar o lo que le falta. Tocar una celda abre esa
 * cuenta y ese mes en Conciliar.
 */
export function ResumenConciliaciones({ sede, abrir }: { sede: number; abrir: (cuenta: number, mes: string) => void }) {
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    cargar();
  }, [cargar]);

  if (!datos) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-gray-500 flex items-center gap-2">
          {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
          {error || "Revisando cada cuenta mes por mes… la primera vez puede tardar hasta un minuto."}
        </CardContent>
      </Card>
    );
  }

  // Los meses que ya terminaron: el mes en curso no cuenta como pendiente.
  const celdas = datos.cuentas.filter((c) => !c.sinEstados).flatMap((c) => Object.values(c.meses));
  const contar = (e: EstadoResumen) => celdas.filter((x) => x.estado === e).length;
  const tarjetas: { estado: EstadoResumen; texto: string }[] = [
    { estado: "cerrado", texto: "Meses cerrados" },
    { estado: "listo", texto: "Listos para cerrar" },
    { estado: "pendiente", texto: "Con algo pendiente" },
    { estado: "sin_estado", texto: "Sin estado de cuenta" },
  ];
  const celda = (cuenta: number, mes: string, c: CeldaResumen) => {
    const e = ESTILO[c.estado];
    return (
      <button
        type="button"
        onClick={() => abrir(cuenta, mes)}
        title={c.faltan.length ? `Falta: ${c.faltan.join("; ")}` : e.titulo}
        className={`w-full min-w-[9rem] text-left rounded-md border px-2 py-1.5 text-xs hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${e.clase}`}
      >
        <span className="flex items-center gap-1 font-medium">
          {c.estado === "cerrado" && <Lock className="h-3 w-3" />}
          {e.titulo}
        </span>
        {c.movimientos > 0 && (
          <span className="block tabular-nums">
            {c.conciliados} de {c.movimientos} conciliados
          </span>
        )}
        {c.estado === "cerrado" && c.cerradoPor && <span className="block opacity-75 truncate">{c.cerradoPor.split("@")[0]}</span>}
        {c.estado !== "cerrado" &&
          c.faltan.slice(0, 2).map((f) => (
            <span key={f} className="block leading-tight">
              · {f}
            </span>
          ))}
        {c.faltan.length > 2 && <span className="block opacity-75">y {c.faltan.length - 2} más</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tarjetas.map((t) => (
          <div key={t.estado} className={`rounded-xl border p-3 ${ESTILO[t.estado].clase}`}>
            <p className="text-xs">{t.texto}</p>
            <p className="text-2xl font-semibold tabular-nums">{contar(t.estado)}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Cada cuenta de la sede, mes por mes. Toca un mes para abrirlo en Conciliar.{" "}
              <span className="text-gray-400">Calculado {new Date(datos.calculadoEl).toLocaleString("es-VE", { timeStyle: "short", dateStyle: "short" })}.</span>
            </p>
            <Button size="sm" variant="outline" disabled={cargando} onClick={() => cargar(true)}>
              {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Actualizar
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-1">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="sticky left-0 bg-white py-1 pr-2 font-medium">Cuenta</th>
                  {datos.meses.map((m) => (
                    <th key={m} className="py-1 font-medium capitalize">
                      {nombreMes(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.cuentas.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="sticky left-0 bg-white py-1 pr-2 whitespace-nowrap font-medium">
                      {c.nombre}
                      <span className="block text-xs font-normal text-gray-400">{c.moneda}</span>
                    </td>
                    {c.sinEstados ? (
                      <td colSpan={datos.meses.length} className="py-1">
                        <button
                          type="button"
                          onClick={() => abrir(c.id, datos.meses[datos.meses.length - 1])}
                          className="w-full text-left rounded-md border border-dashed px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                        >
                          No tiene ningún estado de cuenta cargado en el panel
                        </button>
                      </td>
                    ) : (
                      datos.meses.map((m) => (
                        <td key={m} className="py-1">
                          {celda(c.id, m, c.meses[m])}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
                {datos.cuentas.length === 0 && (
                  <tr>
                    <td colSpan={datos.meses.length + 1} className="py-4 text-gray-500">
                      La sede no tiene cuentas de banco.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
