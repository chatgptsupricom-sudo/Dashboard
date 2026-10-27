"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Aviso, FilaVacia, Tarjeta } from "@/components/administracion/comunes";
import type {
  Comprobante,
  EstadoComprobante,
  OrigenPagos,
  PagoBinance,
  PagoConComprobante,
} from "@/lib/administracion/binance";
import { ETIQUETA_ESTADO } from "@/lib/administracion/binanceEstados";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Bitcoin, Download, FileSpreadsheet, FolderUp, Link2, Loader2, Printer, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Respuesta = {
  comprobantes: Comprobante[];
  sinComprobante: PagoBinance[];
  /** Todos los pagos de la semana, con el comprobante que los tomo. */
  pagos: PagoConComprobante[];
  errorBinance: string | null;
  origen: OrigenPagos;
  movimientos: number;
  /** Pagos del estado de cuenta de la semana que esta sede puede borrar. */
  borrables: number;
};

type Subida = { nombre: string; ok: boolean; texto: string };
type TipoArchivo = "comprobante" | "estado";

const TIPOS_ARCHIVO = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;
// Cuantos archivos se leen a la vez: 180 comprobantes de a uno eran ~15 min.
// Las capturas del estado de cuenta tardan mas y traen mas filas: menos a la vez.
const EN_PARALELO: Record<TipoArchivo, number> = { comprobante: 4, estado: 2 };
// Para que el navegador deje elegir una carpeta entera (no esta en los tipos de React).
const ELEGIR_CARPETA = { webkitdirectory: "", directory: "" } as Record<string, string>;

const CLASE_ESTADO: Record<EstadoComprobante, string> = {
  conciliado: "bg-emerald-100 text-emerald-800",
  manual: "bg-emerald-100 text-emerald-800",
  por_monto_hora: "bg-amber-100 text-amber-800",
  nombre_distinto: "bg-amber-100 text-amber-800",
  monto_distinto: "bg-red-100 text-red-800",
  no_encontrado: "bg-red-100 text-red-800",
  sin_verificar: "bg-slate-100 text-slate-700",
};

const DIA = 86400_000;
const POR_PAGINA = 25;

/** Anterior / Pagina x de y / Siguiente; no se muestra con una sola pagina. */
function Paginacion({ pagina, total, cambiar }: { pagina: number; total: number; cambiar: (p: number) => void }) {
  const paginas = Math.ceil(total / POR_PAGINA);
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-sm text-gray-600">
      <span>
        {pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}
      </span>
      <Button size="sm" variant="outline" className="h-8" disabled={pagina === 0} onClick={() => cambiar(pagina - 1)}>
        Anterior
      </Button>
      <span>
        Página {pagina + 1} de {paginas}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={pagina >= paginas - 1}
        onClick={() => cambiar(pagina + 1)}
      >
        Siguiente
      </Button>
    </div>
  );
}

const deLaPagina = <T,>(items: T[], pagina: number) => items.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

/** Lunes (YYYY-MM-DD) de las ultimas `n` semanas, la actual primero. */
function semanas(n = 12) {
  const hoy = new Date();
  const lunes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const corto = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(lunes.getTime() - i * 7 * DIA);
    return { value: f(d), label: `${corto(d)} al ${corto(new Date(d.getTime() + 6 * DIA))}/${d.getUTCFullYear()}` };
  });
}

// Hora de Caracas, como se concilia la semana.
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" });

const soloFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-VE", { timeZone: "America/Caracas", dateStyle: "short" });

const cifra = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

/** Un comprobante por subir: un archivo elegido o uno de la carpeta de Google Drive. */
type Elegido = { nombre: string; carpeta: string | null; archivo?: File; driveId?: string };

const MIME_POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

const esZip = (f: File) => /\.zip$/i.test(f.name);

/** Carpeta donde esta el archivo ("Binance/02-10-2026/Cliente.jpg" -> "02-10-2026"). */
function carpetaDe(ruta: string) {
  const partes = ruta.split("/");
  return partes.length > 1 ? partes[partes.length - 2] : null;
}

