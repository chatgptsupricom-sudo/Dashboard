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
  RefreshCw,
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
import EscenaRecepcion from "./EscenaRecepcion";

/**
 * Detalle de una recepcion por packing list.
 *
 * El packing list puede venir en varios contenedores que llegan en dias
 * distintos. Almacen recibe cada uno por su cuenta (fotos + precinto al
 * llegar, foto de como quedo al terminar de descargarlo) y el packing list se
 * cierra cuando llegaron y se descargaron todos. Compras lo sigue en vivo y
 * puede corregirlo o anularlo mientras no haya llegado ninguno.
 *
 * Conteo por contenedor: varios telefonos (el mismo usuario) descargan
 * contenedores a la vez. Cada telefono elige el suyo y cuenta solo ahi
 * (lib/recepcion/conteo.ts); el total del renglon es la suma de todos y se ve
 * en vivo en todos los telefonos. Cuando el packing list dice cuanto trae
 * cada contenedor, cada uno se compara contra lo suyo.
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
  /** packing_list (Compras, contenedores) o factura (mercancia de otra sede). */
  origen?: "packing_list" | "factura";
  /** Carga en Odoo al cerrar (lib/recepcion/odoo.ts). */
  odoo_purchase_order_id?: number | null;
  odoo_oc_nombre?: string | null;
  odoo_estado?: "cargando" | "cargado" | "error" | "sin_oc" | null;
  odoo_error?: string | null;
  odoo_resultado?: string | null;
  odoo_cargado_at?: string | null;
};

type ResultadoOdoo = {
  recepciones?: Array<{ id: number; nombre: string; pendiente: string | null }>;
  traslados?: Array<{ id: number; nombre: string; pendiente: string | null }>;
  sin_producto?: string[];
  en_entrada?: string[];
  /** Validacion que se corto a medias (el siguiente intento la resuelve). */
  intento?: { picking_id: number } | null;
  /** Por que se freno la carga: lo puede saltar solo el SuperAdmin, tras revisar en Odoo. */
  bloqueo?: { tipo: "recibido_en_odoo" | "packing_list_repetido"; detalle: string[] } | null;
};

function leerResultadoOdoo(json: string | null | undefined): ResultadoOdoo {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

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
  /** Esperado (si el packing list lo dice) y contado en cada contenedor; 0 = sin contenedor. */
  conteo: FilaConteo[];
};

type FilaConteo = { contenedor_id: number; cantidad_esperada: number | null; cantidad_recibida: number | null };

type SerialItem = {
  id: number;
  item_id: number;
  serial: string;
  escaneado_por: string | null;
  created_at: string;
  contenedor_id?: number;
};

/** Lo contado en un contenedor, como se escribe en el campo ("" = sin contar). */
function recibidaEn(item: { conteo?: FilaConteo[] }, contenedorId: number | null): string {
  if (contenedorId === null) return "";
  const f = (item.conteo || []).find((x) => Number(x.contenedor_id) === contenedorId);
  return f && f.cantidad_recibida !== null ? String(Number(f.cantidad_recibida)) : "";
}

/** El renglon con lo contado en un contenedor y su nuevo total (tras una lectura). */
function conFila<T extends Item>(item: T, contenedorId: number, enContenedor: number | null, total: number | null): T {
  const filas = [...(item.conteo || [])];
  const k = filas.findIndex((f) => Number(f.contenedor_id) === contenedorId);
  const fila = {
    ...(k >= 0 ? filas[k] : { contenedor_id: contenedorId, cantidad_esperada: null }),
    cantidad_recibida: enContenedor,
  };
  if (k >= 0) filas[k] = fila;
  else filas.push(fila);
  return { ...item, conteo: filas, cantidad_recibida: total };
}

const fmt = (n: number) => n.toLocaleString("es-VE");

