"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Aviso,
  BotonExcel,
  deLaPagina,
  FilaVacia,
  Paginacion,
  mesesRecientes,
  Tarjeta,
  useSedeFija,
} from "@/components/administracion/comunes";
import type { ConciliacionBanco, CuentaBanco } from "@/lib/administracion/bancos";
import type {
  Coincide,
  ComprobanteCruzado,
  EstadoComprobante,
  PagoOdoo,
  VerificacionApi,
} from "@/lib/administracion/bancosCruce";
import { RegistrarCobroOdoo } from "@/components/administracion/RegistrarCobroOdoo";
import { AprobarMovimiento } from "@/components/administracion/AprobarMovimiento";
import { LineasViejasOdoo } from "@/components/administracion/LineasViejasOdoo";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FolderUp,
  Landmark,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Conciliacion bancaria. Una sola pantalla para dos roles, como la de Binance:
 * - Administracion (`modo="admin"`): pestaña Conciliar (el estado de cuenta del
 *   banco contra los cobros y pagos de Odoo, y aprobar), Comprobantes de clientes
 *   y Lineas que ya estaban en Odoo.
 * - Cuentas por Cobrar (`modo="cxc"`): solo sube los comprobantes de los clientes
 *   y ve en que quedo cada uno (la API no le deja subir el estado de cuenta ni
 *   conciliar).
 */

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

type Tipo = "estado" | "comprobante";
type Subida = { nombre: string; ok: boolean; texto: string };
// Listas que se abren en el dialogo (tarjetas de comprobantes y el aviso de Odoo).
type Lista = "conciliados" | "problema" | "sinComprobante" | "odoo";
const TITULO_LISTA: Record<Lista, string> = {
  conciliados: "Comprobantes conciliados",
  problema: "Comprobantes con problema",
  sinComprobante: "Entradas del banco sin comprobante",
  odoo: "En Odoo y no en el banco",
};
type Pestana = "conciliar" | "comprobantes" | "viejas";

const IMAGENES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXCEL = /\.(xlsx?|csv|html?)$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const EN_PARALELO: Record<Tipo, number> = { estado: 2, comprobante: 4 };
// Para que el navegador deje elegir una carpeta entera (no esta en los tipos de React).
const ELEGIR_CARPETA = { webkitdirectory: "", directory: "" } as Record<string, string>;

/** Ultimo dia del mes "YYYY-MM". */
const finDeMes = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
const RANGO = "rango";

const ODOO_URL = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "");
/**
 * Donde se ve en Odoo un movimiento conciliado: el asiento de la linea de
 * extracto que creo el panel o, si se concilio alla, el cobro/pago.
 */
const enlaceConciliado = (m: MovimientoPeriodo) =>
  m.odoo?.asientoId
    ? `${ODOO_URL}/web#id=${m.odoo.asientoId}&model=account.move&view_type=form`
    : `${ODOO_URL}/web#id=${m.pago?.id}&model=account.payment&view_type=form`;
const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const suma = (items: { monto: number }[]) => items.reduce((s, i) => s + i.monto, 0);
type MovimientoPeriodo = ConciliacionBanco["movimientos"][number];
/** Ya esta conciliado en Odoo: lo concilio el panel o su cobro/pago ya estaba conciliado alla. */
const yaConciliado = (m: MovimientoPeriodo) => !!m.odoo || !!m.pago?.conciliado;
/** Falta pasarlo a Odoo. */
const conciliable = (m: MovimientoPeriodo) => !yaConciliado(m);
/** Se aprueba con un clic, sin el dialogo: calza por referencia (o se amarro a mano), o es una comision con su cuenta propuesta. */
const directo = (m: MovimientoPeriodo) =>
  conciliable(m) && (m.pago ? m.estado === "referencia" || m.estado === "manual" : m.estado === "comision" && !!m.sugerida);
/** Contra que se concilia al aprobar con un clic. */
const destinoDirecto = (m: MovimientoPeriodo) =>
  m.pago ? { pagos: [m.pago, ...m.otrosPagos].map((p) => p.id) } : { cuenta_contable: m.sugerida!.id };