/**
 * Fotos y PDF de un .zip. Google Drive descarga una carpeta como
 * "02-10-2026-20261027T150000Z-001.zip" con la carpeta adentro; si los archivos
 * vienen sueltos en el zip, la fecha sale del nombre del zip.
 */
async function abrirZip(zip: File): Promise<Elegido[]> {
  const { default: JSZip } = await import("jszip");
  const z = await JSZip.loadAsync(zip);
  const salida: Elegido[] = [];
  for (const e of Object.values(z.files)) {
    const nombre = e.name.split("/").pop() || "";
    const tipo = MIME_POR_EXTENSION[nombre.split(".").pop()?.toLowerCase() || ""];
    // "._x.jpg" / "__MACOSX": basura que agrega la Mac al comprimir.
    if (e.dir || !tipo || nombre.startsWith("._") || e.name.startsWith("__MACOSX")) continue;
    const archivo = new File([await e.async("blob")], nombre, { type: tipo });
    salida.push({ archivo, nombre, carpeta: carpetaDe(e.name) ?? zip.name.replace(/\.zip$/i, "") });
  }
  return salida;
}

const fechaComprobante = (c: Comprobante) =>
  c.fechaEstimada && !c.binance
    ? c.horaTelefono
      ? `${fechaHora(c.fecha)} (hora del comprobante)`
      : c.soloDia
        ? `${soloFecha(c.fecha)} (sin hora)`
        : "Sin fecha"
    : fechaHora(c.fecha);

// Lo que muestra cada tarjeta al hacerle clic.
type Lista = "comprobantes" | "conciliados" | "problema" | "sinComprobante";
const TITULO_LISTA: Record<Lista, string> = {
  comprobantes: "Comprobantes",
  conciliados: "Conciliados",
  problema: "Con diferencia o no encontrados",
  sinComprobante: "Recibido sin comprobante",
};

/** Suma por moneda: Binance recibe USDT, USDC, BTC... y no se mezclan. */
function porMoneda(items: { monto: number; moneda: string }[]) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.moneda, (m.get(i.moneda) || 0) + i.monto));
  return [...m].map(([moneda, monto]) => `${cifra(monto)} ${moneda}`).join(" · ") || "0";
}