/** Cada dano marcado con la cantidad tal como se escribe en el campo. */
type DanoForm = { tipo: TipoDano; cantidad: string };
type Conteo = { recibida: string; motivo: string; danos: DanoForm[]; nota: string };
/** Lo que se escribe de un renglon y se manda al guardar (danos y nota van juntos). */
type CampoConteo = "recibida" | "motivo" | "dano";
const CAMPOS_DE: Record<keyof Conteo, CampoConteo> = { recibida: "recibida", motivo: "motivo", danos: "dano", nota: "dano" };

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
  // El SuperAdmin marca en una recepcion cerrada las cajas en mal estado que
  // Almacen no anoto (accion corregir_danos).
  const [corrigiendoDanos, setCorrigiendoDanos] = useState(false);
  // Y agrega un producto que no se conto (accion agregar_producto).
  const [nuevo, setNuevo] = useState<{ codigo: string; cantidad: string; seriales: string } | null>(null);
  // Carga en Odoo: OC elegida para una recepcion que no tenia, y la lista.
  const [ocElegida, setOcElegida] = useState<number | "">("");
  // El SuperAdmin confirma que reviso en Odoo que no es la misma mercancia.
  const [revisadoEnOdoo, setRevisadoEnOdoo] = useState(false);
  const [ocsOdoo, setOcsOdoo] = useState<Array<{ id: number; nombre: string; proveedor: string }> | null>(null);

  const abierto = rec !== null && rec.etapa !== "cerrado";
  useEffect(() => {
    if (!abierto) return;
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, [abierto]);

  // Renglones que este telefono cambio y todavia no guardo, con que campos.
  // Al guardar se manda solo eso: varios telefonos cuentan la misma recepcion
  // a la vez y mandar todo pisaba lo que contaban los otros. `v` sube con cada
  // cambio: lo que se edito mientras se guardaba queda pendiente.
  // La cantidad escrita va con el contenedor donde se escribio (`contenedor`).
  const pendientes = useRef(
    new Map<number, { campos: Set<CampoConteo>; v: number; contenedor: number | null }>(),
  );

  // Contenedor que esta descargando ESTE telefono: cada uno cuenta el suyo y
  // nadie escribe en el de otro. Se recuerda en el telefono (si se recarga la
  // pagina sigue en el mismo). `corrigiendoCont`: eligio uno ya terminado para
  // corregir un error, no para descargarlo.
  const [miContenedor, setMiContenedor] = useState<number | null>(null);
  const [corrigiendoCont, setCorrigiendoCont] = useState(false);
  const miRef = useRef<number | null>(null);
  miRef.current = miContenedor;
  const yaElegido = useRef(false);

  const aplicar = useCallback((j: any, conConteo: boolean) => {
    setRec(j.recepcion);
    setItems(j.items || []);
    setContenedores(j.contenedores || []);
    setArchivos(j.archivos || []);
    if (conConteo) {
      // Sin contenedores (recepcion por factura) se cuenta en el 0.
      const mio = (j.contenedores || []).length ? miRef.current : 0;
      setConteo((prev) => {
        const c: Record<number, Conteo> = {};
        for (const i of j.items || []) {
          const servidor: Conteo = {
            // El campo es lo de este contenedor; el total se suma en pantalla.
            recibida: recibidaEn(i, mio),
            motivo: i.motivo_diferencia || "",
            danos: (Array.isArray(i.danos) ? i.danos : []).map((d: any) => ({
              tipo: d.tipo,
              cantidad: d.cantidad === null || d.cantidad === undefined ? "" : String(d.cantidad),
            })),
            nota: i.golpeado_nota || "",
          };
          // Lo que se escribio aca y no se guardo todavia no se pisa.
          const local = prev[i.id];
          const pend = pendientes.current.get(i.id);
          const campos = pend?.campos;
          c[i.id] =
            local && campos
              ? {
                  recibida: campos.has("recibida") && pend!.contenedor === mio ? local.recibida : servidor.recibida,
                  motivo: campos.has("motivo") ? local.motivo : servidor.motivo,
                  danos: campos.has("dano") ? local.danos : servidor.danos,
                  nota: campos.has("dano") ? local.nota : servidor.nota,
                }
              : servidor;
        }
        return c;
      });
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

  // En vivo: lo que cuentan los otros telefonos, llegada o cierre de un
  // contenedor, cierre, edicion o anulacion. Lo escrito aca y no guardado no
  // se pisa (ver `aplicar`). Las lecturas de los otros llegan seguidas: se
  // recarga una vez cuando paran.
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRecepcionEnVivo((a) => {
    if (a.id !== Number(id)) return;
    if (a.accion === "eliminado") {
      setAnulada(true);
      return;
    }
    if (recarga.current) clearTimeout(recarga.current);
    recarga.current = setTimeout(() => void cargar(true), a.accion === "conteo" ? 700 : 0);
  });
  useEffect(() => () => {
    if (recarga.current) clearTimeout(recarga.current);
  }, []);

  // El contenedor de este telefono: el que recuerda, si sigue descargandose.
  // Si se termino (lo cerro otro telefono), hay que elegir otro. La primera
  // vez, si hay uno solo descargandose, ese.
  const claveMio = `recepcion:${id}:contenedor`;
  useEffect(() => {
    if (!contenedores.length) return;
    let elegido = miRef.current;
    if (elegido === null && !yaElegido.current) {
      try {
        const v = Number(localStorage.getItem(claveMio));
        if (v) elegido = v;
      } catch {
        // Sin almacenamiento: se elige de nuevo.
      }
    }
    const c = contenedores.find((x) => x.id === elegido);
    if (!c || c.etapa === "por_llegar" || (c.etapa === "cerrado" && !corrigiendoCont)) elegido = null;
    const abiertos = contenedores.filter((x) => x.etapa === "descargando");
    if (elegido === null && !yaElegido.current && abiertos.length === 1) elegido = abiertos[0].id;
    if (elegido !== null) yaElegido.current = true;
    if (elegido !== miRef.current) setMiContenedor(elegido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedores, corrigiendoCont]);

  // Al cambiar de contenedor, el campo muestra lo contado en el nuevo.
  useEffect(() => {
    const mio = contenedores.length ? miContenedor : 0;
    setConteo((prev) => {
      const c = { ...prev };
      for (const i of items) {
        const p = pendientes.current.get(i.id);
        if (p?.campos.has("recibida") && p.contenedor === mio) continue;
        c[i.id] = { ...(c[i.id] || { recibida: "", motivo: "", danos: [], nota: "" }), recibida: recibidaEn(i, mio) };
      }
      return c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miContenedor]);

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
        setAutoguardado((await guardarPendientes()) ? "guardado" : null);
      } catch {
        setAutoguardado(null);
      }
    }, 1500);
    return () => clearTimeout(timer);
    // cuerpoConteo lee `conteo`, que cambia junto con `editado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editado]);

  /** Manda lo pendiente de este telefono. true si quedo guardado (o no habia nada). */
  const guardarPendientes = async (): Promise<boolean> => {
    const { items: cuerpo, enviado } = cuerpoConteo();
    if (!cuerpo.length) return true;
    const res = await fetch(`/api/recepcion/${id}/etapa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "guardar_conteo", items: cuerpo }),
    });
    if (res.ok) guardados(enviado);
    return res.ok;
  };

  /** Cambia el contenedor de este telefono (lo escrito en el anterior se guarda antes). */
  const elegirContenedor = async (cid: number | null, correccion = false) => {
    if ([...pendientes.current.values()].some((x) => x.campos.has("recibida"))) {
      try {
        if (!(await guardarPendientes())) {
          setError(t("error"));
          return;
        }
      } catch {
        setError(t("error"));
        return;
      }
    }
    yaElegido.current = true;
    setCorrigiendoCont(correccion);
    setMiContenedor(cid);
    try {
      if (cid === null) localStorage.removeItem(claveMio);
      else localStorage.setItem(claveMio, String(cid));
    } catch {
      // Sin almacenamiento: vale para esta pantalla.
    }
  };

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
    // `cantidad` es el total del renglon; `cantidad_contenedor`, lo de este contenedor.
    const cid = Number(r.contenedor_id ?? 0);
    const enCont = r.cantidad_contenedor ?? r.cantidad;
    setConteo((prev) => ({
      ...prev,
      [r.item_id]: { ...(prev[r.item_id] || { recibida: "", motivo: "", danos: [], nota: "" }), recibida: String(enCont) },
    }));
    // La cantidad ya la tiene el servidor: si habia una escrita sin guardar,
    // no se manda encima de la lectura.
    const pendiente = pendientes.current.get(r.item_id);
    if (pendiente?.campos.delete("recibida") && pendiente.campos.size === 0) pendientes.current.delete(r.item_id);
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== r.item_id) return i;
        const nuevo = conFila(i, cid, enCont, r.cantidad);
        // El primer serial de un producto elegido a mano lo pasa a contarse por serial.
        return r.resultado === "serial"
          ? { ...nuevo, lleva_serial: true, seriales: [...(i.seriales || []), r.serial] }
          : nuevo;
      }),
    );
  };

  const quitarSerial = async (itemId: number, serialId: number) => {
    setError(null);
    const res = await fetch(`/api/recepcion/${id}/seriales/${serialId}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || t("error"));
      return;
    }
    // Se resta en el contenedor donde se habia pistoleado.
    const cid = Number(j.contenedor_id ?? 0);
    const enCont = Number(j.cantidad_contenedor) > 0 ? Number(j.cantidad_contenedor) : null;
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...conFila(i, cid, enCont, Number(j.cantidad) > 0 ? Number(j.cantidad) : null),
              // Sin seriales vuelve a lo que diga Odoo (se habia elegido a mano).
              lleva_serial: typeof j.lleva_serial === "boolean" ? j.lleva_serial : i.lleva_serial,
              seriales: (i.seriales || []).filter((x) => x.id !== serialId),
            }
          : i,
      ),
    );
    if (cid === (contenedores.length ? miContenedor : 0)) {
      setConteo((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || { recibida: "", motivo: "", danos: [], nota: "" }), recibida: enCont === null ? "" : String(enCont) },
      }));
    }
  };

  // Los seriales en Excel, como los llevaban hasta ahora.
  const descargarSeriales = () => {
    if (!rec) return;
    const filas = items.flatMap((i) =>
      (i.seriales || []).map((x) => ({
        Codigo: i.codigo || "",
        Producto: i.producto,
        Serial: x.serial,
        Contenedor: contenedores.find((c) => c.id === Number(x.contenedor_id))?.numero || "",
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
    // Renglones pendientes que van en este envio (ver cuerpoConteo).
    enviado?: Map<number, number>,
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
      if (enviado) guardados(enviado);
      aplicar(j, conConteo);
      if (accion === "guardar_conteo") setAviso(t("avance_guardado"));
      return true;
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setEnviando(false);
    }
    return false;
  };

  /**
   * Lo que este telefono cambio y no guardo: solo esos renglones y, de cada
   * uno, solo los campos tocados (el servidor no toca los que no vienen).
   * `enviado` dice con que version salio cada renglon, para no dar por
   * guardado lo que se volvio a editar mientras tanto.
   */
  const cuerpoConteo = () => {
    const enviado = new Map<number, number>();
    const cuerpo: Array<Record<string, unknown>> = [];
    for (const [itemId, p] of pendientes.current) {
      const c = conteo[itemId];
      if (!c) continue;
      enviado.set(itemId, p.v);
      const fila: Record<string, unknown> = { id: itemId };
      if (p.campos.has("recibida")) {
        fila.cantidad_recibida = c.recibida === "" ? null : Number(c.recibida);
        fila.contenedor_id = p.contenedor;
      }
      if (p.campos.has("motivo")) fila.motivo_diferencia = c.motivo || null;
      if (p.campos.has("dano")) {
        fila.danos = danosANumero(c.danos);
        fila.golpeado_nota = c.danos.length ? c.nota || null : null;
      }
      cuerpo.push(fila);
    }
    return { items: cuerpo, enviado };
  };

  const guardados = (enviado: Map<number, number>) => {
    for (const [itemId, v] of enviado) {
      if (pendientes.current.get(itemId)?.v === v) pendientes.current.delete(itemId);
    }
  };

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
  const editaDanos = contando || (corrigiendoDanos && rol === "superadmin" && rec.etapa === "cerrado");

  // Conteo por contenedor. Sin contenedores (por factura) todo va al 0.
  const sinContenedores = contenedores.length === 0;
  const contMio = sinContenedores ? 0 : miContenedor;
  const porCont = contando && !sinContenedores;
  const contAbiertos = contenedores.filter((c) => c.etapa === "descargando");
  const contTerminados = contenedores.filter((c) => c.etapa === "cerrado");
  const descargandoAun = contenedores.some((c) => c.etapa !== "cerrado");
  const numeroDe = (cid: number) => contenedores.find((c) => c.id === cid)?.numero || t("sin_contenedor");
  /** Lo contado en un contenedor (el de este telefono, con lo que se esta escribiendo). */
  const recibidoEn = (i: Item, cid: number): number | null => {
    const v = cid === contMio ? conteo[i.id]?.recibida : recibidaEn(i, cid);
    return v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  };
  /** Lo que el packing list dice para ese contenedor (con uno solo, todo). */
  const esperadoEn = (i: Item, cid: number): number | null => {
    if (contenedores.length === 1 && cid === contenedores[0].id) return Number(i.cantidad_esperada);
    const f = (i.conteo || []).find((x) => Number(x.contenedor_id) === cid);
    return f && f.cantidad_esperada !== null ? Number(f.cantidad_esperada) : null;
  };
  const contenedoresDe = (i: Item) => {
    const ids = new Set((i.conteo || []).map((f) => Number(f.contenedor_id)));
    if (contMio !== null) ids.add(contMio);
    return [...ids];
  };
  /** Total del renglon: la suma de los contenedores (cerrado, lo que guardo el servidor). */
  const totalDe = (i: Item): number | null => {
    const servidor = i.cantidad_recibida === null || i.cantidad_recibida === undefined ? null : Number(i.cantidad_recibida);
    if (rec.etapa === "cerrado" || !(i.conteo || []).length) {
      if (contMio === null || !conteo[i.id] || conteo[i.id].recibida === "") return servidor;
    }
    let hay = false;
    let suma = 0;
    for (const cid of contenedoresDe(i)) {
      const v = recibidoEn(i, cid);
      if (v !== null) {
        hay = true;
        suma += v;
      }
    }
    return hay ? suma : null;
  };
  /** Unidades contadas en un contenedor y cuantos productos no dan lo esperado (si se sabe). */
  const resumenCont = (cid: number) => {
    const conocido = contenedores.length === 1 || items.some((i) => esperadoEn(i, cid) !== null);
    let unidades = 0;
    let difs = 0;
    for (const i of items) {
      const r = recibidoEn(i, cid);
      if (r !== null) unidades += r;
      if (conocido && (r ?? 0) !== (esperadoEn(i, cid) ?? 0)) difs++;
    }
    return { unidades, difs: conocido ? difs : null };
  };
  const sucursal = SUCURSALES.find((s) => s.cids === Number(rec.cids))?.nombre;
  const llegados = contenedores.filter((c) => c.etapa !== "por_llegar").length;
  const abiertos = contenedores.filter((c) => c.etapa !== "cerrado");

  // Lo que falta para cerrar, calculado en pantalla (la API lo vuelve a validar).
  const fotosGolpe = new Set(archivos.filter((a) => a.tipo === "foto_golpe").map((a) => Number(a.item_id)));
  const ev = evaluarConteo(
    items.map((i) => ({
      id: i.id,
      cantidad_esperada: Number(i.cantidad_esperada),
      cantidad_recibida: totalDe(i),
      motivo_diferencia: conteo[i.id]?.motivo || null,
      golpeado: (conteo[i.id]?.danos?.length ?? 0) > 0,
      danos: danosANumero(conteo[i.id]?.danos),
      golpeado_nota: conteo[i.id]?.nota || null,
    })),
    fotosGolpe,
  );
  const porFactura = rec.origen === "factura";
  const resultadoOdoo = leerResultadoOdoo(rec.odoo_resultado);
  // La OC se puede elegir (o cambiar) mientras no se haya cargado nada en Odoo.
  // Con la carga frenada, solo el SuperAdmin: cambiar de OC no puede servir
  // para cargar dos veces lo mismo.
  const puedeElegirOc =
    rec.etapa === "cerrado" &&
    (!resultadoOdoo.bloqueo || rol === "superadmin") &&
    (rec.odoo_estado === "sin_oc" ||
      (rec.odoo_estado === "error" && !(resultadoOdoo.recepciones || []).length && !resultadoOdoo.intento));
  const cargarOcs = async () => {
    if (ocsOdoo) return;
    try {
      const res = await fetch(`/api/recepcion/odoo/ocs?cids=${rec.cids}`);
      setOcsOdoo(res.ok ? (await res.json()).ocs || [] : []);
    } catch {
      setOcsOdoo([]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={porFactura ? FileText : Container}
        titulo={porFactura ? `${t("factura.etiqueta")} ${rec.referencia}` : rec.referencia}
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

        {/* La descarga en 3D: el mismo conteo de abajo, visto de un golpe. */}
        <EscenaRecepcion
          renglones={items.map((i) => ({
            id: i.id,
            producto: i.producto,
            codigo: i.codigo,
            esperada: Number(i.cantidad_esperada),
            recibida: totalDe(i),
            danado: (conteo[i.id]?.danos?.length ?? 0) > 0,
          }))}
          contenedores={contenedores.map((c) => ({ id: c.id, numero: c.numero, etapa: c.etapa }))}
          seleccion={ultimo}
          onSeleccion={marcar}
          resumen={ev}
        />

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
                {porFactura ? (
                  <Dato etiqueta={t("factura.factura")} valor={rec.referencia} />
                ) : (
                  <Dato etiqueta={t("contenedores")} valor={String(contenedores.length)} />
                )}
                <Dato etiqueta={t("oc_odoo")} valor={rec.odoo_oc_nombre} />
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

            {/* Contenedores: cada uno con su llegada y su cierre. Una recepcion
                con factura no tiene: nace descargando. */}
            {contenedores.length > 0 && (
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
                        {(() => {
                          // Lo contado en este contenedor contra lo que dice el packing list.
                          const rs = resumenCont(c.id);
                          return (
                            <p className="text-xs text-slate-600">
                              {t("contenedor_contado", { unidades: fmt(rs.unidades) })}
                              {rs.difs !== null && rs.difs > 0 && (
                                <span className="font-semibold text-amber-700">
                                  {" "}
                                  · {t("contenedor_diferencias", { count: rs.difs })}
                                </span>
                              )}
                            </p>
                          );
                        })()}
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
                              onClick={() => {
                                const rs = resumenCont(c.id);
                                if (rs.difs && !window.confirm(t("contenedor_confirmar_diferencias", { count: rs.difs }))) {
                                  return;
                                }
                                void accionar(
                                  "cerrar_contenedor",
                                  { contenedor_id: c.id, notas_cierre: notasCont[c.id] || null },
                                  false,
                                );
                              }}
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
            )}

            {/* Conteo contra el packing list: cada telefono cuenta en su contenedor y
                el total de cada renglon es la suma de todos. */}
            <Card className={contando ? "border-violet-200" : ""}>
              <SectionTitle>
                {t("conteo")} ({items.length})
              </SectionTitle>
              {contando && <p className="text-xs text-slate-500 -mt-1 mb-3">{t("conteo_ayuda")}</p>}
              {porCont && (
                <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">{t("conteo_que_contenedor")}</p>
                  {contAbiertos.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {contAbiertos.map((c) => {
                        const mio = miContenedor === c.id && !corrigiendoCont;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void elegirContenedor(c.id)}
                            aria-pressed={mio}
                            className={`h-10 px-3 rounded-lg font-mono text-xs font-semibold ${
                              mio
                                ? "bg-violet-600 text-white"
                                : "border border-violet-300 bg-white text-violet-700 hover:bg-violet-50"
                            }`}
                          >
                            {c.numero}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">{t("conteo_sin_abiertos")}</p>
                  )}
                  {contTerminados.length > 0 && (
                    <select
                      value={corrigiendoCont && miContenedor !== null ? miContenedor : ""}
                      onChange={(e) =>
                        void (e.target.value ? elegirContenedor(Number(e.target.value), true) : elegirContenedor(null))
                      }
                      aria-label={t("conteo_corregir_terminado")}
                      className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-600"
                    >
                      <option value="">{t("conteo_corregir_terminado")}</option>
                      {contTerminados.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero}
                        </option>
                      ))}
                    </select>
                  )}
                  {miContenedor === null ? (
                    <p className="text-xs text-amber-700">{t("conteo_elige_contenedor")}</p>
                  ) : corrigiendoCont ? (
                    <p className="text-xs text-amber-700">{t("conteo_corrigiendo", { contenedor: numeroDe(miContenedor) })}</p>
                  ) : null}
                </div>
              )}
              {contando && contMio !== null && (
                <Pistola
                  endpoint={`/api/recepcion/${rec.id}/escaneo?contenedor_id=${contMio}`}
                  items={items.map((i) => ({
                    id: i.id,
                    codigo: i.codigo,
                    producto: i.producto,
                    lleva_serial: !!i.lleva_serial,
                    esperado: Number(i.cantidad_esperada),
                    recibido: i.lleva_serial ? (i.seriales || []).length : totalDe(i) ?? 0,
                  }))}
                  seleccionado={seleccionado}
                  serialEnCualquiera
                  seguirPasadoEsperado
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
                <span className="text-right">{porCont ? t("esperado_contenedor") : t("esperado")}</span>
                <span className="text-right">{porCont ? t("este_contenedor") : t("recibido")}</span>
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
                const esperado = Number(i.cantidad_esperada);
                // El total (todos los contenedores) contra el packing list.
                const total = totalDe(i);
                const recibidaNum = total;
                const hayDif = total !== null && total !== esperado;
                // Con contenedores todavia descargandose, que falte es normal: el
                // motivo se pide cuando no queda ninguno (o si ya sobra).
                const pidoMotivo = hayDif && (!descargandoAun || (total ?? 0) > esperado || !!c.motivo.trim());
                // Lo de este contenedor contra lo que el packing list dice para el.
                const espMio = porCont && contMio !== null ? esperadoEn(i, contMio) : null;
                const marca = porCont
                  ? espMio !== null && c.recibida !== "" && Number(c.recibida) !== espMio
                  : hayDif;
                const puedeEscribir = contando && contMio !== null;
                const set = (p: Partial<Conteo>) => {
                  setConteo((prev) => ({ ...prev, [i.id]: { ...c, ...p } }));
                  const previo = pendientes.current.get(i.id);
                  const campos = new Set(previo?.campos);
                  for (const k of Object.keys(p) as Array<keyof Conteo>) campos.add(CAMPOS_DE[k]);
                  pendientes.current.set(i.id, {
                    campos,
                    v: (previo?.v ?? 0) + 1,
                    // La cantidad escrita es del contenedor de este telefono.
                    contenedor: p.recibida !== undefined ? contMio : previo?.contenedor ?? null,
                  });
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
                        {total !== null && total > esperado && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                            {t("sobrante")} +{fmt(total - esperado)}
                          </span>
                        )}
                        <p className="text-[11px] text-slate-400 truncate">
                          {[i.codigo, i.cajas_esperadas !== null ? `${i.cajas_esperadas} ${t("cajas").toLowerCase()}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {!sinContenedores && (() => {
                          // Total y lo de cada contenedor (contado / esperado, si se sabe).
                          const partes = contenedoresDe(i)
                            .map((cid) => ({ cid, r: recibidoEn(i, cid), e: esperadoEn(i, cid) }))
                            .filter((x) => x.r !== null || (x.e !== null && contenedores.length > 1));
                          if (!porCont && partes.length < 2) return null;
                          return (
                            <p className="text-[11px] text-slate-500 leading-snug">
                              {porCont && (
                                <span
                                  className={`font-semibold ${
                                    hayDif && !descargandoAun ? "text-red-600" : "text-slate-700"
                                  }`}
                                >
                                  {t("total_de", { total: fmt(total ?? 0), esperado: fmt(esperado) })}
                                </span>
                              )}
                              {partes.map((x) => (
                                <span key={x.cid} className={x.cid === contMio && porCont ? "text-violet-700 font-medium" : ""}>
                                  {(porCont || partes.indexOf(x) > 0) && " · "}
                                  {numeroDe(x.cid)}: {fmt(x.r ?? 0)}
                                  {x.e !== null && contenedores.length > 1 && `/${fmt(x.e)}`}
                                </span>
                              ))}
                            </p>
                          );
                        })()}
                        {(i.lleva_serial || contando) && (
                          // Cualquier producto se puede elegir para pistolear sus
                          // seriales (el packing list sin codigo no dice cual lleva).
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {i.lleva_serial && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">
                                {t("con_serial")}
                              </span>
                            )}
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
                      <span className="text-sm font-semibold tabular-nums text-slate-700 text-right">
                        {porCont ? (espMio === null ? "—" : fmt(espMio)) : esperado}
                      </span>
                      {porCont && contMio === null ? (
                        // Sin contenedor elegido no se cuenta: no se sabe en cual.
                        <span className="w-full h-10 px-2 flex items-center justify-end rounded-lg border border-dashed border-slate-200 text-sm text-slate-300">
                          —
                        </span>
                      ) : contando && i.lleva_serial ? (
                        // Con serial: se cuenta pistoleando, no se escribe.
                        <span
                          title={t("cuenta_seriales")}
                          className={`w-full h-10 px-2 flex items-center justify-end rounded-lg border bg-slate-50 text-sm tabular-nums ${
                            marca ? "border-red-300 text-red-700 font-semibold" : "border-slate-200 text-slate-700"
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
                            marca ? "border-red-300 bg-red-50 text-red-700 font-semibold" : "border-slate-200"
                          }`}
                        />
                      ) : (
                        <span
                          className={`text-sm tabular-nums text-right ${
                            hayDif ? "font-semibold text-red-600" : total === null ? "text-slate-300" : "text-slate-700"
                          }`}
                        >
                          {total === null ? "—" : total}
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
                          {/* Si no llego ninguno (a este contenedor) se anota 0 a mano. */}
                          {puedeEscribir &&
                            seriales.filter((x) => Number(x.contenedor_id ?? 0) === contMio).length === 0 && (
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
                                {!sinContenedores && (
                                  <span className="font-mono text-slate-400 truncate">{numeroDe(Number(x.contenedor_id ?? 0))}</span>
                                )}
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
                      (!contando || pidoMotivo) &&
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
                    {(editaDanos || conDano) && (
                      <div className="mt-2 space-y-2">
                        {editaDanos ? (
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
                            {editaDanos ? (
                              <input
                                value={c.nota}
                                onChange={(e) => set({ nota: e.target.value.slice(0, 300) })}
                                placeholder={t("golpeado_nota")}
                                aria-label={t("golpeado_nota")}
                                className={`w-full h-10 px-3 rounded-lg border text-sm focus:outline-none ${
                                  c.nota.trim() ? "border-slate-200" : "border-red-300 bg-red-50"
                                }`}
                              />
                            ) : (
                              c.nota && (
                                <p className="text-xs text-amber-800">
                                  <span className="font-semibold">{t("golpeado_motivo")}:</span> {c.nota}
                                </p>
                              )
                            )}
                            <FotoCaptura
                              recepcionId={rec.id}
                              tipo="foto_golpe"
                              itemId={i.id}
                              titulo={t("foto_golpe")}
                              fotos={fotos("foto_golpe", { itemId: i.id })}
                              editable={editaDanos}
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
                    onClick={() => {
                      const { items: cuerpo, enviado } = cuerpoConteo();
                      void accionar("guardar_conteo", { items: cuerpo }, true, enviado);
                    }}
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
                          {ev.golpesSinMotivo > 0 && (
                            <li>{t("falta_motivo_golpe", { count: ev.golpesSinMotivo })}</li>
                          )}
                          {ev.danosSinCantidad > 0 && (
                            <li>{t("falta_cantidad_dano", { count: ev.danosSinCantidad })}</li>
                          )}
                          {ev.danosDeMas > 0 && <li>{t("falta_dano_de_mas", { count: ev.danosDeMas })}</li>}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">
                      {rec.odoo_oc_nombre
                        ? t("odoo.al_cerrar", { oc: rec.odoo_oc_nombre })
                        : t("odoo.al_cerrar_sin_oc")}
                    </p>
                    <BotonPrimario
                      onClick={() => {
                        const { items: cuerpo, enviado } = cuerpoConteo();
                        void accionar("cerrar", { items: cuerpo, notas_cierre: notas }, true, enviado);
                      }}
                      disabled={enviando || !ev.listo || abiertos.length > 0}
                      icon={CheckCircle2}
                      className="w-full h-12"
                    >
                      {t("cerrar")}
                    </BotonPrimario>
                  </>
                ) : (
                  <>
                    {rec.notas_cierre && <p className="text-sm text-slate-600 whitespace-pre-line">{rec.notas_cierre}</p>}
                    {rol === "superadmin" &&
                      (corrigiendoDanos ? (
                        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                          <p className="text-xs text-amber-900">{t("corregir_danos_ayuda")}</p>
                          <div className="flex gap-2">
                            <BotonPrimario
                              onClick={async () => {
                                const { items: cuerpo, enviado } = cuerpoConteo();
                                const ok = await accionar(
                                  "corregir_danos",
                                  { items: cuerpo.filter((f) => "danos" in f) },
                                  true,
                                  enviado,
                                );
                                if (ok) {
                                  setCorrigiendoDanos(false);
                                  setAviso(t("corregir_danos_hecho"));
                                }
                              }}
                              disabled={enviando}
                              icon={Save}
                              className="flex-1"
                            >
                              {t("guardar_correccion")}
                            </BotonPrimario>
                            <BotonSecundario
                              onClick={() => {
                                pendientes.current.clear();
                                setCorrigiendoDanos(false);
                                void cargar();
                              }}
                              disabled={enviando}
                            >
                              {t("cancelar_correccion")}
                            </BotonSecundario>
                          </div>
                        </div>
                      ) : (
                        <BotonSecundario onClick={() => setCorrigiendoDanos(true)} icon={AlertTriangle} className="w-full">
                          {t("corregir_danos")}
                        </BotonSecundario>
                      ))}
                    {rol === "superadmin" &&
                      (nuevo ? (
                        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                          <p className="text-xs text-violet-900">{t("agregar_producto_ayuda")}</p>
                          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                            <input
                              value={nuevo.codigo}
                              onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value.slice(0, 100) })}
                              placeholder={t("agregar_producto_codigo")}
                              aria-label={t("agregar_producto_codigo")}
                              className={inputClases}
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              value={nuevo.cantidad}
                              onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })}
                              placeholder={t("agregar_producto_cantidad")}
                              aria-label={t("agregar_producto_cantidad")}
                              className={`${inputClases} text-right`}
                            />
                          </div>
                          <textarea
                            value={nuevo.seriales}
                            onChange={(e) => setNuevo({ ...nuevo, seriales: e.target.value })}
                            placeholder={t("agregar_producto_seriales")}
                            aria-label={t("agregar_producto_seriales")}
                            className={`${inputClases} h-auto min-h-[64px] py-2 font-mono text-xs`}
                          />
                          <div className="flex gap-2">
                            <BotonPrimario
                              onClick={async () => {
                                const ok = await accionar(
                                  "agregar_producto",
                                  {
                                    codigo: nuevo.codigo,
                                    cantidad: Number(nuevo.cantidad),
                                    seriales: nuevo.seriales.split(/[\s,;]+/).filter(Boolean),
                                  },
                                  true,
                                );
                                if (ok) {
                                  setNuevo(null);
                                  setAviso(t("agregar_producto_hecho"));
                                }
                              }}
                              disabled={enviando || !nuevo.codigo.trim()}
                              icon={Save}
                              className="flex-1"
                            >
                              {t("agregar_producto")}
                            </BotonPrimario>
                            <BotonSecundario onClick={() => setNuevo(null)} disabled={enviando}>
                              {t("cancelar_correccion")}
                            </BotonSecundario>
                          </div>
                        </div>
                      ) : (
                        <BotonSecundario
                          onClick={() => setNuevo({ codigo: "", cantidad: "", seriales: "" })}
                          icon={Save}
                          className="w-full"
                        >
                          {t("agregar_producto")}
                        </BotonSecundario>
                      ))}
                  </>
                )}
              </Card>
            )}

            {/* Carga en Odoo: recepcion de la OC + traslado a Existencias */}
            {rec.etapa === "cerrado" && (
              <Card className="space-y-3">
                <SectionTitle>{t("odoo.titulo")}</SectionTitle>
                <div className="flex items-start gap-2">
                  {rec.odoo_estado === "cargado" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : rec.odoo_estado === "cargando" ? (
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
                  ) : (
                    <AlertTriangle
                      className={`w-5 h-5 shrink-0 ${rec.odoo_estado === "error" ? "text-red-600" : "text-amber-600"}`}
                    />
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-slate-900">
                      {t(`odoo.estado.${rec.odoo_estado || "sin_oc"}`, { oc: rec.odoo_oc_nombre || "" })}
                    </p>
                    {rec.odoo_estado === "cargado" && rec.odoo_cargado_at && (
                      <p className="text-xs text-slate-500">{hora(rec.odoo_cargado_at)}</p>
                    )}
                    {rec.odoo_estado === "error" && rec.odoo_error && (
                      <p className="mt-1 text-xs text-red-700 whitespace-pre-line break-words">{rec.odoo_error}</p>
                    )}
                  </div>
                </div>

                {((resultadoOdoo.recepciones || []).length > 0 || (resultadoOdoo.traslados || []).length > 0) && (
                  <ul className="text-xs text-slate-600 space-y-0.5">
                    {(resultadoOdoo.recepciones || []).map((r) => (
                      <li key={`in-${r.id}`}>
                        {t("odoo.recepcion_validada", { nombre: r.nombre })}
                        {r.pendiente && <span className="text-amber-700"> · {t("odoo.pendiente", { nombre: r.pendiente })}</span>}
                      </li>
                    ))}
                    {(resultadoOdoo.traslados || []).map((r) => (
                      <li key={`int-${r.id}`}>
                        {t("odoo.traslado_validado", { nombre: r.nombre })}
                        {r.pendiente && <span className="text-amber-700"> · {t("odoo.pendiente", { nombre: r.pendiente })}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {(resultadoOdoo.sin_producto || []).length > 0 && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p className="font-semibold">{t("odoo.sin_producto")}</p>
                    <ul className="list-disc list-inside">
                      {resultadoOdoo.sin_producto!.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(resultadoOdoo.en_entrada || []).length > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {t("odoo.en_entrada", { lista: resultadoOdoo.en_entrada!.join(", ") })}
                  </p>
                )}

                {(rec.odoo_estado === "error" || rec.odoo_estado === "sin_oc") && (
                  <div className="space-y-2">
                    {puedeElegirOc && (
                      <select
                        value={ocElegida}
                        onFocus={() => void cargarOcs()}
                        onChange={(e) => setOcElegida(e.target.value ? Number(e.target.value) : "")}
                        className={inputClases}
                        aria-label={t("oc_odoo")}
                      >
                        <option value="">
                          {rec.odoo_oc_nombre ? t("odoo.misma_oc", { oc: rec.odoo_oc_nombre }) : t("odoo.elegir_oc")}
                        </option>
                        {(ocsOdoo || []).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre} — {o.proveedor}
                          </option>
                        ))}
                      </select>
                    )}
                    {resultadoOdoo.bloqueo && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-2">
                        <p>{t(`odoo.bloqueo.${resultadoOdoo.bloqueo.tipo}`, { detalle: resultadoOdoo.bloqueo.detalle.join(", ") })}</p>
                        {rol === "superadmin" ? (
                          <label className="flex items-start gap-2 font-medium">
                            <input
                              type="checkbox"
                              checked={revisadoEnOdoo}
                              onChange={(e) => setRevisadoEnOdoo(e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded border-amber-300"
                            />
                            {t("odoo.bloqueo.revisado")}
                          </label>
                        ) : (
                          <p className="font-medium">{t("odoo.bloqueo.solo_superadmin")}</p>
                        )}
                      </div>
                    )}
                    <BotonSecundario
                      onClick={() =>
                        void accionar(
                          "cargar_odoo",
                          {
                            ...(ocElegida ? { purchase_order_id: ocElegida } : {}),
                            ...(resultadoOdoo.bloqueo && revisadoEnOdoo ? { saltar_frenos: true } : {}),
                          },
                          false,
                        )
                      }
                      disabled={
                        enviando ||
                        (rec.odoo_estado === "sin_oc" && !ocElegida) ||
                        (!!resultadoOdoo.bloqueo && !ocElegida && !(rol === "superadmin" && revisadoEnOdoo))
                      }
                      icon={enviando ? Loader2 : RefreshCw}
                      className="w-full"
                    >
                      {t("odoo.reintentar")}
                    </BotonSecundario>
                  </div>
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
              <Paso
                hecho={rec.odoo_estado === "cargado"}
                actual={rec.etapa === "cerrado" && rec.odoo_estado !== "cargado"}
                titulo={t("odoo.paso")}
                detalle={rec.odoo_estado === "cargado" ? hora(rec.odoo_cargado_at ?? null) : rec.odoo_oc_nombre || null}
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
          {t(`etapa.${rec.etapa}`)}
          {total > 0 && <> · {t("contenedores_recibidos", { llegados, total })}</>}
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
