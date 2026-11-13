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
  PagoOdoo,
  VerificacionApi,
} from "@/lib/administracion/bancosCruce";
import { RegistrarCobroOdoo } from "@/components/administracion/RegistrarCobroOdoo";
import { ArrowLeft, Banknote, FileSpreadsheet, FolderUp, Landmark, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const SEDES = [
  { value: 9, label: "Valencia" },
  { value: 10, label: "Caracas" },
  { value: 7, label: "Panamá" },
];

const ETIQUETA_COMP: Record<EstadoComprobante, string> = {
  conciliado: "Conciliado",
  por_revisar: "Solo por monto (revisar)",
  sin_registrar: "Entró al banco, falta en Odoo",
  no_encontrado: "No está en el banco",
  sin_estado: "Falta el estado de cuenta",
};
const CLASE_COMP: Record<EstadoComprobante, string> = {
  conciliado: "bg-emerald-100 text-emerald-800",
  por_revisar: "bg-amber-100 text-amber-800",
  sin_registrar: "bg-red-100 text-red-800",
  no_encontrado: "bg-red-100 text-red-800",
  sin_estado: "bg-slate-100 text-slate-700",
};
const CLASE_MOV: Record<EstadoMovimiento, string> = {
  referencia: "bg-emerald-100 text-emerald-800",
  manual: "bg-emerald-100 text-emerald-800",
  por_monto: "bg-amber-100 text-amber-800",
  sin_registrar: "bg-red-100 text-red-800",
};

type Tipo = "estado" | "comprobante";
type Subida = { nombre: string; ok: boolean; texto: string };
// Lo que muestra cada tarjeta al hacerle clic.
type Lista = "comprobantes" | "conciliados" | "problema" | "sinComprobante" | "odoo";
const TITULO_LISTA: Record<Lista, string> = {
  comprobantes: "Comprobantes",
  conciliados: "Conciliados",
  problema: "Con problema",
  sinComprobante: "Entradas del banco sin comprobante",
  odoo: "En Odoo y no en el banco",
};

const IMAGENES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXCEL = /\.(xlsx?|csv|html?)$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const EN_PARALELO: Record<Tipo, number> = { estado: 2, comprobante: 4 };
// Para que el navegador deje elegir una carpeta entera (no esta en los tipos de React).
const ELEGIR_CARPETA = { webkitdirectory: "", directory: "" } as Record<string, string>;

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const suma = (items: { monto: number }[]) => items.reduce((s, i) => s + i.monto, 0);
const enOdoo = (m: MovimientoCruzado) => m.estado !== "sin_registrar";

/** Carpeta donde esta el archivo ("Comprobantes/27-10-2026/Cliente.jpg" -> "27-10-2026"). */
function carpetaDe(ruta: string) {
  const partes = ruta.split("/");
  return partes.length > 1 ? partes[partes.length - 2] : "";
}

/** Lo que respondio el banco por la API (Mercantil) en una linea. */
function EnElBanco({ api }: { api: VerificacionApi }) {
  if (api.estado === "confirmado") {
    return (
      <span className="text-xs">
        <span className="font-medium text-emerald-700">Mercantil lo confirma</span> · {api.fecha ? dia(api.fecha) : ""} {api.hora}
        <span className="block text-gray-500">
          {api.pagador || "—"}
          {api.estatus && api.estatus !== "A" ? ` · estatus ${api.estatus}` : ""}
        </span>
      </span>
    );
  }
  const texto: Record<string, string> = {
    no_encontrado: "Mercantil no lo encontró",
    duplicado: "Transferencia repetida",
    no_aplica: "No se puede consultar",
    error: "No se pudo consultar",
  };
  return (
    <span className="text-xs" title={api.mensaje}>
      <span className={api.estado === "error" || api.estado === "no_aplica" ? "text-gray-600" : "text-red-700 font-medium"}>
        {texto[api.estado]}
      </span>
      {api.mensaje && <span className="block text-gray-500 max-w-[16rem] whitespace-normal">{api.mensaje}</span>}
    </span>
  );
}

/** El cobro de Odoo en una linea: numero, cliente y referencia. */
function Cobro({ pago }: { pago: PagoOdoo }) {
  return (
    <span className="text-xs">
      <span className="font-medium">{pago.nombre}</span> · {pago.cliente}
      <span className="block text-gray-500">
        ref {pago.ref || "—"} · {dia(pago.fecha)}
      </span>
    </span>
  );
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
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number; tipo: Tipo } | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [sobreAviso, setSobreAviso] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  const [verImagen, setVerImagen] = useState<{ id: number; referencia: string; cliente: string } | null>(null);
  const [paginaComprobantes, setPaginaComprobantes] = useState(0);
  const [paginaMovs, setPaginaMovs] = useState(0);
  const [registrar, setRegistrar] = useState<number | null>(null);
  const [verificando, setVerificando] = useState<number | "pendientes" | null>(null);
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

  useEffect(() => {
    setPaginaComprobantes(0);
    setPaginaMovs(0);
  }, [cuenta, semana]);

  // El aviso de la subida se va solo 5 s despues de terminar (no mientras el
  // mouse esta encima, para poder leer los errores).
  useEffect(() => {
    if (subiendo || sobreAviso || !subidas.length) return;
    const t = setTimeout(() => setSubidas([]), 5000);
    return () => clearTimeout(t);
  }, [subiendo, sobreAviso, subidas]);

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
      const banco = j.api ? ` · ${j.api.estado === "confirmado" ? "Mercantil lo confirma" : j.api.mensaje || j.api.estado}` : "";
      return { nombre, ok: true, texto: `${j.cliente || "sin cliente"} · ${j.referencia} · ${cifra(j.monto)} · ${dia(j.fecha)}${banco}` };
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
    setSubiendo({ hecho: 0, total: archivos.length, tipo });
    const trabajador = async () => {
      while (siguiente < archivos.length) {
        resultados.push(await subirUno(archivos[siguiente++], tipo));
        setSubiendo({ hecho: resultados.length, total: archivos.length, tipo });
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

  /** Vuelve a consultar en el banco un comprobante, o todos los de la semana que no confirmo. */
  const verificar = async (que: number | "pendientes") => {
    setVerificando(que);
    const res = await fetch("/api/administracion/bancos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta, verificar: que, semana }),
    });
    const j = await res.json().catch(() => ({}));
    setVerificando(null);
    if (!j.success) setError(j.error || "No se pudo consultar el banco");
    cargar();
  };

  const movimientos = datos?.movimientos || [];
  const comprobantes = datos?.comprobantes || [];
  const sinMovimiento = datos?.pagosSinMovimiento || [];
  const conciliados = comprobantes.filter((c) => c.estado === "conciliado");
  const conProblema = comprobantes.filter((c) => c.estado !== "conciliado");
  const sinComprobante = movimientos.filter((m) => !m.comprobante);
  const COMPROBANTES_LISTA = { comprobantes, conciliados, problema: conProblema };
  const moneda = cuentaElegida?.moneda || "";
  const etiqueta = (e: EstadoComprobante) => (e === "sin_estado" && datos?.mercantil ? "Sin verificar en el banco" : ETIQUETA_COMP[e]);

  /** Movimientos para amarrar a mano un comprobante: los que no tienen comprobante, primero los de su monto. */
  const opcionesMovimiento = (c: ComprobanteCruzado) =>
    [...sinComprobante].sort((a, b) => Math.abs(a.monto - c.monto) - Math.abs(b.monto - c.monto));
  /** Cobros de Odoo para amarrar a mano un movimiento: los libres, primero los de su monto. */
  const opcionesPago = (m: MovimientoCruzado) =>
    [...(datos?.pagosLibres || [])].sort((a, b) => Math.abs(a.monto - m.monto) - Math.abs(b.monto - m.monto));

  const hojasExcel = () => [
    {
      nombre: "Comprobantes",
      filas: comprobantes.map((c) => ({
        Fecha: c.fecha,
        Cliente: c.cliente,
        Referencia: c.referencia,
        Monto: c.monto,
        Estado: etiqueta(c.estado),
        "Según el banco": c.api ? (c.api.estado === "confirmado" ? `Confirmado ${c.api.pagador || ""}` : c.api.mensaje || c.api.estado) : "",
        "Movimiento del banco": c.movimiento ? `${c.movimiento.fecha} ${c.movimiento.referencia}` : "",
        "Cobro en Odoo": c.pago?.nombre || "",
      })),
    },
    {
      nombre: "Estado de cuenta",
      filas: movimientos.map((m) => ({
        Fecha: m.fecha,
        Referencia: m.referencia,
        Descripción: m.descripcion,
        Monto: m.monto,
        "Cobro en Odoo": m.pago?.nombre || "No está en Odoo",
        Cliente: m.pago?.cliente || m.comprobante?.cliente || "",
        Comprobante: m.comprobante?.referencia || "",
      })),
    },
    {
      nombre: "En Odoo y no en el banco",
      filas: sinMovimiento.map((p) => ({ Fecha: p.fecha, Cobro: p.nombre, Cliente: p.cliente, Ref: p.ref, Monto: p.monto })),
    },
  ];

  const imagen = (c: { id: number; referencia: string; cliente: string }) => (
    <button className="text-blue-600 hover:underline font-mono text-xs text-left" onClick={() => setVerImagen(c)}>
      {c.referencia}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" />
            Conciliación bancaria
          </h1>
          <p className="text-gray-500 text-sm">
            Sube el estado de cuenta y los comprobantes de la semana; el panel los cruza entre sí y con los cobros de Odoo
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

      {subidas.length > 0 && (
        <Card
          className="fixed bottom-4 left-4 z-50 w-[min(440px,calc(100vw-2rem))] shadow-lg"
          role="status"
          onMouseEnter={() => setSobreAviso(true)}
          onMouseLeave={() => setSobreAviso(false)}
        >
          <CardContent className="p-4 space-y-2 text-sm max-h-[60vh] overflow-y-auto">
            <p className="font-medium text-gray-700">
              {subiendo ? `Subiendo ${subiendo.hecho} de ${subiendo.total}…` : "Subida terminada"} ·{" "}
              <span className="text-emerald-700">{subidas.filter((s) => s.ok).length} cargados</span> ·{" "}
              <span className="text-red-700">{subidas.filter((s) => !s.ok).length} con error</span>
            </p>
            {subidas.map((s, i) => (
              <p key={i} className={s.ok ? "text-emerald-700" : "text-red-700"}>
                {s.ok ? "✓" : "✗"} <span className="font-medium">{s.nombre}</span>: {s.texto}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <input
        ref={entradas.estado}
        type="file"
        multiple
        className="hidden"
        accept=".xls,.xlsx,.csv,.html,image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => subir(e.target.files, "estado")}
      />
      <input
        ref={entradas.comprobante}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => subir(e.target.files, "comprobante")}
      />
      <input
        ref={entradas.carpeta}
        type="file"
        multiple
        className="hidden"
        {...ELEGIR_CARPETA}
        onChange={(e) => subir(e.target.files, "comprobante")}
      />
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        datos && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  ["comprobantes", "neutro", comprobantes],
                  ["conciliados", "verde", conciliados],
                  ["problema", conProblema.length ? "rojo" : "neutro", conProblema],
                  ["sinComprobante", sinComprobante.length ? "ambar" : "neutro", sinComprobante],
                ] as const
              ).map(([clave, tono, items]) => (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setLista(clave)}
                  className="text-left rounded-xl transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Tarjeta tono={tono} titulo={TITULO_LISTA[clave]} valor={items.length} detalle={`${cifra(suma(items))} ${moneda}`} />
                </button>
              ))}
            </div>

            {sinMovimiento.length > 0 && (
              <Aviso tono="rojo">
                {sinMovimiento.length} cobro{sinMovimiento.length === 1 ? "" : "s"} registrado
                {sinMovimiento.length === 1 ? "" : "s"} en Odoo en esta cuenta no aparece
                {sinMovimiento.length === 1 ? "" : "n"} en el estado de cuenta ({cifra(suma(sinMovimiento))} {moneda}).{" "}
                <button className="underline font-medium" onClick={() => setLista("odoo")}>
                  Ver cuáles
                </button>
              </Aviso>
            )}

            <Dialog
              open={lista !== null || verImagen !== null}
              onOpenChange={(abierto) => {
                if (!abierto) {
                  setLista(null);
                  setVerImagen(null);
                }
              }}
            >
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{verImagen ? `${verImagen.cliente || "Comprobante"} · ${verImagen.referencia}` : lista && TITULO_LISTA[lista]}</DialogTitle>
                </DialogHeader>
                {verImagen ? (
                  <div className="space-y-3">
                    {lista && (
                      <Button variant="outline" size="sm" onClick={() => setVerImagen(null)}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Volver a la lista
                      </Button>
                    )}
                    {/* El PDF tambien se ve: el navegador lo abre en el iframe. */}
                    <iframe
                      src={`/api/administracion/bancos/imagen?cuenta=${cuenta}&id=${verImagen.id}`}
                      title={`Comprobante ${verImagen.referencia}`}
                      className="w-full h-[70vh] border rounded-lg bg-white"
                    />
                  </div>
                ) : lista === "sinComprobante" || lista === "odoo" ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>{lista === "odoo" ? "Cobro en Odoo" : "Descripción"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lista === "sinComprobante" &&
                        (sinComprobante.length === 0 ? (
                          <FilaVacia columnas={4} texto="Todas las entradas tienen comprobante." />
                        ) : (
                          sinComprobante.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap">{dia(m.fecha)}</TableCell>
                              <TableCell className="font-mono text-xs">{m.referencia || "—"}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{cifra(m.monto)}</TableCell>
                              <TableCell className="text-xs">{m.descripcion}</TableCell>
                            </TableRow>
                          ))
                        ))}
                      {lista === "odoo" &&
                        sinMovimiento.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap">{dia(p.fecha)}</TableCell>
                            <TableCell className="font-mono text-xs">{p.ref || "—"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{cifra(p.monto)}</TableCell>
                            <TableCell>
                              <Cobro pago={p} />
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                ) : (
                  lista && (
                    <>
                      <p className="text-xs text-gray-500">Haz clic en un comprobante para ver su imagen.</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Referencia</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {COMPROBANTES_LISTA[lista].length === 0 && <FilaVacia columnas={5} texto="No hay comprobantes aquí." />}
                          {COMPROBANTES_LISTA[lista].map((c) => (
                            <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setVerImagen(c)}>
                              <TableCell className="whitespace-nowrap">{dia(c.fecha)}</TableCell>
                              <TableCell>{c.cliente || "—"}</TableCell>
                              <TableCell className="font-mono text-xs text-blue-600">{c.referencia}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{cifra(c.monto)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`border-0 ${CLASE_COMP[c.estado]}`}>
                                  {etiqueta(c.estado)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )
                )}
              </DialogContent>
            </Dialog>

            {cuenta && (
              <RegistrarCobroOdoo cuenta={cuenta} comprobante={registrar} cerrar={() => setRegistrar(null)} listo={cargar} />
            )}

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Comprobantes de la semana</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {datos.mercantil && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      disabled={!cuenta || !!subiendo || verificando !== null}
                      onClick={() => verificar("pendientes")}
                      title="Consultar en Mercantil los comprobantes de la semana que todavía no confirmó"
                    >
                      {verificando === "pendientes" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Verificar pendientes
                    </Button>
                  )}
                  <Button size="sm" className="h-9" disabled={!cuenta || !!subiendo} onClick={() => entradas.comprobante.current?.click()}>
                    {subiendo?.tipo === "comprobante" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {subiendo?.tipo === "comprobante" ? `Leyendo ${subiendo.hecho} de ${subiendo.total}` : "Subir comprobantes"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!cuenta || !!subiendo}
                    onClick={() => entradas.carpeta.current?.click()}
                    title="Elegir una carpeta (con el día, ej. 27-10-2026) y subir todas sus fotos y PDF"
                  >
                    <FolderUp className="h-4 w-4 mr-2" />
                    Carpeta
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>En el banco</TableHead>
                      <TableHead>En Odoo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprobantes.length === 0 && <FilaVacia columnas={8} texto="No hay comprobantes en esta semana." />}
                    {deLaPagina(comprobantes, paginaComprobantes).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{dia(c.fecha)}</TableCell>
                        <TableCell>{c.cliente || "—"}</TableCell>
                        <TableCell>{imagen(c)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{cifra(c.monto)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {c.movimiento ? (
                            `${dia(c.movimiento.fecha)} · ${c.movimiento.referencia || "sin ref."}`
                          ) : c.api ? (
                            <EnElBanco api={c.api} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{c.pago ? <Cobro pago={c.pago} /> : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border-0 ${CLASE_COMP[c.estado]}`}>
                            {etiqueta(c.estado)}
                          </Badge>
                          {c.estado !== "conciliado" && (c.movimientoId || opcionesMovimiento(c).length > 0) && (
                            <select
                              value=""
                              onChange={(e) =>
                                enviar("PATCH", { comprobante: c.id, movimiento: e.target.value === "soltar" ? null : e.target.value })
                              }
                              className="mt-1 block w-full max-w-[260px] border rounded-md px-2 py-1 text-xs bg-white"
                              aria-label="Amarrar a un movimiento del estado de cuenta"
                            >
                              <option value="">Amarrar a un movimiento…</option>
                              {c.movimientoId && <option value="soltar">Soltar</option>}
                              {opcionesMovimiento(c).map((m) => (
                                <option key={m.id} value={m.id}>
                                  {dia(m.fecha)} · {cifra(m.monto)} · {m.referencia || m.descripcion.slice(0, 25)}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {datos.mercantil && !c.pago && !!c.odooPagoId && (
                            <span className="text-xs text-gray-500 mr-1">Registrado en Odoo (borrador)</span>
                          )}
                          {datos.mercantil && c.api?.estado === "confirmado" && !c.pago && !c.odooPagoId && (
                            <Button size="sm" className="h-8 mr-1" onClick={() => setRegistrar(c.id)}>
                              <Landmark className="h-4 w-4 mr-1" />
                              Registrar en Odoo
                            </Button>
                          )}
                          {datos.mercantil && c.api?.estado !== "confirmado" && !c.movimiento && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Verificar en el banco"
                              title="Consultar en Mercantil"
                              disabled={verificando !== null}
                              onClick={() => verificar(c.id)}
                            >
                              {verificando === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-gray-500" />}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Quitar comprobante"
                            onClick={() => confirm(`¿Quitar el comprobante ${c.referencia}?`) && enviar("DELETE", { comprobante: c.id })}
                          >
                            <Trash2 className="h-4 w-4 text-gray-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Paginacion pagina={paginaComprobantes} total={comprobantes.length} cambiar={setPaginaComprobantes} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">Estado de cuenta</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    {datos.archivos.length
                      ? `${movimientos.length} entradas en la semana · ${movimientos.filter(enOdoo).length} están en Odoo`
                      : "Esta semana todavía no tiene estado de cuenta: el Excel que baja el banco (o una captura/PDF)."}
                    {datos.archivos.length > 0 && datos.diasSinEstado.length > 0 && ` · falta el ${datos.diasSinEstado.map(dia).join(", ")}`}
                  </p>
                  {datos.archivos.map((a) => (
                    <p key={a.id} className="text-xs text-gray-500 flex items-center gap-1">
                      {a.nombre} · {dia(a.desde)} al {dia(a.hasta)}
                      {a.saltos > 0 && <span className="text-amber-700"> · el saldo no cuadra en {a.saltos} fila{a.saltos === 1 ? "" : "s"}</span>}
                      <button
                        className="text-gray-400 hover:text-red-600"
                        aria-label={`Quitar ${a.nombre}`}
                        onClick={() => confirm(`¿Quitar ${a.nombre} y sus movimientos?`) && enviar("DELETE", { estado: a.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </p>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="h-9" disabled={!cuenta || !!subiendo} onClick={() => entradas.estado.current?.click()}>
                  {subiendo?.tipo === "estado" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  {subiendo?.tipo === "estado" ? `Leyendo ${subiendo.hecho} de ${subiendo.total}` : "Subir estado de cuenta"}
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>En Odoo</TableHead>
                      <TableHead>Comprobante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.length === 0 && <FilaVacia columnas={6} texto="No hay entradas en esta semana." />}
                    {deLaPagina(movimientos, paginaMovs).map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{dia(m.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.referencia || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[20rem]">{m.descripcion}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{cifra(m.monto)}</TableCell>
                        <TableCell>
                          {m.pago ? (
                            <>
                              <Cobro pago={m.pago} />
                              {m.estado !== "referencia" && (
                                <Badge variant="outline" className={`border-0 block w-fit mt-0.5 ${CLASE_MOV[m.estado]}`}>
                                  {m.estado === "manual" ? "A mano" : "Solo por monto (revisar)"}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline" className={`border-0 ${CLASE_MOV.sin_registrar}`}>
                              No está en Odoo
                            </Badge>
                          )}
                          {m.estado !== "referencia" && (m.estado === "manual" || opcionesPago(m).length > 0) && (
                            <select
                              value=""
                              onChange={(e) =>
                                enviar("PATCH", { movimiento: m.id, pago_id: e.target.value === "soltar" ? null : Number(e.target.value) })
                              }
                              className="mt-1 block w-full max-w-[260px] border rounded-md px-2 py-1 text-xs bg-white"
                              aria-label="Amarrar a un cobro de Odoo"
                            >
                              <option value="">{m.pago ? "Cambiar por otro cobro…" : "Amarrar a un cobro de Odoo…"}</option>
                              {m.estado === "manual" && <option value="soltar">Soltar</option>}
                              {m.estado === "por_monto" && m.pago && <option value={m.pago.id}>Confirmar {m.pago.nombre}</option>}
                              {opcionesPago(m).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre} · {cifra(p.monto)} · {p.cliente}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.comprobante ? (
                            <span className="text-xs">
                              {m.comprobante.cliente || "sin cliente"} · {imagen(m.comprobante)}
                            </span>
                          ) : (
                            <Badge variant="outline" className="border-0 bg-slate-100 text-slate-700">
                              Sin comprobante
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Paginacion pagina={paginaMovs} total={movimientos.length} cambiar={setPaginaMovs} />
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
