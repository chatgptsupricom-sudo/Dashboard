"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Aviso,
  BotonExcel,
  deLaPagina,
  FilaVacia,
  Paginacion,
  Pestanas,
  semanas,
  Tarjeta,
  useSedeFija,
} from "@/components/administracion/comunes";
import type { ConciliacionBanco, CuentaBanco } from "@/lib/administracion/bancos";
import type {
  ComprobanteCruzado,
  EstadoComprobante,
  EstadoMovimiento,
  MovimientoCruzado,
} from "@/lib/administracion/bancosCruce";
import { Banknote, FileSpreadsheet, FolderUp, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const SEDES = [
  { value: 9, label: "Valencia" },
  { value: 10, label: "Caracas" },
  { value: 7, label: "Panamá" },
];

const ETIQUETA_MOV: Record<EstadoMovimiento, string> = {
  referencia: "Conciliado",
  manual: "Conciliado a mano",
  por_monto: "Solo por monto (revisar)",
  sin_registrar: "No está en Odoo",
};
const CLASE_MOV: Record<EstadoMovimiento, string> = {
  referencia: "bg-emerald-100 text-emerald-800",
  manual: "bg-emerald-100 text-emerald-800",
  por_monto: "bg-amber-100 text-amber-800",
  sin_registrar: "bg-red-100 text-red-800",
};
const ETIQUETA_COMP: Record<EstadoComprobante, string> = {
  conciliado: "Conciliado",
  por_revisar: "Solo por monto (revisar)",
  sin_registrar: "Entró al banco, no está en Odoo",
  no_encontrado: "No está en el banco",
  sin_estado: "Falta el estado de cuenta de ese día",
};
const CLASE_COMP: Record<EstadoComprobante, string> = {
  conciliado: "bg-emerald-100 text-emerald-800",
  por_revisar: "bg-amber-100 text-amber-800",
  sin_registrar: "bg-red-100 text-red-800",
  no_encontrado: "bg-red-100 text-red-800",
  sin_estado: "bg-slate-100 text-slate-700",
};

type Tipo = "estado" | "comprobante";
type Subida = { nombre: string; ok: boolean; texto: string };
type Vista = "movimientos" | "comprobantes" | "odoo";
type FiltroMov = "todos" | "conciliados" | "revisar" | "sin_registrar";

const IMAGENES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXCEL = /\.(xlsx?|csv|html?)$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const EN_PARALELO: Record<Tipo, number> = { estado: 2, comprobante: 4 };
// Para que el navegador deje elegir una carpeta entera (no esta en los tipos de React).
const ELEGIR_CARPETA = { webkitdirectory: "", directory: "" } as Record<string, string>;

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const conciliado = (m: MovimientoCruzado) => m.estado === "referencia" || m.estado === "manual";
const suma = (items: { monto: number }[]) => items.reduce((s, i) => s + i.monto, 0);

/** Carpeta donde esta el archivo ("Comprobantes/27-10-2026/Cliente.jpg" -> "27-10-2026"). */
function carpetaDe(ruta: string) {
  const partes = ruta.split("/");
  return partes.length > 1 ? partes[partes.length - 2] : "";
}

export default function ConciliacionBancariaPage() {
  const opciones = semanas();
  const fija = useSedeFija();
  const [sede, setSede] = useState(9);
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([]);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [semana, setSemana] = useState(opciones[0].value);
  const [datos, setDatos] = useState<ConciliacionBanco | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number } | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [vista, setVista] = useState<Vista>("movimientos");
  const [filtro, setFiltro] = useState<FiltroMov>("todos");
  const [pagina, setPagina] = useState(0);
  const [verImagen, setVerImagen] = useState<{ id: number; nombre: string; cliente: string } | null>(null);
  const entradas = {
    estado: useRef<HTMLInputElement>(null),
    comprobante: useRef<HTMLInputElement>(null),
    carpeta: useRef<HTMLInputElement>(null),
  };
  const sedeUsada = fija?.companyId ?? sede;
  const cuentaElegida = cuentas.find((c) => c.id === cuenta) || null;

  useEffect(() => {
    if (fija && !fija.companyId) return;
    fetch(`/api/administracion/bancos?cuentas=1&sede=${sedeUsada}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return setError(j.error || "No se pudieron leer las cuentas");
        setCuentas(j.cuentas);
        setCuenta((actual) => (j.cuentas.some((c: CuentaBanco) => c.id === actual) ? actual : j.cuentas[0]?.id ?? null));
      })
      .catch(() => setError("No se pudieron leer las cuentas"));
  }, [sedeUsada, fija?.companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!cuenta) return;
    setCargando(true);
    setError(null);
    try {
      const json = await (await fetch(`/api/administracion/bancos?cuenta=${cuenta}&semana=${semana}`)).json();
      if (json.success) setDatos(json);
      else setError(json.error || "No se pudo cargar");
    } catch {
      setError("No se pudo cargar");
    }
    setCargando(false);
  }, [cuenta, semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => setPagina(0), [cuenta, semana, vista, filtro]);

  const subirUno = async (archivo: File, tipo: Tipo): Promise<Subida> => {
    const carpeta = carpetaDe(archivo.webkitRelativePath);
    const nombre = carpeta ? `${carpeta}/${archivo.name}` : archivo.name;
    if (archivo.size > MAX_BYTES) return { nombre, ok: false, texto: "Pesa más de 8 MB" };
    const form = new FormData();
    form.append("cuenta", String(cuenta));
    form.append("archivo", archivo);
    form.append("tipo", tipo);
    if (carpeta) form.append("carpeta", carpeta);
    try {
      let res = await fetch("/api/administracion/bancos", { method: "POST", body: form });
      // IA saturada (429): se espera y se reintenta, cada vez un poco mas.
      for (const espera of [10_000, 20_000, 40_000]) {
        if (res.status !== 429) break;
        await new Promise((listo) => setTimeout(listo, espera));
        res = await fetch("/api/administracion/bancos", { method: "POST", body: form });
      }
      const j = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
      if (!j.success) return { nombre, ok: false, texto: j.error || "Error" };
      if (j.estado) {
        return j.yaEstaba
          ? { nombre, ok: true, texto: "Este archivo ya estaba cargado" }
          : {
              nombre,
              ok: true,
              texto:
                `${j.filas} movimientos (${j.entradas} entradas) del ${dia(j.desde)} al ${dia(j.hasta)}` +
                (j.saltos ? ` · ojo: el saldo no cuadra en ${j.saltos} fila${j.saltos === 1 ? "" : "s"}` : ""),
            };
      }
      return { nombre, ok: true, texto: `${j.cliente || "sin cliente"} · ${j.referencia} · ${cifra(j.monto)} · ${dia(j.fecha)}` };
    } catch {
      return { nombre, ok: false, texto: "No se pudo subir (se cortó la conexión)" };
    }
  };

  const subir = async (lista: FileList | null, tipo: Tipo) => {
    const archivos = [...(lista || [])]
      .filter((f) => IMAGENES.has(f.type) || (tipo === "estado" && EXCEL.test(f.name)))
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
    Object.values(entradas).forEach((r) => r.current && (r.current.value = ""));
    if (!archivos.length || !cuenta) return;
    const resultados: Subida[] = [];
    let siguiente = 0;
    setSubidas([]);
    setSubiendo({ hecho: 0, total: archivos.length });
    const trabajador = async () => {
      while (siguiente < archivos.length) {
        resultados.push(await subirUno(archivos[siguiente++], tipo));
        setSubiendo({ hecho: resultados.length, total: archivos.length });
        setSubidas([...resultados]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(EN_PARALELO[tipo], archivos.length) }, trabajador));
    setSubiendo(null);
    cargar();
  };

  const enviar = async (metodo: "PATCH" | "DELETE", cuerpo: Record<string, unknown>) => {
    const res =
      metodo === "PATCH"
        ? await fetch("/api/administracion/bancos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cuenta, ...cuerpo }),
          })
        : await fetch(`/api/administracion/bancos?${new URLSearchParams({ cuenta: String(cuenta), ...cuerpo } as any)}`, {
            method: "DELETE",
          });
    const j = await res.json().catch(() => ({}));
    if (!j.success) setError(j.error || "No se pudo guardar");
    cargar();
  };

  const movimientos = datos?.movimientos || [];
  const comprobantes = datos?.comprobantes || [];
  const sinMovimiento = datos?.pagosSinMovimiento || [];
  const moneda = cuentaElegida?.moneda || "";
  const sinRegistrar = movimientos.filter((m) => m.estado === "sin_registrar");
  const revisar = movimientos.filter((m) => m.estado === "por_monto");
  const movsFiltrados = movimientos.filter(
    (m) =>
      filtro === "todos" ||
      (filtro === "conciliados" && conciliado(m)) ||
      (filtro === "revisar" && m.estado === "por_monto") ||
      (filtro === "sin_registrar" && m.estado === "sin_registrar"),
  );
  const compProblema = comprobantes.filter((c) => c.estado === "no_encontrado" || c.estado === "sin_registrar");
  const movsSinComprobante = movimientos.filter((m) => !m.comprobante);

  /** Cobros para amarrar a mano un movimiento: los libres, primero los de su monto. */
  const opcionesPago = (m: MovimientoCruzado) =>
    [...(datos?.pagosLibres || [])].sort((a, b) => Math.abs(a.monto - m.monto) - Math.abs(b.monto - m.monto));

  const hojasExcel = () => [
    {
      nombre: "Movimientos",
      filas: movimientos.map((m) => ({
        Fecha: m.fecha,
        Referencia: m.referencia,
        Descripción: m.descripcion,
        Monto: m.monto,
        Estado: ETIQUETA_MOV[m.estado],
        "Cobro en Odoo": m.pago?.nombre || "",
        Cliente: m.pago?.cliente || m.comprobante?.cliente || "",
        "Ref. en Odoo": m.pago?.ref || "",
        "Fecha en Odoo": m.pago?.fecha || "",
      })),
    },
    {
      nombre: "Comprobantes",
      filas: comprobantes.map((c) => ({
        Cliente: c.cliente,
        Fecha: c.fecha,
        Referencia: c.referencia,
        Monto: c.monto,
        Moneda: c.moneda,
        Banco: c.banco,
        "Cuenta origen": c.cuentaOrigen,
        Motivo: c.motivo,
        Estado: ETIQUETA_COMP[c.estado],
        "Movimiento del banco": c.movimiento ? `${c.movimiento.fecha} ${c.movimiento.referencia}` : "",
        "Cobro en Odoo": c.pago?.nombre || "",
      })),
    },
    {
      nombre: "Odoo sin movimiento",
      filas: sinMovimiento.map((p) => ({ Fecha: p.fecha, Cobro: p.nombre, Cliente: p.cliente, Ref: p.ref, Monto: p.monto })),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" />
            Conciliación bancaria
          </h1>
          <p className="text-gray-500 text-sm">
            Estado de cuenta del banco contra los cobros registrados en Odoo y los comprobantes de los clientes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fija ? (
            <span className="border rounded-lg px-3 py-2 text-sm bg-slate-50">
              {SEDES.find((s) => s.value === fija.companyId)?.label || "Sin sede"}
            </span>
          ) : (
            <select
              value={sede}
              onChange={(e) => setSede(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              aria-label="Sede"
            >
              {SEDES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          <select
            value={cuenta ?? ""}
            onChange={(e) => setCuenta(Number(e.target.value) || null)}
            className="border rounded-lg px-3 py-2 text-sm bg-white max-w-[16rem]"
            aria-label="Cuenta"
          >
            {!cuentas.length && <option value="">Sin cuentas</option>}
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.moneda ? ` (${c.moneda})` : ""}
              </option>
            ))}
          </select>
          <select
            value={semana}
            onChange={(e) => setSemana(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
            aria-label="Semana"
          >
            {opciones.map((o) => (
              <option key={o.value} value={o.value}>
                Semana {o.label}
              </option>
            ))}
          </select>
          {datos && <BotonExcel archivo={`conciliacion-${cuentaElegida?.nombre || "banco"}-${semana}`} hojas={hojasExcel} />}
        </div>
      </div>

      {error && <Aviso tono="rojo">{error}</Aviso>}

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          <input
            ref={entradas.estado}
            type="file"
            multiple
            hidden
            accept=".xls,.xlsx,.csv,.html,image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => subir(e.target.files, "estado")}
          />
          <input
            ref={entradas.comprobante}
            type="file"
            multiple
            hidden
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => subir(e.target.files, "comprobante")}
          />
          <input ref={entradas.carpeta} type="file" hidden {...ELEGIR_CARPETA} onChange={(e) => subir(e.target.files, "comprobante")} />
          <Button size="sm" disabled={!cuenta || !!subiendo} onClick={() => entradas.estado.current?.click()}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Subir estado de cuenta
          </Button>
          <Button size="sm" variant="outline" disabled={!cuenta || !!subiendo} onClick={() => entradas.comprobante.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Subir comprobantes
          </Button>
          <Button size="sm" variant="outline" disabled={!cuenta || !!subiendo} onClick={() => entradas.carpeta.current?.click()}>
            <FolderUp className="h-4 w-4 mr-2" />
            Subir carpeta de comprobantes
          </Button>
          <p className="text-xs text-gray-500 w-full">
            Estado de cuenta: el Excel que baja el banco (se lee sin IA) o una captura/PDF. Comprobantes: cada archivo se
            llama como el cliente; si la imagen no trae la fecha, va dentro de una carpeta con el día (27-10-2026).
          </p>
          {subiendo && (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Subiendo {subiendo.hecho} de {subiendo.total}…
            </p>
          )}
          {subidas.length > 0 && (
            <ul className="w-full text-xs space-y-0.5 max-h-40 overflow-y-auto">
              {subidas.map((s, i) => (
                <li key={i} className={s.ok ? "text-emerald-700" : "text-red-700"}>
                  {s.nombre}: {s.texto}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {datos && (
        <>
          {datos.archivos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Estado de cuenta cargado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {datos.archivos.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.nombre}</span>
                    <span className="text-gray-500">
                      {dia(a.desde)} al {dia(a.hasta)} · {a.filas} movimientos · {a.subidoPor}
                    </span>
                    {a.saltos > 0 && (
                      <Badge className="bg-amber-100 text-amber-800">
                        el saldo no cuadra en {a.saltos} fila{a.saltos === 1 ? "" : "s"}: puede faltar un movimiento
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-red-600"
                      onClick={() => confirm(`¿Quitar ${a.nombre} y sus movimientos?`) && enviar("DELETE", { estado: a.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {datos.diasSinEstado.length > 0 && (
            <Aviso>
              Falta el estado de cuenta de {datos.diasSinEstado.map(dia).join(", ")}: esos días no se marca nada como
              “no está en el banco”.
            </Aviso>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tarjeta titulo="Entradas del banco" valor={movimientos.length} detalle={`${cifra(suma(movimientos))} ${moneda}`} />
            <Tarjeta
              tono="verde"
              titulo="Registradas en Odoo"
              valor={movimientos.filter(conciliado).length}
              detalle={revisar.length ? `+${revisar.length} solo por monto (revisar)` : "por referencia o a mano"}
            />
            <Tarjeta
              tono={sinRegistrar.length ? "rojo" : "neutro"}
              titulo="Entraron y no están en Odoo"
              valor={sinRegistrar.length}
              detalle={`${cifra(suma(sinRegistrar))} ${moneda}`}
            />
            <Tarjeta
              tono={sinMovimiento.length ? "rojo" : "neutro"}
              titulo="En Odoo y no en el banco"
              valor={sinMovimiento.length}
              detalle={`${cifra(suma(sinMovimiento))} ${moneda}`}
            />
            <Tarjeta
              tono={compProblema.length ? "ambar" : "neutro"}
              titulo="Comprobantes"
              valor={comprobantes.length}
              detalle={compProblema.length ? `${compProblema.length} con problema` : "sin problemas"}
            />
          </div>

          <Pestanas<Vista>
            valor={vista}
            onChange={setVista}
            opciones={[
              { value: "movimientos", label: "Movimientos del banco", contador: movimientos.length },
              { value: "comprobantes", label: "Comprobantes", contador: comprobantes.length },
              { value: "odoo", label: "Cobros de Odoo sin movimiento", contador: sinMovimiento.length },
            ]}
          />

          {cargando && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Actualizando…
            </p>
          )}

          {vista === "movimientos" && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["todos", "Todos", movimientos.length],
                      ["conciliados", "Conciliados", movimientos.filter(conciliado).length],
                      ["revisar", "Revisar", revisar.length],
                      ["sin_registrar", "No están en Odoo", sinRegistrar.length],
                    ] as [FiltroMov, string, number][]
                  ).map(([valor, texto, n]) => (
                    <Button key={valor} size="sm" variant={filtro === valor ? "default" : "outline"} onClick={() => setFiltro(valor)}>
                      {texto} ({n})
                    </Button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Cobro en Odoo</TableHead>
                        <TableHead>Comprobante</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!movsFiltrados.length && <FilaVacia columnas={7} texto="Sin entradas: sube el estado de cuenta de la semana." />}
                      {deLaPagina(movsFiltrados, pagina).map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap">{dia(m.fecha)}</TableCell>
                          <TableCell className="font-mono text-xs">{m.referencia}</TableCell>
                          <TableCell className="text-xs max-w-[22rem]">{m.descripcion}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{cifra(m.monto)}</TableCell>
                          <TableCell>
                            <Badge className={CLASE_MOV[m.estado]}>{ETIQUETA_MOV[m.estado]}</Badge>
                          </TableCell>
                          <TableCell className="text-xs min-w-[14rem]">
                            {m.pago && (
                              <div>
                                <span className="font-medium">{m.pago.nombre}</span> · {m.pago.cliente}
                                <div className="text-gray-500">
                                  ref {m.pago.ref || "—"} · {dia(m.pago.fecha)}
                                  {m.estado === "manual" && (
                                    <button className="ml-2 text-red-600 underline" onClick={() => enviar("PATCH", { movimiento: m.id, pago_id: null })}>
                                      soltar
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            {(m.estado === "sin_registrar" || m.estado === "por_monto") && (datos.pagosLibres.length > 0 || m.pago) && (
                              <select
                                value=""
                                onChange={(e) => e.target.value && enviar("PATCH", { movimiento: m.id, pago_id: Number(e.target.value) })}
                                className="mt-1 border rounded px-1 py-0.5 text-xs bg-white max-w-[16rem]"
                                aria-label="Amarrar a un cobro de Odoo"
                              >
                                <option value="">{m.pago ? "Cambiar por otro cobro…" : "Amarrar a un cobro de Odoo…"}</option>
                                {m.pago && <option value={m.pago.id}>Confirmar {m.pago.nombre}</option>}
                                {opcionesPago(m).map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre} · {p.cliente} · {cifra(p.monto)} · {dia(p.fecha)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.comprobante ? (
                              <button
                                className="text-blue-700 underline"
                                onClick={() => setVerImagen({ id: m.comprobante!.id, nombre: m.comprobante!.referencia, cliente: m.comprobante!.cliente })}
                              >
                                {m.comprobante.cliente || m.comprobante.referencia}
                              </button>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Paginacion pagina={pagina} total={movsFiltrados.length} cambiar={setPagina} />
              </CardContent>
            </Card>
          )}

          {vista === "comprobantes" && (
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Desde</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Movimiento del banco</TableHead>
                        <TableHead>Cobro en Odoo</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!comprobantes.length && <FilaVacia columnas={9} texto="Sin comprobantes esta semana." />}
                      {deLaPagina(comprobantes, pagina).map((c: ComprobanteCruzado) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <button
                              className="text-blue-700 underline text-left"
                              onClick={() => setVerImagen({ id: c.id, nombre: c.referencia, cliente: c.cliente })}
                            >
                              {c.cliente || "Sin cliente"}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{dia(c.fecha)}</TableCell>
                          <TableCell className="font-mono text-xs">{c.referencia}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {cifra(c.monto)} {c.moneda}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.banco}
                            {c.cuentaOrigen && ` ···${c.cuentaOrigen.slice(-4)}`}
                          </TableCell>
                          <TableCell>
                            <Badge className={CLASE_COMP[c.estado]}>{ETIQUETA_COMP[c.estado]}</Badge>
                          </TableCell>
                          <TableCell className="text-xs min-w-[12rem]">
                            {c.movimiento && (
                              <div>
                                {dia(c.movimiento.fecha)} · {c.movimiento.referencia || c.movimiento.descripcion.slice(0, 30)}
                                {c.movimientoId && (
                                  <button className="ml-2 text-red-600 underline" onClick={() => enviar("PATCH", { comprobante: c.id, movimiento: null })}>
                                    soltar
                                  </button>
                                )}
                              </div>
                            )}
                            {(c.estado === "no_encontrado" || c.estado === "por_revisar") && movsSinComprobante.length > 0 && (
                              <select
                                value=""
                                onChange={(e) => e.target.value && enviar("PATCH", { comprobante: c.id, movimiento: e.target.value })}
                                className="mt-1 border rounded px-1 py-0.5 text-xs bg-white max-w-[16rem]"
                                aria-label="Amarrar a un movimiento"
                              >
                                <option value="">Amarrar a un movimiento…</option>
                                {[...movsSinComprobante]
                                  .sort((a, b) => Math.abs(a.monto - c.monto) - Math.abs(b.monto - c.monto))
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {dia(m.fecha)} · {m.referencia || m.descripcion.slice(0, 25)} · {cifra(m.monto)}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.pago ? (
                              <>
                                <span className="font-medium">{c.pago.nombre}</span> · {c.pago.cliente}
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-red-600"
                              aria-label="Quitar comprobante"
                              onClick={() => confirm(`¿Quitar el comprobante ${c.referencia}?`) && enviar("DELETE", { comprobante: c.id })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Paginacion pagina={pagina} total={comprobantes.length} cambiar={setPagina} />
              </CardContent>
            </Card>
          )}

          {vista === "odoo" && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm text-gray-600">
                  Cobros registrados en este diario que no aparecen en el estado de cuenta (solo de días que el estado
                  cubre). Pueden estar en otro banco, con otro monto o no haber entrado.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cobro</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!sinMovimiento.length && <FilaVacia columnas={5} texto="Todos los cobros de Odoo están en el banco." />}
                      {deLaPagina(sinMovimiento, pagina).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">{dia(p.fecha)}</TableCell>
                          <TableCell className="font-medium">{p.nombre}</TableCell>
                          <TableCell>{p.cliente}</TableCell>
                          <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{cifra(p.monto)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Paginacion pagina={pagina} total={sinMovimiento.length} cambiar={setPagina} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!datos && cargando && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

      <Dialog open={verImagen !== null} onOpenChange={(abierto) => !abierto && setVerImagen(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {verImagen?.cliente || "Comprobante"} · {verImagen?.nombre}
            </DialogTitle>
          </DialogHeader>
          {verImagen && (
            // El PDF tambien se ve: el navegador lo abre en el iframe.
            <iframe
              src={`/api/administracion/bancos/imagen?cuenta=${cuenta}&id=${verImagen.id}`}
              title={`Comprobante ${verImagen.nombre}`}
              className="w-full h-[70vh] border rounded-lg bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
