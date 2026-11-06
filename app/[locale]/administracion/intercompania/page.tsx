"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Aviso,
  BotonExcel,
  EncabezadoAdmin,
  EstadoCarga,
  FilaVacia,
  NOMBRE_SEDE,
  Paginacion,
  Pestanas,
  Tarjeta,
  deLaPagina,
  fechaCorta,
  mesActual,
  mesesRecientes,
  money,
  useDatosAdmin,
} from "@/components/administracion/comunes";
import type { EstadoPagoIC, PagoIC } from "@/lib/administracion/pagosIntercompania";
import { ArrowLeftRight, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

type Respuesta = { success: true; empresa: string; mes: string; pagos: PagoIC[] };
type Vista = "hechos" | "recibidos" | "todos";

const ESTADOS: Record<EstadoPagoIC, { texto: (p: PagoIC) => string; clase: string }> = {
  por_aplicar: {
    texto: (p) => `Por aplicar en ${NOMBRE_SEDE[p.receptor]}`,
    clase: "bg-amber-100 text-amber-800 border-amber-200",
  },
  sin_aplicar: {
    texto: (p) => `${NOMBRE_SEDE[p.pagador]} no lo ha aplicado`,
    clase: "bg-slate-100 text-slate-700 border-slate-200",
  },
  sin_equivalente: {
    texto: () => "Factura sin equivalente",
    clase: "bg-red-100 text-red-800 border-red-200",
  },
  listo: { texto: () => "Aplicado en las dos", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

const TIPO_DOC: Record<string, string> = {
  in_invoice: "Factura",
  in_refund: "Nota de crédito",
  out_invoice: "Factura",
  out_refund: "Nota de crédito",
};

export default function PagosEntreSedesPage() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(mesActual);
  const [vista, setVista] = useState<Vista>("recibidos");
  const [estado, setEstado] = useState<"" | EstadoPagoIC>("");
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(0);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const { datos, cargando, error } = useDatosAdmin<Respuesta>("/api/administracion/intercompania", empresa, mes);

  // Con una sede: lo que pagó y lo que le pagaron. Con todas: una sola lista.
  const sede = datos && NOMBRE_SEDE[datos.empresa] ? datos.empresa : null;
  const vistaReal: Vista = sede ? (vista === "todos" ? "recibidos" : vista) : "todos";

  const delaVista = useMemo(
    () =>
      (datos?.pagos ?? []).filter(
        (p) => vistaReal === "todos" || (vistaReal === "hechos" ? p.pagador === sede : p.receptor === sede),
      ),
    [datos, vistaReal, sede],
  );

  const texto = buscar.toLowerCase().trim();
  const pagos = useMemo(
    () =>
      delaVista.filter(
        (p) =>
          (!estado || p.estado === estado) &&
          (!texto ||
            p.numero.toLowerCase().includes(texto) ||
            p.ref.toLowerCase().includes(texto) ||
            p.documentos.some(
              (d) =>
                d.documento.toLowerCase().includes(texto) ||
                d.ref.toLowerCase().includes(texto) ||
                (d.equivalente?.numero || "").toLowerCase().includes(texto),
            )),
      ),
    [delaVista, estado, texto],
  );
  useEffect(() => setPagina(0), [vistaReal, estado, texto, datos]);

  const total = (lista: PagoIC[]) => lista.reduce((s, p) => s + p.monto, 0);
  const hechos = sede ? (datos?.pagos ?? []).filter((p) => p.pagador === sede) : [];
  const recibidos = sede ? (datos?.pagos ?? []).filter((p) => p.receptor === sede) : [];
  const porAplicar = delaVista.flatMap((p) =>
    p.documentos.filter((d) => d.equivalente && d.equivalente.saldo > 0.01).map((d) => ({ p, d })),
  );

  const alternar = (id: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<ArrowLeftRight className="h-7 w-7 text-blue-600" />}
        titulo="Pagos entre sedes"
        subtitulo="Qué facturas pagó cada pago entre sedes y cuál es su factura en la otra sede · desde Odoo, en USD"
        empresa={empresa}
        setEmpresa={setEmpresa}
        conMes={false}
        acciones={
          <>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm capitalize flex-1 lg:flex-none bg-white"
              aria-label="Mes"
            >
              <option value="todos">Todos los meses</option>
              {mesesRecientes().map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {datos && (
              <BotonExcel
                archivo={`Pagos_entre_sedes_${datos.empresa}_${datos.mes}`}
                hojas={() => [
                  {
                    nombre: "Pagos y facturas",
                    filas: pagos.flatMap((p) => {
                      const base = {
                        Fecha: p.fecha,
                        Pago: p.numero,
                        Paga: NOMBRE_SEDE[p.pagador],
                        Cobra: NOMBRE_SEDE[p.receptor],
                        Diario: p.diario,
                        Referencia: p.ref,
                        "Monto del pago": p.monto,
                        "Sin aplicar": p.sinAplicar,
                        Estado: ESTADOS[p.estado].texto(p),
                      };
                      if (p.documentos.length === 0) return [base];
                      return p.documentos.map((d) => ({
                        ...base,
                        [`Documento en ${NOMBRE_SEDE[p.pagador]}`]: d.documento,
                        "Ref (nº en la otra sede)": d.ref,
                        "Fecha documento": d.fecha,
                        "Total documento": d.total,
                        Aplicado: d.aplicado,
                        [`Factura en ${NOMBRE_SEDE[p.receptor]}`]: d.equivalente?.numero || "",
                        "Encontrada por monto": d.equivalente?.porMonto ? "Sí" : "",
                        [`Saldo en ${NOMBRE_SEDE[p.receptor]}`]: d.equivalente ? d.equivalente.saldo : "",
                      }));
                    }),
                  },
                ]}
              />
            )}
          </>
        }
      />

      <EstadoCarga cargando={cargando} error={error} />

      {datos && !cargando && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {sede ? (
              <>
                <Tarjeta
                  titulo={`Pagos que recibió ${NOMBRE_SEDE[sede]}`}
                  valor={money(total(recibidos))}
                  detalle={`${recibidos.length} pagos`}
                  tono="azul"
                />
                <Tarjeta
                  titulo={`Pagos que hizo ${NOMBRE_SEDE[sede]}`}
                  valor={money(total(hechos))}
                  detalle={`${hechos.length} pagos`}
                />
              </>
            ) : (
              <Tarjeta
                titulo="Pagos entre sedes"
                valor={money(total(datos.pagos))}
                detalle={`${datos.pagos.length} pagos`}
                tono="azul"
              />
            )}
            <Tarjeta
              titulo="Facturas por aplicar en la sede que cobra"
              valor={money(porAplicar.reduce((s, x) => s + x.d.aplicado, 0))}
              detalle={`${porAplicar.length} facturas siguen abiertas allá · ${
                vistaReal === "todos" ? "todos los pagos" : vistaReal === "hechos" ? "de los pagos hechos" : "de los pagos recibidos"
              }`}
              tono={porAplicar.length ? "ambar" : "verde"}
            />
            <Tarjeta
              titulo="Sin aplicar por quien pagó"
              valor={money(delaVista.reduce((s, p) => s + p.sinAplicar, 0))}
              detalle="Parte de los pagos que todavía no se aplicó a ninguna factura"
            />
          </div>

          <Aviso tono="azul">
            Cada pago trae las facturas a las que lo aplicó la sede que pagó y, al lado, la misma factura en la sede que
            cobra (se busca por la referencia de la factura de proveedor, que es el número de la factura de la otra sede).
            Si allá sigue con saldo, hay que aplicar el cobro a esa factura en Odoo. «Por monto» = la referencia no
            coincidió y se tomó la única factura del mismo monto en ±15 días: revísala.
          </Aviso>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                {sede ? (
                  <Pestanas
                    opciones={[
                      { value: "recibidos", label: "Pagos que recibimos", contador: recibidos.length },
                      { value: "hechos", label: "Pagos que hicimos", contador: hechos.length },
                    ]}
                    valor={vistaReal}
                    onChange={(v) => setVista(v as Vista)}
                  />
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap gap-2">
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value as any)}
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    aria-label="Estado"
                  >
                    <option value="">Todos los estados</option>
                    <option value="por_aplicar">Por aplicar en la sede que cobra</option>
                    <option value="sin_aplicar">No aplicado por quien pagó</option>
                    <option value="sin_equivalente">Factura sin equivalente</option>
                    <option value="listo">Aplicado en las dos</option>
                  </select>
                  <Input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar pago, referencia o factura"
                    className="w-full sm:w-64"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Fecha</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>De → a</TableHead>
                      <TableHead>Diario / referencia</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Sin aplicar</TableHead>
                      <TableHead>Facturas</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.length === 0 && <FilaVacia columnas={9} texto="No hay pagos entre sedes con ese filtro." />}
                    {deLaPagina(pagos, pagina).map((p) => {
                      const abierto = abiertos.has(p.id);
                      return (
                        <Fragment key={p.id}>
                          <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => alternar(p.id)}>
                            <TableCell>
                              {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{fechaCorta(p.fecha)}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">{p.numero}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {NOMBRE_SEDE[p.pagador]} → {NOMBRE_SEDE[p.receptor]}
                            </TableCell>
                            <TableCell className="max-w-[280px]">
                              <div className="text-xs text-gray-500">{p.diario}</div>
                              <div className="truncate" title={p.ref}>
                                {p.ref || "—"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">{money(p.monto, 2)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {p.sinAplicar > 0.01 ? money(p.sinAplicar, 2) : "—"}
                            </TableCell>
                            <TableCell>{p.documentos.length}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={ESTADOS[p.estado].clase}>
                                {ESTADOS[p.estado].texto(p)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {abierto && (
                            <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                              <TableCell />
                              <TableCell colSpan={8} className="py-3">
                                {p.documentos.length === 0 ? (
                                  <p className="text-sm text-gray-500">
                                    {NOMBRE_SEDE[p.pagador]} todavía no aplicó este pago a ninguna factura en Odoo.
                                  </p>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>En {NOMBRE_SEDE[p.pagador]}</TableHead>
                                        <TableHead>Ref</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Aplicado con este pago</TableHead>
                                        <TableHead>Factura en {NOMBRE_SEDE[p.receptor]}</TableHead>
                                        <TableHead className="text-right">Saldo en {NOMBRE_SEDE[p.receptor]}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {p.documentos.map((d) => (
                                        <TableRow key={d.documento}>
                                          <TableCell className="whitespace-nowrap">
                                            <div className="font-medium">{d.documento}</div>
                                            <div className="text-xs text-gray-500">{TIPO_DOC[d.tipo] || "Otro asiento"}</div>
                                          </TableCell>
                                          <TableCell className="max-w-[220px] truncate" title={d.ref}>
                                            {d.ref || "—"}
                                          </TableCell>
                                          <TableCell className="whitespace-nowrap">{fechaCorta(d.fecha)}</TableCell>
                                          <TableCell className="text-right whitespace-nowrap">{money(d.total, 2)}</TableCell>
                                          <TableCell className="text-right whitespace-nowrap font-medium">
                                            {money(d.aplicado, 2)}
                                          </TableCell>
                                          <TableCell className="whitespace-nowrap">
                                            {d.equivalente ? (
                                              <>
                                                <span className="font-medium">{d.equivalente.numero}</span>
                                                {d.equivalente.porMonto && (
                                                  <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-800 border-amber-200">
                                                    Por monto
                                                  </Badge>
                                                )}
                                              </>
                                            ) : TIPO_DOC[d.tipo] ? (
                                              <span className="text-red-700">No se encontró</span>
                                            ) : (
                                              "—"
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right whitespace-nowrap">
                                            {d.equivalente ? (
                                              d.equivalente.saldo > 0.01 ? (
                                                <span className="text-amber-700 font-medium">{money(d.equivalente.saldo, 2)}</span>
                                              ) : (
                                                <span className="text-emerald-700">Pagada</span>
                                              )
                                            ) : (
                                              "—"
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Paginacion pagina={pagina} total={pagos.length} cambiar={setPagina} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
