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

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
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
          "Los cobros y pagos vuelven a quedar pendientes y Odoo revierte los asientos de diferencial cambiario. " +
          "Después se aprueban de nuevo desde el Estado de cuenta, sin diferencial.",
      )
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    setAvance({ hecho: 0, total: ids.length });
    let hechas = 0;
    for (const id of ids) {
      const res = await fetch("/api/administracion/bancos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta, deshacer: id }),
      });
      const j = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
      if (!j.success) {
        setError(`${dia(lista.find((l) => l.id === id)!.fecha)}: ${j.error || "no se pudo deshacer"}`);
        break;
      }
      hechas++;
      setAvance({ hecho: hechas, total: ids.length });
    }
    setAvance(null);
    if (hechas) setAviso(`${hechas} línea${hechas === 1 ? "" : "s"} deshecha${hechas === 1 ? "" : "s"} y borrada${hechas === 1 ? "" : "s"} en Odoo. Ya se pueden aprobar desde el Estado de cuenta.`);
    await cargar();
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
          <Button size="sm" variant="ghost" className="h-9" onClick={cargar} disabled={cargando || !!avance} aria-label="Volver a leer de Odoo">
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </Button>
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
        {sinPanel > 0 && (
          <Aviso>
            {sinPanel} línea{sinPanel === 1 ? "" : "s"} no está{sinPanel === 1 ? "" : "n"} en el estado de cuenta del panel: no se pueden borrar hasta subir el
            estado de cuenta de esos días (si no, no habría cómo rehacerlas).
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
                  <TableCell className="text-xs">{l.enPanel ? "Sí" : <span className="text-amber-700">Falta el estado de cuenta</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
