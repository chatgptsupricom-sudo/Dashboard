"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Aviso,
  BotonExcel,
  EncabezadoAdmin,
  EstadoCarga,
  FilaVacia,
  NOMBRE_SEDE,
  Pestanas,
  Tarjeta,
  fechaCorta,
  mesActual,
  money,
  useDatosAdmin,
} from "@/components/administracion/comunes";
import type { Comprobante, DatosFiscal, ResumenRetenciones } from "@/lib/administracion/fiscal";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { useState } from "react";

type Respuesta = DatosFiscal & { success: true; hoy: string; mes: string };
type Vista = "pendientes" | "sin_retencion" | "mes";

const TIPO: Record<Comprobante["tipo"], string> = { iva: "Ret. IVA", islr: "Ret. ISLR", itbms: "Ret. ITBMS" };
const ESTADO_BADGE: Record<Comprobante["estado"], string> = {
  confirmado: "border-emerald-300 text-emerald-700",
  borrador: "border-amber-300 text-amber-700",
  anulado: "border-slate-300 text-slate-500",
};

function montoPorMoneda(r: ResumenRetenciones) {
  if (r.porMoneda.length === 0) return "$0";
  return r.porMoneda
    .map((m) => (m.moneda === "USD" ? money(m.monto) : `${m.moneda} ${m.monto.toLocaleString("es-VE")}`))
    .join(" + ");
}