/** En que grupo cae cada movimiento: las tarjetas de la pestaña Conciliar filtran por esto. */
type Grupo = "listos" | "revisar" | "sinOdoo" | "conciliados";
function grupoDe(m: MovimientoPeriodo): Grupo {
  if (yaConciliado(m)) return "conciliados";
  if (directo(m)) return "listos";
  if (m.pago || m.estado === "comision") return "revisar";
  return "sinOdoo";
}
const GRUPOS: { clave: Grupo; titulo: string; tono: "verde" | "ambar" | "rojo" | "azul"; ayuda: string }[] = [
  { clave: "listos", titulo: "Listos para aprobar", tono: "verde", ayuda: "Coinciden fecha, referencia y monto, o son comisiones" },
  { clave: "revisar", titulo: "Por revisar", tono: "ambar", ayuda: "Algo no coincide: confírmalo o elige otro" },
  { clave: "sinOdoo", titulo: "No están en Odoo", tono: "rojo", ayuda: "Sin cobro ni pago: regístralo o pásalo contra una cuenta" },
  { clave: "conciliados", titulo: "Conciliados", tono: "azul", ayuda: "Ya conciliados en Odoo" },
];

/** Texto del movimiento para el buscador: referencia, descripcion, monto y el cobro/pago propuesto. */
const textoBusqueda = (m: MovimientoPeriodo) =>
  [
    m.referencia,
    m.descripcion,
    cifra(m.monto),
    String(Math.abs(m.monto)),
    ...[m.pago, ...m.otrosPagos].flatMap((p) => (p ? [p.nombre, p.cliente, p.ref] : [])),
    m.comprobante?.cliente,
    m.odoo?.detalle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

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
          {api.tipo === "pago_movil"
            ? `Pago Móvil desde ${api.telefono ? `0${api.telefono.slice(2, 5)}-${api.telefono.slice(5)}` : "—"} · aut. ${api.autorizacion || "—"}`
            : api.pagador || "—"}
          {api.estatus && api.estatus !== "A" ? ` · estatus ${api.estatus}` : ""}
        </span>
      </span>
    );
  }
  const texto: Record<string, string> = {
    no_encontrado: "Mercantil no lo encontró",
    duplicado: "Transferencia repetida",
    no_aplica: "No se puede consultar",
    sin_telefono: "Falta el celular de quien pagó",
    error: "No se pudo consultar",
  };
  return (
    <span className="text-xs" title={api.mensaje}>
      <span className={api.estado === "error" || api.estado === "no_aplica" || api.estado === "sin_telefono" ? "text-amber-700 font-medium" : "text-red-700 font-medium"}>
        {texto[api.estado]}
      </span>
      {api.mensaje && <span className="block text-gray-500 max-w-[16rem] whitespace-normal">{api.mensaje}</span>}
    </span>
  );
}

/**
 * El cobro/pago de Odoo: numero, cliente, monto, Memo y fecha. Con `coincide`
 * (contra el movimiento del banco) lo que no coincide va en rojo.
 */
function Cobro({ pago, coincide }: { pago: PagoOdoo; coincide?: Coincide | null }) {
  const mal = (ok: boolean | undefined) => (coincide && !ok ? "text-red-700 font-medium" : "");
  return (
    <span className="text-xs">
      <span className="font-medium">{pago.nombre}</span> · {pago.cliente}
      <span className="block text-gray-500">
        <span className={mal(coincide?.monto)}>{cifra(pago.monto)}</span> · Memo{" "}
        <span className={mal(coincide?.referencia)}>{pago.ref || "—"}</span> · <span className={mal(coincide?.fecha)}>{dia(pago.fecha)}</span>
      </span>
    </span>
  );
}

/** Que no coincide entre el movimiento y el cobro/pago propuesto ("la fecha y el monto"). */
function queFalla(c: Coincide) {
  const fallan = [!c.fecha && "la fecha", !c.referencia && "la referencia", !c.monto && "el monto"].filter(Boolean) as string[];
  return fallan.length > 1 ? `${fallan.slice(0, -1).join(", ")} y ${fallan[fallan.length - 1]}` : fallan[0] || "";
}

