"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/administracion/comunes";
import type { CuadreMes, librosDelMes } from "@/lib/administracion/bancos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { CheckCircle2, Loader2, Lock, LockOpen, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const cuando = (iso: string) => new Date(iso).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
const nombreMes = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1)).toLocaleDateString("es-VE", { month: "long", year: "numeric", timeZone: "UTC" });
type Libros = Awaited<ReturnType<typeof librosDelMes>>;
const ODOO_URL = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "");
const finDeMes = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
/** Dias seguidos juntos: ["2026-05-01".."2026-05-07", "2026-05-20"] -> "01/05 al 07/05, 20/05". */
const tramos = (dias: string[]) => {
  const corto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const grupos: string[][] = [];
  for (const d of [...dias].sort()) {
    const ultimo = grupos[grupos.length - 1];
    const previo = ultimo?.[ultimo.length - 1];
    if (previo && Date.parse(d) - Date.parse(previo) === 86400000) ultimo.push(d);
    else grupos.push([d]);
  }
  return grupos.map((g) => (g.length === 1 ? corto(g[0]) : `${corto(g[0])} al ${corto(g[g.length - 1])}`)).join(", ");
};

/**
 * Cierre del mes de una cuenta de banco (al final de la pestaña Conciliar):
 * saldo final del banco contra el saldo en libros de Odoo al ultimo dia, lo que
 * falta para cerrar y, si cuadra, «Cerrar el mes» (desde ahi el servidor no deja
 * conciliar, revertir, amarrar ni subir/quitar movimientos de ese mes; el
 * SuperAdmin lo reabre con motivo). Un mes sin estado de cuenta pregunta si la
 * cuenta tuvo movimientos: si no, se cierra con el saldo con que arranco. Los dias
 * que el estado de cuenta no cubre se pueden confirmar sin movimientos (quedan
 * anotados en el cierre). `incrustado`: va dentro de la tarjeta de avance, sin
 * tarjeta propia.
 */
