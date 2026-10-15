"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { Banda, DatosCxPAdmin } from "@/lib/administracion/cxp";
import { Receipt } from "lucide-react";
import { useMemo, useState } from "react";

type Respuesta = DatosCxPAdmin & { success: true; hoy: string };
type Vista = "proveedores" | "calendario" | "documentos" | "borradores" | "pagos";

const ETIQUETA_BANDA: Record<Banda, string> = {
  corriente: "Por vencer",
  "1_30": "1–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  "91_mas": "+90 días",
};
const COLOR_BANDA: Record<Banda, string> = {
  corriente: "bg-emerald-500",
  "1_30": "bg-amber-400",
  "31_60": "bg-orange-500",
  "61_90": "bg-red-500",
  "91_mas": "bg-red-800",
};
const BANDAS: Banda[] = ["corriente", "1_30", "31_60", "61_90", "91_mas"];

export default function CuentasPorPagarPage() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(mesActual);
  const [sinIntercompania, setSinIntercompania] = useState(true);
  const [vista, setVista] = useState<Vista>("proveedores");
  const [buscar, setBuscar] = useState("");
  const [soloVencidos, setSoloVencidos] = useState(false);

  const { datos, cargando, error } = useDatosAdmin<Respuesta>(
    "/api/administracion/cuentas-por-pagar",
    empresa,
    mes,
    sinIntercompania ? "&sin_intercompania=1" : "",
  );

  const texto = buscar.toLowerCase().trim();
  const documentos = useMemo(
    () =>
      (datos?.documentos ?? []).filter(
        (d) =>
          (!soloVencidos || d.diasVencido > 0) &&
          (!texto ||
            d.proveedor.toLowerCase().includes(texto) ||
            d.numero.toLowerCase().includes(texto) ||
            d.referencia.toLowerCase().includes(texto)),
      ),
    [datos, texto, soloVencidos],
  );
  const proveedores = useMemo(
    () => (datos?.proveedores ?? []).filter((p) => !texto || p.proveedor.toLowerCase().includes(texto)),
    [datos, texto],
  );

  const totalBandas = datos ? BANDAS.reduce((s, b) => s + Math.max(0, datos.bandas[b]), 0) : 0;
  const maxSemana = datos ? Math.max(1, ...datos.calendario.map((s) => s.monto)) : 1;

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<Receipt className="h-7 w-7 text-blue-600" />}
        titulo="Cuentas por Pagar"
        subtitulo="Lo que se le debe a proveedores, desde Odoo · montos en USD (moneda de la empresa)"
        empresa={empresa}
        setEmpresa={setEmpresa}
        mes={mes}
        setMes={setMes}
        acciones={
          datos && (
            <BotonExcel
              archivo={`CxP_${empresa || "todas"}_${datos.hoy}`}
              hojas={() => [
                {
                  nombre: "Proveedores",
                  filas: datos.proveedores.map((p) => ({
                    Proveedor: p.proveedor,
                    Documentos: p.documentos,
                    Saldo: p.saldo,
                    Vencido: p.vencido,
                    ...Object.fromEntries(BANDAS.map((b) => [ETIQUETA_BANDA[b], p.bandas[b]])),
                    "Vence el más viejo": p.venceMasViejo,
                  })),
                },
                {
                  nombre: "Documentos",
                  filas: datos.documentos.map((d) => ({
                    Sede: NOMBRE_SEDE[d.sede] || d.sede,
                    Tipo: d.tipo === "factura" ? "Factura" : "Nota de crédito",
                    Numero: d.numero,
                    Referencia: d.referencia,
                    Proveedor: d.proveedor,
                    Fecha: d.fecha,
                    Vence: d.vence,
                    "Días vencido": d.diasVencido > 0 ? d.diasVencido : 0,
                    Total: d.total,
                    Saldo: d.saldo,
                    Moneda: d.moneda,
                    "Saldo moneda origen": d.saldoMonedaOrigen ?? "",
                    "Sin condición de pago": d.sinCondicionPago ? "Sí" : "",
                  })),
                },
                {
                  nombre: "Borradores",
                  filas: datos.borradores.map((b) => ({
                    Sede: NOMBRE_SEDE[b.sede] || b.sede,
                    Numero: b.numero,
                    Referencia: b.referencia,
                    Proveedor: b.proveedor,
                    Fecha: b.fecha,
                    Total: b.total,
                    "Días en borrador": b.diasEnBorrador,
                  })),
                },
                {
                  nombre: "Pagos del mes",
                  filas: datos.pagosDelMes.map((p) => ({
                    Fecha: p.fecha,
                    Sede: NOMBRE_SEDE[p.sede] || p.sede,
                    Proveedor: p.proveedor,
                    Diario: p.diario,
                    Monto: p.monto,
                  })),
                },
              ]}
            />
          )
        }
      />

      <label className="flex items-center gap-2 text-sm text-gray-600 w-fit cursor-pointer">
        <input
          type="checkbox"
          checked={sinIntercompania}
          onChange={(e) => setSinIntercompania(e.target.checked)}
          className="h-4 w-4"
        />
        Sin intercompañía (deudas entre sedes del grupo)
      </label>

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tarjeta
              titulo="Saldo por pagar"
              valor={money(datos.resumen.saldo)}
              detalle={`${datos.resumen.documentos} documentos · ${datos.resumen.proveedores} proveedores`}
              tono="azul"
            />
            <Tarjeta
              titulo="Vencido"
              valor={money(datos.resumen.vencido)}
              detalle={
                datos.resumen.saldo > 0
                  ? `${Math.round((datos.resumen.vencido / datos.resumen.saldo) * 100)}% del saldo`
                  : undefined
              }
              tono={datos.resumen.vencido > 0 ? "rojo" : "verde"}
            />
            <Tarjeta titulo="Vence en 7 días" valor={money(datos.resumen.porVencer7)} tono="ambar" />
            <Tarjeta titulo="Vence en 30 días" valor={money(datos.resumen.porVencer30)} />
            <Tarjeta
              titulo="Pagado en el mes"
              valor={money(datos.resumen.pagadoEnElMes)}
              detalle={`${datos.pagosDelMes.length} pagos a proveedores`}
              tono="verde"
            />
          </div>

          {datos.resumen.sinCondicionPago.documentos > 0 && (
            <Aviso>
              <b>{datos.resumen.sinCondicionPago.documentos}</b> facturas ({money(datos.resumen.sinCondicionPago.monto)})
              no tienen condiciones de pago en Odoo: vencen el mismo día de la factura y figuran vencidas desde que se
              cargan. Cargar el plazo del proveedor corrige la antigüedad.
            </Aviso>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Antigüedad del saldo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
                {BANDAS.map((b) =>
                  datos.bandas[b] > 0 && totalBandas > 0 ? (
                    <div
                      key={b}
                      className={COLOR_BANDA[b]}
                      style={{ width: `${(datos.bandas[b] / totalBandas) * 100}%` }}
                      title={`${ETIQUETA_BANDA[b]}: ${money(datos.bandas[b])}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                {BANDAS.map((b) => (
                  <div key={b} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${COLOR_BANDA[b]}`} />
                    <span className="text-gray-500">{ETIQUETA_BANDA[b]}</span>
                    <span className="font-semibold ml-auto sm:ml-0">{money(datos.bandas[b])}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-2 sm:px-4 pt-2">
                <Pestanas<Vista>
                  valor={vista}
                  onChange={setVista}
                  opciones={[
                    { value: "proveedores", label: "Por proveedor", contador: datos.proveedores.length },
                    { value: "calendario", label: "Calendario de pagos" },
                    { value: "documentos", label: "Documentos", contador: datos.documentos.length },
                    { value: "borradores", label: "En borrador", contador: datos.borradores.length },
                    { value: "pagos", label: "Pagos del mes", contador: datos.pagosDelMes.length },
                  ]}
                />
              </div>

              {(vista === "proveedores" || vista === "documentos") && (
                <div className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
                  <Input
                    placeholder="Buscar proveedor, número o referencia"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    className="max-w-sm h-9"
                  />
                  {vista === "documentos" && (
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={soloVencidos}
                        onChange={(e) => setSoloVencidos(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Solo vencidos
                    </label>
                  )}
                </div>
              )}

              {vista === "proveedores" && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Proveedor</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Vencido</TableHead>
                        {BANDAS.slice(1).map((b) => (
                          <TableHead key={b} className="text-right hidden lg:table-cell">
                            {ETIQUETA_BANDA[b]}
                          </TableHead>
                        ))}
                        <TableHead className="text-right hidden md:table-cell pr-4">Vence el más viejo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proveedores.length === 0 ? (
                        <FilaVacia columnas={8} />
                      ) : (
                        proveedores.map((p) => (
                          <TableRow key={`${p.proveedorId ?? p.proveedor}`}>
                            <TableCell className="px-2 sm:px-4 whitespace-normal">
                              <div className="font-medium text-sm break-words">{p.proveedor}</div>
                              <div className="text-xs text-gray-400">
                                {p.documentos} doc.
                                {p.intercompania && <span className="ml-1 text-violet-600">· intercompañía</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{money(p.saldo)}</TableCell>
                            <TableCell className={`text-right ${p.vencido > 0 ? "text-red-600" : "text-gray-400"}`}>
                              {money(p.vencido)}
                            </TableCell>
                            {BANDAS.slice(1).map((b) => (
                              <TableCell key={b} className="text-right text-sm text-gray-600 hidden lg:table-cell">
                                {p.bandas[b] ? money(p.bandas[b]) : "—"}
                              </TableCell>
                            ))}
                            <TableCell className="text-right text-sm text-gray-500 hidden md:table-cell pr-4">
                              {fechaCorta(p.venceMasViejo)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {vista === "calendario" && (
                <div className="p-4 space-y-3">
                  <p className="text-sm text-gray-500">
                    Facturas por semana de vencimiento. Lo ya vencido ({money(datos.resumen.vencido)}) no entra aquí:
                    está en la tarjeta "Vencido".
                  </p>
                  {datos.calendario.map((s, i) => (
                    <div key={s.desde} className="flex items-center gap-3 text-sm">
                      <div className="w-36 sm:w-44 shrink-0 text-gray-600">
                        {i === 0 ? "Esta semana" : `${fechaCorta(s.desde)} – ${fechaCorta(s.hasta)}`}
                      </div>
                      <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
                        <div
                          className="h-full bg-blue-500/80"
                          style={{ width: `${(s.monto / maxSemana) * 100}%` }}
                        />
                      </div>
                      <div className="w-28 text-right font-semibold">{money(s.monto)}</div>
                      <div className="w-14 text-right text-xs text-gray-400 hidden sm:block">{s.documentos} fact.</div>
                    </div>
                  ))}
                </div>
              )}

              {vista === "documentos" && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Documento</TableHead>
                        <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                        <TableHead className="text-center">Vence</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right hidden lg:table-cell pr-4">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documentos.length === 0 ? (
                        <FilaVacia columnas={5} />
                      ) : (
                        documentos.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="px-2 sm:px-4 whitespace-normal">
                              <div className="font-mono text-xs">{d.numero}</div>
                              <div className="text-xs text-gray-500 md:hidden break-words">{d.proveedor}</div>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {d.referencia && <span className="text-[11px] text-gray-400">Ref. {d.referencia}</span>}
                                {d.tipo === "nota_credito" && (
                                  <Badge variant="outline" className="text-[10px] py-0">NC</Badge>
                                )}
                                {d.sinCondicionPago && (
                                  <Badge variant="outline" className="text-[10px] py-0 border-amber-300 text-amber-700">
                                    sin plazo
                                  </Badge>
                                )}
                                {!empresa && (
                                  <span className="text-[11px] text-gray-400">{NOMBRE_SEDE[d.sede] || d.sede}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm hidden md:table-cell whitespace-normal">{d.proveedor}</TableCell>
                            <TableCell className="text-center text-sm">
                              <div>{fechaCorta(d.vence)}</div>
                              {d.diasVencido > 0 && (
                                <div className="text-[11px] text-red-600">hace {d.diasVencido} d</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-semibold">{money(d.saldo, 2)}</div>
                              {d.saldoMonedaOrigen !== null && (
                                <div className="text-[11px] text-gray-400">
                                  {d.moneda} {d.saldoMonedaOrigen.toLocaleString("es-VE")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm text-gray-500 hidden lg:table-cell pr-4">
                              {money(d.total, 2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {vista === "borradores" && (
                <div className="overflow-x-auto">
                  <p className="text-sm text-gray-500 px-4 pt-3">
                    Facturas de proveedor cargadas en Odoo que nadie ha publicado: no cuentan en el saldo ni en los
                    libros hasta que se publiquen.
                  </p>
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Proveedor</TableHead>
                        <TableHead className="hidden sm:table-cell">Referencia</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right pr-4">Días en borrador</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.borradores.length === 0 ? (
                        <FilaVacia columnas={4} texto="No hay facturas de proveedor en borrador." />
                      ) : (
                        datos.borradores.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="px-2 sm:px-4 whitespace-normal">
                              <div className="text-sm font-medium break-words">{b.proveedor}</div>
                              <div className="text-xs text-gray-400">
                                {fechaCorta(b.fecha)}
                                {!empresa && ` · ${NOMBRE_SEDE[b.sede] || b.sede}`}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-500 hidden sm:table-cell">{b.referencia || "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{money(b.total, 2)}</TableCell>
                            <TableCell
                              className={`text-right pr-4 ${b.diasEnBorrador > 3 ? "text-red-600 font-semibold" : ""}`}
                            >
                              {b.diasEnBorrador}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {vista === "pagos" && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Fecha</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="hidden md:table-cell">Diario</TableHead>
                        <TableHead className="text-right pr-4">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.pagosDelMes.length === 0 ? (
                        <FilaVacia columnas={4} texto="Sin pagos a proveedores en el mes." />
                      ) : (
                        datos.pagosDelMes.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="px-2 sm:px-4 text-sm">{fechaCorta(p.fecha)}</TableCell>
                            <TableCell className="text-sm whitespace-normal">{p.proveedor}</TableCell>
                            <TableCell className="text-sm text-gray-500 hidden md:table-cell">{p.diario}</TableCell>
                            <TableCell className="text-right font-semibold pr-4">{money(p.monto, 2)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
