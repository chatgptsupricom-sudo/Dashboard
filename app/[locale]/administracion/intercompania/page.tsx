"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BotonExcel,
  EncabezadoAdmin,
  EstadoCarga,
  FilaVacia,
  NOMBRE_SEDE,
  Paginacion,
  Pestanas,
  deLaPagina,
  fechaCorta,
  mesActual,
  mesesRecientes,
  money,
  useDatosAdmin,
} from "@/components/administracion/comunes";
import type { DocumentoAplicado, EstadoPagoIC, PagoIC } from "@/lib/administracion/pagosIntercompania";
import { claveNumero } from "@/lib/administracion/pagosIntercompaniaCruce";
import { ArrowLeftRight, Check, ChevronDown, ChevronRight, ClipboardList, Copy, ExternalLink, Paperclip } from "lucide-react";
import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";

type Respuesta = { success: true; empresa: string; mes: string; pagos: PagoIC[] };
type Vista = "por_hacer" | "recibidos" | "hechos" | "todos";

const N = (s: string) => NOMBRE_SEDE[s] || s;

/** Lo de este pago que la sede que cobra todavía no aplicó (lo calcula el servidor cruzando las conciliaciones). */
const porAplicar = (d: DocumentoAplicado) => d.porAplicar;
const pendiente = (d: DocumentoAplicado) => porAplicar(d) > 0.01;
/** La ref de la factura de proveedor ya es el número de la factura de la otra sede. */
const mismoNumero = (d: DocumentoAplicado) =>
  !!d.equivalente && (d.ref.trim() === d.equivalente.numero || claveNumero(d.ref) === claveNumero(d.equivalente.numero));
const esFactura = (d: DocumentoAplicado) => ["in_invoice", "in_refund", "out_invoice", "out_refund"].includes(d.tipo);

/** Frases desde la sede del usuario (null = ve todas las sedes). */
function titulo(p: PagoIC, sede: string | null) {
  if (sede === p.receptor) return `${N(p.pagador)} nos pagó`;
  if (sede === p.pagador) return `Le pagamos a ${N(p.receptor)}`;
  return `${N(p.pagador)} le pagó a ${N(p.receptor)}`;
}

