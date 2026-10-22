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
import type {
  ClaseFiscal,
  CompraDelMes,
  Comprobante,
  DatosFiscal,
  ResumenRetenciones,
  TipoDocumento,
} from "@/lib/administracion/fiscal";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { useState } from "react";

type Respuesta = DatosFiscal & { success: true; hoy: string; mes: string };
type Vista = "pendientes" | "sin_retencion" | "mes" | "compras";
type FiltroCompras = "todas" | "fiscales" | "no_fiscales";

const TIPO: Record<Comprobante["tipo"], string> = { iva: "Ret. IVA", islr: "Ret. ISLR", itbms: "Ret. ITBMS" };
const ESTADO_BADGE: Record<Comprobante["estado"], string> = {
  confirmado: "border-emerald-300 text-emerald-700",
  borrador: "border-amber-300 text-amber-700",
  anulado: "border-slate-300 text-slate-500",
};

const DOCUMENTO: Record<TipoDocumento, string> = {
  ventas: "Facturas de venta",
  nc_ventas: "NC de venta",
  compras: "Facturas de compra",
  nc_compras: "NC de compra",
};
const CLASE: Record<ClaseFiscal, { label: string; badge: string }> = {
  gravada: { label: "Fiscal con IVA", badge: "border-emerald-300 text-emerald-700" },
  exenta: { label: "Fiscal exenta", badge: "border-blue-300 text-blue-700" },
  sin_impuesto: { label: "No fiscal", badge: "border-slate-300 text-slate-500" },
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
  const [filtroCompras, setFiltroCompras] = useState<FiltroCompras>("todas");
  const { datos, cargando, error } = useDatosAdmin<Respuesta>("/api/administracion/fiscal", empresa, mes);

  const fiscales = (tipo: TipoDocumento) => {
    const filas = (datos?.documentos || []).filter((d) => d.tipo === tipo);
    return {
      total: filas.reduce((s, d) => s + d.total, 0),
      fiscales: filas.reduce((s, d) => s + d.gravadas + d.exentas, 0),
      gravadas: filas.reduce((s, d) => s + d.gravadas, 0),
      monto: filas.reduce((s, d) => s + d.montoFiscal, 0),
    };
  };
  const ventasF = fiscales("ventas");
  const comprasF = fiscales("compras");
  const comprasFiltradas = (datos?.compras || []).filter((c) =>
    filtroCompras === "todas" ? true : filtroCompras === "fiscales" ? c.clase !== "sin_impuesto" : c.clase === "sin_impuesto",
  );

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
                  nombre: "Documentos del mes",
                  filas: datos.documentos.map((d) => ({
                    Sede: NOMBRE_SEDE[d.sede] || d.sede,
                    Documento: DOCUMENTO[d.tipo],
                    Total: d.total,
                    "Fiscales con IVA": d.gravadas,
                    "Fiscales exentas": d.exentas,
                    "No fiscales": d.sinImpuesto,
                    "Monto fiscal (USD)": d.montoFiscal,
                    "Monto no fiscal (USD)": d.montoNoFiscal,
                    "IVA (USD)": d.iva,
                  })),
                },
                {
                  nombre: "Compras del mes",
                  filas: datos.compras.map((c) => ({
                    Sede: NOMBRE_SEDE[c.sede] || c.sede,
                    Documento: c.numero,
                    Tipo: c.esNotaCredito ? "Nota de crédito" : "Factura",
                    "Factura proveedor": c.facturaProveedor,
                    "Nro. control": c.nroControl,
                    Proveedor: c.proveedor,
                    Intercompañía: c.intercompania ? "Sí" : "",
                    Fecha: c.fecha,
                    Clase: CLASE[c.clase].label,
                    "Base gravada": c.baseGravada,
                    "Base exenta": c.baseExenta,
                    "Sin impuesto": c.baseSinImpuesto,
                    IVA: c.iva,
                    Total: c.total,
                    "Ret. IVA": c.conRetencionIva ? "Sí" : "",
                    "Ret. ISLR": c.conRetencionIslr ? "Sí" : "",
                  })),
                },
                {
                  nombre: "Ret. IVA por porcentaje",
                  filas: datos.clasesRetencionIva.map((c) => ({
                    Sede: NOMBRE_SEDE[c.sede] || c.sede,
                    "% retenido": c.porcentaje,
                    Comprobantes: c.comprobantes,
                    Facturas: c.facturas,
                    "Base (USD)": c.base,
                    "IVA (USD)": c.iva,
                    "Retenido (USD)": c.retenido,
                  })),
                },
                {
                  nombre: "Ret. ISLR por concepto",
                  filas: datos.clasesRetencionIslr.map((c) => ({
                    Sede: NOMBRE_SEDE[c.sede] || c.sede,
                    Concepto: c.concepto,
                    "Tasa %": c.tasa,
                    Comprobantes: c.comprobantes,
                    Facturas: c.facturas,
                    "Base (USD)": c.base,
                    "Retenido (USD)": c.retenido,
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
          {datos.aplicaVenezuela && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tarjeta
                titulo="Facturas fiscales de venta"
                valor={ventasF.fiscales}
                detalle={`de ${ventasF.total} facturas del mes · ${money(ventasF.monto)}`}
              />
              <Tarjeta
                titulo="Compras fiscales"
                valor={comprasF.fiscales}
                detalle={`de ${comprasF.total} facturas de compra · ${comprasF.gravadas} con IVA`}
              />
              {datos.igtf.map((i) => (
                <Tarjeta
                  key={i.sede}
                  titulo={`IGTF cobrado · ${NOMBRE_SEDE[i.sede] || i.sede}`}
                  valor={money(i.cobradoFacturasMes, 2)}
                  detalle={`${i.facturasMes} facturas · base ${money(i.baseMes)}`}
                />
              ))}
            </div>
          )}

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
                          <span className="text-gray-500">causado en el mes {money(i.causadoMes, 2)}</span>
                          <span className="ml-auto font-semibold">por enterar {money(i.porPagar, 2)}</span>
                          <span className="w-full text-xs text-gray-500">
                            En facturas de cliente: {i.facturasMes} con 3 % IGTF sobre {money(i.baseMes, 2)} pagados en
                            divisas = {money(i.cobradoFacturasMes, 2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {datos.aplicaVenezuela && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Facturas fiscales del mes</CardTitle>
                  <p className="text-sm text-gray-500">
                    Fiscal = alguna línea con IVA o exenta (0% EXEMPT). Sin impuesto en ninguna línea no es fiscal
                    (nota de entrega, importación, intercompañía). Montos en USD.
                  </p>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Documento</TableHead>
                        <TableHead className="text-right">Con IVA</TableHead>
                        <TableHead className="text-right">Exentas</TableHead>
                        <TableHead className="text-right">No fiscales</TableHead>
                        <TableHead className="text-right pr-4">Monto fiscal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.documentos.length === 0 ? (
                        <FilaVacia columnas={5} texto="Sin documentos publicados en el mes." />
                      ) : (
                        datos.documentos.map((d) => (
                          <TableRow key={`${d.sede}-${d.tipo}`}>
                            <TableCell className="px-2 sm:px-4 text-sm">
                              {DOCUMENTO[d.tipo]}
                              <div className="text-[11px] text-gray-400">
                                {NOMBRE_SEDE[d.sede] || d.sede} · {d.total} en total
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{d.gravadas}</TableCell>
                            <TableCell className="text-right">{d.exentas}</TableCell>
                            <TableCell className="text-right text-gray-500">{d.sinImpuesto}</TableCell>
                            <TableCell className="text-right pr-4">
                              {money(d.montoFiscal)}
                              {d.iva > 0 && <div className="text-[11px] text-gray-400">IVA {money(d.iva, 2)}</div>}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Clasificación de retenciones del mes</CardTitle>
                  <p className="text-sm text-gray-500">
                    Comprobantes confirmados y en borrador (sin anulados), en USD. IVA por porcentaje retenido; ISLR
                    por concepto del SENIAT.
                  </p>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Retención</TableHead>
                        <TableHead className="text-right">Facturas</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right pr-4">Retenido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.clasesRetencionIva.length + datos.clasesRetencionIslr.length === 0 ? (
                        <FilaVacia columnas={4} texto="Sin retenciones en el mes." />
                      ) : (
                        <>
                          {datos.clasesRetencionIva.map((c) => (
                            <TableRow key={`iva-${c.sede}-${c.porcentaje}`}>
                              <TableCell className="px-2 sm:px-4 text-sm">
                                <span className="font-medium">IVA {c.porcentaje} %</span>
                                <div className="text-[11px] text-gray-400">
                                  {!empresa && `${NOMBRE_SEDE[c.sede] || c.sede} · `}IVA facturado {money(c.iva, 2)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{c.facturas}</TableCell>
                              <TableCell className="text-right">{money(c.base, 2)}</TableCell>
                              <TableCell className="text-right pr-4 font-semibold">{money(c.retenido, 2)}</TableCell>
                            </TableRow>
                          ))}
                          {datos.clasesRetencionIslr.map((c) => (
                            <TableRow key={`islr-${c.sede}-${c.concepto}-${c.tasa}`}>
                              <TableCell className="px-2 sm:px-4 text-sm whitespace-normal">
                                <span className="font-medium">ISLR {c.tasa} %</span>
                                <div className="text-[11px] text-gray-500 line-clamp-2" title={c.concepto}>
                                  {c.concepto}
                                </div>
                                {!empresa && <div className="text-[11px] text-gray-400">{NOMBRE_SEDE[c.sede] || c.sede}</div>}
                              </TableCell>
                              <TableCell className="text-right">{c.facturas}</TableCell>
                              <TableCell className="text-right">{money(c.base, 2)}</TableCell>
                              <TableCell className="text-right pr-4 font-semibold">{money(c.retenido, 2)}</TableCell>
                            </TableRow>
                          ))}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

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
                    ...(datos.aplicaVenezuela
                      ? [{ value: "compras" as Vista, label: "Compras del mes", contador: datos.compras.length }]
                      : []),
                  ]}
                />
              </div>

              {vista === "compras" ? (
                <TablaCompras
                  compras={comprasFiltradas}
                  filtro={filtroCompras}
                  setFiltro={setFiltroCompras}
                  todasLasSedes={!empresa}
                />
              ) : vista === "sin_retencion" ? (
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

function TablaCompras({
  compras,
  filtro,
  setFiltro,
  todasLasSedes,
}: {
  compras: CompraDelMes[];
  filtro: FiltroCompras;
  setFiltro: (f: FiltroCompras) => void;
  todasLasSedes: boolean;
}) {
  const opciones: { value: FiltroCompras; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "fiscales", label: "Fiscales" },
    { value: "no_fiscales", label: "No fiscales" },
  ];
  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {opciones.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setFiltro(o.value)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filtro === o.value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"
            }`}
          >
            {o.label}
          </button>
        ))}
        <span className="text-xs text-gray-500">
          Fiscal = factura con IVA o exenta; no fiscal = sin impuesto en ninguna línea.
        </span>
      </div>
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="px-2 sm:px-4">Factura</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-center">Clase</TableHead>
            <TableHead className="text-right hidden md:table-cell">IVA</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-center pr-4 hidden sm:table-cell">Retenciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {compras.length === 0 ? (
            <FilaVacia columnas={6} texto="Sin compras en el mes." />
          ) : (
            compras.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="px-2 sm:px-4">
                  <div className="font-mono text-xs">
                    {c.numero}
                    {c.esNotaCredito && <span className="ml-1 text-[10px] text-red-600">NC</span>}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {c.facturaProveedor && `Fact. ${c.facturaProveedor}`}
                    {c.nroControl && ` · Ctrl. ${c.nroControl}`}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {fechaCorta(c.fecha)}
                    {todasLasSedes && ` · ${NOMBRE_SEDE[c.sede] || c.sede}`}
                  </div>
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {c.proveedor}
                  {c.intercompania && (
                    <Badge variant="outline" className="ml-1 text-[10px] py-0 border-purple-300 text-purple-700">
                      intercompañía
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={`text-[10px] py-0 whitespace-nowrap ${CLASE[c.clase].badge}`}>
                    {CLASE[c.clase].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right hidden md:table-cell">{c.iva ? money(c.iva, 2) : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{money(c.total, 2)}</TableCell>
                <TableCell className="text-center pr-4 text-[11px] hidden sm:table-cell">
                  {[c.conRetencionIva && "IVA", c.conRetencionIslr && "ISLR"].filter(Boolean).join(" · ") || "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
