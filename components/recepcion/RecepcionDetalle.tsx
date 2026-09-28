"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Timer,
  Container,
  Download,
  ScanBarcode,
  Search,
  X,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Truck,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";
import {
  SUCURSALES,
  esEtapa,
  evaluarConteo,
  compararPrecintos,
  MAX_PRECINTOS,
  TIPOS_DANO,
  duracion,
  formatearDuracion,
  inicioRecepcion,
  separarPrecintos,
  type Contenedor,
  type Etapa,
  type TipoDano,
} from "@/lib/recepcion/flujo";
import { useRecepcionEnVivo } from "@/lib/recepcion/useRecepcionEnVivo";
import * as XLSX from "xlsx";
import Pistola, { type ResultadoEscaneo } from "@/components/escaneo/Pistola";
import {
  PageHeader,
  Card,
  SectionTitle,
  BotonPrimario,
  BotonSecundario,
  inputClases,
  labelClases,
} from "@/components/seguridad/mercancia-ui";
import FotoCaptura, { type ArchivoRecepcion } from "./FotoCaptura";

/**
 * Detalle de una recepcion por packing list.
 *
 * El packing list puede venir en varios contenedores que llegan en dias
 * distintos. Almacen recibe cada uno por su cuenta (fotos + precinto al
 * llegar, foto de como quedo al terminar de descargarlo); el conteo contra el
 * packing list es uno solo y se va llenando con cada contenedor; y el packing
 * list se cierra cuando llegaron y se descargaron todos. Compras lo sigue en
 * vivo y puede corregirlo o anularlo mientras no haya llegado ninguno.
 */

type Recepcion = {
  id: number;
  cids: number;
  proveedor: string;
  referencia: string;
  oc_referencia: string | null;
  fecha_estimada: string | null;
  observaciones: string | null;
  etapa: Etapa;
  creado_por: string;
  created_at: string;
  cerrado_at: string | null;
  cerrado_por: string | null;
  resultado: "conforme" | "con_novedades" | null;
  notas_cierre: string | null;
};

type Item = {
  id: number;
  codigo: string | null;
  producto: string;
  cantidad_esperada: string | number;
  cajas_esperadas: number | null;
  cantidad_recibida: string | number | null;
  motivo_diferencia: string | null;
  golpeado: number;
  /** En que estado llego la caja (danada, humeda y/o abierta) y cuantas unidades. */
  danos: Array<{ tipo: TipoDano; cantidad: number | null }>;
  golpeado_nota: string | null;
  /** En Odoo lleva numero de serie: se cuenta pistoleando cada serial. */
  lleva_serial: boolean;
  seriales: SerialItem[];
};

type SerialItem = { id: number; item_id: number; serial: string; escaneado_por: string | null; created_at: string };

/** Cada dano marcado con la cantidad tal como se escribe en el campo. */
type DanoForm = { tipo: TipoDano; cantidad: string };
type Conteo = { recibida: string; motivo: string; danos: DanoForm[]; nota: string };

const danosANumero = (danos: DanoForm[] = []) =>
  danos.map((d) => ({ tipo: d.tipo, cantidad: d.cantidad.trim() === "" ? null : Number(d.cantidad) }));

