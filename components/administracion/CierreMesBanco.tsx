"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/administracion/comunes";
import type { CuadreMes } from "@/lib/administracion/bancos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { CheckCircle2, Loader2, Lock, LockOpen, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const cuando = (iso: string) => new Date(iso).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
const nombreMes = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1)).toLocaleDateString("es-VE", { month: "long", year: "numeric", timeZone: "UTC" });
const finDeMes = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);

/**
 * Cierre del mes de una cuenta de banco (al final de la pestaña Conciliar):
 * saldo final del banco contra el saldo en libros de Odoo al ultimo dia, lo que
 * falta para cerrar y, si cuadra, «Cerrar el mes» (desde ahi el servidor no deja
 * conciliar, revertir, amarrar ni subir/quitar movimientos de ese mes; el
 * SuperAdmin lo reabre con motivo). Un mes sin estado de cuenta pregunta si la
 * cuenta tuvo movimientos: si no, se cierra con el saldo con que arranco.
 */
export function CierreMesBanco({
  cuenta,
  mes,
  moneda,
  version,
  subirEstado,
  alCambiar,
}: {
  cuenta: number;
  mes: string;
  moneda: string;
  /** Cambia cuando la pantalla recarga la conciliacion: se vuelve a leer el cuadre. */
  version: unknown;
  /** Boton para subir el estado de cuenta (el de la pantalla). */
  subirEstado: React.ReactNode;
  alCambiar: () => void;
}) {
  const { user } = useAuthStore();
  const superAdmin = String((user as any)?.role || "").toLowerCase().trim() === "superadmin";
  const [c, setC] = useState<CuadreMes | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** null = no respondio; true/false = la cuenta tuvo o no movimientos en el mes. */
  const [tuvo, setTuvo] = useState<boolean | null>(null);
  const [saldoEscrito, setSaldoEscrito] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const j = await (await fetch(`/api/administracion/bancos?cuenta=${cuenta}&cierre=${mes}`)).json();
      if (j.success) setC(j.cuadre);
      else setError(j.error || "No se pudo leer el saldo de Odoo");
    } catch {
      setError("No se pudo leer el saldo de Odoo");
    }
    setCargando(false);
  }, [cuenta, mes]);
  useEffect(() => {
    setError(null);
    cargar();
  }, [cargar, version]);
  useEffect(() => {
    setTuvo(null);
    setSaldoEscrito("");
  }, [cuenta, mes]);

  const patch = async (cuerpo: Record<string, unknown>) => {
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/administracion/bancos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta, ...cuerpo }),
    });
    const j = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
    setEnviando(false);
    if (!j.success) setError(j.error || "No se pudo");
    await cargar();
    alCambiar();
  };

  if (!c) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-gray-500 flex items-center gap-2">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {error || "Leyendo el saldo en libros de Odoo…"}
        </CardContent>
      </Card>
    );
  }

  const sinMovimientos = c.movimientos === 0;
  // Sin movimientos el saldo final es el inicial (cierre anterior o ultimo estado de cuenta), o el que se escriba.
  const calculado = sinMovimientos ? (c.anterior?.saldo ?? null) : (c.estado?.final ?? null);
  // "1.234,56" (como se escribe en Venezuela) o "1234.56".
  const escrito =
    saldoEscrito.trim() === "" ? null : Number(saldoEscrito.includes(",") ? saldoEscrito.replace(/\./g, "").replace(",", ".") : saldoEscrito);
  const valeEscrito = escrito !== null && Number.isFinite(escrito) ? escrito : null;
  // Sin movimientos, o con el final calculado del mes anterior + los movimientos (el estado no trae saldo), lo escrito
  // manda: el que encontro el panel puede no ser el del banco. Con saldo en el estado de cuenta, el del estado.
  const deAnterior = !!c.estado?.deAnterior;
  const mandaEscrito = sinMovimientos || deAnterior;
  const saldoBanco = c.cierre ? c.cierre.saldoBanco : mandaEscrito ? (valeEscrito ?? calculado) : (calculado ?? valeEscrito);
  const editable = !c.cierre && (mandaEscrito || calculado === null);
  const aMano = valeEscrito !== null && (calculado === null || Math.abs(valeEscrito - calculado) >= 0.005);
  const diferencia = saldoBanco === null ? null : Math.round((saldoBanco - c.saldoLibros) * 100) / 100;
  const preguntar = sinMovimientos && !c.cierre && tuvo === null;

  const pasos: { ok: boolean; texto: string }[] = sinMovimientos
    ? [
        { ok: c.terminado, texto: c.terminado ? "El mes terminó" : "El mes todavía no termina" },
        { ok: c.lineasSinConciliar === 0, texto: c.lineasSinConciliar ? `Odoo tiene ${c.lineasSinConciliar} línea(s) del banco sin conciliar en el mes` : "Odoo no tiene líneas del banco sin conciliar" },
        { ok: diferencia === 0, texto: diferencia === 0 ? "El saldo del banco es el de Odoo" : "El saldo del banco no es el de Odoo" },
      ]
    : [
        { ok: c.terminado, texto: c.terminado ? "El mes terminó" : "El mes todavía no termina" },
        {
          ok: c.diasSinEstado.length === 0,
          texto: c.diasSinEstado.length ? `Falta el estado de cuenta de ${c.diasSinEstado.length} día(s)` : "El estado de cuenta cubre todo el mes",
        },
        {
          ok: !c.estado || c.estado.cuadra,
          texto: !c.estado
            ? "El estado de cuenta no trae saldo: escribe el saldo final del banco"
            : deAnterior
              ? `El estado de cuenta no trae saldo: el final se calcula con el del ${c.anterior?.fuente} + los movimientos del mes`
              : c.estado.cuadra
                ? "Los saldos del estado de cuenta cuadran"
                : "Los saldos del estado de cuenta no cuadran: le falta algún movimiento",
        },
        { ok: c.lineasSinConciliar === 0, texto: c.lineasSinConciliar ? `Odoo tiene ${c.lineasSinConciliar} línea(s) del banco sin conciliar en el mes` : "Todas las líneas del banco del mes están conciliadas en Odoo" },
        { ok: diferencia === 0, texto: diferencia === 0 ? "El saldo del banco es el de Odoo" : "El saldo del banco no es el de Odoo" },
      ];
  // «¿Tuvo movimientos? Sí» solo cuenta mientras el mes sigue sin movimientos: subido el estado de cuenta ya no frena el cierre.
  const listo = !c.cierre && !preguntar && !(sinMovimientos && tuvo === true) && pasos.every((p) => p.ok);
  const saldoInicial = sinMovimientos ? c.anterior?.saldo ?? null : c.estado?.inicial ?? null;
  // El estado arranca en otro saldo que el que dejo el mes anterior: falta un movimiento entre los dos.
  const saltoInicial =
    !sinMovimientos && c.estado && c.anterior && Math.abs(c.estado.inicial - c.anterior.saldo) >= 0.01 ? c.estado.inicial - c.anterior.saldo : null;

  const cerrar = () => {
    if (saldoBanco === null) return;
    if (
      !confirm(
        `¿Cerrar ${nombreMes(mes)} en esta cuenta con saldo ${cifra(saldoBanco)} ${moneda}?\n\n` +
          "Después no se podrá conciliar, revertir ni cambiar el estado de cuenta de ese mes. Solo el SuperAdmin lo reabre.",
      )
    ) {
      return;
    }
    patch({ cerrar: mes, sin_movimientos: sinMovimientos, saldo: valeEscrito !== null && editable ? valeEscrito : undefined });
  };
  const reabrir = () => {
    const motivo = prompt(`¿Por qué se reabre ${nombreMes(mes)}? (queda guardado)`)?.trim();
    if (!motivo) return;
    if (motivo.length < 5) return setError("Escribe un motivo más claro para reabrir el mes");
    patch({ reabrir: mes, motivo });
  };

  return (
    <Card className={c.cierre ? "border-emerald-300" : ""}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {c.cierre ? <Lock className="h-4 w-4 text-emerald-600" /> : <LockOpen className="h-4 w-4 text-gray-400" />}
          Cierre de {nombreMes(mes)}
        </CardTitle>
        {c.cierre ? (
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Cerrado{c.cierre.sinMovimientos ? " sin movimientos" : ""} · {c.cierre.cerradoPor} · {cuando(c.cierre.cerradoEl)}
            </Badge>
            {superAdmin && (
              <Button size="sm" variant="outline" disabled={enviando} onClick={reabrir}>
                Reabrir
              </Button>
            )}
          </div>
        ) : (
          <Badge variant="outline">Abierto</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Aviso tono="rojo">{error}</Aviso>}

        {preguntar ? (
          <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
            <p className="font-medium">¿La cuenta tuvo movimientos en {nombreMes(mes)}?</p>
            <p className="text-sm text-gray-500">
              Si los tuvo, sube el estado de cuenta del mes. Si no, el mes se cierra con el saldo con que arrancó
              {c.anterior ? ` (${cifra(c.anterior.saldo)} ${moneda}, del ${c.anterior.fuente})` : ""}, siempre que sea el mismo de Odoo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setTuvo(true)}>
                Sí, tuvo movimientos
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTuvo(false)}>
                No, cerrarlo con el saldo inicial
              </Button>
            </div>
          </div>
        ) : sinMovimientos && tuvo === true && !c.cierre ? (
          <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
            <p className="text-sm">Sube el estado de cuenta de {nombreMes(mes)} para conciliarlo.</p>
            <div className="flex flex-wrap gap-2">
              {subirEstado}
              <Button size="sm" variant="ghost" onClick={() => setTuvo(null)}>
                Volver
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">Saldo inicial del banco</p>
                <p className="font-semibold tabular-nums">{saldoInicial === null ? "—" : `${cifra(saldoInicial)} ${moneda}`}</p>
                {(sinMovimientos || deAnterior) && c.anterior && <p className="text-xs text-gray-400">del {c.anterior.fuente}</p>}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">Saldo final del banco</p>
                {editable ? (
                  <Input
                    className="h-8 mt-1"
                    inputMode="decimal"
                    placeholder={calculado !== null ? cifra(calculado) : "Escríbelo del estado de cuenta"}
                    value={saldoEscrito}
                    onChange={(e) => setSaldoEscrito(e.target.value)}
                  />
                ) : (
                  <p className="font-semibold tabular-nums">{saldoBanco === null ? "—" : `${cifra(saldoBanco)} ${moneda}`}</p>
                )}
                {editable && aMano && (
                  <p className="text-xs text-amber-700">Escrito a mano{calculado !== null ? ` (el panel calculaba ${cifra(calculado)})` : ""}</p>
                )}
                {editable && valeEscrito === null && calculado !== null && (
                  <p className="text-xs text-gray-400">
                    {cifra(calculado)} {deAnterior ? `= saldo del ${c.anterior?.fuente} + movimientos del mes` : `del ${c.anterior?.fuente}`}; si el banco dice
                    otro, escríbelo
                  </p>
                )}
                {c.cierre?.saldoManual && (
                  <p className="text-xs text-amber-700">
                    Escrito a mano al cerrar{c.cierre.saldoSugerido !== null ? ` (el panel calculaba ${cifra(c.cierre.saldoSugerido)})` : ""}
                  </p>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">Saldo en libros de Odoo al {dia(finDeMes(mes))}</p>
                <p className="font-semibold tabular-nums">
                  {cifra(c.cierre ? c.cierre.saldoLibros : c.saldoLibros)} {moneda}
                </p>
                {c.cierre && Math.abs(c.cierre.saldoLibros - c.saldoLibros) >= 0.01 && (
                  <p className="text-xs text-red-600">Hoy Odoo dice {cifra(c.saldoLibros)}: alguien lo cambió en Odoo después del cierre</p>
                )}
              </div>
              <div className={`rounded-lg border p-3 ${diferencia === 0 ? "bg-emerald-50 border-emerald-200" : diferencia === null ? "" : "bg-red-50 border-red-200"}`}>
                <p className="text-xs text-gray-500">Diferencia</p>
                <p className={`font-semibold tabular-nums ${diferencia === 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {diferencia === null ? "—" : `${cifra(diferencia)} ${moneda}`}
                </p>
              </div>
            </div>

            {saltoInicial !== null && (
              <Aviso>
                El estado de cuenta arranca en {cifra(c.estado!.inicial)} y el mes anterior terminó en {cifra(c.anterior!.saldo)} ({c.anterior!.fuente}):
                diferencia {cifra(saltoInicial)}. Puede faltar un movimiento entre los dos.
              </Aviso>
            )}

            {!c.cierre && (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <ul className="space-y-1 text-sm">
                  {pasos.map((p) => (
                    <li key={p.texto} className="flex items-center gap-2">
                      {p.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                      <span className={p.ok ? "" : "text-red-700"}>{p.texto}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  {sinMovimientos && (
                    <Button size="sm" variant="ghost" onClick={() => setTuvo(null)}>
                      Volver
                    </Button>
                  )}
                  <Button disabled={!listo || enviando} onClick={cerrar}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                    Cerrar el mes
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {c.deshechos.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">
              {c.deshechos.length} conciliación{c.deshechos.length === 1 ? "" : "es"} deshecha{c.deshechos.length === 1 ? "" : "s"} en el mes (con su motivo)
            </summary>
            <ul className="mt-2 space-y-1">
              {c.deshechos.map((d, i) => (
                <li key={i} className="border-l-2 pl-2">
                  {dia(d.fecha)} · {d.asiento} · {cifra(d.monto)} {moneda} — <span className="italic">{d.motivo || "sin motivo (de antes)"}</span>
                  <span className="text-gray-400">
                    {" "}
                    · {d.por}, {cuando(d.el)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {c.historial.some((h) => h.reabiertoEl) && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">Reaperturas del mes</summary>
            <ul className="mt-2 space-y-1">
              {c.historial
                .filter((h) => h.reabiertoEl)
                .map((h, i) => (
                  <li key={i} className="border-l-2 pl-2">
                    Cerrado por {h.cerradoPor} ({cuando(h.cerradoEl)}), reabierto por {h.reabiertoPor} ({cuando(h.reabiertoEl!)}):{" "}
                    <span className="italic">{h.motivoReapertura}</span>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