export function CierreMesBanco({
  cuenta,
  mes,
  moneda,
  version,
  subirEstado,
  alCambiar,
  incrustado = false,
}: {
  incrustado?: boolean;
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
  /** Quien cierra confirma que los dias sin estado de cuenta no tuvieron movimientos. */
  const [diasConfirmados, setDiasConfirmados] = useState(false);
  /** Que forma el saldo en libros de Odoo (se lee al abrirlo). */
  const [libros, setLibros] = useState<Libros | null>(null);
  const [verLibros, setVerLibros] = useState(false);
  const [cargandoLibros, setCargandoLibros] = useState(false);

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
    setDiasConfirmados(false);
    setVerLibros(false);
    setLibros(null);
  }, [cuenta, mes]);
  // Si la pantalla recarga (se concilio o se revirtio algo), el detalle abierto se vuelve a leer.
  useEffect(() => {
    setLibros(null);
  }, [version]);
  useEffect(() => {
    if (!verLibros || libros) return;
    setCargandoLibros(true);
    fetch(`/api/administracion/bancos?cuenta=${cuenta}&libros=${mes}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setLibros(j.libros) : setError(j.error || "No se pudo leer el saldo de Odoo")))
      .catch(() => setError("No se pudo leer el saldo de Odoo"))
      .finally(() => setCargandoLibros(false));
  }, [verLibros, libros, cuenta, mes]);

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
    const leyendo = (
      <p className="text-sm text-gray-500 flex items-center gap-2">
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {error || "Leyendo el saldo en libros de Odoo…"}
      </p>
    );
    return incrustado ? (
      <div className="border-t pt-3">{leyendo}</div>
    ) : (
      <Card>
        <CardContent className="p-4">{leyendo}</CardContent>
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
          ok: c.diasSinEstado.length === 0 || diasConfirmados,
          texto: !c.diasSinEstado.length
            ? "El estado de cuenta cubre todo el mes"
            : diasConfirmados
              ? `Sin movimientos del ${tramos(c.diasSinEstado)} (confirmado)`
              : `Falta el estado de cuenta del ${tramos(c.diasSinEstado)}`,
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
    patch({
      cerrar: mes,
      sin_movimientos: sinMovimientos,
      saldo: valeEscrito !== null && editable ? valeEscrito : undefined,
      dias_sin_movimientos: !sinMovimientos && c.diasSinEstado.length > 0 && diasConfirmados,
    });
  };
  const reabrir = () => {
    const motivo = prompt(`¿Por qué se reabre ${nombreMes(mes)}? (queda guardado)`)?.trim();
    if (!motivo) return;
    if (motivo.length < 5) return setError("Escribe un motivo más claro para reabrir el mes");
    patch({ reabrir: mes, motivo });
  };

  const cabecera = (
    <>
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
    </>
  );
  const cuerpo = (
    <>
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
                <button type="button" className="text-xs text-blue-600 hover:underline mt-1" onClick={() => setVerLibros((v) => !v)}>
                  {verLibros ? "Ocultar qué lo forma" : "Ver qué lo forma"}
                </button>
              </div>
              <div className={`rounded-lg border p-3 ${diferencia === 0 ? "bg-emerald-50 border-emerald-200" : diferencia === null ? "" : "bg-red-50 border-red-200"}`}>
                <p className="text-xs text-gray-500">Diferencia</p>
                <p className={`font-semibold tabular-nums ${diferencia === 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {diferencia === null ? "—" : `${cifra(diferencia)} ${moneda}`}
                </p>
              </div>
            </div>

            {verLibros && (
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                {!libros ? (
                  <p className="text-gray-500 flex items-center gap-2">
                    {cargandoLibros && <Loader2 className="h-4 w-4 animate-spin" />} Leyendo los apuntes del banco en Odoo…
                  </p>
                ) : (
                  <>
                    <p className="text-gray-600">
                      Saldo en Odoo al empezar el mes <span className="font-semibold tabular-nums">{cifra(libros.inicial)}</span> + apuntes del mes{" "}
                      <span className="font-semibold tabular-nums">{cifra(libros.total)}</span> = <span className="font-semibold tabular-nums">{cifra(libros.final)} {moneda}</span>.
                      {libros.lineas.some((l) => l.repetido) && (
                        <span className="text-red-700">
                          {" "}
                          En rojo, los que están más veces en Odoo que en el estado de cuenta (mismo día y monto): uno sobra; ábrelo en Odoo para anularlo, o
                          revierte la conciliación duplicada desde la tabla de arriba.
                        </span>
                      )}
                    </p>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="text-gray-500 text-left sticky top-0 bg-white">
                          <tr>
                            <th className="py-1 pr-2">Fecha</th>
                            <th className="py-1 pr-2">Asiento</th>
                            <th className="py-1 pr-2">Descripción</th>
                            <th className="py-1 pr-2">Contra</th>
                            <th className="py-1 pr-2 text-right">Monto</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {libros.lineas.map((l, i) => (
                            <tr key={i} className={`border-t ${l.repetido ? "bg-red-50" : ""}`}>
                              <td className="py-1 pr-2 whitespace-nowrap">{dia(l.fecha)}</td>
                              <td className="py-1 pr-2 whitespace-nowrap">
                                <a
                                  href={`${ODOO_URL}/web#id=${l.asientoId}&model=account.move&view_type=form`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {l.asiento}
                                </a>
                              </td>
                              <td className="py-1 pr-2">{l.descripcion}</td>
                              <td className="py-1 pr-2 text-gray-500">{l.contra.join(", ")}</td>
                              <td className={`py-1 pr-2 text-right tabular-nums ${l.monto < 0 ? "text-red-700" : ""}`}>{cifra(l.monto)}</td>
                              <td className="py-1 whitespace-nowrap">
                                {l.repetido && <span className="text-red-700 font-medium">Repetido </span>}
                                {!l.repetido && l.noEnBanco && <span className="text-amber-700">No está en el estado de cuenta </span>}
                                {!l.deExtracto && <span className="text-gray-500">Sin línea de extracto </span>}
                                {l.deExtracto && l.conciliada === false && <span className="text-amber-700">Sin conciliar </span>}
                                {l.delPanel && <span className="text-gray-400">· panel</span>}
                              </td>
                            </tr>
                          ))}
                          {libros.lineas.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-2 text-gray-500">
                                En el mes no hay apuntes en la cuenta del banco en Odoo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {saltoInicial !== null && (
              <Aviso>
                El estado de cuenta arranca en {cifra(c.estado!.inicial)} y el mes anterior terminó en {cifra(c.anterior!.saldo)} ({c.anterior!.fuente}):
                diferencia {cifra(saltoInicial)}. Puede faltar un movimiento entre los dos.
              </Aviso>
            )}

            {c.cierre && c.cierre.diasSinMovimientos.length > 0 && (
              <p className="text-xs text-gray-500">
                {c.cierre.cerradoPor} confirmó al cerrar que no hubo movimientos del {tramos(c.cierre.diasSinMovimientos)} (el estado de cuenta no
                cubre esos días).
              </p>
            )}

            {!c.cierre && (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-2">
                  <ul className="space-y-1 text-sm">
                    {pasos.map((p) => (
                      <li key={p.texto} className="flex items-center gap-2">
                        {p.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                        <span className={p.ok ? "" : "text-red-700"}>{p.texto}</span>
                      </li>
                    ))}
                  </ul>
                  {!sinMovimientos && c.diasSinEstado.length > 0 && (
                    // El estado de cuenta suele empezar el primer dia con movimientos (Bancamiga BS may-2026 arranca el 08/05).
                    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm max-w-xl cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={diasConfirmados}
                        onChange={(e) => setDiasConfirmados(e.target.checked)}
                      />
                      <span>
                        Confirmo que la cuenta no tuvo movimientos del {tramos(c.diasSinEstado)}. Si los tuvo, sube el estado de cuenta de esos días.
                        <span className="block text-xs text-gray-500">Queda anotado en el cierre con tu nombre.</span>
                      </span>
                    </label>
                  )}
                </div>
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
    </>
  );
  return incrustado ? (
    <div className="border-t pt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">{cabecera}</div>
      {cuerpo}
    </div>
  ) : (
    <Card className={c.cierre ? "border-emerald-300" : ""}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">{cabecera}</CardHeader>
      <CardContent className="space-y-4">{cuerpo}</CardContent>
    </Card>
  );
}