export default function ConciliacionBancaria({ modo = "admin" }: { modo?: "admin" | "cxc" }) {
  const cxc = modo === "cxc";
  const opciones = mesesRecientes(12);
  const fija = useSedeFija();
  const [sede, setSede] = useState(9);
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([]);
  const [cuenta, setCuenta] = useState<number | null>(null);
  // Un mes o un rango de fechas a mano (hasta 93 dias, lo valida el servidor).
  const [mes, setMes] = useState(opciones[0].value);
  const [rango, setRango] = useState({ desde: `${opciones[0].value}-01`, hasta: new Date().toISOString().slice(0, 10) });
  const periodo = mes === RANGO ? rango : { desde: `${mes}-01`, hasta: finDeMes(mes) };
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
  const [pestana, setPestana] = useState<Pestana>(cxc ? "comprobantes" : "conciliar");
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [buscar, setBuscar] = useState("");
  const [registrar, setRegistrar] = useState<number | null>(null);
  const [verificando, setVerificando] = useState<number | "pendientes" | null>(null);
  const [avanceVerificar, setAvanceVerificar] = useState<{ hecho: number; total: number } | null>(null);
  const [conciliando, setConciliando] = useState<string | null>(null);
  const [aprobar, setAprobar] = useState<MovimientoPeriodo | null>(null);
  const [avanceConciliar, setAvanceConciliar] = useState<{ hecho: number; total: number } | null>(null);
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
      const json = await (await fetch(`/api/administracion/bancos?cuenta=${cuenta}&desde=${periodo.desde}&hasta=${periodo.hasta}`)).json();
      if (json.success) setDatos(json);
      else setError(json.error || "No se pudo cargar");
    } catch {
      setError("No se pudo cargar");
    }
    setCargando(false);
  }, [cuenta, periodo.desde, periodo.hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPaginaComprobantes(0);
    setPaginaMovs(0);
  }, [cuenta, periodo.desde, periodo.hasta, grupo, buscar]);

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

  const consultarBanco = async (id: number, telefono?: string) => {
    const res = await fetch("/api/administracion/bancos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta, verificar: id, telefono }),
    });
    return res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
  };

  /**
   * Vuelve a consultar en el banco un comprobante, o los del período que no
   * confirmo. Los pendientes van de a uno desde aqui (cada uno puede llevar
   * decenas de consultas a Mercantil): una sola peticion con todos se pasaria
   * del tiempo que espera el servidor.
   */
  const verificar = async (que: number | "pendientes", telefono?: string) => {
    setError(null);
    if (que !== "pendientes") {
      setVerificando(que);
      const j = await consultarBanco(que, telefono);
      setVerificando(null);
      if (!j.success) setError(j.error || "No se pudo consultar el banco");
      return cargar();
    }
    const ids = (datos?.comprobantes || [])
      .filter((c) => !c.movimiento && (!c.api || ["no_encontrado", "error", "sin_telefono"].includes(c.api.estado)))
      .map((c) => c.id);
    setVerificando("pendientes");
    setAvanceVerificar({ hecho: 0, total: ids.length });
    for (const [n, id] of ids.entries()) {
      const j = await consultarBanco(id);
      setAvanceVerificar({ hecho: n + 1, total: ids.length });
      if (!j.success || j.api?.estado === "error") {
        // Mercantil caido o el servidor fallo: no tiene sentido seguir con los demas.
        setError(j.error || j.api?.mensaje || "No se pudo consultar el banco");
        break;
      }
    }
    setVerificando(null);
    setAvanceVerificar(null);
    cargar();
  };

  /** Aprobado: crea la linea de extracto en Odoo y la concilia con su cobro/pago (o como comision). */
  const pedirConciliar = async (m: MovimientoPeriodo) => {
    const res = await fetch("/api/administracion/bancos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta, conciliar: m.id, ...destinoDirecto(m) }),
    });
    return res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
  };

  const conciliar = async (m: MovimientoPeriodo) => {
    if (!directo(m)) return setAprobar(m);
    const con = m.pago
      ? `${[m.pago, ...m.otrosPagos].map((p) => p.nombre).join(" + ")} (${m.pago.cliente})`
      : `la cuenta ${m.sugerida!.codigo} ${m.sugerida!.nombre}`;
    if (!confirm(`¿Conciliar en Odoo el movimiento del ${dia(m.fecha)} por ${cifra(m.monto)} con ${con}?`)) return;
    setError(null);
    setConciliando(m.id);
    const j = await pedirConciliar(m);
    setConciliando(null);
    if (!j.success) setError(j.error || "No se pudo conciliar en Odoo");
    cargar();
  };

  const movimientos = datos?.movimientos || [];
  const comprobantes = datos?.comprobantes || [];
  const sinMovimiento = datos?.pagosSinMovimiento || [];
  const moneda = cuentaElegida?.moneda || "";

  /** Los listos del período, de a uno; para al primer error. */
  const conciliarTodos = async () => {
    const listos = movimientos.filter(directo);
    if (!listos.length || !confirm(`¿Conciliar en Odoo los ${listos.length} movimientos listos (los que calzan por referencia y las comisiones)?`)) return;
    setError(null);
    setConciliando("todos");
    setAvanceConciliar({ hecho: 0, total: listos.length });
    for (const [n, m] of listos.entries()) {
      const j = await pedirConciliar(m);
      setAvanceConciliar({ hecho: n + 1, total: listos.length });
      if (!j.success) {
        setError(`${dia(m.fecha)} ${m.referencia || ""}: ${j.error || "no se pudo conciliar en Odoo"}`);
        break;
      }
    }
    setConciliando(null);
    setAvanceConciliar(null);
    cargar();
  };

  const porGrupo = useMemo(() => {
    const g: Record<Grupo, MovimientoPeriodo[]> = { listos: [], revisar: [], sinOdoo: [], conciliados: [] };
    for (const m of movimientos) g[grupoDe(m)].push(m);
    return g;
  }, [movimientos]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (grupo ? porGrupo[grupo] : movimientos).filter((m) => !q || textoBusqueda(m).includes(q));
  }, [grupo, porGrupo, movimientos, buscar]);

  const conciliadosComp = comprobantes.filter((c) => c.estado === "conciliado");
  const conProblema = comprobantes.filter((c) => c.estado !== "conciliado");
  const sinComprobante = movimientos.filter((m) => m.monto > 0 && !m.comprobante);
  const etiqueta = (e: EstadoComprobante) => (e === "sin_estado" && datos?.mercantil ? "Sin verificar en el banco" : ETIQUETA_COMP[e]);

  /** Movimientos para amarrar a mano un comprobante: los que no tienen comprobante, primero los de su monto. */
  const opcionesMovimiento = (c: ComprobanteCruzado) =>
    [...sinComprobante].sort((a, b) => Math.abs(a.monto - c.monto) - Math.abs(b.monto - c.monto));

  const hojasExcel = () => [
    {
      nombre: "Estado de cuenta",
      filas: movimientos.map((m) => ({
        Fecha: m.fecha,
        Referencia: m.referencia,
        Descripción: m.descripcion,
        Monto: m.monto,
        Situación: GRUPOS.find((g) => g.clave === grupoDe(m))!.titulo,
        "Cobro/pago en Odoo": m.pago ? [m.pago, ...m.otrosPagos].map((p) => p.nombre).join(" + ") : m.estado === "comision" ? "Comisión" : "No está en Odoo",
        "Monto en Odoo": m.pago ? [m.pago, ...m.otrosPagos].reduce((s, p) => s + p.monto, 0) : "",
        "Memo en Odoo": m.pago ? [m.pago, ...m.otrosPagos].map((p) => p.ref).join(" + ") : "",
        "Fecha en Odoo": m.pago?.fecha || "",
        "No coincide": m.coincide ? queFalla(m.coincide) : "",
        "Cliente/proveedor": m.pago?.cliente || m.comprobante?.cliente || "",
        Comprobante: m.comprobante?.referencia || "",
        "En Odoo": m.odoo ? (m.odoo.conciliada ? `Conciliado (${m.odoo.asiento}): ${m.odoo.detalle}` : `Pasado sin conciliar (${m.odoo.asiento})`) : m.pago?.conciliado ? "Conciliado" : "No",
      })),
    },
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
      nombre: "En Odoo y no en el banco",
      filas: sinMovimiento.map((p) => ({ Fecha: p.fecha, Cobro: p.nombre, Cliente: p.cliente, Ref: p.ref, Monto: p.monto })),
    },
  ];

  const imagen = (c: { id: number; referencia: string; cliente: string }) => (
    <button className="text-blue-600 hover:underline font-mono text-xs text-left" onClick={() => setVerImagen(c)}>
      {c.referencia}
    </button>
  );

  const botonSubirEstado = (variante: "default" | "outline") => (
    <Button size="sm" variant={variante} className="h-9" disabled={!cuenta || !!subiendo} onClick={() => entradas.estado.current?.click()}>
      {subiendo?.tipo === "estado" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
      {subiendo?.tipo === "estado" ? `Leyendo ${subiendo.hecho} de ${subiendo.total}` : "Subir estado de cuenta"}
    </Button>
  );

  const conciliadosOdoo = porGrupo.conciliados.length;
  const pct = movimientos.length ? Math.round((conciliadosOdoo / movimientos.length) * 100) : 0;
  const pestanas: [Pestana, string][] = cxc
    ? []
    : [
        ["conciliar", `Conciliar (${movimientos.length})`],
        ["comprobantes", `Comprobantes de clientes (${comprobantes.length})`],
        ["viejas", "Líneas viejas de Odoo"],
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" />
            {cxc ? "Comprobantes bancarios" : "Conciliación bancaria"}
          </h1>
          <p className="text-gray-500 text-sm">
            {cxc
              ? "Sube los comprobantes de pago de los clientes y mira si entraron al banco y si ya están en Odoo"
              : "Sube el estado de cuenta del banco, revisa cómo se cruza con los cobros y pagos de Odoo y apruébalo"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!cxc &&
            (fija ? (
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
            ))}
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
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white capitalize"
            aria-label="Período"
          >
            {opciones.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value={RANGO}>Rango de fechas…</option>
          </select>
          {mes === RANGO && (
            <span className="flex items-center gap-1 text-sm">
              <input
                type="date"
                value={rango.desde}
                max={rango.hasta}
                onChange={(e) => e.target.value && setRango((r) => ({ ...r, desde: e.target.value }))}
                className="border rounded-lg px-2 py-2 bg-white"
                aria-label="Desde"
              />
              <span className="text-gray-500">al</span>
              <input
                type="date"
                value={rango.hasta}
                min={rango.desde}
                onChange={(e) => e.target.value && setRango((r) => ({ ...r, hasta: e.target.value }))}
                className="border rounded-lg px-2 py-2 bg-white"
                aria-label="Hasta"
              />
            </span>
          )}
          {datos && !cxc && (
            <BotonExcel archivo={`conciliacion-${cuentaElegida?.nombre || "banco"}-${periodo.desde}_${periodo.hasta}`} hojas={hojasExcel} />
          )}
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

      {!cxc && (
        <input
          ref={entradas.estado}
          type="file"
          multiple
          className="hidden"
          accept=".xls,.xlsx,.csv,.html,image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => subir(e.target.files, "estado")}
        />
      )}
      <input
        ref={entradas.comprobante}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => subir(e.target.files, "comprobante")}
      />
      <input ref={entradas.carpeta} type="file" multiple className="hidden" {...ELEGIR_CARPETA} onChange={(e) => subir(e.target.files, "comprobante")} />
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        datos && (
          <>
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
                        <TableHead>{lista === "odoo" ? "Cobro o pago en Odoo" : "Descripción"}</TableHead>
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
                          {(lista === "conciliados" ? conciliadosComp : conProblema).length === 0 && (
                            <FilaVacia columnas={5} texto="No hay comprobantes aquí." />
                          )}
                          {(lista === "conciliados" ? conciliadosComp : conProblema).map((c) => (
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

            {cuenta && !cxc && (
              <RegistrarCobroOdoo cuenta={cuenta} comprobante={registrar} cerrar={() => setRegistrar(null)} listo={cargar} />
            )}
            {cuenta && !cxc && (
              <AprobarMovimiento cuenta={cuenta} movimiento={aprobar} pagosLibres={datos.pagosLibres} cerrar={() => setAprobar(null)} listo={cargar} />
            )}

            {pestanas.length > 0 && (
              <div className="inline-flex flex-wrap rounded-lg border bg-gray-50 p-0.5" role="tablist" aria-label="Sección">
                {pestanas.map(([clave, texto]) => (
                  <button
                    key={clave}
                    type="button"
                    role="tab"
                    aria-selected={pestana === clave}
                    onClick={() => setPestana(clave)}
                    className={`px-4 py-2 text-sm rounded-md ${pestana === clave ? "bg-white shadow-sm font-medium" : "text-gray-600"}`}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            )}

            {/* ---------- Conciliar: el estado de cuenta contra Odoo ---------- */}
            {!cxc && pestana === "conciliar" &&
              (datos.archivos.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                    <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
                    <p className="text-lg font-semibold">Este período todavía no tiene estado de cuenta</p>
                    <p className="text-sm text-gray-500 max-w-xl">
                      Sube el Excel o CSV que baja el banco por internet (con Fecha, Referencia, Descripción y Monto, o Débito y Crédito; mejor si
                      trae Saldo). También sirve una captura o PDF, pero esos los lee la IA y conviene revisarlos. Puede cubrir un mes entero: lo
                      repetido no se duplica.
                    </p>
                    {botonSubirEstado("default")}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm">
                          <span className="font-semibold">{conciliadosOdoo}</span> de <span className="font-semibold">{movimientos.length}</span>{" "}
                          movimientos conciliados en Odoo
                          {datos.diasSinEstado.length > 0 && (
                            <span className="text-amber-700">
                              {" "}
                              · falta{datos.diasSinEstado.length > 1 ? `n ${datos.diasSinEstado.length} días` : " el " + dia(datos.diasSinEstado[0])} en
                              el estado de cuenta
                            </span>
                          )}
                        </p>
                        {botonSubirEstado("outline")}
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        {datos.archivos.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1">
                            {a.nombre} · {dia(a.desde)} al {dia(a.hasta)}
                            {a.saltos > 0 && <span className="text-amber-700"> · el saldo no cuadra en {a.saltos}</span>}
                            <button
                              className="text-gray-400 hover:text-red-600"
                              aria-label={`Quitar ${a.nombre}`}
                              onClick={() => confirm(`¿Quitar ${a.nombre} y sus movimientos?`) && enviar("DELETE", { estado: a.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {GRUPOS.map((g) => {
                      const items = porGrupo[g.clave];
                      const activo = grupo === g.clave;
                      return (
                        <button
                          key={g.clave}
                          type="button"
                          aria-pressed={activo}
                          onClick={() => setGrupo(activo ? null : g.clave)}
                          className={`text-left rounded-xl transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            activo ? "ring-2 ring-blue-500" : ""
                          }`}
                          title={g.ayuda}
                        >
                          <Tarjeta tono={items.length ? g.tono : "neutro"} titulo={g.titulo} valor={items.length} detalle={`${cifra(suma(items))} ${moneda}`} />
                        </button>
                      );
                    })}
                  </div>

                  {sinMovimiento.length > 0 && (
                    <Aviso>
                      {sinMovimiento.length} cobro{sinMovimiento.length === 1 ? "" : "s"} o pago{sinMovimiento.length === 1 ? "" : "s"} de Odoo de esta
                      cuenta no aparece{sinMovimiento.length === 1 ? "" : "n"} en el estado de cuenta ({cifra(suma(sinMovimiento))} {moneda}).{" "}
                      <button className="underline font-medium" onClick={() => setLista("odoo")}>
                        Ver cuáles
                      </button>
                    </Aviso>
                  )}

                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">
                          {grupo ? GRUPOS.find((g) => g.clave === grupo)!.titulo : "Todos los movimientos"}
                        </CardTitle>
                        {grupo && (
                          <button className="text-xs text-blue-600 hover:underline" onClick={() => setGrupo(null)}>
                            Ver todos
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-2.5" />
                          <Input
                            value={buscar}
                            onChange={(e) => setBuscar(e.target.value)}
                            placeholder="Buscar referencia, monto, cliente…"
                            className="h-9 pl-8 w-64"
                            aria-label="Buscar en el estado de cuenta"
                          />
                        </div>
                        {porGrupo.listos.length > 0 && (
                          <Button size="sm" className="h-9" disabled={conciliando !== null} onClick={conciliarTodos}>
                            {conciliando === "todos" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            {avanceConciliar ? `Conciliando ${avanceConciliar.hecho} de ${avanceConciliar.total}` : `Aprobar los ${porGrupo.listos.length} listos`}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Movimiento del banco</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Se concilia con</TableHead>
                            <TableHead className="text-right" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibles.length === 0 && (
                            <FilaVacia columnas={5} texto={buscar ? "Nada coincide con la búsqueda." : "No hay movimientos aquí."} />
                          )}
                          {deLaPagina(visibles, paginaMovs).map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap align-top">{dia(m.fecha)}</TableCell>
                              <TableCell className="text-xs max-w-[22rem] align-top">
                                <span className="font-mono">{m.referencia || "sin ref."}</span>
                                <span className="block text-gray-600">{m.descripcion}</span>
                                {m.comprobante && (
                                  <span className="block text-gray-500 mt-0.5">
                                    Comprobante: {m.comprobante.cliente || "sin cliente"} · {imagen(m.comprobante)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className={`text-right whitespace-nowrap align-top ${m.monto < 0 ? "text-red-700" : ""}`}>{cifra(m.monto)}</TableCell>
                              <TableCell className="align-top">
                                {m.odoo ? (
                                  <span className="text-xs text-gray-700">
                                    {m.odoo.asiento && (
                                      <a href={enlaceConciliado(m)} target="_blank" rel="noreferrer" className="block font-medium text-blue-600 hover:underline">
                                        {m.odoo.asiento}
                                      </a>
                                    )}
                                    {m.odoo.detalle}
                                  </span>
                                ) : m.pago ? (
                                  <>
                                    {[m.pago, ...m.otrosPagos].map((p) => (
                                      <span key={p.id} className="block">
                                        <Cobro pago={p} coincide={m.otrosPagos.length ? { ...m.coincide!, monto: true } : m.coincide} />
                                      </span>
                                    ))}
                                    {m.otrosPagos.length > 0 && (
                                      <span className={`block text-xs ${m.coincide?.monto ? "text-emerald-700" : "text-red-700"}`}>
                                        Cobro dividido: suman {cifra([m.pago, ...m.otrosPagos].reduce((s, p) => s + p.monto, 0))}
                                      </span>
                                    )}
                                    {!m.pago.conciliado && m.estado === "parcial" && m.coincide && (
                                      <Badge variant="outline" className="border-0 block w-fit mt-0.5 bg-amber-100 text-amber-800">
                                        No coincide {queFalla(m.coincide)}
                                      </Badge>
                                    )}
                                    {!m.pago.conciliado && m.estado === "manual" && (
                                      <Badge variant="outline" className="border-0 block w-fit mt-0.5 bg-emerald-100 text-emerald-800">
                                        Amarrado a mano
                                      </Badge>
                                    )}
                                  </>
                                ) : m.estado === "comision" ? (
                                  <span className="text-xs">
                                    Comisión del banco
                                    <span className="block text-gray-500">
                                      {m.sugerida ? `${m.sugerida.codigo} ${m.sugerida.nombre}` : "Elige la cuenta al aprobar"}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-red-700">No está en Odoo</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap align-top">
                                {yaConciliado(m) ? (
                                  <a
                                    href={enlaceConciliado(m)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`text-xs inline-flex items-center gap-1 hover:underline ${m.odoo && !m.odoo.conciliada ? "text-amber-700" : "text-emerald-700"}`}
                                    title={
                                      (m.odoo ? `Aprobado por ${m.odoo.por} el ${dia(m.odoo.el.slice(0, 10))}` : "Ya estaba conciliado en Odoo") +
                                      " · abrir en Odoo"
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    {m.odoo && !m.odoo.conciliada ? "En Odoo, falta conciliar allá" : "Conciliado"}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant={directo(m) ? "default" : "outline"}
                                      className="h-8"
                                      disabled={conciliando !== null}
                                      onClick={() => conciliar(m)}
                                    >
                                      {conciliando === m.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                                      {directo(m) ? "Aprobar" : "Revisar y aprobar"}
                                    </Button>
                                    {directo(m) && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                        aria-label="Conciliar contra otra cosa"
                                        title="Otros cobros/pagos, una cuenta contable, transferencia o pasar sin conciliar"
                                        disabled={conciliando !== null}
                                        onClick={() => setAprobar(m)}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <Paginacion pagina={paginaMovs} total={visibles.length} cambiar={setPaginaMovs} />
                    </CardContent>
                  </Card>
                </div>
              ))}

            {/* ---------- Comprobantes de los clientes ---------- */}
            {(cxc || pestana === "comprobantes") && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Tarjeta titulo="Comprobantes" valor={comprobantes.length} detalle={`${cifra(suma(comprobantes))} ${moneda}`} />
                  <button
                    type="button"
                    onClick={() => setLista("conciliados")}
                    className="text-left rounded-xl transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <Tarjeta tono="verde" titulo="Conciliados" valor={conciliadosComp.length} detalle={`${cifra(suma(conciliadosComp))} ${moneda}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLista("problema")}
                    className="text-left rounded-xl transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <Tarjeta
                      tono={conProblema.length ? "rojo" : "neutro"}
                      titulo="Con problema"
                      valor={conProblema.length}
                      detalle={`${cifra(suma(conProblema))} ${moneda}`}
                    />
                  </button>
                  {cxc ? (
                    <Tarjeta
                      tono={comprobantes.some((c) => c.estado === "sin_registrar") ? "ambar" : "neutro"}
                      titulo="Entraron al banco, faltan en Odoo"
                      valor={comprobantes.filter((c) => c.estado === "sin_registrar").length}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLista("sinComprobante")}
                      className="text-left rounded-xl transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Tarjeta
                        tono={sinComprobante.length ? "ambar" : "neutro"}
                        titulo="Entradas sin comprobante"
                        valor={sinComprobante.length}
                        detalle={`${cifra(suma(sinComprobante))} ${moneda}`}
                      />
                    </button>
                  )}
                </div>

                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                    <div>
                      <CardTitle className="text-base">Comprobantes del período</CardTitle>
                      <p className="text-xs text-gray-500 mt-1">
                        Cada archivo se llama como el cliente; en una carpeta con el día (ej. 27-10-2026) los que no traen fecha toman la de la carpeta.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {datos.mercantil && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          disabled={!cuenta || !!subiendo || verificando !== null}
                          onClick={() => verificar("pendientes")}
                          title="Consultar en Mercantil los comprobantes del período que todavía no confirmó"
                        >
                          {verificando === "pendientes" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                          {avanceVerificar ? `Verificando ${avanceVerificar.hecho} de ${avanceVerificar.total}` : "Verificar pendientes"}
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
                        {comprobantes.length === 0 && <FilaVacia columnas={8} texto="No hay comprobantes en este período." />}
                        {deLaPagina(comprobantes, paginaComprobantes).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="whitespace-nowrap">{dia(c.fecha)}</TableCell>
                            <TableCell>{c.cliente || "—"}</TableCell>
                            <TableCell>{imagen(c)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{cifra(c.monto)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {c.movimiento ? `${dia(c.movimiento.fecha)} · ${c.movimiento.referencia || "sin ref."}` : c.api ? <EnElBanco api={c.api} /> : "—"}
                            </TableCell>
                            <TableCell>{c.pago ? <Cobro pago={c.pago} /> : "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`border-0 ${CLASE_COMP[c.estado]}`}>
                                {etiqueta(c.estado)}
                              </Badge>
                              {!cxc && c.estado !== "conciliado" && (c.movimientoId || opcionesMovimiento(c).length > 0) && (
                                <select
                                  value=""
                                  onChange={(e) => enviar("PATCH", { comprobante: c.id, movimiento: e.target.value === "soltar" ? null : e.target.value })}
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
                              {!cxc && datos.mercantil && !c.pago && !!c.odooPagoId && (
                                <span className="text-xs text-gray-500 mr-1">Registrado en Odoo (borrador)</span>
                              )}
                              {!cxc && datos.mercantil && c.api?.estado === "confirmado" && !c.pago && !c.odooPagoId && (
                                <Button size="sm" className="h-8 mr-1" onClick={() => setRegistrar(c.id)}>
                                  <Landmark className="h-4 w-4 mr-1" />
                                  Registrar en Odoo
                                </Button>
                              )}
                              {datos.mercantil && (c.api?.estado === "sin_telefono" || c.api?.estado === "no_encontrado") && !c.movimiento && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Buscar como Pago Móvil con el celular de quien pagó"
                                  title="Pago Móvil: buscar con el celular de quien pagó"
                                  disabled={verificando !== null}
                                  onClick={() => {
                                    const tel = prompt("Celular completo de quien hizo el Pago Móvil (ej. 0412-1234567):");
                                    if (tel && tel.trim()) verificar(c.id, tel.trim());
                                  }}
                                >
                                  <Smartphone className="h-4 w-4 text-gray-500" />
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
              </div>
            )}

            {!cxc && pestana === "viejas" && cuenta && (
              <LineasViejasOdoo cuenta={cuenta} desde={periodo.desde} hasta={periodo.hasta} alCambiar={cargar} />
            )}
          </>
        )
      )}
    </div>
  );
}
