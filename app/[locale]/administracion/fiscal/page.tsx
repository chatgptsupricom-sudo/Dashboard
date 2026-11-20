"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BotonExcel,
  EncabezadoAdmin,
  EstadoCarga,
  FilaVacia,
  NOMBRE_SEDE,
  Pestanas,
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
import { CheckCircle2, ChevronRight, FileText, XCircle } from "lucide-react";
import { type ReactNode, useState } from "react";

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
    .map((m) => (m.moneda === "USD" ? money(m.monto, 2) : `${m.moneda} ${m.monto.toLocaleString("es-VE")}`))
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

  function revisar(v: Vista) {
    setVista(v);
    document.getElementById("documentos-fiscales")?.scrollIntoView({ block: "start" });
  }

  const tarjetaRet = (titulo: string, tipo: Comprobante["tipo"], r: ResumenRetenciones) => r.confirmados + r.borradores + r.anulados === 0 ? null : (
    <TarjetaDetalle
      titulo={titulo}
      valor={montoPorMoneda(r)}
      detalle={`${r.confirmados} confirmadas${r.borradores ? ` · ${r.borradores} en borrador` : ""}${
        r.anulados ? ` · ${r.anulados} anuladas` : ""
      }`}
      tono={r.borradores > 0 ? "ambar" : "neutro"}
    >
      {tipo !== "itbms" && <p className="p-3 text-sm text-muted-foreground">Los importes en USD pueden incluir conversiones estimadas a partir de la factura y su tasa.</p>}
      <TablaComprobantes comprobantes={datos!.comprobantesDelMes.filter(c => c.tipo === tipo)} todasLasSedes={!empresa} conDias={false} vacio="Sin retenciones en el mes." />
    </TarjetaDetalle>
  );

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<FileText className="h-7 w-7 text-blue-600" />}
        titulo="Fiscal"
        subtitulo="Compras, ventas y cierre fiscal del período según los registros de Odoo."
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
                  nombre: "NC emitidas por registro",
                  filas: datos.notasCreditoEmitidas.map(n => ({
                    Sede: NOMBRE_SEDE[n.sede], Nota: n.numero, Cliente: n.cliente,
                    Registro: n.registro, "Fecha del documento": n.fechaDocumento, "Total acreditado (USD)": n.total,
                  })),
                },
                {
                  nombre: "Impuestos por documento",
                  filas: datos.detalleImpuestos.map(f => ({
                    Sede: NOMBRE_SEDE[f.sede], Operación: f.ventas ? "Venta" : "Compra",
                    Fecha: f.fecha, Documento: f.numero, Contacto: f.contacto, Impuesto: f.impuesto,
                    Tasa: f.tasa, "Base USD": f.base, "Impuesto USD": f.monto,
                  })),
                },
                {
                  nombre: "Retenciones de clientes",
                  filas: datos.comprobantesVentas.map(c => ({ Sede: NOMBRE_SEDE[c.sede], Fecha: c.fecha,
                    Documento: c.numero, Cliente: c.proveedor, Tipo: TIPO[c.tipo], Estado: c.estado, Moneda: c.moneda, Monto: c.monto })),
                },
                {
                  nombre: "Retenciones de proveedores",
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
          <section className="rounded-xl border bg-white p-4" aria-label="Por revisar">
            <h2 className="font-semibold mb-2">Por revisar</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              {datos.facturasSinRetencionIva.length > 0 && <button className="text-amber-800 underline" onClick={() => revisar("sin_retencion")}>{datos.facturasSinRetencionIva.length} compras con IVA sin comprobante de retención</button>}
              {datos.comprobantesPendientes.length > 0 && <button className="text-amber-800 underline" onClick={() => revisar("pendientes")}>{datos.comprobantesPendientes.length} retenciones de proveedores en borrador · todos los períodos</button>}
              {!datos.facturasSinRetencionIva.length && !datos.comprobantesPendientes.length && <span className="text-muted-foreground">Sin pendientes en estas revisiones.</span>}
            </div>
          </section>
          {(["Compras", "Ventas"] as const).map(lado => {
            const ventas = lado === "Ventas";
            const f = ventas ? ventasF : comprasF;
            const filas = ventas
              ? datos.ventasDetalle.filter(v => v.fiscal).map(v => ({ ...v, contacto: v.cliente, monto: v.total }))
              : datos.compras.filter(c => !c.esNotaCredito && c.clase !== "sin_impuesto").map(c => ({ ...c, contacto: c.proveedor, monto: c.total }));
            const impuestos = datos.detalleImpuestos.filter(i => i.ventas === ventas);
            const retClientes = datos.comprobantesVentas;
            return (
              <section key={lado} aria-label={lado} className="space-y-2">
                <h2 className="text-lg font-semibold">{lado}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <TarjetaDetalle titulo={lado + " fiscales"} valor={money(f.monto, 2)} detalle={`${f.fiscales} facturas · ${f.gravadas} gravadas · ${f.fiscales - f.gravadas} exentas`}>
                    <Documentos filas={filas} importe="Total" />
                  </TarjetaDetalle>
                  {ventas && (
                    <TarjetaDetalle titulo="Notas de crédito emitidas" valor={money(datos.notasCreditoEmitidas.reduce((s, n) => s + n.total, 0), 2)}
                      detalle={`${datos.notasCreditoEmitidas.length} notas publicadas · por fecha de registro`}>
                      <Table>
                        <TableHeader><TableRow>
                          {["Nota", "Cliente", "Registro en Odoo", "Fecha del documento", "Total acreditado (USD)"].map(t => <TableHead key={t}>{t}</TableHead>)}
                        </TableRow></TableHeader>
                        <TableBody>
                          {datos.notasCreditoEmitidas.map(n => <TableRow key={n.id}>
                            <TableCell><EnlaceFactura id={n.id} numero={n.numero} /><div className="text-xs text-muted-foreground">{NOMBRE_SEDE[n.sede]}</div></TableCell>
                            <TableCell>{n.cliente}</TableCell><TableCell>{fechaCorta(n.registro)}</TableCell>
                            <TableCell>{fechaCorta(n.fechaDocumento)}</TableCell><TableCell className="text-right">{money(n.total, 2)}</TableCell>
                          </TableRow>)}
                          {!datos.notasCreditoEmitidas.length && <FilaVacia columnas={5} texto="Sin notas de crédito emitidas registradas en el período." />}
                        </TableBody>
                      </Table>
                    </TarjetaDetalle>
                  )}
                  {datos.impuestos.map(i => {
                    const lineas = impuestos.filter(t => t.sede === i.sede && t.iva);
                    return <TarjetaDetalle key={i.sede} titulo={`${i.impuesto} de ${lado.toLowerCase()} · ${NOMBRE_SEDE[i.sede]}`}
                      valor={money(ventas ? i.debitoVentas : i.creditoCompras, 2)} detalle="Facturas y notas de crédito">
                      <DetalleImpuestos filas={lineas} />
                    </TarjetaDetalle>;
                  })}
                  {!ventas && datos.aplicaVenezuela && tarjetaRet("IVA retenido a proveedores", "iva", datos.retencionesIva)}
                  {!ventas && datos.aplicaVenezuela && tarjetaRet("ISLR retenido a proveedores", "islr", datos.retencionesIslr)}
                  {!ventas && datos.aplicaPanama && tarjetaRet("ITBMS retenido a proveedores", "itbms", datos.retencionesItbms)}
                  {ventas && datos.igtf.map(i => (
                    <TarjetaDetalle key={i.sede} titulo={`IGTF facturado · ${NOMBRE_SEDE[i.sede]}`}
                      valor={money(i.cobradoFacturasMes, 2)} detalle={`${i.facturasMes} facturas · base neta ${money(i.baseMes, 2)}`}>
                      <p className="p-3 text-sm">Saldo contable por enterar al {fechaCorta(datos.corte)}: {money(i.porPagar, 2)} · {i.cuenta}</p>
                      <Documentos filas={datos.ventasDetalle.filter(v => v.sede === i.sede && v.igtf !== 0).map(v => ({ ...v, contacto: v.cliente, monto: v.igtf }))} importe="IGTF" />
                    </TarjetaDetalle>
                  ))}
                  {ventas && retClientes.length > 0 && (
                    <TarjetaDetalle titulo="Retenciones de clientes" valor={`${retClientes.length} comprobantes`}
                      detalle={`IVA: ${montoPorMoneda(datos.retencionesVentas.iva)} · ISLR: ${montoPorMoneda(datos.retencionesVentas.islr)}`}>
                      <TablaComprobantes ventas comprobantes={retClientes} conDias={false} todasLasSedes={!empresa} vacio="Sin comprobantes." />
                    </TarjetaDetalle>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
                  {!ventas && !datos.comprobantesDelMes.length && <p className="text-muted-foreground">Sin retenciones a proveedores registradas en el mes.</p>}
                  {ventas && datos.aplicaVenezuela && !retClientes.length && <p className="text-muted-foreground">Sin retenciones de clientes registradas en el mes.</p>}
                  <Dialog><DialogTrigger className="text-blue-700 underline">Ver todos los impuestos de {lado.toLowerCase()}</DialogTrigger>
                    <DialogContent className="w-[calc(100%-2rem)] max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-5xl"><DialogTitle>Impuestos de {lado.toLowerCase()}</DialogTitle>
                      <DialogDescription>Apuntes fiscales publicados del período.</DialogDescription>
                      <DetalleImpuestos filas={impuestos} />
                    </DialogContent>
                  </Dialog>
                </div>
              </section>
            );
          })}
          <h2 className="text-lg font-semibold">Cierre del mes</h2>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">IVA / ITBMS del mes</CardTitle>
                <p className="text-sm text-gray-500">
                  Importes en USD. Las notas de crédito de ventas se asignan al mes en que se crearon en Odoo. Solo se incluyen las publicadas. Es la referencia para cuadrar la declaración, no
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
                      <TableHead className="text-right pr-4">Diferencia según facturas</TableHead>
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
                  <CardTitle className="text-base">Libros fiscales</CardTitle>
                  <p className="text-sm text-gray-500">Estado del período en Odoo.</p>
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
                </CardContent>
              </Card>
            )}
          </div>

          {datos.aplicaVenezuela && (
            <details className="rounded-xl border bg-white p-4">
              <summary className="cursor-pointer font-medium">Detalle de retenciones a proveedores por porcentaje y concepto</summary>
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
            </details>
          )}

          <Card id="documentos-fiscales">
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

function TarjetaDetalle({ children, ...props }: { titulo: string; valor: ReactNode; detalle?: ReactNode; tono?: "ambar" | "verde" | "neutro"; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={`Ver detalle de ${props.titulo}`}
          className="group flex min-h-28 w-full flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600">
          <span className="flex w-full items-start justify-between gap-2 text-sm font-medium text-muted-foreground">
            {props.titulo}<ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
          </span>
          <span className="mt-2 text-xl font-semibold tabular-nums">{props.valor}</span>
          <span className={`mt-1 text-xs ${props.tono === "ambar" ? "text-amber-700" : "text-muted-foreground"}`}>{props.detalle}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-4xl">
        <DialogTitle>{props.titulo}</DialogTitle>
        <DialogDescription>{props.valor} · {props.detalle}</DialogDescription>
        <div className="max-h-[65vh] overflow-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function EnlaceFactura({ id, numero }: { id: number; numero: string }) {
  const base = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "");
  return <a className="text-blue-700 underline" href={`${base}/web#id=${id}&model=account.move&view_type=form`} target="_blank" rel="noreferrer">{numero}</a>;
}

function DetalleImpuestos({ filas }: { filas: DatosFiscal["detalleImpuestos"] }) {
  const [busca, setBusca] = useState("");
  const termino = busca.trim().toLowerCase();
  const visibles = filas.filter(f => [f.numero, f.fecha, f.contacto, f.impuesto, f.sede].join(" ").toLowerCase().includes(termino));
  const facturas = filas.reduce((s,f) => s + (f.nc ? 0 : f.monto), 0);
  const notas = filas.reduce((s,f) => s + (f.nc ? f.monto : 0), 0);
  return <div className="space-y-3">
    <p className="text-sm">Facturas {money(facturas, 2)} · Notas de crédito {money(notas, 2)} · Neto {money(facturas + notas, 2)}</p>
    <input className="w-full rounded-md border px-3 py-2" aria-label="Buscar documento, contacto o impuesto" placeholder="Buscar documento, contacto o impuesto" value={busca} onChange={e => setBusca(e.target.value)} />
    <div className="max-h-[52vh] overflow-auto"><Table><TableHeader><TableRow>
      {["Documento", "Fecha", "Contacto", "Impuesto", "Tasa", "Base (USD)", "Impuesto (USD)"].map(t => <TableHead key={t}>{t}</TableHead>)}
    </TableRow></TableHeader><TableBody>
      {visibles.map((f,i) => <TableRow key={i}><TableCell><EnlaceFactura id={f.id} numero={f.numero} /></TableCell>
        <TableCell>{fechaCorta(f.fecha)}</TableCell><TableCell className="min-w-36 whitespace-normal break-words">{f.contacto}</TableCell><TableCell>{f.impuesto}</TableCell>
        <TableCell>{f.tasa}%</TableCell><TableCell>{money(f.base, 2)}</TableCell><TableCell>{money(f.monto, 2)}</TableCell></TableRow>)}
      {!visibles.length && <FilaVacia columnas={7} texto="Sin documentos para esta selección." />}
    </TableBody></Table></div>
  </div>;
}

function Documentos({ filas, importe }: {
  filas: { id: number; numero: string; fecha: string; sede: string; contacto: string; monto: number }[];
  importe: string;
}) {
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Documento</TableHead><TableHead>Fecha</TableHead><TableHead>Contacto</TableHead>
        <TableHead className="text-right">{importe} (USD)</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {!filas.length && <FilaVacia columnas={4} texto="Sin documentos en el mes." />}
        {filas.map(f => (
          <TableRow key={f.id}>
            <TableCell><EnlaceFactura id={f.id} numero={f.numero} /><div className="text-xs text-muted-foreground">{NOMBRE_SEDE[f.sede] || f.sede}</div></TableCell>
            <TableCell>{fechaCorta(f.fecha)}</TableCell><TableCell>{f.contacto}</TableCell>
            <TableCell className="text-right">{money(f.monto, 2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TablaComprobantes({
  ventas = false,
  comprobantes,
  todasLasSedes,
  conDias,
  vacio,
}: {
  ventas?: boolean;
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
            <TableHead>{ventas ? "Cliente" : "Proveedor"}</TableHead>
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
                  {conDias && <div className="text-xs text-muted-foreground">Período: {c.fecha?.slice(0, 7) || "Sin fecha"}</div>}
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