export default function BinancePage() {
  const opciones = semanas();
  const [semana, setSemana] = useState(opciones[0].value);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number; tipo: TipoArchivo } | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [lista, setLista] = useState<Lista | null>(null);
  const [verImagen, setVerImagen] = useState<Comprobante | null>(null);
  const [ignorados, setIgnorados] = useState(0);
  const [paginaComprobantes, setPaginaComprobantes] = useState(0);
  const [paginaPagos, setPaginaPagos] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const inputEstado = useRef<HTMLInputElement>(null);
  const carpeta = useRef<HTMLInputElement>(null);
  const carpetaEstado = useRef<HTMLInputElement>(null);
  const [drive, setDrive] = useState<{ configurado: boolean; conectado: boolean; correo: string } | null>(null);
  const [enlace, setEnlace] = useState("");
  const [leyendoDrive, setLeyendoDrive] = useState(false);

  useEffect(() => {
    fetch("/api/administracion/binance/drive?estado=1")
      .then((r) => r.json())
      .then((j) => setDrive(j?.configurado !== undefined ? j : null))
      .catch(() => setDrive(null));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await (await fetch(`/api/administracion/binance?semana=${semana}`)).json();
      if (json.success) setDatos(json);
      else setError(json.error || "No se pudo cargar");
    } catch {
      setError("No se pudo cargar");
    }
    setCargando(false);
  }, [semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Otra semana: de vuelta a la primera pagina.
  useEffect(() => {
    setPaginaComprobantes(0);
    setPaginaPagos(0);
  }, [semana]);

  const subirUno = async (elegido: Elegido, tipo: TipoArchivo): Promise<Subida> => {
    const { archivo, driveId, carpeta } = elegido;
    const nombre = carpeta ? `${carpeta}/${elegido.nombre}` : elegido.nombre;
    if (archivo && archivo.size > MAX_BYTES) return { nombre, ok: false, texto: "Pesa más de 8 MB" };
    const form = new FormData();
    if (archivo) form.append("archivo", archivo);
    if (driveId) form.append("drive_id", driveId);
    form.append("semana", semana);
    // La carpeta de los comprobantes se llama como el dia de los pagos ("02-10-2026").
    if (carpeta) form.append("carpeta", carpeta);
    if (tipo === "estado") form.append("tipo", "estado");
    try {
      let res = await fetch("/api/administracion/binance", { method: "POST", body: form });
      // IA saturada (429): se espera y se reintenta, cada vez un poco mas.
      for (const espera of [10_000, 20_000, 40_000]) {
        if (res.status !== 429) break;
        await new Promise((listo) => setTimeout(listo, espera));
        res = await fetch("/api/administracion/binance", { method: "POST", body: form });
      }
      const json = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
      if (json.success && json.estado) {
        return json.yaEstaba
          ? { nombre, ok: true, texto: "Esta captura ya estaba cargada (no se volvió a leer)" }
          : { nombre, ok: true, texto: `${json.recibidos} pagos recibidos (${json.nuevos} nuevos, ${json.repetidos} ya estaban)` };
      }
      if (json.success) {
        const fecha = json.horaTelefono
          ? `${fechaHora(json.fecha)} (día de la carpeta, hora del comprobante)`
          : json.soloDia
            ? `${soloFecha(json.fecha)} (día de la carpeta, sin hora)`
            : json.fechaEstimada
              ? "sin fecha, quedó en esta semana"
              : fechaHora(json.fecha);
        return {
          nombre,
          ok: true,
          texto: `${json.cliente || "sin cliente"} · ${json.orderId} · ${cifra(json.monto)} ${json.moneda} · ${fecha}`,
        };
      }
      return { nombre, ok: false, texto: json.error || "Error" };
    } catch {
      return { nombre, ok: false, texto: "No se pudo subir (se cortó la conexión)" };
    }
  };

  /**
   * Sube los archivos elegidos (o los de la carpeta) varios a la vez. De una
   * carpeta solo se suben fotos y PDF; lo demas se cuenta como ignorado. Un .zip
   * (la carpeta de Google Drive descargada) se abre aca y se sube lo de adentro.
   */
  const subir = async (archivos: FileList | null, tipo: TipoArchivo) => {
    if (!archivos?.length) return;
    const todos = [...archivos];
    const zips = todos.filter(esZip);
    const lista: Elegido[] = todos
      .filter((f) => TIPOS_ARCHIVO.has(f.type))
      .map((f) => ({ archivo: f, nombre: f.name, carpeta: carpetaDe(f.webkitRelativePath) }));
    try {
      for (const z of zips) lista.push(...(await abrirZip(z)));
    } catch {
      setError("No se pudo abrir el .zip");
    }
    setIgnorados(todos.length - zips.length - todos.filter((f) => TIPOS_ARCHIVO.has(f.type)).length);
    await subirLista(lista, tipo);
  };

  const subirLista = async (elegidos: Elegido[], tipo: TipoArchivo) => {
    const ruta = (e: Elegido) => `${e.carpeta || ""}/${e.nombre}`;
    const lista = [...elegidos].sort((a, b) => ruta(a).localeCompare(ruta(b), undefined, { numeric: true }));
    setSubidas([]);
    if (!lista.length) {
      for (const el of [input, inputEstado, carpeta, carpetaEstado]) if (el.current) el.current.value = "";
      return;
    }
    const resultados: Subida[] = new Array(lista.length);
    let siguiente = 0;
    let hechos = 0;
    setSubiendo({ hecho: 0, total: lista.length, tipo });
    const trabajador = async () => {
      while (siguiente < lista.length) {
        const i = siguiente++;
        resultados[i] = await subirUno(lista[i], tipo);
        hechos++;
        setSubiendo({ hecho: hechos, total: lista.length, tipo });
        setSubidas(resultados.filter(Boolean));
      }
    };
    await Promise.all(Array.from({ length: Math.min(EN_PARALELO[tipo], lista.length) }, trabajador));
    setSubiendo(null);
    for (const el of [input, inputEstado, carpeta, carpetaEstado]) if (el.current) el.current.value = "";
    cargar();
  };

  /** Lee la carpeta de Google Drive pegada y sube sus comprobantes (el servidor los baja de Drive). */
  const leerDrive = async () => {
    setError(null);
    setLeyendoDrive(true);
    try {
      const json = await (
        await fetch("/api/administracion/binance/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: enlace }),
        })
      ).json();
      if (!json.success) setError(json.error || "No se pudo leer la carpeta de Drive");
      else if (!json.archivos.length) setError(`La carpeta «${json.carpeta}» no tiene fotos ni PDF`);
      else {
        setIgnorados(0);
        setLeyendoDrive(false);
        await subirLista(
          json.archivos.map((a: { id: string; nombre: string; carpeta: string }) => ({
            driveId: a.id,
            nombre: a.nombre,
            carpeta: a.carpeta,
          })),
          "comprobante",
        );
        setEnlace("");
      }
    } catch {
      setError("No se pudo leer la carpeta de Drive");
    }
    setLeyendoDrive(false);
  };

  const asignar = async (c: Comprobante, valor: string, aprobar = false) => {
    const json = await (
      await fetch("/api/administracion/binance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, movimiento_id: valor ? Number(valor) : null, aprobar }),
      })
    ).json();
    if (!json.success) setError(json.error || "No se pudo guardar");
    cargar();
  };

  const borrarEstado = async () => {
    const cuantos = datos?.borrables || 0;
    const otros = (datos?.movimientos || 0) - cuantos;
    const aviso =
      `¿Borrar ${cuantos} pago${cuantos === 1 ? "" : "s"} del estado de cuenta de esta semana para volver a subirlos?` +
      (otros > 0 ? `\n\nLos otros ${otros} los subió otra sede (o también otra sede) y se quedan.` : "");
    if (!confirm(aviso)) return;
    const json = await (await fetch(`/api/administracion/binance?estado=${semana}`, { method: "DELETE" }))
      .json()
      .catch(() => ({ error: "No se pudo borrar" }));
    if (!json.success) setError(json.error || "No se pudo borrar");
    cargar();
  };

  const eliminar = async (c: Comprobante) => {
    if (!confirm(`¿Quitar el comprobante ${c.orderId}?`)) return;
    await fetch(`/api/administracion/binance?id=${c.id}`, { method: "DELETE" });
    cargar();
  };

  const comprobantes = datos?.comprobantes || [];
  const sinComprobante = datos?.sinComprobante || [];
  const pagosSemana = datos?.pagos || [];
  const esConciliado = (c: Comprobante) => c.estado === "conciliado" || c.estado === "manual";
  const conciliados = comprobantes.filter(esConciliado);
  const conProblema = comprobantes.filter((c) => !esConciliado(c));
  const COMPROBANTES_LISTA = { comprobantes, conciliados, problema: conProblema };

  /**
   * Hoja para imprimir los conciliados: cada comprobante con el cliente arriba,
   * sus datos y la firma, uno por hoja. Se imprime desde un iframe oculto: su
   * `load` espera a que bajen todas las imagenes.
   */
  const imprimirConciliados = () => {
    const esc = (s: string) =>
      s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
    const semanaTexto = opciones.find((o) => o.value === semana)?.label || semana;
    const tarjetas = conciliados
      .map((c) => {
        const imagen = /\.pdf$/i.test(c.archivoNombre || "")
          ? `<div class="pdf">Comprobante en PDF<br>(ver en el panel)</div>`
          : `<img class="comprobante" src="/api/administracion/binance/imagen?id=${c.id}" alt="">`;
        return `<div class="tarjeta">
          <div class="semana">Conciliación Binance · Semana ${esc(semanaTexto)}</div>
          <div class="cliente">${esc(c.cliente || "Sin cliente")}</div>
          ${imagen}
          <div class="datos">${esc(fechaComprobante(c))}<br>${esc(cifra(c.monto))} ${esc(c.moneda)} · ${esc(c.orderId)}</div>
          <img class="firma" src="/api/administracion/binance/firma" alt="">
          <div class="pie-firma">Firma de Administración</div>
        </div>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Conciliados</title><style>
      /* margin 0: sin margen el navegador no imprime su encabezado y pie (titulo, fecha, URL); el margen va en la tarjeta. */
      @page { size: letter; margin: 0; }
      body { font-family: Arial, sans-serif; margin: 0; color: #111; }
      .tarjeta { break-after: page; box-sizing: border-box; height: 270mm; padding: 14mm 15mm 12mm; text-align: center; display: flex; flex-direction: column; align-items: center; }
      .tarjeta:last-child { break-after: auto; }
      .semana { font-size: 10px; color: #666; align-self: flex-end; }
      .cliente { font-weight: bold; font-size: 20px; margin: 2mm 0 5mm; }
      .comprobante { max-width: 100%; max-height: 170mm; object-fit: contain; border: 1px solid #ddd; }
      .pdf { height: 170mm; display: flex; align-items: center; justify-content: center; color: #666; font-size: 14px; }
      .datos { font-size: 12px; color: #444; margin-top: 4mm; line-height: 1.5; }
      .firma { height: 32mm; margin-top: auto; }
      .pie-firma { border-top: 1px solid #333; padding-top: 1.5mm; width: 70mm; font-size: 12px; }
    </style></head><body>${tarjetas}</body></html>`;
    const marco = document.createElement("iframe");
    marco.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    marco.onload = () => {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
      setTimeout(() => marco.remove(), 60_000);
    };
    marco.srcdoc = html;
    document.body.appendChild(marco);
  };
  // Pagos para amarrar a mano un comprobante: solo los de su monto y moneda, y
  // solo si ese monto se repite en el estado de cuenta (si es unico, el cruce ya
  // lo amarro). Van los libres y el que ya tiene (elegirlo confirma el que propuso el panel).
  // `montoRepetido` lo cuenta el servidor: ve tambien los pagos que tomaron otras sedes.
  const opcionesPago = (c: Comprobante) => {
    const mismo = (p: PagoBinance) => p.moneda === c.moneda && Math.abs(p.monto - c.monto) < 1e-6;
    // Uno amarrado antes a mano sigue en la lista, para poder soltarlo.
    const actual = c.estado === "manual" && c.binance ? [c.binance] : [];
    if (!c.montoRepetido) return actual;
    const libres = sinComprobante.filter(mismo);
    return [...libres, ...(c.binance && (mismo(c.binance) || actual.length) ? [c.binance] : [])].sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );
  };
  // El estado de cuenta no trae ID de orden: su id es interno y no se muestra.
  const idBinance = (id?: string) => (datos?.origen === "estado" || !id ? "" : id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bitcoin className="h-7 w-7 text-amber-500" />
            Conciliación Binance
          </h1>
          <p className="text-gray-500 text-sm">
            Sube el estado de cuenta y los comprobantes de la semana; el panel los cruza por monto, moneda y hora
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {/* Lo arma el servidor: el Excel lleva la imagen de cada comprobante y su línea del estado de cuenta. */}
          {datos && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <a href={`/api/administracion/binance/excel?semana=${semana}`}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </a>
            </Button>
          )}
        </div>
      </div>

      {(subidas.length > 0 || ignorados > 0) && (
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            {/* Con una carpeta de cientos de archivos la lista entera no se lee: arriba el
                resumen y los que fallaron; los que entraron, plegados. */}
            <p className="font-medium text-gray-700">
              {subiendo ? `Subiendo ${subiendo.hecho} de ${subiendo.total}…` : "Subida terminada"} ·{" "}
              <span className="text-emerald-700">{subidas.filter((s) => s.ok).length} cargados</span> ·{" "}
              <span className="text-red-700">{subidas.filter((s) => !s.ok).length} con error</span>
              {ignorados > 0 && (
                <span className="text-gray-500"> · {ignorados} ignorados (no son fotos ni PDF)</span>
              )}
            </p>
            {subidas
              .filter((s) => !s.ok)
              .map((s, i) => (
                <p key={i} className="text-red-700">
                  ✗ <span className="font-medium">{s.nombre}</span>: {s.texto}
                </p>
              ))}
            {subidas.some((s) => s.ok) && (
              <details>
                <summary className="cursor-pointer text-emerald-700">Ver los cargados</summary>
                <div className="mt-1 space-y-1 max-h-64 overflow-y-auto">
                  {subidas
                    .filter((s) => s.ok)
                    .map((s, i) => (
                      <p key={i} className="text-emerald-700">
                        ✓ <span className="font-medium">{s.nombre}</span>: {s.texto}
                      </p>
                    ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {datos?.errorBinance && (
        <Aviso>
          Esta semana no tiene estado de cuenta: súbelo con «Subir estado de cuenta» (capturas o PDF de los movimientos
          de Binance Pay) para conciliar. La consulta directa a Binance tampoco respondió ({datos.errorBinance}).
        </Aviso>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf,.zip,application/zip"
        className="hidden"
        onChange={(e) => subir(e.target.files, "comprobante")}
      />
      <input
        ref={inputEstado}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => subir(e.target.files, "estado")}
      />
      <input
        ref={carpeta}
        type="file"
        multiple
        {...ELEGIR_CARPETA}
        className="hidden"
        onChange={(e) => subir(e.target.files, "comprobante")}
      />
      <input
        ref={carpetaEstado}
        type="file"
        multiple
        {...ELEGIR_CARPETA}
        className="hidden"
        onChange={(e) => subir(e.target.files, "estado")}
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
                  <Tarjeta tono={tono} titulo={TITULO_LISTA[clave]} valor={items.length} detalle={porMoneda(items)} />
                </button>
              ))}
            </div>

            <Dialog
              open={lista !== null}
              onOpenChange={(abierto) => {
                if (!abierto) {
                  setLista(null);
                  setVerImagen(null);
                }
              }}
            >
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{verImagen ? `Comprobante ${verImagen.orderId}` : lista && TITULO_LISTA[lista]}</DialogTitle>
                </DialogHeader>
                {verImagen ? (
                  <div className="space-y-3">
                    <Button variant="outline" size="sm" onClick={() => setVerImagen(null)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Volver a la lista
                    </Button>
                    <p className="text-sm text-gray-600">
                      {fechaComprobante(verImagen)} · {cifra(verImagen.monto)} {verImagen.moneda} ·{" "}
                      {ETIQUETA_ESTADO[verImagen.estado]}
                    </p>
                    {/\.pdf$/i.test(verImagen.archivoNombre || "") ? (
                      <iframe
                        src={`/api/administracion/binance/imagen?id=${verImagen.id}`}
                        title={`Comprobante ${verImagen.orderId}`}
                        className="w-full h-[70vh] border rounded-lg"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/administracion/binance/imagen?id=${verImagen.id}`}
                        alt={`Comprobante ${verImagen.orderId}`}
                        className="mx-auto max-h-[70vh] rounded-lg border"
                      />
                    )}
                  </div>
                ) : lista === "sinComprobante" ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Pagador</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sinComprobante.length === 0 && <FilaVacia columnas={3} texto="Todo lo recibido tiene comprobante." />}
                      {sinComprobante.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">{fechaHora(p.fecha)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {cifra(p.monto)} {p.moneda}
                          </TableCell>
                          <TableCell>{p.pagador || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  lista && (
                    <>
                      {lista === "conciliados" && conciliados.length > 0 && (
                        <Button size="sm" className="h-9 w-fit" onClick={imprimirConciliados}>
                          <Printer className="h-4 w-4 mr-2" />
                          Imprimir conciliados
                        </Button>
                      )}
                      <p className="text-xs text-gray-500">Haz clic en un comprobante para ver su imagen.</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>ID de orden</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Pagador</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {COMPROBANTES_LISTA[lista].length === 0 && (
                            <FilaVacia columnas={5} texto="No hay comprobantes aquí." />
                          )}
                          {COMPROBANTES_LISTA[lista].map((c) => (
                            <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setVerImagen(c)}>
                              <TableCell className="whitespace-nowrap">{fechaComprobante(c)}</TableCell>
                              <TableCell className="font-mono text-xs text-blue-600">{c.orderId}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {cifra(c.monto)} {c.moneda}
                              </TableCell>
                              <TableCell>{c.binance?.pagador || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`border-0 ${CLASE_ESTADO[c.estado]}`}>
                                  {ETIQUETA_ESTADO[c.estado]}
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

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Comprobantes de la semana</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="h-9"
                    disabled={!!subiendo}
                    onClick={() => input.current?.click()}
                    title="Fotos, PDF o el .zip de la carpeta descargada de Google Drive"
                  >
                    {subiendo?.tipo === "comprobante" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {subiendo?.tipo === "comprobante"
                      ? `Leyendo ${subiendo.hecho} de ${subiendo.total}`
                      : "Subir comprobantes"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!!subiendo}
                    onClick={() => carpeta.current?.click()}
                    title="Elegir una carpeta y subir todas sus fotos y PDF"
                  >
                    <FolderUp className="h-4 w-4 mr-2" />
                    Carpeta
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {drive?.configurado && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                    {drive.conectado ? (
                      <>
                        <input
                          value={enlace}
                          onChange={(e) => setEnlace(e.target.value)}
                          placeholder="Pega el enlace de la carpeta de Google Drive"
                          aria-label="Enlace de la carpeta de Google Drive"
                          className="border rounded-lg px-3 py-2 text-sm bg-white flex-1 min-w-0"
                        />
                        <Button
                          size="sm"
                          className="h-9"
                          disabled={!enlace.trim() || leyendoDrive || !!subiendo}
                          onClick={leerDrive}
                          title={drive.correo ? `Se lee con la cuenta ${drive.correo}` : undefined}
                        >
                          {leyendoDrive ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                          Leer carpeta de Drive
                        </Button>
                      </>
                    ) : (
                      <Button asChild size="sm" variant="outline" className="h-9">
                        <a href="/api/administracion/binance/drive">
                          <Link2 className="h-4 w-4 mr-2" />
                          Conectar Google Drive
                        </a>
                      </Button>
                    )}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>ID de orden</TableHead>
                      <TableHead className="text-right">Comprobante</TableHead>
                      <TableHead className="text-right">Binance</TableHead>
                      <TableHead>Pagador</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprobantes.length === 0 && <FilaVacia columnas={8} texto="No hay comprobantes en esta semana." />}
                    {deLaPagina(comprobantes, paginaComprobantes).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{fechaComprobante(c)}</TableCell>
                        <TableCell>{c.cliente || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <a
                            href={`/api/administracion/binance/imagen?id=${c.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {c.orderId}
                          </a>
                          {c.estado === "por_monto_hora" && c.binance && (
                            <span className="block text-amber-700">
                              {idBinance(c.binance.id) ? `Binance: ${c.binance.id}` : "Sin hora en el comprobante"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {cifra(c.monto)} {c.moneda}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {c.binance ? `${cifra(c.binance.monto)} ${c.binance.moneda}` : "—"}
                        </TableCell>
                        <TableCell>{c.binance?.pagador || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border-0 ${CLASE_ESTADO[c.estado]}`}>
                            {ETIQUETA_ESTADO[c.estado]}
                          </Badge>
                          {c.estado === "nombre_distinto" && c.binance && /^e\d+$/.test(c.binance.id) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-1 h-7 text-xs block"
                              onClick={() => {
                                if (confirm(`¿El pago de ${c.binance!.pagador} es de ${c.cliente}? Queda conciliado.`))
                                  asignar(c, c.binance!.id.slice(1), true);
                              }}
                            >
                              Aprobar
                            </Button>
                          )}
                          {datos.origen === "estado" && c.estado !== "conciliado" && opcionesPago(c).length > 0 && (
                            <select
                              value={c.estado === "manual" ? String(c.movimientoId) : ""}
                              onChange={(e) => asignar(c, e.target.value)}
                              className="mt-1 block w-full max-w-[260px] border rounded-md px-2 py-1 text-xs bg-white"
                              aria-label="Amarrar a un pago del estado de cuenta"
                            >
                              <option value="">
                                {c.estado === "manual" ? "Soltar" : "Amarrar a un pago…"}
                              </option>
                              {opcionesPago(c).map((p) => (
                                <option key={p.id} value={p.id.slice(1)}>
                                  {fechaHora(p.fecha)} · {cifra(p.monto)} {p.moneda} · {p.pagador || "—"}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => eliminar(c)} aria-label="Quitar comprobante">
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
                    {datos.origen === "estado"
                      ? `Estado de cuenta cargado: ${datos.movimientos} pagos recibidos en la semana.`
                      : "Esta semana todavía no tiene estado de cuenta."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* El estado de cuenta es de las tres sedes: cada una borra solo lo que subió ella. */}
                  {datos.borrables > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-gray-500"
                      disabled={!!subiendo}
                      onClick={borrarEstado}
                      title={
                        datos.borrables < datos.movimientos
                          ? "Solo se borran los pagos que subió esta sede; los de otras sedes se quedan"
                          : undefined
                      }
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {datos.borrables < datos.movimientos
                        ? `Borrar lo que subió esta sede (${datos.borrables})`
                        : "Borrar y volver a subir"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!!subiendo}
                    onClick={() => inputEstado.current?.click()}
                  >
                    {subiendo?.tipo === "estado" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                    )}
                    {subiendo?.tipo === "estado"
                      ? `Leyendo ${subiendo.hecho} de ${subiendo.total}`
                      : "Subir estado de cuenta"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!!subiendo}
                    onClick={() => carpetaEstado.current?.click()}
                    title="Elegir una carpeta y subir todas sus capturas y PDF"
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
                      <TableHead>ID de orden</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Pagador</TableHead>
                      <TableHead>Comprobante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosSemana.length === 0 && <FilaVacia columnas={5} texto="No hay pagos recibidos en esta semana." />}
                    {deLaPagina(pagosSemana, paginaPagos).map((p) => {
                      const c = p.comprobante;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">{fechaHora(p.fecha)}</TableCell>
                          <TableCell className="font-mono text-xs">{idBinance(p.id) || "—"}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {cifra(p.monto)} {p.moneda}
                          </TableCell>
                          <TableCell>{p.pagador || "—"}</TableCell>
                          <TableCell>
                            {!c ? (
                              <Badge variant="outline" className="border-0 bg-slate-100 text-slate-700">
                                Sin comprobante
                              </Badge>
                            ) : "otraSede" in c ? (
                              <Badge variant="outline" className="border-0 bg-slate-100 text-slate-700">
                                Comprobante de otra sede
                              </Badge>
                            ) : (
                              <>
                                <Badge variant="outline" className={`border-0 ${CLASE_ESTADO[c.estado]}`}>
                                  {ETIQUETA_ESTADO[c.estado]}
                                </Badge>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                  {c.cliente || "sin cliente"} · {c.orderId}
                                </span>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <Paginacion pagina={paginaPagos} total={pagosSemana.length} cambiar={setPaginaPagos} />
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
