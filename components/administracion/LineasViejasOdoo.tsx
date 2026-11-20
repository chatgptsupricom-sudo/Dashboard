"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Aviso, FilaVacia } from "@/components/administracion/comunes";
import type { LineaVieja } from "@/lib/administracion/bancos";
import { Loader2, RefreshCw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const ESTADO: Record<LineaVieja["estado"], { texto: string; clase: string }> = {
  con_diferencial: { texto: "Conciliada con diferencial", clase: "bg-red-100 text-red-800" },
  conciliada: { texto: "Conciliada sin diferencial", clase: "bg-emerald-100 text-emerald-800" },
  sin_conciliar: { texto: "Sin conciliar", clase: "bg-slate-100 text-slate-700" },
};

/**
 * Lineas de extracto que ya estaban en Odoo (importadas o conciliadas a mano)
 * en la cuenta y el periodo. Las conciliadas con diferencial cambiario se
 * deshacen y se borran para rehacerlas desde el panel, a la tasa del cobro.
 */
export function LineasViejasOdoo({
  cuenta,
  desde,
  hasta,
  alCambiar,
}: {
  cuenta: number;
  desde: string;
  hasta: string;
  alCambiar: () => void;
}) {
  const [lineas, setLineas] = useState<LineaVieja[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null);
  // Que hacer con los asientos de diferencial al deshacer: revertirlos (Odoo) o borrarlos del todo.
  const [modoDif, setModoDif] = useState<"reverso" | "borrar">("reverso");

  // Despues de deshacer se recarga sin borrar el error: si no, el motivo por el que Odoo no lo acepto no se veia.
  const cargar = useCallback(async (limpiarError = true) => {
    setCargando(true);
    if (limpiarError) setError(null);
    try {
      const j = await (await fetch(`/api/administracion/bancos?cuenta=${cuenta}&desde=${desde}&hasta=${hasta}&viejas=1`)).json();
      if (!j.success) throw new Error(j.error);
      setLineas(j.viejas);
      setElegidas(new Set());
    } catch (e: any) {
      setError(e?.message || "No se pudieron leer las líneas de Odoo");
    }
    setCargando(false);
  }, [cuenta, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const lista = lineas || [];
  const conDif = lista.filter((l) => l.estado === "con_diferencial");
  const totalDif = conDif.reduce((s, l) => s + l.diferencial, 0);
  const sinPanel = lista.filter((l) => !l.enPanel).length;
  const elegidasConDif = lista.filter((l) => elegidas.has(l.id) && l.estado === "con_diferencial").length;
  const elegir = (l: LineaVieja, si: boolean) =>
    setElegidas((e) => {
      const n = new Set(e);
      if (si) n.add(l.id);
      else n.delete(l.id);
      return n;
    });

  const deshacer = async () => {
    const ids = lista.filter((l) => elegidas.has(l.id)).map((l) => l.id);
    if (
      !ids.length ||
      !confirm(
        `¿Deshacer la conciliación y borrar en Odoo ${ids.length} línea${ids.length === 1 ? "" : "s"} de extracto?\n\n` +
          "Los cobros y pagos vuelven a quedar pendientes. " +
          (elegidasConDif
            ? modoDif === "borrar"
              ? `Los asientos de diferencial cambiario de ${elegidasConDif} se BORRAN del todo de Odoo. `
              : `Los asientos de diferencial cambiario de ${elegidasConDif} se revierten (queda el original y su reverso). `
            : "") +
          "Después se aprueban de nuevo desde el Estado de cuenta, sin diferencial.",
      )
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    setAvance({ hecho: 0, total: ids.length });
    let hechas = 0;
    const avisos: string[] = [];
    // Una que Odoo rechaza no frena a las demas: se sigue y al final se dice cuales quedaron y por que.
    const fallas: string[] = [];
    for (const [n, id] of ids.entries()) {
      const res = await fetch("/api/administracion/bancos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta, deshacer: id, diferencial: modoDif }),
      });
      const j = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
      setAvance({ hecho: n + 1, total: ids.length });
      const l = lista.find((x) => x.id === id)!;
      if (!j.success) {
        fallas.push(`${l.asiento} (${dia(l.fecha)}, ${cifra(l.monto)}): ${j.error || "no se pudo deshacer"}`);
        continue;
      }
      hechas++;
      if (j.aviso) avisos.push(`${l.asiento}: ${j.aviso}`);
    }
    if (fallas.length) {
      setError(
        `No se pudieron deshacer ${fallas.length} de ${ids.length}: ` +
          fallas.slice(0, 5).join(" · ") +
          (fallas.length > 5 ? ` · y ${fallas.length - 5} más` : ""),
      );
    }
    setAvance(null);
    if (hechas) {
      setAviso(
        `${hechas} línea${hechas === 1 ? "" : "s"} deshecha${hechas === 1 ? "" : "s"} y borrada${hechas === 1 ? "" : "s"} en Odoo. Ya se pueden aprobar desde el Estado de cuenta.` +
          (avisos.length ? ` ${avisos.join(" · ")}` : ""),
      );
    }
    await cargar(false);
    alCambiar();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Líneas que ya estaban en Odoo</CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Líneas de extracto importadas o conciliadas a mano en Odoo (no las creó el panel).
            {conDif.length > 0 &&
              ` ${conDif.length} se conciliaron con diferencial cambiario (${cifra(totalDif)} USD netos): se deshacen y se rehacen desde el panel a la tasa del cobro.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" className="h-9" onClick={() => cargar()} disabled={cargando || !!avance} aria-label="Volver a leer de Odoo">
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </Button>
          {lista.some((l) => l.enPanel) && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!!avance}
              onClick={() => setElegidas(elegidas.size ? new Set() : new Set(lista.filter((l) => l.enPanel).map((l) => l.id)))}
            >
              {elegidas.size ? "Quitar selección" : "Elegir todas"}
            </Button>
          )}
          {conDif.some((l) => l.enPanel) && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!!avance}
              onClick={() => setElegidas(new Set(conDif.filter((l) => l.enPanel).map((l) => l.id)))}
            >
              Elegir las que tienen diferencial
            </Button>
          )}
          <Button size="sm" variant="destructive" className="h-9" disabled={!elegidas.size || !!avance} onClick={deshacer}>
            {avance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
            {avance ? `Deshaciendo ${avance.hecho} de ${avance.total}` : `Deshacer y borrar (${elegidas.size})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {aviso && <Aviso tono="azul">{aviso}</Aviso>}
        {elegidasConDif > 0 && (
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
            <legend className="px-1 text-xs text-gray-500">
              Asientos de diferencial cambiario de las {elegidasConDif} elegida{elegidasConDif === 1 ? "" : "s"} que lo tienen
            </legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="modo-dif" checked={modoDif === "reverso"} onChange={() => setModoDif("reverso")} />
              Revertirlos <span className="text-xs text-gray-500">(queda el original y su reverso, en neto cero)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="modo-dif" checked={modoDif === "borrar"} onChange={() => setModoDif("borrar")} />
              Borrarlos del todo <span className="text-xs text-gray-500">(no queda rastro en Odoo, solo el registro del panel)</span>
            </label>
          </fieldset>
        )}
        {sinPanel > 0 && (
          <Aviso>
            {sinPanel} línea{sinPanel === 1 ? "" : "s"} no está{sinPanel === 1 ? "" : "n"} en el estado de cuenta del panel: no se pueden borrar hasta subir el
            estado de cuenta de esos días (si no, no habría cómo rehacerlas). Se emparejan también las que Odoo tiene con los decimales mal (hasta
            1 Bs o 0,1 % de diferencia, o la coma corrida) por el mismo día o la misma referencia.
          </Aviso>
        )}
        {cargando && !lineas ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado en Odoo</TableHead>
                <TableHead>Conciliada con</TableHead>
                <TableHead>En el panel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 && <FilaVacia columnas={7} texto="Odoo no tiene líneas de extracto de este período fuera de las del panel." />}
              {lista.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Elegir la línea del ${dia(l.fecha)}`}
                      checked={elegidas.has(l.id)}
                      disabled={!l.enPanel || !!avance}
                      onChange={(e) => elegir(l, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dia(l.fecha)}</TableCell>
                  <TableCell className="text-xs max-w-[20rem]">
                    {l.descripcion}
                    <span className="block text-gray-500">{l.asiento}</span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{cifra(l.monto)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border-0 ${ESTADO[l.estado].clase}`}>
                      {ESTADO[l.estado].texto}
                    </Badge>
                    {l.estado === "con_diferencial" && <span className="block text-xs text-red-700 mt-0.5">{cifra(l.diferencial)} USD</span>}
                  </TableCell>
                  <TableCell className="text-xs">{l.contra.join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {!l.enPanel || !l.movPanel ? (
                      <span className="text-amber-700">Falta el estado de cuenta</span>
                    ) : Math.abs(l.movPanel.monto - l.monto) < 0.005 && l.movPanel.fecha === l.fecha ? (
                      "Sí"
                    ) : (
                      // Odoo la tiene mal cargada (decimales o fecha): al rehacerla queda con lo del banco.
                      <span className="text-amber-700">
                        Sí, en el banco {cifra(l.movPanel.monto)}
                        {l.movPanel.fecha !== l.fecha ? ` del ${dia(l.movPanel.fecha)}` : ""}
                        {l.movPanel.referencia ? ` · ref ${l.movPanel.referencia}` : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