export default function FiscalPage() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(mesActual);
  const [vista, setVista] = useState<Vista>("pendientes");
  const { datos, cargando, error } = useDatosAdmin<Respuesta>("/api/administracion/fiscal", empresa, mes);

  const tarjetaRet = (titulo: string, r: ResumenRetenciones) => (
    <Tarjeta
      titulo={titulo}
      valor={montoPorMoneda(r)}
      detalle={`${r.confirmados} confirmadas${r.borradores ? ` · ${r.borradores} en borrador` : ""}${
        r.anulados ? ` · ${r.anulados} anuladas` : ""
      }`}
      tono={r.borradores > 0 ? "ambar" : "neutro"}
    />
  );

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<FileText className="h-7 w-7 text-blue-600" />}
        titulo="Fiscal"
        subtitulo="SENIAT (Valencia y Caracas) y DGI (Panamá): retenciones, libros, IVA/ITBMS e IGTF del mes, desde Odoo"
        empresa={empresa}
        setEmpresa={setEmpresa}
        mes={mes}
        setMes={setMes}
        acciones={
          datos && (
            <BotonExcel
              archivo={`Fiscal_${empresa || "todas"}_${datos.mes}`}
              hojas={() => [
                {
                  nombre: "IVA-ITBMS del mes",
                  filas: datos.impuestos.map((i) => ({
                    Sede: NOMBRE_SEDE[i.sede] || i.sede,
                    Impuesto: i.impuesto,
                    "Débito (ventas)": i.debitoVentas,
                    "Crédito (compras)": i.creditoCompras,
                    Neto: i.neto,
                  })),
                },
                {
                  nombre: "Retenciones del mes",
                  filas: datos.comprobantesDelMes.map((c) => ({
                    Tipo: TIPO[c.tipo],
                    Sede: NOMBRE_SEDE[c.sede] || c.sede,
                    Numero: c.numero,
                    Proveedor: c.proveedor,
                    Fecha: c.fecha,
                    Estado: c.estado,
                    Moneda: c.moneda,
                    Monto: c.monto,
                  })),
                },
                {
                  nombre: "Pendientes",
                  filas: datos.comprobantesPendientes.map((c) => ({
                    Tipo: TIPO[c.tipo],
                    Sede: NOMBRE_SEDE[c.sede] || c.sede,
                    Numero: c.numero,
                    Proveedor: c.proveedor,
                    Fecha: c.fecha,
                    Moneda: c.moneda,
                    Monto: c.monto,
                    "Días en borrador": c.diasEnBorrador ?? "",
                  })),
                },
                {
                  nombre: "Sin retención IVA",
                  filas: datos.facturasSinRetencionIva.map((f) => ({
                    Sede: NOMBRE_SEDE[f.sede] || f.sede,
                    Factura: f.numero,
                    Referencia: f.referencia,
                    Proveedor: f.proveedor,
                    Fecha: f.fecha,
                    IVA: f.iva,
                  })),
                },
              ]}
            />
          )
        }
      />

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {datos.aplicaVenezuela && tarjetaRet("Retenciones de IVA del mes", datos.retencionesIva)}
            {datos.aplicaVenezuela && tarjetaRet("Retenciones de ISLR del mes", datos.retencionesIslr)}
            {datos.aplicaPanama && tarjetaRet("Retenciones de ITBMS del mes", datos.retencionesItbms)}
            {datos.aplicaVenezuela && (
              <Tarjeta
                titulo="Facturas con IVA sin retención"
                valor={datos.facturasSinRetencionIva.length}
                detalle={`${money(datos.facturasSinRetencionIva.reduce((s, f) => s + f.iva, 0), 2)} de IVA`}
                tono={datos.facturasSinRetencionIva.length > 0 ? "ambar" : "verde"}
              />
            )}
          </div>

          {datos.comprobantesPendientes.length > 0 && (
            <Aviso>
              Hay <b>{datos.comprobantesPendientes.length}</b> comprobantes de retención en borrador (de cualquier mes).
              Un comprobante sin confirmar no sale en el TXT/XML ni en la declaración.
            </Aviso>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">IVA / ITBMS del mes</CardTitle>
                <p className="text-sm text-gray-500">
                  Impuesto de las facturas publicadas del mes, en USD. Es la referencia para cuadrar la declaración, no
                  la reemplaza (no descuenta retenciones ni excedentes de meses anteriores).
                </p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="px-2 sm:px-4">Sede</TableHead>
                      <TableHead className="text-right">Débito (ventas)</TableHead>
                      <TableHead className="text-right">Crédito (compras)</TableHead>
                      <TableHead className="text-right pr-4">Neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.impuestos.length === 0 ? (
                      <FilaVacia columnas={4} texto="Sin facturas publicadas en el mes." />
                    ) : (
                      datos.impuestos.map((i) => (
                        <TableRow key={i.sede}>
                          <TableCell className="px-2 sm:px-4 text-sm">
                            {NOMBRE_SEDE[i.sede] || i.sede} <span className="text-xs text-gray-400">{i.impuesto}</span>
                          </TableCell>
                          <TableCell className="text-right">{money(i.debitoVentas, 2)}</TableCell>
                          <TableCell className="text-right">{money(i.creditoCompras, 2)}</TableCell>
                          <TableCell className={`text-right pr-4 font-semibold ${i.neto > 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {money(i.neto, 2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {datos.aplicaVenezuela && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Libros e IGTF</CardTitle>
                  <p className="text-sm text-gray-500">Libros de compra y venta del mes y el IGTF retenido por enterar.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {datos.libros.map((l) => (
                      <div key={`${l.sede}-${l.tipo}`} className="flex items-center gap-2 text-sm">
                        {l.existe && l.estado === "done" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : l.existe ? (
                          <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <span className="font-medium">
                          Libro de {l.tipo} · {NOMBRE_SEDE[l.sede] || l.sede}
                        </span>
                        <span className="text-gray-500 ml-auto text-xs text-right">
                          {l.existe
                            ? `${l.estado === "done" ? "cerrado" : "en borrador"} · ${fechaCorta(l.desde)}–${fechaCorta(l.hasta)}`
                            : "no está creado en Odoo"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {datos.igtf.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      {datos.igtf.map((i) => (
                        <div key={i.sede} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="font-medium">IGTF · {NOMBRE_SEDE[i.sede] || i.sede}</span>
                          <span className="text-gray-500">retenido en el mes {money(i.causadoMes, 2)}</span>
                          <span className="ml-auto font-semibold">por enterar {money(i.porPagar, 2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="px-2 sm:px-4 pt-2">
                <Pestanas<Vista>
                  valor={vista}
                  onChange={setVista}
                  opciones={[
                    { value: "pendientes", label: "Retenciones en borrador", contador: datos.comprobantesPendientes.length },
                    ...(datos.aplicaVenezuela
                      ? [{ value: "sin_retencion" as Vista, label: "Facturas sin retención de IVA", contador: datos.facturasSinRetencionIva.length }]
                      : []),
                    { value: "mes", label: "Retenciones del mes", contador: datos.comprobantesDelMes.length },
                  ]}
                />
              </div>

              {vista === "sin_retencion" ? (
                <div className="overflow-x-auto">
                  <p className="text-sm text-gray-500 px-4 pt-3">
                    Facturas de proveedor del mes, publicadas, con IVA y sin comprobante de retención. Revisar si el
                    proveedor está exento de retención; si no, falta hacerla.
                  </p>
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Factura</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-center hidden sm:table-cell">Fecha</TableHead>
                        <TableHead className="text-right pr-4">IVA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.facturasSinRetencionIva.length === 0 ? (
                        <FilaVacia columnas={4} texto="Todas las facturas con IVA del mes tienen retención." />
                      ) : (
                        datos.facturasSinRetencionIva.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="px-2 sm:px-4">
                              <div className="font-mono text-xs">{f.numero}</div>
                              <div className="text-[11px] text-gray-400">
                                {f.referencia && `Ref. ${f.referencia}`}
                                {!empresa && ` · ${NOMBRE_SEDE[f.sede] || f.sede}`}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm whitespace-normal">{f.proveedor}</TableCell>
                            <TableCell className="text-center text-sm hidden sm:table-cell">{fechaCorta(f.fecha)}</TableCell>
                            <TableCell className="text-right pr-4 font-semibold">{money(f.iva, 2)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <TablaComprobantes
                  comprobantes={vista === "pendientes" ? datos.comprobantesPendientes : datos.comprobantesDelMes}
                  todasLasSedes={!empresa}
                  conDias={vista === "pendientes"}
                  vacio={vista === "pendientes" ? "No hay retenciones en borrador." : "Sin retenciones en el mes."}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TablaComprobantes({
  comprobantes,
  todasLasSedes,
  conDias,
  vacio,
}: {
  comprobantes: Comprobante[];
  todasLasSedes: boolean;
  conDias: boolean;
  vacio: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="px-2 sm:px-4">Comprobante</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-center hidden sm:table-cell">Fecha</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="text-center pr-4">{conDias ? "Días" : "Estado"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comprobantes.length === 0 ? (
            <FilaVacia columnas={5} texto={vacio} />
          ) : (
            comprobantes.map((c) => (
              <TableRow key={`${c.tipo}-${c.id}`}>
                <TableCell className="px-2 sm:px-4">
                  <div className="text-xs font-medium">{TIPO[c.tipo]}</div>
                  <div className="font-mono text-[11px] text-gray-500">{c.numero || "sin número"}</div>
                  {todasLasSedes && <div className="text-[11px] text-gray-400">{NOMBRE_SEDE[c.sede] || c.sede}</div>}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">{c.proveedor}</TableCell>
                <TableCell className="text-center text-sm hidden sm:table-cell">{fechaCorta(c.fecha)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {c.moneda === "USD" ? money(c.monto, 2) : `${c.moneda} ${c.monto.toLocaleString("es-VE")}`}
                </TableCell>
                <TableCell className="text-center pr-4">
                  {conDias ? (
                    <span className={(c.diasEnBorrador ?? 0) > 5 ? "text-red-600 font-semibold" : ""}>
                      {c.diasEnBorrador ?? "—"}
                    </span>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] py-0 ${ESTADO_BADGE[c.estado]}`}>
                      {c.estado}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
