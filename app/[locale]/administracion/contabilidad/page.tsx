"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Aviso,
  BotonExcel,
  EncabezadoAdmin,
  EstadoCarga,
  Pestanas,
  Tarjeta,
  fechaCorta,
  mesActual,
  money,
  useDatosAdmin,
} from "@/components/administracion/comunes";
import type { CheckCierre, DatosContabilidad, GrupoBalance, LineaResultado } from "@/lib/administracion/contabilidad";
import { BookOpenCheck, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";

type Respuesta = DatosContabilidad & { success: true; hoy: string; mes: string };
type Vista = "cierre" | "resultados" | "balance";

function nombreMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-VE", { month: "short", year: "numeric" });
}

export default function ContabilidadPage() {
  const locale = usePathname().split("/")[1] || "es";
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(mesActual);
  const [vista, setVista] = useState<Vista>("cierre");
  const [abierta, setAbierta] = useState<string | null>(null);
  const { datos, cargando, error } = useDatosAdmin<Respuesta>("/api/administracion/contabilidad", empresa, mes);

  const pendientes = datos ? datos.cierre.filter((c) => c.estado === "pendiente").length : 0;
  const aplicables = datos ? datos.cierre.filter((c) => c.estado !== "no_aplica").length : 0;

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<BookOpenCheck className="h-7 w-7 text-blue-600" />}
        titulo="Contabilidad y cierre"
        subtitulo="Cierre del mes, estado de resultados y balance general desde Odoo · USD"
        empresa={empresa}
        setEmpresa={setEmpresa}
        mes={mes}
        setMes={setMes}
        acciones={
          datos && (
            <BotonExcel
              archivo={`Contabilidad_${empresa || "todas"}_${datos.mes}`}
              hojas={() => [
                {
                  nombre: "Estado de resultados",
                  filas: datos.resultados.lineas.flatMap((l) => [
                    { Concepto: l.titulo, Cuenta: "", Mes: l.mes, "Mes anterior": l.mesAnterior, Acumulado: l.acumulado },
                    ...l.cuentas.map((c) => ({
                      Concepto: "",
                      Cuenta: `${c.codigo} ${c.nombre}`,
                      Mes: c.mes,
                      "Mes anterior": c.mesAnterior,
                      Acumulado: c.acumulado,
                    })),
                  ]),
                },
                {
                  nombre: "Balance general",
                  filas: [
                    ...datos.balance.activo.map((g) => ({ Lado: "Activo", Grupo: g.titulo, Monto: g.monto })),
                    ...datos.balance.pasivo.map((g) => ({ Lado: "Pasivo", Grupo: g.titulo, Monto: g.monto })),
                    ...datos.balance.patrimonio.map((g) => ({ Lado: "Patrimonio", Grupo: g.titulo, Monto: g.monto })),
                  ],
                },
                {
                  nombre: "Cierre",
                  filas: datos.cierre.map((c) => ({ Punto: c.titulo, Estado: c.estado, Detalle: c.detalle })),
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
            <Tarjeta
              titulo="Cierre del mes"
              valor={`${aplicables - pendientes} / ${aplicables}`}
              detalle={pendientes === 0 ? "Todo en orden" : `${pendientes} puntos pendientes`}
              tono={pendientes === 0 ? "verde" : "ambar"}
            />
            <Tarjeta
              titulo="Ingresos del mes"
              valor={money(datos.resultados.lineas.find((l) => l.grupo === "ingresos")?.mes)}
              tono="azul"
            />
            <Tarjeta
              titulo="Utilidad bruta"
              valor={money(datos.resultados.utilidadBruta.mes)}
              detalle={datos.resultados.margenBrutoMes !== null ? `Margen ${datos.resultados.margenBrutoMes}%` : undefined}
            />
            <Tarjeta
              titulo="Utilidad neta del mes"
              valor={money(datos.resultados.utilidadNeta.mes)}
              detalle={`Acumulado ${money(datos.resultados.utilidadNeta.acumulado)}`}
              tono={datos.resultados.utilidadNeta.mes < 0 ? "rojo" : "verde"}
            />
          </div>

          {datos.resultados.avisos.map((a) => (
            <Aviso key={a}>{a}</Aviso>
          ))}

          <Card>
            <CardContent className="p-0">
              <div className="px-2 sm:px-4 pt-2">
                <Pestanas<Vista>
                  valor={vista}
                  onChange={setVista}
                  opciones={[
                    { value: "cierre", label: "Cierre del mes", contador: pendientes },
                    { value: "resultados", label: "Estado de resultados" },
                    { value: "balance", label: "Balance general" },
                  ]}
                />
              </div>

              {vista === "cierre" && (
                <div className="divide-y">
                  {datos.cierre.map((c) => (
                    <FilaCierre key={c.id} check={c} locale={locale} />
                  ))}
                </div>
              )}

              {vista === "resultados" && (
                <div className="overflow-x-auto">
                  <p className="text-sm text-gray-500 px-4 pt-3">
                    Acumulado desde {fechaCorta(datos.resultados.periodos.acumuladoDesde)} hasta{" "}
                    {fechaCorta(datos.resultados.periodos.hasta)}. Clic en un concepto para ver sus cuentas.
                  </p>
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="px-2 sm:px-4">Concepto</TableHead>
                        <TableHead className="text-right capitalize">{nombreMes(datos.resultados.periodos.mes)}</TableHead>
                        <TableHead className="text-right capitalize hidden sm:table-cell">
                          {nombreMes(datos.resultados.periodos.mesAnterior)}
                        </TableHead>
                        <TableHead className="text-right pr-4">Acumulado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.resultados.lineas.map((l, i) => (
                        <Fragment key={l.grupo}>
                          <FilaResultado
                            linea={l}
                            abierta={abierta === l.grupo}
                            onClick={() => setAbierta(abierta === l.grupo ? null : l.grupo)}
                          />
                          {abierta === l.grupo &&
                            l.cuentas.map((c) => (
                              <TableRow key={c.codigo} className="bg-slate-50/60">
                                <TableCell className="pl-10 pr-2 text-xs whitespace-normal">
                                  <span className="font-mono text-gray-400 mr-2">{c.codigo}</span>
                                  {c.nombre}
                                </TableCell>
                                <TableCell className="text-right text-xs">{money(c.mes, 2)}</TableCell>
                                <TableCell className="text-right text-xs hidden sm:table-cell">{money(c.mesAnterior, 2)}</TableCell>
                                <TableCell className="text-right text-xs pr-4">{money(c.acumulado, 2)}</TableCell>
                              </TableRow>
                            ))}
                          {i === 1 && <FilaTotal titulo="Utilidad bruta" v={datos.resultados.utilidadBruta} />}
                          {i === 3 && <FilaTotal titulo="Utilidad operativa" v={datos.resultados.utilidadOperativa} />}
                        </Fragment>
                      ))}
                      <FilaTotal titulo="Utilidad neta" v={datos.resultados.utilidadNeta} fuerte />
                    </TableBody>
                  </Table>
                </div>
              )}

              {vista === "balance" && (
                <div className="p-4 space-y-4">
                  <p className="text-sm text-gray-500">Saldos al {fechaCorta(datos.balance.fecha)}.</p>
                  {Math.abs(datos.balance.descuadre) > 1 && (
                    <Aviso tono="rojo">
                      El balance no cuadra por {money(datos.balance.descuadre, 2)}: hay saldos en cuentas de un tipo que
                      este resumen no clasifica. Revisar en Odoo el balance general.
                    </Aviso>
                  )}
                  <div className="grid md:grid-cols-2 gap-4">
                    <BloqueBalance titulo="Activo" grupos={datos.balance.activo} total={datos.balance.totalActivo} />
                    <div className="space-y-4">
                      <BloqueBalance titulo="Pasivo" grupos={datos.balance.pasivo} total={datos.balance.totalPasivo} />
                      <BloqueBalance
                        titulo="Patrimonio"
                        grupos={datos.balance.patrimonio}
                        total={datos.balance.totalPatrimonio}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FilaCierre({ check, locale }: { check: CheckCierre; locale: string }) {
  const icono =
    check.estado === "ok" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    ) : check.estado === "pendiente" ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : (
      <CircleDashed className="h-5 w-5 text-slate-400" />
    );
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">{icono}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-sm">{check.titulo}</span>
          {check.cantidad !== null && check.estado === "pendiente" && (
            <span className="text-xs rounded-full bg-red-50 text-red-700 px-2 py-0.5">{check.cantidad}</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 break-words">{check.detalle}</p>
      </div>
      {check.enlace && check.estado === "pendiente" && (
        <Link href={`/${locale}${check.enlace}`} className="text-xs text-blue-600 hover:underline shrink-0 mt-0.5">
          Ver
        </Link>
      )}
    </div>
  );
}

function FilaResultado({ linea, abierta, onClick }: { linea: LineaResultado; abierta: boolean; onClick: () => void }) {
  return (
    <TableRow className="cursor-pointer hover:bg-slate-50" onClick={onClick}>
      <TableCell className="px-2 sm:px-4 whitespace-normal">
        <div className="flex items-center gap-2 text-sm">
          {abierta ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          {linea.titulo}
          <span className="text-xs text-gray-400">({linea.cuentas.length})</span>
        </div>
      </TableCell>
      <TableCell className={`text-right ${linea.mes < 0 ? "text-red-600" : ""}`}>{money(linea.mes)}</TableCell>
      <TableCell className="text-right text-gray-500 hidden sm:table-cell">{money(linea.mesAnterior)}</TableCell>
      <TableCell className="text-right pr-4">{money(linea.acumulado)}</TableCell>
    </TableRow>
  );
}

function FilaTotal({
  titulo,
  v,
  fuerte = false,
}: {
  titulo: string;
  v: { mes: number; mesAnterior: number; acumulado: number };
  fuerte?: boolean;
}) {
  const color = (n: number) => (n < 0 ? "text-red-600" : "text-gray-900");
  return (
    <TableRow className={fuerte ? "bg-blue-50/60" : "bg-slate-50"}>
      <TableCell className={`px-2 sm:px-4 text-sm ${fuerte ? "font-bold" : "font-semibold"}`}>{titulo}</TableCell>
      <TableCell className={`text-right font-semibold ${color(v.mes)}`}>{money(v.mes)}</TableCell>
      <TableCell className={`text-right font-semibold hidden sm:table-cell ${color(v.mesAnterior)}`}>
        {money(v.mesAnterior)}
      </TableCell>
      <TableCell className={`text-right font-semibold pr-4 ${color(v.acumulado)}`}>{money(v.acumulado)}</TableCell>
    </TableRow>
  );
}

function BloqueBalance({ titulo, grupos, total }: { titulo: string; grupos: GrupoBalance[]; total: number }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex justify-between">
          <span>{titulo}</span>
          <span>{money(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {grupos.map((g) => (
          <div key={g.clave} className="flex justify-between gap-3 text-sm">
            <span className="text-gray-600">{g.titulo}</span>
            <span className={`font-medium ${g.monto < 0 ? "text-red-600" : ""}`}>{money(g.monto)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
