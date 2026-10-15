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
  Tarjeta,
  fechaCorta,
  mesActual,
  money,
  useDatosAdmin,
} from "@/components/administracion/comunes";
import type { ClaseCuenta, CuentaTesoreria, DatosTesoreriaAdmin } from "@/lib/administracion/tesoreria";
import { Landmark } from "lucide-react";
import { useState } from "react";

type Respuesta = DatosTesoreriaAdmin & { success: true; hoy: string };

const DIAS_ATRASADO = 7;

const TITULO_CLASE: Record<ClaseCuenta, { titulo: string; nota: string }> = {
  disponible: { titulo: "Bancos y cajas", nota: "Suman al disponible." },
  retencion: {
    titulo: "Retenciones",
    nota: "IVA, ISLR, ITBMS e IGTF que retuvieron los clientes o que se retienen para pagar al fisco. No es dinero disponible.",
  },
  puente: {
    titulo: "Cuentas puente",
    nota: "Transitorias, depósitos por identificar y descuentos. Deberían quedar en cero al conciliar; no suman al disponible.",
  },
};

export default function TesoreriaPage() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(mesActual);
  const { datos, cargando, error } = useDatosAdmin<Respuesta>("/api/administracion/tesoreria", empresa, mes);

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<Landmark className="h-7 w-7 text-blue-600" />}
        titulo="Tesorería y Bancos"
        subtitulo="Saldos contables de bancos y cajas, conciliación y flujo a 4 semanas, desde Odoo"
        empresa={empresa}
        setEmpresa={setEmpresa}
        mes={mes}
        setMes={setMes}
        acciones={
          datos && (
            <BotonExcel
              archivo={`Tesoreria_${empresa || "todas"}_${datos.hoy}`}
              hojas={() => [
                {
                  nombre: "Cuentas",
                  filas: datos.cuentas.map((c) => ({
                    Sede: NOMBRE_SEDE[c.sede] || c.sede,
                    Clase: TITULO_CLASE[c.clase].titulo,
                    Cuenta: c.codigo,
                    Nombre: c.nombre,
                    Diarios: c.diarios.join(", "),
                    Moneda: c.moneda,
                    "Saldo USD": c.saldo,
                    "Saldo moneda diario": c.saldoMonedaDiario ?? "",
                    "Entradas del mes": c.entradasMes,
                    "Salidas del mes": c.salidasMes,
                    "Último extracto": c.extracto.ultimo ?? "",
                    "Líneas sin conciliar": c.extracto.sinConciliar,
                    "Monto sin conciliar": c.extracto.montoSinConciliar,
                  })),
                },
                {
                  nombre: "Flujo 4 semanas",
                  filas: datos.flujo.semanas.map((s) => ({
                    Desde: s.desde,
                    Hasta: s.hasta,
                    Entradas: s.entradas,
                    Salidas: s.salidas,
                    "Saldo final": s.saldoFinal,
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tarjeta
              titulo="Disponible"
              valor={money(datos.resumen.disponible)}
              detalle={`Bancos ${money(datos.resumen.disponibleBancos)} · Cajas ${money(datos.resumen.disponibleCajas)}`}
              tono="azul"
            />
            <Tarjeta titulo="Entradas del mes" valor={money(datos.resumen.entradasMes)} tono="verde" />
            <Tarjeta titulo="Salidas del mes" valor={money(datos.resumen.salidasMes)} />
            <Tarjeta
              titulo="Líneas sin conciliar"
              valor={datos.resumen.lineasSinConciliar.toLocaleString("es-VE")}
              detalle="Líneas de extracto cargadas sin conciliar"
              tono={datos.resumen.lineasSinConciliar > 0 ? "ambar" : "verde"}
            />
            {datos.tasas.length > 0 ? (
              <Tarjeta
                titulo={`Tasa BCV ${fechaCorta(datos.tasas[0].fecha)}`}
                valor={`Bs ${datos.tasas[0].bsPorUnidad.toLocaleString("es-VE")}`}
                detalle={datos.tasas
                  .map((t) => {
                    const variacion = t.anterior
                      ? ((t.bsPorUnidad - t.anterior.bsPorUnidad) / t.anterior.bsPorUnidad) * 100
                      : null;
                    return `${t.moneda} ${t.bsPorUnidad.toLocaleString("es-VE")}${
                      variacion !== null ? ` (${variacion >= 0 ? "+" : ""}${variacion.toFixed(2)}%)` : ""
                    }`;
                  })
                  .join(" · ")}
              />
            ) : (
              <Tarjeta titulo="Tasa BCV" valor="—" detalle="Solo aplica a Valencia y Caracas" />
            )}
          </div>

          {datos.tasas[0] && datos.tasas[0].fecha < datos.hoy && (
            <Aviso>
              La última tasa BCV cargada en Odoo es del {fechaCorta(datos.tasas[0].fecha)}. Las facturas en bolívares de
              hoy se convierten con esa tasa hasta que se cargue la del día.
            </Aviso>
          )}

          {datos.resumen.diariosSinExtractoReciente > 0 && (
            <Aviso>
              <b>{datos.resumen.diariosSinExtractoReciente}</b> bancos no tienen extracto cargado en los últimos{" "}
              {DIAS_ATRASADO} días. Sin extracto no hay conciliación: el saldo contable no está comprobado contra el banco.
            </Aviso>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Flujo proyectado (4 semanas)</CardTitle>
              <p className="text-sm text-gray-500">
                Disponible de hoy + facturas de clientes que vencen − facturas de proveedores que vencen. Sin
                intercompañía. No incluye lo ya vencido: por cobrar {money(datos.flujo.porCobrarVencido)} y por pagar{" "}
                {money(datos.flujo.porPagarVencido)}.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="px-2 sm:px-4">Semana</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Salidas</TableHead>
                    <TableHead className="text-right pr-4">Saldo al final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="px-2 sm:px-4 text-sm text-gray-500">Hoy</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right pr-4 font-semibold">{money(datos.flujo.saldoInicial)}</TableCell>
                  </TableRow>
                  {datos.flujo.semanas.map((s) => (
                    <TableRow key={s.desde}>
                      <TableCell className="px-2 sm:px-4 text-sm">
                        {fechaCorta(s.desde)} – {fechaCorta(s.hasta)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-700">{money(s.entradas)}</TableCell>
                      <TableCell className="text-right text-red-600">{money(-s.salidas)}</TableCell>
                      <TableCell
                        className={`text-right pr-4 font-semibold ${s.saldoFinal < 0 ? "text-red-600" : ""}`}
                      >
                        {money(s.saldoFinal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(["disponible", "retencion", "puente"] as ClaseCuenta[]).map((clase) => {
            const lista = datos.cuentas.filter((c) => c.clase === clase);
            if (lista.length === 0 && clase !== "disponible") return null;
            return (
              <Card key={clase}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{TITULO_CLASE[clase].titulo}</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {money(lista.reduce((s, c) => s + c.saldo, 0))}
                    </span>
                  </CardTitle>
                  <p className="text-sm text-gray-500">{TITULO_CLASE[clase].nota}</p>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <TablaCuentas cuentas={lista} todasLasSedes={!empresa} hoy={datos.hoy} conExtracto={clase === "disponible"} />
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function TablaCuentas({
  cuentas,
  todasLasSedes,
  hoy,
  conExtracto,
}: {
  cuentas: CuentaTesoreria[];
  todasLasSedes: boolean;
  hoy: string;
  conExtracto: boolean;
}) {
  return (
    <Table>
      <TableHeader className="bg-slate-50">
        <TableRow>
          <TableHead className="px-2 sm:px-4">Cuenta</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="text-right hidden md:table-cell">Entradas mes</TableHead>
          <TableHead className="text-right hidden md:table-cell">Salidas mes</TableHead>
          {conExtracto && <TableHead className="text-center hidden sm:table-cell pr-4">Extracto</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {cuentas.length === 0 ? (
          <FilaVacia columnas={5} />
        ) : (
          cuentas.map((c) => {
            const atrasado =
              c.tipo === "bank" && (c.extracto.diasDesdeUltimo === null || c.extracto.diasDesdeUltimo > DIAS_ATRASADO);
            return (
              <TableRow key={c.cuentaId}>
                <TableCell className="px-2 sm:px-4 whitespace-normal">
                  <div className="font-medium text-sm break-words">{c.nombre}</div>
                  <div className="text-xs text-gray-400">
                    <span className="font-mono">{c.codigo}</span>
                    {todasLasSedes && ` · ${NOMBRE_SEDE[c.sede] || c.sede}`}
                    {c.tipo === "cash" && " · caja"}
                    {c.diarios.length > 1 && ` · ${c.diarios.length} diarios`}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className={`font-semibold ${c.saldo < 0 ? "text-red-600" : ""}`}>{money(c.saldo, 2)}</div>
                  {c.saldoMonedaDiario !== null && (
                    <div className="text-[11px] text-gray-400">
                      {c.moneda} {c.saldoMonedaDiario.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-emerald-700 hidden md:table-cell">
                  {c.entradasMes ? money(c.entradasMes) : "—"}
                </TableCell>
                <TableCell className="text-right text-sm text-red-600 hidden md:table-cell">
                  {c.salidasMes ? money(-c.salidasMes) : "—"}
                </TableCell>
                {conExtracto && (
                  <TableCell className="text-center hidden sm:table-cell pr-4">
                    {c.tipo === "cash" ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-xs ${atrasado ? "text-red-600 font-medium" : "text-gray-600"}`}>
                          {c.extracto.ultimo ? `Último ${fechaCorta(c.extracto.ultimo)}` : "Sin extractos"}
                        </span>
                        {c.extracto.sinConciliar > 0 && (
                          <Badge variant="outline" className="text-[10px] py-0 border-amber-300 text-amber-700">
                            {c.extracto.sinConciliar} sin conciliar
                            {c.extracto.sinConciliarMasViejo && ` desde ${fechaCorta(c.extracto.sinConciliarMasViejo)}`}
                          </Badge>
                        )}
                        {c.extracto.ultimo === hoy && (
                          <span className="text-[10px] text-emerald-600">al día</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