function estado(p: PagoIC, sede: string | null): { texto: string; clase: string } {
  const e: EstadoPagoIC = p.estado;
  if (e === "por_aplicar")
    return {
      texto: sede === p.receptor ? "Te toca aplicarlo" : `${N(p.receptor)} debe aplicarlo`,
      clase: "bg-amber-100 text-amber-800 border-amber-200",
    };
  if (e === "sin_aplicar")
    return {
      texto: sede === p.pagador ? "Falta repartirlo en facturas" : `${N(p.pagador)} aún no lo reparte en facturas`,
      clase: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (e === "sin_equivalente")
    return { texto: `Revisar: factura no encontrada en ${N(p.receptor)}`, clase: "bg-red-100 text-red-800 border-red-200" };
  return { texto: "Listo en las dos sedes", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

function Monto({ p }: { p: PagoIC }) {
  return (
    <>
      <div className="font-medium">{money(p.monto, 2)}</div>
      {p.moneda && p.moneda !== "USD" && (
        <div className="text-xs text-gray-500">
          {p.moneda} {p.montoMoneda.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}
    </>
  );
}

function EnlaceOdoo({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-blue-700 hover:underline"
      title="Abrir en Odoo"
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** Número de la factura (uno solo si coincide en las dos sedes) y el documento de la sede que pagó. */
function Factura({ d, p }: { d: DocumentoAplicado; p: PagoIC }) {
  if (!esFactura(d)) {
    return (
      <div>
        <EnlaceOdoo url={d.url}>{d.documento}</EnlaceOdoo>
        <div className="text-xs text-gray-500">Otro asiento{d.ref ? ` · ${d.ref}` : ""}</div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      {d.equivalente ? (
        <EnlaceOdoo url={d.equivalente.url}>
          <span className="font-semibold">{d.equivalente.numero}</span>
        </EnlaceOdoo>
      ) : (
        <span className="font-semibold text-red-700">{d.ref || "Sin número"} · no se encontró en {N(p.receptor)}</span>
      )}
      {d.equivalente?.porMonto && (
        <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-800 border-amber-200">
          Por monto: revisar
        </Badge>
      )}
      <div className="text-xs text-gray-500">
        {d.tipo.endsWith("refund") ? "Nota de crédito · " : ""}
        En {N(p.pagador)}: <EnlaceOdoo url={d.url}>{d.documento}</EnlaceOdoo>
        {d.equivalente && !mismoNumero(d) && d.ref ? ` (ref ${d.ref})` : ""}
      </div>
    </div>
  );
}

function BotonCopiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(texto).then(() => {
          setHecho(true);
          setTimeout(() => setHecho(false), 1500);
        });
      }}
    >
      {hecho ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
      {hecho ? "Copiado" : "Copiar facturas"}
    </Button>
  );
}

const tamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Los comprobantes que la sede que paga adjuntó al pago en Odoo. */
function Comprobantes({ p }: { p: PagoIC }) {
  if (p.adjuntos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {p.adjuntos.map((a) => (
        <a
          key={a.id}
          href={`/api/administracion/intercompania/comprobante?id=${a.id}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
          title={`Descargar el comprobante que adjuntó ${N(p.pagador)}`}
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{a.nombre}</span>
          <span className="shrink-0 text-gray-400">{tamano(a.tamano)}</span>
        </a>
      ))}
    </div>
  );
}

/** Un pago como tarjeta: la vista «Por hacer» y la lista en el celular. */
function TarjetaPago({ p, sede, soloPendientes }: { p: PagoIC; sede: string | null; soloPendientes: boolean }) {
  const docs = soloPendientes ? p.documentos.filter((d) => pendiente(d) || (esFactura(d) && !d.equivalente)) : p.documentos;
  const pendientes = p.documentos.filter(pendiente);
  const e = estado(p, sede);
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">
              {titulo(p, sede)} · {fechaCorta(p.fecha)}
            </p>
            <p className="text-sm text-gray-600">
              <EnlaceOdoo url={p.url}>{p.numero}</EnlaceOdoo> · {p.diario}
            </p>
            {p.ref && <p className="text-xs text-gray-500 break-words">{p.ref}</p>}
            <Comprobantes p={p} />
          </div>
          <div className="text-right">
            <Monto p={p} />
            <Badge variant="outline" className={`mt-1 ${e.clase}`}>
              {e.texto}
            </Badge>
          </div>
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-gray-500">
            {p.documentos.length === 0
              ? `${N(p.pagador)} todavía no repartió este pago en facturas en Odoo. Cuando lo haga, sale aquí.`
              : "No queda nada por aplicar."}
          </p>
        ) : (
          <div className="divide-y rounded-lg border bg-slate-50/50">
            {docs.map((d) => (
              <div key={d.url} className="flex items-center justify-between gap-3 p-3">
                <Factura d={d} p={p} />
                <div className="text-right shrink-0">
                  {pendiente(d) ? (
                    <>
                      <div className="text-base font-bold text-amber-700">Aplica {money(porAplicar(d), 2)}</div>
                      <div className="text-xs text-gray-500">saldo allá {money(d.equivalente!.saldo, 2)}</div>
                    </>
                  ) : d.equivalente ? (
                    <>
                      <div className="text-sm font-medium text-emerald-700">Aplicada</div>
                      <div className="text-xs text-gray-500">{money(d.aplicado, 2)} con este pago</div>
                    </>
                  ) : (
                    <div className="text-sm">{money(d.aplicado, 2)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {pendientes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-gray-600">
              Total por aplicar: <b>{money(pendientes.reduce((s, d) => s + porAplicar(d), 0), 2)}</b> en {pendientes.length}{" "}
              {pendientes.length === 1 ? "factura" : "facturas"}
            </span>
            <BotonCopiar texto={pendientes.map((d) => d.equivalente!.numero).join(", ")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PagosEntreSedesPage() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState("todos");
  const [vista, setVista] = useState<Vista>("por_hacer");
  const [filtroEstado, setFiltroEstado] = useState<"" | EstadoPagoIC>("");
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(0);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const { datos, cargando, error } = useDatosAdmin<Respuesta>("/api/administracion/intercompania", empresa, mes);

  const sede = datos && NOMBRE_SEDE[datos.empresa] ? datos.empresa : null;
  const todos = datos?.pagos ?? [];
  const recibidos = sede ? todos.filter((p) => p.receptor === sede) : [];
  const hechos = sede ? todos.filter((p) => p.pagador === sede) : [];
  // «Por hacer»: lo que esta sede tiene que aplicar (con todas las sedes, todo lo pendiente), lo más viejo primero.
  const porHacer = useMemo(
    () =>
      todos
        .filter((p) => p.estado === "por_aplicar" && (!sede || p.receptor === sede))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero)),
    [todos, sede],
  );
  const montoPorHacer = porHacer.reduce((s, p) => s + p.documentos.reduce((t, d) => t + porAplicar(d), 0), 0);
  const esperanOtra = hechos.filter((p) => p.estado === "por_aplicar");

  const vistaReal: Vista = vista === "por_hacer" ? "por_hacer" : sede ? (vista === "todos" ? "recibidos" : vista) : "todos";
  const base = vistaReal === "por_hacer" ? porHacer : vistaReal === "recibidos" ? recibidos : vistaReal === "hechos" ? hechos : todos;

  const texto = buscar.toLowerCase().trim();
  const pagos = useMemo(
    () =>
      base.filter(
        (p) =>
          (vistaReal === "por_hacer" || !filtroEstado || p.estado === filtroEstado) &&
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
    [base, vistaReal, filtroEstado, texto],
  );
  useEffect(() => setPagina(0), [vistaReal, filtroEstado, texto, datos]);

  const alternar = (id: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pestanas: { value: Vista; label: string; contador?: number }[] = sede
    ? [
        { value: "por_hacer", label: "Por hacer", contador: porHacer.length },
        { value: "recibidos", label: "Nos pagaron", contador: recibidos.length },
        { value: "hechos", label: "Pagamos", contador: hechos.length },
      ]
    : [
        { value: "por_hacer", label: "Por aplicar", contador: porHacer.length },
        { value: "todos", label: "Todos los pagos", contador: todos.length },
      ];

  return (
    <div className="space-y-5">
      <EncabezadoAdmin
        icono={<ArrowLeftRight className="h-7 w-7 text-blue-600" />}
        titulo="Pagos entre sedes"
        subtitulo="A qué facturas aplicó cada sede los pagos a otra sede, para aplicarlos igual del otro lado · desde Odoo"
        empresa={empresa}
        setEmpresa={setEmpresa}
        conMes={false}
        acciones={
          <>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm capitalize flex-1 lg:flex-none bg-white"
              aria-label="Mes del pago"
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
                      const fila = {
                        Fecha: p.fecha,
                        Pago: p.numero,
                        Paga: N(p.pagador),
                        Cobra: N(p.receptor),
                        Diario: p.diario,
                        Referencia: p.ref,
                        "Monto USD": p.monto,
                        Moneda: p.moneda,
                        "Monto en su moneda": p.montoMoneda,
                        Estado: estado(p, sede).texto,
                        Comprobantes: p.adjuntos.map((a) => a.nombre).join(", "),
                      };
                      if (p.documentos.length === 0) return [fila];
                      return p.documentos.map((d) => ({
                        ...fila,
                        Factura: d.equivalente?.numero || d.ref,
                        [`Documento en la sede que paga`]: d.documento,
                        "Ref de la factura de proveedor": d.ref,
                        "Aplicado por quien pagó": d.aplicado,
                        "Por aplicar en quien cobra": porAplicar(d),
                        "Saldo en quien cobra": d.equivalente ? d.equivalente.saldo : "",
                        "Encontrada por monto": d.equivalente?.porMonto ? "Sí" : "",
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
          {/* Contador: lo que hay que hacer, en una línea. */}
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-1 ${
              porHacer.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <p className="text-lg font-semibold text-gray-900">
              {porHacer.length
                ? `${porHacer.length} ${porHacer.length === 1 ? "pago" : "pagos"} por aplicar${sede ? ` en ${N(sede)}` : ""} · ${money(montoPorHacer)}`
                : `Nada por aplicar${sede ? ` en ${N(sede)}` : ""}`}
            </p>
            {sede && esperanOtra.length > 0 && (
              <p className="text-sm text-gray-600">
                {esperanOtra.length} {esperanOtra.length === 1 ? "pago nuestro espera" : "pagos nuestros esperan"} que la otra sede
                los aplique
              </p>
            )}
          </div>

          {/* Los 3 pasos. */}
          <ol className="grid sm:grid-cols-3 gap-2 text-sm">
            {[
              "Mira qué facturas pagó la otra sede con cada pago.",
              "En Odoo, aplica tu cobro a esas mismas facturas por el monto que dice «Aplica».",
              "Recarga esta pantalla: el pago pasa solo a «Listo».",
            ].map((t, i) => (
              <li key={i} className="flex gap-2 rounded-lg border bg-white p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-gray-700">{t}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <Pestanas opciones={pestanas} valor={vistaReal} onChange={setVista} />
            <div className="flex flex-wrap gap-2">
              {vistaReal !== "por_hacer" && (
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as any)}
                  className="border rounded-lg px-3 py-2 text-sm bg-white flex-1"
                  aria-label="Estado"
                >
                  <option value="">Todos los estados</option>
                  <option value="por_aplicar">Por aplicar</option>
                  <option value="sin_aplicar">Sin repartir en facturas</option>
                  <option value="sin_equivalente">Factura no encontrada</option>
                  <option value="listo">Listo en las dos sedes</option>
                </select>
              )}
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar pago o factura"
                className="w-full sm:w-60"
              />
            </div>
          </div>

          {vistaReal === "por_hacer" ? (
            <div className="space-y-3">
              {pagos.length === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-gray-500 flex flex-col items-center gap-2">
                    <ClipboardList className="h-6 w-6" />
                    {texto ? "Nada coincide con la búsqueda." : "No hay pagos por aplicar."}
                  </CardContent>
                </Card>
              )}
              {deLaPagina(pagos, pagina).map((p) => (
                <TarjetaPago key={p.id} p={p} sede={sede} soloPendientes />
              ))}
              <Paginacion pagina={pagina} total={pagos.length} cambiar={setPagina} />
            </div>
          ) : (
            <>
              {/* Celular: tarjetas. */}
              <div className="space-y-3 md:hidden">
                {pagos.length === 0 && <p className="text-center text-gray-500 py-8">No hay pagos con ese filtro.</p>}
                {deLaPagina(pagos, pagina).map((p) => (
                  <TarjetaPago key={p.id} p={p} sede={sede} soloPendientes={false} />
                ))}
              </div>

              {/* Escritorio: tabla; clic en un pago = sus facturas. */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-center">Facturas</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagos.length === 0 && <FilaVacia columnas={5} texto="No hay pagos con ese filtro." />}
                      {deLaPagina(pagos, pagina).map((p) => {
                        const abierto = abiertos.has(p.id);
                        const e = estado(p, sede);
                        return (
                          <Fragment key={p.id}>
                            <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => alternar(p.id)}>
                              <TableCell>
                                {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="max-w-[420px]">
                                <div className="font-medium">
                                  {titulo(p, sede)} · {fechaCorta(p.fecha)}
                                </div>
                                <div className="text-xs text-gray-500 truncate" title={p.ref}>
                                  <EnlaceOdoo url={p.url}>{p.numero}</EnlaceOdoo> · {p.diario}
                                  {p.ref ? ` · ${p.ref}` : ""}
                                </div>
                                {p.adjuntos.length > 0 && (
                                  <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-700">
                                    <Paperclip className="h-3 w-3" />
                                    {p.adjuntos.length === 1 ? "1 comprobante" : `${p.adjuntos.length} comprobantes`}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Monto p={p} />
                              </TableCell>
                              <TableCell className="text-center">{p.documentos.length}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={e.clase}>
                                  {e.texto}
                                </Badge>
                              </TableCell>
                            </TableRow>
                            {abierto && (
                              <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                                <TableCell />
                                <TableCell colSpan={4} className="py-3">
                                  <TarjetaPago p={p} sede={sede} soloPendientes={false} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Paginacion pagina={pagina} total={pagos.length} cambiar={setPagina} />
            </>
          )}
        </>
      )}
    </div>
  );
}
