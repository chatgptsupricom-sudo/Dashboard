"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlertaAdmin } from "@/lib/administracion/alertas";
import type { DetalleAlerta as Detalle } from "@/lib/administracion/saludDetalle";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * Al hacer clic en una alerta del Top 10: de donde sale en Odoo y los registros
 * que la componen, cada uno con su enlace a la ficha en Odoo.
 */
export default function DetalleAlerta({
  alerta,
  empresa,
  mes,
  cerrar,
}: {
  alerta: AlertaAdmin | null;
  empresa: string;
  mes: string;
  cerrar: () => void;
}) {
  const [datos, setDatos] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alerta) return;
    let vigente = true;
    setDatos(null);
    setError(null);
    fetch(`/api/administracion/salud-financiera/detalle?alerta=${encodeURIComponent(alerta.id)}&empresa=${empresa}&mes=${mes}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vigente) return;
        if (j.success) setDatos(j);
        else setError(j.error || "No se pudo cargar el detalle");
      })
      .catch(() => vigente && setError("No se pudo cargar el detalle"));
    return () => {
      vigente = false;
    };
  }, [alerta, empresa, mes]);

  const conFecha = datos?.filas.some((f) => f.fecha);
  const conMonto = datos?.filas.some((f) => typeof f.monto === "number");

  return (
    <Dialog open={alerta !== null} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{alerta?.titulo}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !datos ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando en Odoo…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-gray-700">
              <span className="font-medium">De dónde sale: </span>
              {datos.origen}
            </div>
            {(datos.odoo || datos.panel) && (
              <div className="flex flex-wrap gap-2">
                {datos.odoo && (
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <a href={datos.odoo.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir en Odoo: {datos.odoo.etiqueta}
                    </a>
                  </Button>
                )}
                {datos.panel && (
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <Link href={datos.panel.ruta}>Ver en el panel: {datos.panel.etiqueta}</Link>
                  </Button>
                )}
              </div>
            )}
            {datos.total > 0 && (
              <>
                <p className="text-xs text-gray-500">
                  {datos.total} registro{datos.total === 1 ? "" : "s"}
                  {datos.filas.length < datos.total ? `, se muestran los primeros ${datos.filas.length}` : ""}. Clic en uno para
                  abrirlo en Odoo.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Registro</TableHead>
                      {conFecha && <TableHead>Fecha</TableHead>}
                      {conMonto && <TableHead className="text-right">Monto</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.filas.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-normal">
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-700 hover:underline inline-flex items-center gap-1"
                            >
                              {f.texto}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="font-medium">{f.texto}</span>
                          )}
                          {f.sub && <div className="text-xs text-gray-500">{f.sub}</div>}
                        </TableCell>
                        {conFecha && <TableCell className="whitespace-nowrap text-sm">{fecha(f.fecha)}</TableCell>}
                        {conMonto && (
                          <TableCell className="text-right whitespace-nowrap font-medium">
                            {typeof f.monto === "number" ? money(f.monto) : "—"}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            {datos.total === 0 && datos.filas.length === 0 && datos.odoo === null && datos.panel !== null && (
              <p className="text-sm text-gray-500">El detalle está en la pantalla del panel.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