function hora(valor: string | null): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function RecepcionDetalle({ base, id }: { base: string; id: string }) {
  const t = useTranslations("recepcion");
  const router = useRouter();
  const { user } = useAuthStore();
  const rol = (user?.role || "").toLowerCase().trim();
  const esAlmacen = rol === "almacen" || rol === "superadmin";
  const esCompras = rol === "compras" || rol === "superadmin";

  const [rec, setRec] = useState<Recepcion | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [contenedores, setContenedores] = useState<Contenedor[]>([]);
  const [archivos, setArchivos] = useState<ArchivoRecepcion[]>([]);
  const [conteo, setConteo] = useState<Record<number, Conteo>>({});
  // Por contenedor: el precinto que se lee al llegar y la nota al terminarlo.
  const [precintos, setPrecintos] = useState<Record<number, string[]>>({});
  const [notasCont, setNotasCont] = useState<Record<number, string>>({});
  const [notas, setNotas] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [anulada, setAnulada] = useState(false);
  // Correccion de precintos ya anotados (ej. un error de tipeo): contenedor
  // que se esta corrigiendo, los precintos correctos y el motivo.
  const [corrigiendo, setCorrigiendo] = useState<number | null>(null);
  // Pistola: producto con serial seleccionado y renglones con la lista de seriales abierta.
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [verSeriales, setVerSeriales] = useState<Record<number, boolean>>({});
  // El ultimo renglon contado se ilumina unos segundos y se trae a la vista,
  // para ver que producto sumo cada lectura de la pistola.
  const [ultimo, setUltimo] = useState<number | null>(null);
  const timerUltimo = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Buscar un producto por nombre o codigo (cajas que solo traen el nombre:
  // se busca y se escribe la cantidad total en su campo).
  const [filtro, setFiltro] = useState("");
  // Hora de referencia para el tiempo que lleva abierto (se mueve cada minuto).
  const [ahora, setAhora] = useState(() => new Date());
  const [correccion, setCorreccion] = useState({ precintos: "", motivo: "" });

  const abierto = rec !== null && rec.etapa !== "cerrado";
  useEffect(() => {
    if (!abierto) return;
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, [abierto]);

  const aplicar = useCallback((j: any, conConteo: boolean) => {
    setRec(j.recepcion);
    setItems(j.items || []);
    setContenedores(j.contenedores || []);
    setArchivos(j.archivos || []);
    if (conConteo) {
      const c: Record<number, Conteo> = {};
      for (const i of j.items || []) {
        c[i.id] = {
          recibida: i.cantidad_recibida === null ? "" : String(Number(i.cantidad_recibida)),
          motivo: i.motivo_diferencia || "",
          danos: (Array.isArray(i.danos) ? i.danos : []).map((d: any) => ({
            tipo: d.tipo,
            cantidad: d.cantidad === null || d.cantidad === undefined ? "" : String(d.cantidad),
          })),
          nota: i.golpeado_nota || "",
        };
      }
      setConteo(c);
    }
  }, []);

  const cargar = useCallback(
    async (conConteo = true) => {
      try {
        const res = await fetch(`/api/recepcion/${id}`);
        if (res.status === 404) {
          setAnulada(true);
          return;
        }
        if (!res.ok) return;
        aplicar(await res.json(), conConteo);
      } finally {
        setCargando(false);
      }
    },
    [id, aplicar],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // En vivo: llegada o cierre de un contenedor, cierre, edicion o anulacion.
  // Sin pisar el conteo en curso: la llegada de otro contenedor no cambia lo
  // que se lleva contado.
  useRecepcionEnVivo((a) => {
    if (a.id !== Number(id)) return;
    if (a.accion === "eliminado") setAnulada(true);
    else void cargar(a.accion !== "llegada" && a.accion !== "contenedor_cerrado");
  });

  // Tras subir/quitar una foto se recarga sin pisar lo que se esta contando.
  const recargarArchivos = () => void cargar(false);

  // Guardado automatico del conteo: en el almacen el telefono se bloquea, se
  // recarga la pagina o se cae la senal a mitad de un contenedor, y perder
  // lo contado obliga a empezar de nuevo. Se guarda solo 1,5 s despues de la
  // ultima tecla; "Guardar avance" queda para quien quiera asegurarse.
  const [editado, setEditado] = useState(0);
  const [autoguardado, setAutoguardado] = useState<"guardando" | "guardado" | null>(null);
  useEffect(() => {
    if (!editado || rec?.etapa !== "descargando") return;
    const timer = setTimeout(async () => {
      setAutoguardado("guardando");
      try {
        const res = await fetch(`/api/recepcion/${id}/etapa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "guardar_conteo", items: cuerpoConteo() }),
        });
        setAutoguardado(res.ok ? "guardado" : null);
      } catch {
        setAutoguardado(null);
      }
    }, 1500);
    return () => clearTimeout(timer);
    // cuerpoConteo lee `conteo`, que cambia junto con `editado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editado]);

  // Cada lectura de la pistola ya quedo guardada en el servidor: aca solo se
  // refleja en pantalla (sin disparar el guardado automatico).
  const marcar = (itemId: number) => {
    setUltimo(itemId);
    if (timerUltimo.current) clearTimeout(timerUltimo.current);
    timerUltimo.current = setTimeout(() => setUltimo(null), 3500);
    // Se trae a la vista sin quitarle el foco al campo de la pistola.
    setTimeout(() => {
      document.getElementById(`renglon-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const alEscanear = (r: ResultadoEscaneo) => {
    // Si habia una busqueda escrita, se limpia: el renglon leido tiene que verse.
    setFiltro("");
    marcar(r.item_id);
    if (r.resultado === "seleccionado") {
      setSeleccionado(r.item_id);
      return;
    }
    setConteo((prev) => ({
      ...prev,
      [r.item_id]: { ...(prev[r.item_id] || { recibida: "", motivo: "", danos: [], nota: "" }), recibida: String(r.cantidad) },
    }));
    if (r.resultado === "serial") {
      setItems((prev) =>
        prev.map((i) => (i.id === r.item_id ? { ...i, seriales: [...(i.seriales || []), r.serial] } : i)),
      );
    }
  };

  const quitarSerial = async (itemId: number, serialId: number) => {
    setError(null);
    const res = await fetch(`/api/recepcion/${id}/seriales/${serialId}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || t("error"));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, seriales: (i.seriales || []).filter((x) => x.id !== serialId) } : i)),
    );
    setConteo((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { recibida: "", motivo: "", danos: [], nota: "" }), recibida: j.cantidad ? String(j.cantidad) : "" },
    }));
  };

  // Los seriales en Excel, como los llevaban hasta ahora.
  const descargarSeriales = () => {
    if (!rec) return;
    const filas = items.flatMap((i) =>
      (i.seriales || []).map((x) => ({
        Codigo: i.codigo || "",
        Producto: i.producto,
        Serial: x.serial,
        "Pistoleado por": x.escaneado_por || "",
        Fecha: x.created_at ? new Date(x.created_at).toLocaleString("es-VE") : "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Seriales");
    XLSX.writeFile(wb, `Seriales_${rec.referencia}.xlsx`);
  };

  const corregirPrecintos = async (contenedorId: number) => {
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/recepcion/${id}/contenedores/${contenedorId}/precintos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          precintos_recibidos: separarPrecintos(correccion.precintos),
          motivo: correccion.motivo,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setAviso(j.error || t("conflicto"));
        await cargar();
        return;
      }
      if (!res.ok) throw new Error(j.error || t("error"));
      // Sin tocar el conteo que se este llenando: solo cambia el contenedor.
      aplicar(j, false);
      setCorrigiendo(null);
      setAviso(t("precinto_corregido"));
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setEnviando(false);
    }
  };

  const accionar = async (
    accion: string,
    extra: Record<string, unknown> = {},
    conConteo = true,
  ) => {
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/recepcion/${id}/etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setAviso(t("conflicto"));
        await cargar();
        return;
      }
      if (!res.ok) throw new Error(j.error || t("error"));
      aplicar(j, conConteo);
      if (accion === "guardar_conteo") setAviso(t("avance_guardado"));
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setEnviando(false);
    }
  };

  const cuerpoConteo = () =>
    items.map((i) => {
      const c = conteo[i.id];
      return {
        id: i.id,
        cantidad_recibida: c?.recibida === "" || c?.recibida === undefined ? null : Number(c.recibida),
        motivo_diferencia: c?.motivo || null,
        danos: danosANumero(c?.danos),
        golpeado_nota: c?.danos?.length ? c.nota || null : null,
      };
    });

  const anular = async () => {
    if (!window.confirm(t("anular_confirmar"))) return;
    const res = await fetch(`/api/recepcion/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || t("error"));
      return;
    }
    router.push(base);
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-300">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (anulada || !rec || !esEtapa(rec.etapa)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm px-4 text-center">
        {t("vacio_filtro")}
      </div>
    );
  }

  const fotos = (tipo: string, filtro: { itemId?: number; contenedorId?: number } = {}) =>
    archivos.filter(
      (a) =>
        a.tipo === tipo &&
        (filtro.itemId === undefined || Number(a.item_id) === filtro.itemId) &&
        (filtro.contenedorId === undefined || Number(a.contenedor_id) === filtro.contenedorId),
    );
  const packing = archivos.filter((a) => a.tipo === "packing_list");

  const trabajando = esAlmacen && rec.etapa !== "cerrado";
  const contando = esAlmacen && rec.etapa === "descargando";
  const sucursal = SUCURSALES.find((s) => s.cids === Number(rec.cids))?.nombre;
  const llegados = contenedores.filter((c) => c.etapa !== "por_llegar").length;
  const abiertos = contenedores.filter((c) => c.etapa !== "cerrado");

  // Lo que falta para cerrar, calculado en pantalla (la API lo vuelve a validar).
  const fotosGolpe = new Set(archivos.filter((a) => a.tipo === "foto_golpe").map((a) => Number(a.item_id)));
  const ev = evaluarConteo(
    items.map((i) => ({
      id: i.id,
      cantidad_esperada: Number(i.cantidad_esperada),
      cantidad_recibida:
        conteo[i.id]?.recibida === "" || conteo[i.id]?.recibida === undefined ? null : Number(conteo[i.id].recibida),
      motivo_diferencia: conteo[i.id]?.motivo || null,
      golpeado: (conteo[i.id]?.danos?.length ?? 0) > 0,
      danos: danosANumero(conteo[i.id]?.danos),
    })),
    fotosGolpe,
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Container}
        titulo={rec.referencia}
        subtitulo={[rec.proveedor, sucursal].filter(Boolean).join(" · ")}
        volverA={base}
        accion={
          esCompras && rec.etapa === "por_llegar" ? (
            <div className="flex gap-2">
              <BotonSecundario href={`${base}/${id}/editar`} icon={Pencil}>
                <span className="hidden sm:inline">{t("editar")}</span>
              </BotonSecundario>
              <BotonSecundario onClick={() => void anular()} icon={Trash2}>
                <span className="hidden sm:inline">{t("anular")}</span>
              </BotonSecundario>
            </div>
          ) : undefined
        }
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-32">
        <Estado rec={rec} trabajando={trabajando} llegados={llegados} total={contenedores.length} t={t} />

        {aviso && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{aviso}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            {/* Datos del packing list */}
            <Card>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Dato etiqueta={t("proveedor")} valor={rec.proveedor} />
                <Dato etiqueta={t("fecha_estimada")} valor={rec.fecha_estimada ? fechaCorta(rec.fecha_estimada) : null} />
                <Dato etiqueta={t("oc")} valor={rec.oc_referencia} />
                <Dato etiqueta={t("contenedores")} valor={String(contenedores.length)} />
              </dl>
              {rec.observaciones && (
                <p className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600 whitespace-pre-line">
                  {rec.observaciones}
                </p>
              )}
              {packing.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {packing.map((a) => {
                    const Icono = a.mime.includes("sheet") || a.mime.includes("excel") ? FileSpreadsheet : FileText;
                    return (
                      <a
                        key={a.id}
                        href={`/api/recepcion/${id}/archivos/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-violet-50 text-xs font-medium text-violet-700 hover:underline"
                      >
                        <Icono className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[14rem]">{a.nombre || t("archivos_pl")}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Contenedores: cada uno con su llegada y su cierre */}
            <Card className="space-y-3">
              <SectionTitle>
                {t("contenedores")} · {t("contenedores_recibidos", { llegados, total: contenedores.length })}
              </SectionTitle>
              {contenedores.map((c) => {
                const enLlegada = esAlmacen && c.etapa === "por_llegar";
                const descargandolo = esAlmacen && c.etapa === "descargando";
                const fotosLlegada = fotos("foto_llegada", { contenedorId: c.id });
                const fotosPrecinto = fotos("foto_precinto", { contenedorId: c.id });
                const fotosCierre = fotos("foto_cierre", { contenedorId: c.id });
                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border p-4 space-y-4 ${
                      enLlegada || descargandolo ? "border-violet-200 bg-violet-50/30" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-slate-900">{c.numero}</span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          c.etapa === "cerrado"
                            ? "bg-emerald-50 text-emerald-700"
                            : c.etapa === "descargando"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {t(`etapa_contenedor.${c.etapa}`)}
                      </span>
                      {c.llegada_at && (
                        <span className="text-[11px] text-slate-400">
                          {t("llego")} {hora(c.llegada_at)} · {c.llegada_por}
                        </span>
                      )}
                      {(() => {
                        // Desde su foto de llegada hasta que se termina el contenedor.
                        const ms = duracion(
                          inicioRecepcion(archivos, c.id),
                          c.etapa === "cerrado" ? c.cerrado_at : null,
                          ahora,
                        );
                        if (ms === null) return null;
                        return (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 tabular-nums"
                            title={t("tiempo_contenedor_ayuda")}
                          >
                            <Timer className="w-3 h-3" />
                            {c.etapa === "cerrado"
                              ? formatearDuracion(ms)
                              : t("tiempo_lleva", { tiempo: formatearDuracion(ms) })}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Precintos (puede haber varios). Los esperados no se le
                        muestran a Almacen antes de que lea los suyos: si los tiene
                        en pantalla, tiende a "ver" esos. */}
                    {(esCompras || c.etapa !== "por_llegar") && c.precintos_esperados.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {t("precintos_esperados")}:{" "}
                        <span className="font-medium text-slate-700">{c.precintos_esperados.join(", ")}</span>
                      </p>
                    )}
                    {c.precintos_recibidos.length > 0 && (() => {
                      const cmp = compararPrecintos(c.precintos_esperados, c.precintos_recibidos);
                      return (
                        <div className="text-xs text-slate-500 space-y-0.5">
                          <p>
                            {t("precintos_recibidos")}:{" "}
                            <span className="font-medium text-slate-700">{c.precintos_recibidos.join(", ")}</span>
                            {cmp.coincide === true && (
                              <span className="font-semibold text-emerald-600"> · {t("precinto_coincide")}</span>
                            )}
                          </p>
                          {cmp.faltan.length > 0 && (
                            <p className="font-semibold text-red-600">
                              {t("precinto_faltan", { lista: cmp.faltan.join(", ") })}
                            </p>
                          )}
                          {cmp.sobran.length > 0 && (
                            <p className="font-semibold text-red-600">
                              {t("precinto_sobran", { lista: cmp.sobran.join(", ") })}
                            </p>
                          )}

                          {/* Correcciones anteriores: quedan a la vista, no se pisan. */}
                          {(c.precintos_correcciones || []).map((k, n) => (
                            <p key={n} className="text-[11px] text-amber-800 bg-amber-50 rounded-md px-2 py-1">
                              {t("correccion_linea", {
                                por: k.por,
                                fecha: hora(k.at) || "",
                                antes: k.antes.join(", ") || "—",
                                despues: k.despues.join(", "),
                                motivo: k.motivo,
                              })}
                            </p>
                          ))}

                          {/* Corregir lo anotado (ej. un error de tipeo). Cerrado, ya no se modifica. */}
                          {esAlmacen && rec.etapa !== "cerrado" && corrigiendo !== c.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setCorrigiendo(c.id);
                                setCorreccion({ precintos: c.precintos_recibidos.join(", "), motivo: "" });
                              }}
                              className="text-[11px] font-semibold text-violet-700 hover:underline"
                            >
                              {t("corregir_precintos")}
                            </button>
                          )}
                          {esAlmacen && rec.etapa !== "cerrado" && corrigiendo === c.id && (
                            <div className="mt-2 space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                              <input
                                value={correccion.precintos}
                                onChange={(e) => setCorreccion((p) => ({ ...p, precintos: e.target.value }))}
                                placeholder={t("correccion_precintos_ph")}
                                aria-label={t("correccion_precintos_ph")}
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono uppercase focus:outline-none"
                              />
                              <input
                                value={correccion.motivo}
                                onChange={(e) => setCorreccion((p) => ({ ...p, motivo: e.target.value.slice(0, 300) }))}
                                placeholder={t("correccion_motivo_ph")}
                                aria-label={t("correccion_motivo_ph")}
                                className={`w-full h-10 px-3 rounded-lg border text-sm focus:outline-none ${
                                  correccion.motivo.trim().length >= 5 ? "border-slate-200" : "border-red-300 bg-red-50"
                                }`}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    enviando ||
                                    correccion.motivo.trim().length < 5 ||
                                    separarPrecintos(correccion.precintos).length === 0
                                  }
                                  onClick={() => void corregirPrecintos(c.id)}
                                  className="h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  {t("guardar_correccion")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCorrigiendo(null)}
                                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
                                >
                                  {t("cancelar_correccion")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {(enLlegada || c.etapa !== "por_llegar") && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FotoCaptura
                          recepcionId={rec.id}
                          tipo="foto_llegada"
                          contenedorId={c.id}
                          titulo={t("foto_llegada")}
                          fotos={fotosLlegada}
                          editable={enLlegada}
                          obligatoria
                          onCambio={recargarArchivos}
                        />
                        <FotoCaptura
                          recepcionId={rec.id}
                          tipo="foto_precinto"
                          contenedorId={c.id}
                          titulo={t("foto_precinto")}
                          fotos={fotosPrecinto}
                          editable={enLlegada}
                          obligatoria
                          onCambio={recargarArchivos}
                        />
                      </div>
                    )}

                    {enLlegada && (() => {
                      // Tantas casillas como precintos indica el packing list (al
                      // menos una): se muestra CUANTOS, no cuales, para que no se
                      // olvide ninguno sin condicionar la lectura.
                      const lista =
                        precintos[c.id] ??
                        Array.from({ length: Math.max(1, c.precintos_esperados.length) }, () => "");
                      const poner = (n: number, v: string) =>
                        setPrecintos((p) => ({
                          ...p,
                          [c.id]: lista.map((x, i) => (i === n ? v.slice(0, 50) : x)),
                        }));
                      const leidos = lista.map((x) => x.trim()).filter(Boolean);
                      return (
                        <>
                          <div className="space-y-2">
                            <label className={labelClases}>{t("precintos_leidos")} *</label>
                            {c.precintos_esperados.length > 0 && (
                              <p className="text-[11px] text-slate-400 -mt-1">
                                {t("precintos_indicados", { count: c.precintos_esperados.length })}
                              </p>
                            )}
                            {lista.map((v, n) => (
                              <div key={n} className="flex gap-2">
                                <input
                                  value={v}
                                  onChange={(e) => poner(n, e.target.value)}
                                  placeholder={t("precinto_leido_ph")}
                                  aria-label={`${t("precintos_leidos")} ${n + 1}`}
                                  className={inputClases}
                                />
                                {lista.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPrecintos((p) => ({ ...p, [c.id]: lista.filter((_, i) => i !== n) }))
                                    }
                                    aria-label={t("quitar")}
                                    className="w-11 h-11 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {lista.length < MAX_PRECINTOS && (
                              <button
                                type="button"
                                onClick={() => setPrecintos((p) => ({ ...p, [c.id]: [...lista, ""] }))}
                                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-80"
                              >
                                <Plus className="w-4 h-4" />
                                {t("agregar_precinto")}
                              </button>
                            )}
                          </div>
                          <BotonPrimario
                            onClick={() =>
                              void accionar(
                                "registrar_llegada",
                                { contenedor_id: c.id, precintos_recibidos: leidos },
                                // Llega otro contenedor a mitad del conteo: no se pisa lo contado.
                                false,
                              )
                            }
                            disabled={
                              enviando ||
                              leidos.length === 0 ||
                              fotosLlegada.length === 0 ||
                              fotosPrecinto.length === 0
                            }
                            icon={Truck}
                            className="w-full h-12"
                          >
                            {t("registrar_llegada_contenedor")}
                          </BotonPrimario>
                        </>
                      );
                    })()}

                    {/* Cierre del contenedor: foto de como quedo */}
                    {(descargandolo || c.etapa === "cerrado") && (
                      <div className="space-y-3 pt-3 border-t border-slate-100">
                        <FotoCaptura
                          recepcionId={rec.id}
                          tipo="foto_cierre"
                          contenedorId={c.id}
                          titulo={t("foto_cierre")}
                          fotos={fotosCierre}
                          editable={descargandolo}
                          obligatoria
                          onCambio={recargarArchivos}
                        />
                        {descargandolo ? (
                          <>
                            <input
                              value={notasCont[c.id] || ""}
                              onChange={(e) =>
                                setNotasCont((p) => ({ ...p, [c.id]: e.target.value.slice(0, 500) }))
                              }
                              placeholder={t("notas_contenedor")}
                              className={inputClases}
                            />
                            <BotonSecundario
                              onClick={() =>
                                void accionar(
                                  "cerrar_contenedor",
                                  { contenedor_id: c.id, notas_cierre: notasCont[c.id] || null },
                                  false,
                                )
                              }
                              disabled={enviando || fotosCierre.length === 0}
                              icon={CheckCircle2}
                              className="w-full"
                            >
                              {t("terminar_contenedor")}
                            </BotonSecundario>
                          </>
                        ) : (
                          c.notas_cierre && <p className="text-xs text-slate-600">{c.notas_cierre}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            {/* Conteo contra el packing list (uno solo para todos los contenedores) */}
            <Card className={contando ? "border-violet-200" : ""}>
              <SectionTitle>
                {t("conteo")} ({items.length})
              </SectionTitle>
              {contando && <p className="text-xs text-slate-500 -mt-1 mb-3">{t("conteo_ayuda")}</p>}
              {contando && (
                <Pistola
                  endpoint={`/api/recepcion/${rec.id}/escaneo`}
                  items={items.map((i) => ({
                    id: i.id,
                    codigo: i.codigo,
                    producto: i.producto,
                    lleva_serial: !!i.lleva_serial,
                    esperado: Number(i.cantidad_esperada),
                    recibido: i.lleva_serial ? (i.seriales || []).length : Number(conteo[i.id]?.recibida || 0),
                  }))}
                  seleccionado={seleccionado}
                  onResultado={alEscanear}
                  onTerminar={() => setSeleccionado(null)}
                />
              )}
              {items.some((i) => (i.seriales || []).length > 0) && (
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={descargarSeriales}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t("descargar_seriales", { count: items.reduce((n, i) => n + (i.seriales || []).length, 0) })}
                  </button>
                </div>
              )}

              {items.length > 3 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const q = filtro.trim().toLowerCase();
                      const primero = items.find(
                        (i) => !i.lleva_serial && `${i.producto} ${i.codigo || ""}`.toLowerCase().includes(q),
                      );
                      if (primero) {
                        const campo = document.getElementById(`cantidad-${primero.id}`) as HTMLInputElement | null;
                        campo?.focus();
                        campo?.select();
                      }
                    }}
                    placeholder={t("buscar_producto")}
                    aria-label={t("buscar_producto")}
                    className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                  {filtro && (
                    <button
                      type="button"
                      onClick={() => setFiltro("")}
                      aria-label={t("limpiar_busqueda")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_5rem_6rem] gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100">
                <span>{t("producto")}</span>
                <span className="text-right">{t("esperado")}</span>
                <span className="text-right">{t("recibido")}</span>
              </div>

              {filtro.trim() &&
                !items.some((i) =>
                  `${i.producto} ${i.codigo || ""}`.toLowerCase().includes(filtro.trim().toLowerCase()),
                ) && <p className="py-4 text-center text-sm text-slate-400">{t("sin_resultados")}</p>}
              {items
                .filter(
                  (i) =>
                    !filtro.trim() ||
                    `${i.producto} ${i.codigo || ""}`.toLowerCase().includes(filtro.trim().toLowerCase()),
                )
                .map((i) => {
                const c = conteo[i.id] || { recibida: "", motivo: "", danos: [], nota: "" };
                const conDano = c.danos.length > 0;
                const recibidaNum = c.recibida === "" ? null : Number(c.recibida);
                const esperado = Number(i.cantidad_esperada);
                const hayDif = c.recibida !== "" && Number(c.recibida) !== esperado;
                const set = (p: Partial<Conteo>) => {
                  setConteo((prev) => ({ ...prev, [i.id]: { ...c, ...p } }));
                  setEditado((n) => n + 1);
                };
                const esSeleccionado = seleccionado === i.id;
                const seriales = i.seriales || [];
                return (
                  <div
                    key={i.id}
                    id={`renglon-${i.id}`}
                    className={`py-3 border-b border-slate-50 last:border-0 transition-colors duration-500 ${
                      ultimo === i.id
                        ? "-mx-2 px-2 rounded-lg bg-emerald-50 ring-2 ring-emerald-400"
                        : esSeleccionado
                          ? "-mx-2 px-2 rounded-lg bg-violet-50 ring-1 ring-violet-300"
                          : ""
                    }`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_5rem_6rem] gap-x-2 items-center">
                      <div className="min-w-0">
                        {ultimo === i.id && (
                          <span className="inline-block mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                            {t("recien_contado")}
                          </span>
                        )}
                        <p className="text-sm text-slate-800 truncate">{i.producto}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {[i.codigo, i.cajas_esperadas !== null ? `${i.cajas_esperadas} ${t("cajas").toLowerCase()}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {i.lleva_serial && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">
                              {t("con_serial")}
                            </span>
                            {contando && (
                              <button
                                type="button"
                                onClick={() => setSeleccionado(esSeleccionado ? null : i.id)}
                                className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold ${
                                  esSeleccionado ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700 bg-white"
                                }`}
                              >
                                <ScanBarcode className="w-3.5 h-3.5" />
                                {esSeleccionado ? t("pistoleando") : t("pistolear_seriales")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-slate-700 text-right">{esperado}</span>
                      {contando && i.lleva_serial ? (
                        // Con serial: se cuenta pistoleando, no se escribe.
                        <span
                          title={t("cuenta_seriales")}
                          className={`w-full h-10 px-2 flex items-center justify-end rounded-lg border bg-slate-50 text-sm tabular-nums ${
                            hayDif ? "border-red-300 text-red-700 font-semibold" : "border-slate-200 text-slate-700"
                          }`}
                        >
                          {c.recibida === "" ? "—" : c.recibida}
                        </span>
                      ) : contando ? (
                        <input
                          id={`cantidad-${i.id}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={c.recibida}
                          onChange={(e) => set({ recibida: e.target.value })}
                          className={`w-full h-10 px-2 text-right rounded-lg border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-100 ${
                            hayDif ? "border-red-300 bg-red-50 text-red-700 font-semibold" : "border-slate-200"
                          }`}
                        />
                      ) : (
                        <span
                          className={`text-sm tabular-nums text-right ${
                            hayDif ? "font-semibold text-red-600" : c.recibida === "" ? "text-slate-300" : "text-slate-700"
                          }`}
                        >
                          {c.recibida === "" ? "—" : c.recibida}
                        </span>
                      )}
                    </div>

                    {i.lleva_serial && (seriales.length > 0 || contando) && (
                      <div className="mt-2 space-y-1">
                        <div className="flex flex-wrap items-center gap-3">
                          {seriales.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setVerSeriales((v) => ({ ...v, [i.id]: !v[i.id] }))}
                              className="text-[11px] font-semibold text-violet-700 hover:underline"
                            >
                              {verSeriales[i.id] ? t("ocultar_seriales") : t("ver_seriales", { count: seriales.length })}
                            </button>
                          )}
                          {/* Si no llego ninguno se anota 0 a mano (no hay que pistolear). */}
                          {contando && seriales.length === 0 && (
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                              <input
                                type="checkbox"
                                checked={c.recibida === "0"}
                                onChange={(e) => set({ recibida: e.target.checked ? "0" : "" })}
                                className="w-3.5 h-3.5 rounded border-slate-300"
                              />
                              {t("no_llego_ninguno")}
                            </label>
                          )}
                        </div>
                        {verSeriales[i.id] && (
                          <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                            {seriales.map((x) => (
                              <li key={x.id} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                                <span className="font-mono text-slate-700 flex-1 truncate">{x.serial}</span>
                                <span className="text-slate-400 truncate hidden sm:inline">{x.escaneado_por}</span>
                                {contando && (
                                  <button
                                    type="button"
                                    onClick={() => void quitarSerial(i.id, x.id)}
                                    aria-label={t("quitar_serial", { serial: x.serial })}
                                    className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-600"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Motivo de la diferencia: obligatorio si falta o sobra */}
                    {hayDif &&
                      (contando ? (
                        <input
                          value={c.motivo}
                          onChange={(e) => set({ motivo: e.target.value.slice(0, 300) })}
                          placeholder={t("motivo")}
                          className={`mt-2 w-full h-10 px-3 rounded-lg border text-sm focus:outline-none ${
                            c.motivo.trim() ? "border-slate-200" : "border-red-300 bg-red-50"
                          }`}
                        />
                      ) : (
                        <p className="mt-1.5 text-xs text-red-700">
                          <span className="font-semibold">
                            {Number(c.recibida) < esperado ? t("faltante") : t("sobrante")}:
                          </span>{" "}
                          {c.motivo || "—"}
                        </p>
                      ))}

                    {/* Estado de la caja: danada, humeda y/o abierta (pueden ir
                        juntas), con su nota y su foto. */}
                    {(contando || conDano) && (
                      <div className="mt-2 space-y-2">
                        {contando ? (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="text-xs font-medium text-slate-500">{t("dano_titulo")}</span>
                            {TIPOS_DANO.map((tipo) => {
                              const marcado = c.danos.find((d) => d.tipo === tipo);
                              const cant = marcado && marcado.cantidad.trim() !== "" ? Number(marcado.cantidad) : null;
                              // Cuantas unidades tienen ese dano: no siempre es todo el renglon.
                              const cantMal =
                                !!marcado &&
                                (cant === null ||
                                  !Number.isInteger(cant) ||
                                  cant < 1 ||
                                  (recibidaNum !== null && cant > recibidaNum));
                              return (
                                <span key={tipo} className="inline-flex items-center gap-1.5">
                                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 select-none cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!marcado}
                                      onChange={(e) =>
                                        set({
                                          danos: e.target.checked
                                            ? [...c.danos, { tipo, cantidad: "" }]
                                            : c.danos.filter((d) => d.tipo !== tipo),
                                        })
                                      }
                                      className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                                    />
                                    {t(`dano_${tipo}`)}
                                  </label>
                                  {marcado && (
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={1}
                                      step={1}
                                      value={marcado.cantidad}
                                      placeholder={t("dano_cantidad_ph")}
                                      title={t("dano_cantidad_title")}
                                      aria-label={`${t(`dano_${tipo}`)}: ${t("dano_cantidad_title")}`}
                                      onChange={(e) =>
                                        set({
                                          danos: c.danos.map((d) =>
                                            d.tipo === tipo ? { ...d, cantidad: e.target.value } : d,
                                          ),
                                        })
                                      }
                                      className={`w-16 h-8 px-2 text-right rounded-lg border text-xs tabular-nums focus:outline-none ${
                                        cantMal ? "border-red-300 bg-red-50" : "border-slate-200"
                                      }`}
                                    />
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs font-medium text-amber-800">
                            {t("dano_titulo")}:{" "}
                            {c.danos
                              .map((d) => (d.cantidad.trim() === "" ? t(`dano_${d.tipo}`) : `${t(`dano_${d.tipo}`)} (${d.cantidad})`))
                              .join(", ")}
                          </p>
                        )}
                        {conDano && (
                          <div className="pl-5 space-y-2">
                            {contando ? (
                              <input
                                value={c.nota}
                                onChange={(e) => set({ nota: e.target.value.slice(0, 300) })}
                                placeholder={t("golpeado_nota")}
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none"
                              />
                            ) : (
                              c.nota && <p className="text-xs text-amber-800">{c.nota}</p>
                            )}
                            <FotoCaptura
                              recepcionId={rec.id}
                              tipo="foto_golpe"
                              itemId={i.id}
                              titulo={t("foto_golpe")}
                              fotos={fotos("foto_golpe", { itemId: i.id })}
                              editable={contando}
                              obligatoria
                              onCambio={recargarArchivos}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {contando && (
                <>
                  <BotonSecundario
                    onClick={() => void accionar("guardar_conteo", { items: cuerpoConteo() })}
                    disabled={enviando}
                    icon={Save}
                    className="w-full mt-3"
                  >
                    {t("guardar_avance")}
                  </BotonSecundario>
                  {autoguardado && (
                    <p className="mt-1.5 text-center text-[11px] text-slate-400">
                      {autoguardado === "guardando" ? t("autoguardando") : t("autoguardado")}
                    </p>
                  )}
                </>
              )}
            </Card>

            {/* Cierre del packing list: cuando llegaron y se descargaron todos */}
            {(contando || rec.etapa === "cerrado") && (
              <Card className={contando ? "border-violet-200 space-y-4" : "space-y-4"}>
                <SectionTitle>{t("cierre")}</SectionTitle>
                {contando ? (
                  <>
                    <div>
                      <label className={labelClases}>{t("notas_cierre")}</label>
                      <textarea
                        value={notas}
                        onChange={(e) => setNotas(e.target.value.slice(0, 5000))}
                        className={`${inputClases} h-auto min-h-[72px] py-2.5`}
                      />
                    </div>
                    {(!ev.listo || abiertos.length > 0) && (
                      <div className="text-xs text-slate-500">
                        <p className="font-semibold">{t("faltan_para_cerrar")}</p>
                        <ul className="list-disc list-inside">
                          {abiertos.length > 0 && (
                            <li>
                              {t("falta_contenedores", { count: abiertos.length })}:{" "}
                              {abiertos.map((c) => c.numero).join(", ")}
                            </li>
                          )}
                          {ev.sinContar > 0 && <li>{t("falta_contar", { count: ev.sinContar })}</li>}
                          {ev.sinMotivo > 0 && <li>{t("falta_motivo", { count: ev.sinMotivo })}</li>}
                          {ev.golpesSinFoto > 0 && <li>{t("falta_foto_golpe", { count: ev.golpesSinFoto })}</li>}
                          {ev.danosSinCantidad > 0 && (
                            <li>{t("falta_cantidad_dano", { count: ev.danosSinCantidad })}</li>
                          )}
                          {ev.danosDeMas > 0 && <li>{t("falta_dano_de_mas", { count: ev.danosDeMas })}</li>}
                        </ul>
                      </div>
                    )}
                    <BotonPrimario
                      onClick={() => void accionar("cerrar", { items: cuerpoConteo(), notas_cierre: notas })}
                      disabled={enviando || !ev.listo || abiertos.length > 0}
                      icon={CheckCircle2}
                      className="w-full h-12"
                    >
                      {t("cerrar")}
                    </BotonPrimario>
                  </>
                ) : (
                  rec.notas_cierre && <p className="text-sm text-slate-600 whitespace-pre-line">{rec.notas_cierre}</p>
                )}
              </Card>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
          </div>

          {/* Recorrido: carga, cada contenedor, cierre */}
          <Card className="md:sticky md:top-24">
            <SectionTitle>{t("recorrido")}</SectionTitle>
            {(() => {
              // Desde la primera foto de llegada hasta el cierre del packing list.
              const ms = duracion(
                inicioRecepcion(archivos),
                rec.etapa === "cerrado" ? rec.cerrado_at : null,
                ahora,
              );
              if (ms === null) return null;
              return (
                <div
                  className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"
                  title={t("tiempo_ayuda")}
                >
                  <Timer className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500">
                      {rec.etapa === "cerrado" ? t("tiempo_total") : t("tiempo_en_curso")}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatearDuracion(ms)}</p>
                  </div>
                </div>
              );
            })()}
            <ol className="space-y-3">
              <Paso hecho titulo={t("cargado")} detalle={[rec.creado_por, hora(rec.created_at)].filter(Boolean).join(" · ")} />
              {contenedores.map((c) => (
                <Paso
                  key={c.id}
                  hecho={c.etapa === "cerrado"}
                  actual={c.etapa === "descargando"}
                  titulo={`${c.numero} · ${t(`etapa_contenedor.${c.etapa}`)}`}
                  detalle={
                    c.etapa === "cerrado"
                      ? [c.cerrado_por, hora(c.cerrado_at)].filter(Boolean).join(" · ")
                      : [c.llegada_por, hora(c.llegada_at)].filter(Boolean).join(" · ") || null
                  }
                />
              ))}
              <Paso
                hecho={rec.etapa === "cerrado"}
                actual={rec.etapa === "descargando" && abiertos.length === 0}
                titulo={rec.resultado ? `${t("cerrado_por")} · ${t(`resultado.${rec.resultado}`)}` : t("etapa.cerrado")}
                detalle={[rec.cerrado_por, hora(rec.cerrado_at)].filter(Boolean).join(" · ")}
              />
            </ol>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Estado({
  rec,
  trabajando,
  llegados,
  total,
  t,
}: {
  rec: Recepcion;
  trabajando: boolean;
  llegados: number;
  total: number;
  t: ReturnType<typeof useTranslations>;
}) {
  if (rec.etapa === "cerrado") {
    const novedades = rec.resultado === "con_novedades";
    return (
      <div
        className={`rounded-2xl border p-4 flex items-center gap-3 ${
          novedades ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        {novedades ? (
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("etapa.cerrado")}</p>
          {rec.resultado && <p className="text-sm text-slate-700">{t(`resultado.${rec.resultado}`)}</p>}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`rounded-2xl border p-4 flex items-center gap-3 ${
        trabajando ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white"
      }`}
    >
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          trabajando ? "bg-white text-[color:var(--portal-primary,#741DFE)]" : "bg-slate-100 text-slate-400"
        }`}
      >
        {rec.etapa === "por_llegar" ? <Truck className="w-4 h-4" /> : <Container className="w-4 h-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">
          {t(`etapa.${rec.etapa}`)} · {t("contenedores_recibidos", { llegados, total })}
        </p>
        <p className="text-sm text-slate-600">
          {trabajando ? t("le_toca_almacen") : t("esperando_almacen")} · {t(`paso.${rec.etapa}`)}
        </p>
      </div>
    </div>
  );
}

function Paso({
  hecho,
  actual,
  titulo,
  detalle,
}: {
  hecho?: boolean;
  actual?: boolean;
  titulo: string;
  detalle: string | null;
}) {
  const Icono = hecho ? CheckCircle2 : actual ? Clock : Circle;
  return (
    <li className="flex items-start gap-2.5">
      <Icono
        className={`w-4 h-4 mt-0.5 shrink-0 ${
          hecho ? "text-emerald-500" : actual ? "text-[color:var(--portal-primary,#741DFE)]" : "text-slate-300"
        }`}
      />
      <div className="min-w-0">
        <p className={`text-sm ${actual ? "font-semibold text-slate-900" : hecho ? "text-slate-700" : "text-slate-400"}`}>
          {titulo}
        </p>
        {detalle && <p className="text-[11px] text-slate-400 truncate">{detalle}</p>}
      </div>
    </li>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-400">{etiqueta}</dt>
      <dd className="text-sm text-slate-800 truncate">{valor || "—"}</dd>
    </div>
  );
}
