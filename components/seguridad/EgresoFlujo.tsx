"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  Loader2,
  Package,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";
import FirmasActa from "@/components/seguridad/FirmasActa";
import Pistola from "@/components/escaneo/Pistola";
import { StarRating, StarRatingDisplay } from "@/components/seguridad/StarRating";
import {
  ASPECTOS,
  RESPONSABLE,
  enAlmacen,
  esAnormalEnVivo,
  faltanPorPistolear,
  esEtapa,
  esTipoEntrega,
  evaluarSeriales,
  novedadesVerificacion,
  novedadesQueCuentan,
  pideComentarioPicking,
  rechazoDeSeguridad,
  aspectosACalificar,
  type Aspecto,
  type DecisionSeguridad,
  etapasDelRecorrido,
  indiceEtapa,
  requiereVehiculo,
  resultadoEgreso,
  verificaPorSerial,
  type Accion,
  type Novedad,
  type Etapa,
  type TipoEntrega,
} from "@/lib/seguridad/egresoFlujo";
import { useMercanciaEnVivo } from "@/lib/seguridad/useMercanciaEnVivo";
import {
  PageHeader,
  Card,
  SectionTitle,
  BotonPrimario,
  BotonSecundario,
  inputClases,
  labelClases,
} from "./mercancia-ui";

/**
 * Egreso de mercancia por etapas (ver lib/seguridad/egresoFlujo).
 *
 * Una sola pantalla para los dos roles: arriba el recorrido completo, para que
 * cualquiera vea en que va el camion; abajo el panel del paso actual, que solo
 * se puede usar si ese paso le toca a tu rol. Si no te toca, ves a quien
 * esperas y que falta. La API es la que manda (valida rol y etapa en cada
 * accion); esto solo evita mostrar botones que igual serian rechazados.
 *
 * Todo en vivo: cuando el otro rol mueve el registro, esta pantalla se
 * recarga sola con el mismo evento que usan el listado y el dashboard.
 */

type Item = {
  id: number;
  producto: string;
  codigo: string | null;
  cantidad_cargada: string | number;
  cantidad_armado: string | number | null;
  cantidad_verificada: string | number | null;
  observacion: string | null;
  no_salio: number | boolean;
  /** 1 = lleva serial en Odoo; null = todavia no se leyo (issue #299). */
  lleva_serial?: number | null;
};

type Serial = {
  id: number;
  item_id: number;
  serial: string;
  verificado_at: string | null;
  verificado_por?: string | null;
};

/** Novedad guardada (lib/seguridad/novedades), de cualquier ronda. */
type NovedadGuardada = Novedad & {
  id: number;
  ronda: number;
  origen: "escaneo" | "cierre";
  created_at: string;
};

// Seriales que se ven de entrada por renglon; el resto, al desplegar.
const SERIALES_VISIBLES = 6;

type Movimiento = {
  id: number;
  fecha: string;
  odoo_picking_name: string | null;
  contraparte: string | null;
  facturas: string[];
  /** Facturas de venta traidas de Odoo al registrar (issue #298). */
  facturas_venta?: string[];
  factura_venta_fecha?: string | null;
  etapa: Etapa;
  tipo_entrega: TipoEntrega | null;
  almacenista_nombre?: string | null;
  almacenista_armado: string | null;
  almacenista_despacho: string | null;
  chofer_nombre: string | null;
  placa_vehiculo: string | null;
  observaciones: string | null;
  estado: "pendiente" | "conforme" | "descuadre";
  created_at: string | null;
  armado_inicio_at: string | null;
  armado_fin_at: string | null;
  armado_verificado_por: string | null;
  armado_verificado_at: string | null;
  empaquetado_por: string | null;
  empaquetado_at: string | null;
  despacho_asignado_at: string | null;
  verificado_por: string | null;
  verificado_at: string | null;
  aprobado: number | null;
  despachado: number | null;
  motivo_no_aprobado: string | null;
  cerrado_at: string | null;
  seriales_leidos_at?: string | null;
  /** Suma 1 cada vez que Seguridad no despacha y vuelve a Almacen (#301). */
  ronda_verificacion?: number | null;
  /** aprobar | despachar | devolver | cancelar (sql/egreso_decision_seguridad.sql). */
  decision_seguridad?: string | null;
  verificado_en?: string | null;
};

type Calificacion = {
  id: number;
  almacenista_nombre: string;
  calificacion: number | string;
  comentario: string | null;
  calificado_por: string | null;
  /** picking o despacho (issue #302). Las de antes, sin aspecto, son del despacho. */
  aspecto?: Aspecto | null;
};

type Nota = { estrellas: number; comentario: string };

/** Hora de Caracas: es donde estan los almacenes, no donde este el navegador. */
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

// Producto + Orden + Armado + Portón. Las columnas de numeros se angostan en
// telefono: es donde se cuenta en el porton, y el nombre del producto tiene
// que seguir leyendose.
const COLUMNAS =
  "grid-cols-[minmax(0,1fr)_2rem_3.25rem_3.25rem] sm:grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem]";

const num = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export default function EgresoFlujo({ id }: { id: string }) {
  const tm = useTranslations("seguridad.mercancia");
  const tf = useTranslations("seguridad.mercancia.flujo");
  const tc = useTranslations("seguridad.calificacion");
  const tAlm = useTranslations("seguridad.mercancia.almacenistas_catalogo");
  const tCho = useTranslations("seguridad.mercancia.choferes_catalogo");
  const tUni = useTranslations("seguridad.mercancia.unidades");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const rol = (user?.role || "").toLowerCase().trim();
  // Choferes y unidades son de Almacen: solo Almacen ve "Gestionar".
  const gestionaPersonal = rol === "almacen" || rol === "superadmin";

  const [mov, setMov] = useState<Movimiento | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [calificaciones, setCalificaciones] = useState<Calificacion[]>([]);
  const [seriales, setSeriales] = useState<Serial[]>([]);
  const [novedadesGuardadas, setNovedadesGuardadas] = useState<NovedadGuardada[]>([]);
  // Producto con serial elegido en la pistola (como en la recepcion).
  const [pistolaItem, setPistolaItem] = useState<number | null>(null);
  const [leyendoSeriales, setLeyendoSeriales] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Conteos en pantalla. Se rellenan con lo guardado al cargar, para que un
  // conteo a medias (o uno que no cuadro) no haya que volver a teclearlo.
  const [armado, setArmado] = useState<Record<number, string>>({});
  const [porton, setPorton] = useState<Record<number, string>>({});
  const [noSalio, setNoSalio] = useState<Record<number, boolean>>({});
  const [motivos, setMotivos] = useState<Record<number, string>>({});

  // Paso "asignar despacho": el almacenista, y en ruta tambien el chofer y la
  // unidad (placa), todos de sus catalogos.
  const [despacho, setDespacho] = useState("");
  const [almacenistasCat, setAlmacenistasCat] = useState<string[]>([]);
  const [chofer, setChofer] = useState("");
  const [placa, setPlaca] = useState("");
  const [choferesCat, setChoferesCat] = useState<string[]>([]);
  const [unidadesCat, setUnidadesCat] = useState<
    { placa: string; descripcion: string | null }[]
  >([]);

  // Decision de Seguridad cuando no aprueba.
  const [noAprobar, setNoAprobar] = useState(false);
  const [decision, setDecision] = useState<DecisionSeguridad | null>(null);
  // Etapa y ronda con las que se tomo la decision en curso (ver aplicar).
  const claveDecision = useRef<string | null>(null);
  // Campos que se estan escribiendo y todavia no se guardaron ("porton:12",
  // "armado:12"...). Cada guardado, y cada aviso en vivo, recarga todo el
  // egreso: sin esto la recarga pisaba lo que se estaba escribiendo en la
  // casilla siguiente (contando rapido con Tab se perdian o se mezclaban
  // cantidades, #326).
  const sinGuardar = useRef(new Set<string>());
  const editando = (campo: string, itemId: number) => sinGuardar.current.add(`${campo}:${itemId}`);
  const guardado = (campo: string, itemId: number) => sinGuardar.current.delete(`${campo}:${itemId}`);
  const [motivoNoAprobado, setMotivoNoAprobado] = useState("");

  // Calificacion final.
  // Dos notas al cerrar (issue #302): picking y despacho.
  const [notas, setNotas] = useState<Record<Aspecto, Nota>>({
    picking: { estrellas: 0, comentario: "" },
    despacho: { estrellas: 0, comentario: "" },
  });
  const cambiarNota = (a: Aspecto, cambio: Partial<Nota>) =>
    setNotas((p) => ({ ...p, [a]: { ...p[a], ...cambio } }));

  const aplicar = useCallback((json: any) => {
    const m = json.movimiento as Movimiento;
    // Si cambio la etapa o la ronda (el egreso se devolvio y volvio al
    // porton), la decision anterior no vale: sin esto la ronda 2 abria con
    // "Devolver a Almacen" y el motivo viejo ya puestos, a un toque de
    // devolverlo otra vez.
    const clave = `${m?.etapa}|${m?.ronda_verificacion ?? 1}`;
    if (claveDecision.current !== null && claveDecision.current !== clave) {
      setNoAprobar(false);
      setDecision(null);
      setMotivoNoAprobado("");
    }
    claveDecision.current = clave;
    setMov(m);
    const its = (json.items || []) as Item[];
    setItems(its);
    setCalificaciones(json.calificaciones || []);
    setSeriales(json.seriales || []);
    setNovedadesGuardadas(json.novedades || []);
    const a: Record<number, string> = {};
    const p: Record<number, string> = {};
    const ns: Record<number, boolean> = {};
    const mo: Record<number, string> = {};
    for (const it of its) {
      a[it.id] = num(it.cantidad_armado) === null ? "" : String(num(it.cantidad_armado));
      p[it.id] =
        num(it.cantidad_verificada) === null ? "" : String(num(it.cantidad_verificada));
      ns[it.id] = Number(it.no_salio) === 1;
      mo[it.id] = it.observacion || "";
    }
    // Lo que se esta escribiendo se queda como esta; el resto, de la base.
    const conservar = <T,>(campo: string, previo: Record<number, T>, base: Record<number, T>) => {
      const salida: Record<number, T> = { ...base };
      for (const it of its) {
        if (sinGuardar.current.has(`${campo}:${it.id}`) && it.id in previo) salida[it.id] = previo[it.id];
      }
      return salida;
    };
    setArmado((prev) => conservar("armado", prev, a));
    setPorton((prev) => conservar("porton", prev, p));
    setNoSalio((prev) => conservar("no_salio", prev, ns));
    setMotivos((prev) => conservar("motivo", prev, mo));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}`);
      if (!res.ok) return;
      aplicar(await res.json());
    } finally {
      setCargando(false);
    }
  }, [id, aplicar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // En vivo: cualquier movimiento de ESTE egreso (lo mueve el otro rol, o
  // otra persona del mismo) recarga la pantalla.
  useMercanciaEnVivo((a) => {
    if (a.id === Number(id)) void cargar();
  });

  // Los catalogos solo hacen falta en el paso de asignar despacho; choferes y
  // unidades, solo si sale por ruta.
  const esRuta = requiereVehiculo(esTipoEntrega(mov?.tipo_entrega) ? mov!.tipo_entrega : null);
  useEffect(() => {
    if (mov?.etapa !== "por_asignar_despacho") return;
    (async () => {
      try {
        const [ra, rc, ru] = await Promise.all([
          fetch("/api/seguridad/mercancia/catalogo/almacenistas"),
          esRuta ? fetch("/api/seguridad/mercancia/catalogo/choferes") : null,
          esRuta ? fetch("/api/seguridad/mercancia/catalogo/unidades") : null,
        ]);
        setAlmacenistasCat(
          ra.ok ? ((await ra.json()).almacenistas || []).map((x: any) => x.nombre) : [],
        );
        if (rc?.ok) setChoferesCat(((await rc.json()).choferes || []).map((x: any) => x.nombre));
        if (ru?.ok) setUnidadesCat((await ru.json()).unidades || []);
      } catch {
        // Sin catalogo el select queda vacio; el boton no avanza sin despacho.
      }
    })();
  }, [mov?.etapa, esRuta]);

  // Un egreso por ruta que ya traia chofer y placa (registrado antes de que
  // se pidieran al asignar) arranca con esos valores, no en blanco.
  useEffect(() => {
    if (mov?.etapa !== "por_asignar_despacho" || !esRuta) return;
    if (mov.chofer_nombre) setChofer((v) => v || mov.chofer_nombre || "");
    if (mov.placa_vehiculo) setPlaca((v) => v || mov.placa_vehiculo || "");
  }, [mov?.etapa, esRuta, mov?.chofer_nombre, mov?.placa_vehiculo]);

  const accionar = async (accion: Accion, extra: Record<string, unknown> = {}) => {
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}/etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      // El conteo del armado se manda entero al verificar: la respuesta (o la
      // recarga) trae lo guardado, ya no hay nada "sin guardar" ahi.
      if (accion === "verificar_armado") {
        for (const k of [...sinGuardar.current]) if (k.startsWith("armado:")) sinGuardar.current.delete(k);
      }
      if (res.status === 409) {
        // Otra persona ya lo movio: se muestra lo que hay ahora.
        setAviso(json.error || null);
        await cargar();
        return;
      }
      if (!res.ok) {
        // Al asignar el despacho la API relee los seriales aunque no deje
        // avanzar: se recarga para mostrar cuales faltan.
        if (json.seriales_estado) await cargar();
        throw new Error(json.error || tm("error"));
      }
      aplicar(json);
      if (accion === "verificar_armado" && json.avanzo === false && json.armado) {
        setError(
          tf("armado_diferencias", {
            dif: json.armado.diferencias,
            sin: json.armado.sinContar,
          }),
        );
      }
    } catch (e: any) {
      setError(e?.message || tm("error"));
    } finally {
      setEnviando(false);
    }
  };

  // "Actualizar desde Odoo" (issue #299): relee los seriales del picking.
  const actualizarSeriales = async () => {
    setError(null);
    setAviso(null);
    setLeyendoSeriales(true);
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}/seriales`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || tm("error"));
      aplicar(json);
    } catch (e: any) {
      setError(e?.message || tm("error"));
    } finally {
      setLeyendoSeriales(false);
    }
  };

  // Verificacion en C4 (#301): lo que no se pistolea (cantidad escrita a mano,
  // "No salio" y su motivo) se guarda al momento, como las lecturas.
  // Lo que hay escrito en pantalla ahora, para que la respuesta de un guardado
  // sepa si se volvio a escribir mientras estaba en camino.
  const enPantalla = useRef({ porton, noSalio, motivos });
  enPantalla.current = { porton, noSalio, motivos };

  const guardarPorton = async (itemId: number, datos: Record<string, unknown>) => {
    setError(null);
    // Lo que se manda deja de estar "sin guardar" cuando responde, salvo que
    // se haya vuelto a escribir mientras tanto: eso sigue sin guardar y se
    // guarda al salir del campo.
    const sigueIgual: Record<string, () => boolean> = {
      porton: () =>
        String(enPantalla.current.porton[itemId] ?? "") ===
        (datos.cantidad === null || datos.cantidad === undefined ? "" : String(datos.cantidad)),
      no_salio: () => !!enPantalla.current.noSalio[itemId] === !!datos.no_salio,
      motivo: () =>
        (enPantalla.current.motivos[itemId] || "").trim() === String(datos.observacion ?? "").trim(),
    };
    const campos = [
      ...("cantidad" in datos ? ["porton"] : []),
      ...("no_salio" in datos ? ["no_salio", "motivo"] : []),
    ];
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}/escaneo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, ...datos }),
      });
      const json = await res.json().catch(() => ({}));
      campos.forEach((c) => sigueIgual[c]() && guardado(c, itemId));
      if (!res.ok) throw new Error(json.error || tm("error"));
      aplicar(json);
    } catch (e: any) {
      campos.forEach((c) => guardado(c, itemId));
      setError(e?.message || tm("error"));
      await cargar();
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-300">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!mov || !esEtapa(mov.etapa)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        {tm("vacio")}
      </div>
    );
  }

  const tipo = esTipoEntrega(mov.tipo_entrega) ? mov.tipo_entrega : null;
  const recorrido = etapasDelRecorrido(tipo);
  const actual = indiceEtapa(mov.etapa, tipo);
  const responsable = RESPONSABLE[mov.etapa];
  // superadmin puede todo (mismo criterio que la API); el resto, lo suyo.
  const meToca = responsable !== null && (rol === responsable || rol === "superadmin");

  // Quien y cuando cerro cada etapa, para la linea de tiempo.
  const detalleEtapa: Record<Etapa, string | null> = {
    por_armar: [mov.almacenista_armado, hora(mov.created_at)].filter(Boolean).join(" · ") || null,
    armando: hora(mov.armado_inicio_at),
    pre_despacho: hora(mov.armado_fin_at),
    por_empaquetar:
      [mov.armado_verificado_por, hora(mov.armado_verificado_at)].filter(Boolean).join(" · ") ||
      null,
    por_asignar_despacho:
      mov.empaquetado_at
        ? [mov.empaquetado_por, hora(mov.empaquetado_at)].filter(Boolean).join(" · ")
        : [mov.armado_verificado_por, hora(mov.armado_verificado_at)].filter(Boolean).join(" · ") ||
          null,
    por_verificar:
      [mov.almacenista_despacho, hora(mov.despacho_asignado_at)].filter(Boolean).join(" · ") ||
      null,
    por_calificar:
      [mov.verificado_por, hora(mov.verificado_at)].filter(Boolean).join(" · ") || null,
    cerrado: hora(mov.cerrado_at),
  };

  const resultado = resultadoEgreso(mov);

  // Novedades de la ronda en curso, calculadas igual que la API al cerrar.
  const ronda = Number(mov.ronda_verificacion || 1);
  const novedades = novedadesVerificacion(items, {
    seriales,
    sobrantes: novedadesGuardadas.filter((n) => n.ronda === ronda && n.origen === "escaneo"),
  });
  // En vivo, mientras se pistolea: solo lo anormal; las faltas, contadas. Al
  // decidir (o fuera del porton), la lista completa.
  const faltan = faltanPorPistolear(novedades);
  const anormales = novedades.filter(esAnormalEnVivo).length;
  const novedadesEnVivo = noAprobar ? novedades : novedades.filter(esAnormalEnVivo);
  const porSerial = (it: Item) => verificaPorSerial(it, seriales);
  const verificadosDe = (itemId: number) =>
    seriales.filter((x) => Number(x.item_id) === itemId && x.verificado_at).length;
  const faltaMotivoRenglon = items.some((it) => noSalio[it.id] && !motivos[it.id]?.trim());

  // Seriales: los relee Almacen mientras el egreso es suyo; despues quedan
  // fijos. El estado se calcula igual que en la API (evaluarSeriales).
  const estadoSeriales = evaluarSeriales(items, seriales);
  const hayConSerial = items.some((it) => Number(it.lleva_serial) === 1);
  const puedeLeerSeriales =
    enAlmacen(mov.etapa) && (rol === "almacen" || rol === "superadmin");
  const serialesPorItem = new Map<number, Serial[]>();
  for (const s of seriales) {
    const lista = serialesPorItem.get(Number(s.item_id)) || [];
    lista.push(s);
    serialesPorItem.set(Number(s.item_id), lista);
  }

  const contandoArmado = mov.etapa === "pre_despacho" && meToca;
  const contandoPorton = mov.etapa === "por_verificar" && meToca;

  // Una nota por aspecto; las de antes de #302 (sin aspecto) son del despacho.
  const notaDe = (a: Aspecto) => calificaciones.find((c) => (c.aspecto || "despacho") === a);
  const quienDe: Record<Aspecto, string | null> = {
    picking: mov.almacenista_armado || mov.almacenista_nombre || null,
    despacho: mov.almacenista_despacho || mov.almacenista_nombre || null,
  };
  // Lo que Seguridad encontro al verificar: se ve al calificar, para no
  // calificar a ciegas (misma regla que la API). Incluye las de rondas
  // anteriores: si Seguridad lo devolvio, el picking fallo aunque la ultima
  // verificacion saliera limpia.
  const novedadesPrevias = novedadesGuardadas.filter((n) => n.origen === "cierre" && n.ronda < ronda);
  // En un cancelado, lo que falta es lo que nunca iba a salir (misma regla
  // que la API).
  const novedadesCalificar = novedadesQueCuentan(novedades, mov.decision_seguridad === "cancelar");
  const hayNovedades =
    novedadesCalificar.length > 0 ||
    ronda > 1 ||
    novedadesPrevias.length > 0 ||
    rechazoDeSeguridad(mov);
  const faltaComentarioPicking =
    pideComentarioPicking(notas.picking.estrellas, hayNovedades) && !notas.picking.comentario.trim();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        titulo={mov.odoo_picking_name || tm("sin_factura")}
        subtitulo={`${fechaCorta(mov.fecha)} · ${mov.contraparte || "—"}`}
        volverA={`/${locale}/seguridad/mercancia/egreso`}
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-32">
        {/* Donde esta y a quien le toca: lo primero que se mira. */}
        <EstadoActual
          etapa={mov.etapa}
          resultado={resultado}
          responsable={responsable}
          meToca={meToca}
          tf={tf}
        />

        {aviso && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {aviso}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            {/* Datos del egreso */}
            <Card>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Dato etiqueta={tf("tipo_entrega")} valor={tipo ? tf(`entrega.${tipo}`) : "—"} />
                <Dato etiqueta={tf("almacenista_armado")} valor={mov.almacenista_armado} />
                <Dato etiqueta={tf("almacenista_despacho")} valor={mov.almacenista_despacho} />
                <Dato etiqueta={tm("factura")} valor={mov.facturas?.join(", ")} />
                {!!mov.facturas_venta?.length && (
                  <Dato
                    etiqueta={tm("factura_venta")}
                    valor={`${mov.facturas_venta.join(", ")} · ${fechaCorta(mov.factura_venta_fecha)}`}
                  />
                )}
                {(esRuta || mov.chofer_nombre || mov.placa_vehiculo) && (
                  <>
                    <Dato etiqueta={tm("chofer")} valor={mov.chofer_nombre} />
                    <Dato etiqueta={tm("placa")} valor={mov.placa_vehiculo} />
                  </>
                )}
              </dl>
              {mov.observaciones && (
                <p className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600 whitespace-pre-line">
                  {mov.observaciones}
                </p>
              )}
            </Card>

            {/* Renglones: la orden, lo que conto Almacen y lo que conto Seguridad. */}
            <Card>
              <SectionTitle>
                {tm("items")} ({items.length})
              </SectionTitle>
              {contandoArmado && <p className="text-xs text-slate-500 -mt-1 mb-3">{tf("armado_ayuda")}</p>}
              {contandoPorton && <p className="text-xs text-slate-500 -mt-1 mb-3">{tf("verificacion.ayuda")}</p>}
              {contandoPorton && (
                <Pistola
                  endpoint={`/api/seguridad/mercancia/${id}/escaneo`}
                  textos="seguridad.mercancia.flujo.verificacion"
                  permitirSobrante
                  permitirAprender={false}
                  items={items.map((it) => ({
                    id: it.id,
                    codigo: it.codigo,
                    producto: it.producto,
                    lleva_serial: porSerial(it),
                    esperado: Number(it.cantidad_cargada),
                    recibido: porSerial(it) ? verificadosDe(it.id) : Number(it.cantidad_verificada || 0),
                  }))}
                  seleccionado={pistolaItem}
                  onResultado={(r) => {
                    if (r.resultado === "seleccionado") setPistolaItem(r.item_id);
                    void cargar();
                  }}
                  onNovedad={() => void cargar()}
                  onTerminar={() => setPistolaItem(null)}
                />
              )}

              {/* Seriales del picking (issue #299): Almacen los trae de Odoo y
                  no pasa a Seguridad hasta que esten todos. */}
              {(puedeLeerSeriales || hayConSerial) && (
                <div className="mb-3 space-y-2">
                  {puedeLeerSeriales && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <BotonSecundario
                        onClick={actualizarSeriales}
                        disabled={leyendoSeriales}
                        icon={leyendoSeriales ? undefined : RefreshCw}
                      >
                        {leyendoSeriales && <Loader2 className="w-4 h-4 animate-spin" />}
                        {tf("seriales_actualizar")}
                      </BotonSecundario>
                      <span className="text-[11px] text-slate-400">
                        {mov.seriales_leidos_at
                          ? tf("seriales_leidos", { hora: hora(mov.seriales_leidos_at) || "—" })
                          : tf("seriales_sin_leer")}
                      </span>
                    </div>
                  )}
                  {estadoSeriales.faltantes.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                      <span>{tf("seriales_faltan")}</span>
                    </div>
                  )}
                </div>
              )}

              <div className={`grid ${COLUMNAS} gap-x-2 items-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100`}>
                <span>{tm("producto")}</span>
                <span className="text-right">{tf("col_orden")}</span>
                <span className="text-right">{tf("col_armado")}</span>
                <span className="text-right">{tf("col_porton")}</span>
              </div>

              {items.map((it) => {
                const orden = Number(it.cantidad_cargada);
                const vArm = armado[it.id] ?? "";
                // Con serial, lo verificado son sus seriales pistoleados.
                const vPor =
                  porSerial(it) && (contandoPorton || mov.verificado_at)
                    ? String(verificadosDe(it.id))
                    : porton[it.id] ?? "";
                const difArm = vArm !== "" && Number(vArm) !== orden;
                const difPor = !noSalio[it.id] && vPor !== "" && Number(vPor) !== orden;
                return (
                  <div key={it.id} className="py-2.5 border-b border-slate-50 last:border-0">
                    <div className={`grid ${COLUMNAS} gap-x-2 items-center`}>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{it.producto}</p>
                        {it.codigo && <p className="text-[11px] font-mono text-slate-400 truncate">{it.codigo}</p>}
                        {Number(it.lleva_serial) === 1 && (
                          <p
                            className={`text-[11px] font-medium mt-0.5 ${
                              (serialesPorItem.get(it.id)?.length || 0) === orden
                                ? "text-emerald-600"
                                : "text-amber-700"
                            }`}
                          >
                            {tf("seriales_conteo", {
                              cargados: serialesPorItem.get(it.id)?.length || 0,
                              esperados: orden,
                            })}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-slate-700 text-right">{orden}</span>
                      <Celda
                        editable={contandoArmado}
                        valor={vArm}
                        diferencia={difArm}
                        onChange={(v) => {
                          editando("armado", it.id);
                          setArmado((p) => ({ ...p, [it.id]: v }));
                        }}
                      />
                      <Celda
                        editable={contandoPorton && !porSerial(it) && !noSalio[it.id]}
                        valor={noSalio[it.id] ? "—" : vPor}
                        diferencia={difPor}
                        onChange={(v) => {
                          editando("porton", it.id);
                          setPorton((p) => ({ ...p, [it.id]: v }));
                        }}
                        onBlur={(v) => {
                          const antes = num(it.cantidad_verificada);
                          const ahora = v === "" ? null : Number(v);
                          if (ahora !== antes) void guardarPorton(it.id, { cantidad: ahora });
                          else guardado("porton", it.id);
                        }}
                      />
                    </div>

                    {!!serialesPorItem.get(it.id)?.length && (
                      <ListaSeriales
                        seriales={serialesPorItem.get(it.id)!}
                        tf={tf}
                        marcarVerificados={["por_verificar", "por_calificar", "cerrado"].includes(mov.etapa) || ronda > 1}
                      />
                    )}

                    {/* "No salio" solo en el porton, que es donde se ve si salio. */}
                    {(contandoPorton || noSalio[it.id]) && (
                      <div className="mt-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!noSalio[it.id]}
                            disabled={!contandoPorton}
                            onChange={(e) => {
                              const marcado = e.target.checked;
                              editando("no_salio", it.id);
                              setNoSalio((p) => ({ ...p, [it.id]: marcado }));
                              void guardarPorton(it.id, {
                                no_salio: marcado,
                                observacion: (motivos[it.id] || "").trim(),
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400 disabled:opacity-60"
                          />
                          {tm("no_salio_checkbox")}
                        </label>
                        {noSalio[it.id] && (
                          <input
                            type="text"
                            value={motivos[it.id] || ""}
                            disabled={!contandoPorton}
                            onChange={(e) =>
                              {
                                editando("motivo", it.id);
                                setMotivos((p) => ({ ...p, [it.id]: e.target.value.slice(0, 300) }));
                              }
                            }
                            onBlur={(e) => {
                              if (e.target.value.trim() !== (it.observacion || "")) {
                                void guardarPorton(it.id, { no_salio: true, observacion: e.target.value.trim() });
                              } else {
                                guardado("motivo", it.id);
                              }
                            }}
                            placeholder={tm("motivo_placeholder")}
                            className={`mt-1.5 w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-60 disabled:bg-slate-50 focus:outline-none ${
                              contandoPorton && !motivos[it.id]?.trim()
                                ? "border-red-300 bg-red-50"
                                : "border-slate-200"
                            }`}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            {/* Novedades de la verificacion en C4 (#301): las de la ronda en curso
                mientras Seguridad pistolea, y el historial de las anteriores. */}
            {(novedadesGuardadas.some((n) => n.origen === "cierre") ||
              (contandoPorton && (novedadesEnVivo.length > 0 || faltan > 0))) && (
              <TarjetaNovedades
                actuales={contandoPorton ? novedadesEnVivo : []}
                faltan={contandoPorton && !noAprobar ? faltan : 0}
                guardadas={novedadesGuardadas.filter((n) => n.origen === "cierre")}
                tf={tf}
              />
            )}
            {seriales.length > 0 && (mov.verificado_at || contandoPorton) && (
              <div className="flex justify-end">
                <BotonSecundario
                  onClick={() => {
                    window.location.href = `/api/seguridad/mercancia/${id}/seriales/export`;
                  }}
                  icon={Download}
                >
                  {tf("verificacion.excel_seriales")}
                </BotonSecundario>
              </div>
            )}

            {/* Resultado del porton, cuando ya lo hay */}
            {resultado && (
              <Card>
                <SectionTitle>{tf("resultado." + resultado)}</SectionTitle>
                {mov.motivo_no_aprobado && (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{tf("motivo")}:</span> {mov.motivo_no_aprobado}
                  </p>
                )}
                {ASPECTOS.map((a) => {
                  const nota = notaDe(a);
                  if (!nota) return null;
                  return (
                    <div key={a} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-medium text-slate-600 w-full sm:w-auto">
                        {tf(`aspecto.${a}`)} · {nota.almacenista_nombre}
                      </span>
                      <StarRatingDisplay value={Number(nota.calificacion)} showValue />
                      {nota.comentario && <span className="text-xs text-slate-500">{nota.comentario}</span>}
                    </div>
                  );
                })}
              </Card>
            )}

            {/* Firma de Seguridad: da fe de lo que salio, desde el porton. */}
            {(rol === "seguridad" || rol === "superadmin") &&
              ["por_verificar", "por_calificar", "cerrado"].includes(mov.etapa) && (
                <FirmasActa
                  tipo="mercancia"
                  actaId={mov.id}
                  roles={["seguridad"]}
                  nombresSugeridos={{ seguridad: user?.name }}
                  permitirRehacer={rol === "superadmin"}
                />
              )}

            {/* Panel del paso actual */}
            {meToca && (
              <PanelPaso>
                {mov.etapa === "por_armar" && (
                  <BotonPrimario onClick={() => accionar("iniciar_armado")} disabled={enviando} icon={Play} className="w-full h-12">
                    {tf("iniciar_armado")}
                  </BotonPrimario>
                )}

                {mov.etapa === "armando" && (
                  <BotonPrimario onClick={() => accionar("terminar_armado")} disabled={enviando} icon={Box} className="w-full h-12">
                    {tf("terminar_armado")}
                  </BotonPrimario>
                )}

                {mov.etapa === "pre_despacho" && (
                  <BotonPrimario
                    onClick={() =>
                      accionar("verificar_armado", {
                        items: items.map((it) => ({
                          id: it.id,
                          cantidad_armado: armado[it.id] === "" ? null : Number(armado[it.id]),
                        })),
                      })
                    }
                    disabled={enviando}
                    icon={CheckCircle2}
                    className="w-full h-12"
                  >
                    {tf("verificar_armado")}
                  </BotonPrimario>
                )}

                {mov.etapa === "por_empaquetar" && (
                  <BotonPrimario onClick={() => accionar("empaquetar")} disabled={enviando} icon={PackageCheck} className="w-full h-12">
                    {tf("empaquetar")}
                  </BotonPrimario>
                )}

                {mov.etapa === "por_asignar_despacho" && (
                  <div className="space-y-3">
                    <div>
                      <label className={labelClases}>{tf("almacenista_despacho")} *</label>
                      <select value={despacho} onChange={(e) => setDespacho(e.target.value)} className={inputClases}>
                        <option value="">{tAlm("select_placeholder")}</option>
                        {almacenistasCat.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    {esRuta && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <EtiquetaCatalogo
                            etiqueta={`${tm("chofer")} *`}
                            vacio={choferesCat.length === 0}
                            gestionar={gestionaPersonal ? { href: `/${locale}/seguridad/mercancia/personal`, texto: tCho("gestionar") } : null}
                          />
                          <select value={chofer} onChange={(e) => setChofer(e.target.value)} className={inputClases}>
                            <option value="">{tCho("select_placeholder")}</option>
                            {choferesCat.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          {choferesCat.length === 0 && (
                            <p className="mt-1 text-[11px] text-amber-700">{tf("catalogo_vacio_chofer")}</p>
                          )}
                        </div>
                        <div>
                          <EtiquetaCatalogo
                            etiqueta={`${tm("placa")} *`}
                            vacio={unidadesCat.length === 0}
                            gestionar={gestionaPersonal ? { href: `/${locale}/seguridad/mercancia/unidades`, texto: tUni("gestionar") } : null}
                          />
                          <select value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputClases}>
                            <option value="">{tUni("select_placeholder")}</option>
                            {unidadesCat.map((u) => (
                              <option key={u.placa} value={u.placa}>
                                {u.descripcion ? `${u.placa} — ${u.descripcion}` : u.placa}
                              </option>
                            ))}
                          </select>
                          {unidadesCat.length === 0 && (
                            <p className="mt-1 text-[11px] text-amber-700">{tf("catalogo_vacio_unidad")}</p>
                          )}
                        </div>
                      </div>
                    )}
                    <BotonPrimario
                      onClick={() =>
                        accionar("asignar_despacho", {
                          almacenista_despacho: despacho,
                          ...(esRuta ? { chofer_nombre: chofer, placa_vehiculo: placa } : {}),
                        })
                      }
                      disabled={enviando || !despacho || (esRuta && (!chofer || !placa))}
                      icon={Truck}
                      className="w-full h-12"
                    >
                      {tf("asignar_despacho")}
                    </BotonPrimario>
                  </div>
                )}

                {mov.etapa === "por_verificar" && (
                  <div className="space-y-3">
                    {!noAprobar ? (
                      <>
                        <BotonPrimario
                          onClick={() => accionar("verificar_seguridad", { aprobado: true })}
                          disabled={enviando || novedades.length > 0 || faltaMotivoRenglon}
                          icon={ShieldCheck}
                          className="w-full h-12"
                        >
                          {tf("aprobar")}
                        </BotonPrimario>
                        {/* Las mismas cuentas que la tarjeta: las novedades aparte de lo
                            que todavia falta por pistolear. */}
                        {novedades.length > 0 && (
                          <p className="text-xs text-slate-500 text-center">
                            {[
                              anormales > 0 ? tf("verificacion.aprobar_requiere", { n: anormales }) : null,
                              faltan > 0 ? tf("verificacion.faltan", { n: faltan }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <BotonSecundario onClick={() => setNoAprobar(true)} disabled={enviando} icon={XCircle} className="w-full">
                          {novedades.length > 0 ? tf("verificacion.decidir") : tf("no_aprobar")}
                        </BotonSecundario>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className={labelClases}>{tf("decision")}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {DECISIONES_UI.map(({ valor, etiqueta, activa }) => (
                            <button
                              key={valor}
                              type="button"
                              onClick={() => setDecision(valor)}
                              aria-pressed={decision === valor}
                              className={`min-h-11 px-2 py-2 rounded-xl border text-[13px] font-semibold transition-colors ${
                                decision === valor ? activa : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {tf(etiqueta)}
                            </button>
                          ))}
                        </div>
                        {decision === "devolver" && (
                          <p className="text-xs text-slate-500">{tf("verificacion.no_despachar_ayuda")}</p>
                        )}
                        {decision === "cancelar" && (
                          <p className="text-xs text-slate-500">{tf("verificacion.cancelar_ayuda")}</p>
                        )}
                        <textarea
                          value={motivoNoAprobado}
                          onChange={(e) => setMotivoNoAprobado(e.target.value.slice(0, 500))}
                          placeholder={tf("verificacion.motivo")}
                          className={`${inputClases} h-auto min-h-[80px] py-2.5`}
                        />
                        <div className="flex gap-2">
                          <BotonSecundario onClick={() => setNoAprobar(false)} disabled={enviando} className="flex-1">
                            {tf("cancelar")}
                          </BotonSecundario>
                          <BotonPrimario
                            onClick={() =>
                              accionar("verificar_seguridad", {
                                aprobado: false,
                                decision,
                                motivo: motivoNoAprobado.trim(),
                              })
                            }
                            disabled={
                              enviando ||
                              decision === null ||
                              !motivoNoAprobado.trim() ||
                              faltaMotivoRenglon
                            }
                            className="flex-1"
                          >
                            {tf("confirmar_no_aprobado")}
                          </BotonPrimario>
                        </div>
                      </div>
                    )}
                    {faltaMotivoRenglon && (
                      <p className="text-xs text-red-600 text-center">{tm("motivo_obligatorio")}</p>
                    )}
                  </div>
                )}

                {mov.etapa === "por_calificar" && (
                  <div className="space-y-4">
                    {hayNovedades && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1">
                        <p className="font-semibold">{tf("novedades_titulo")}</p>
                        {novedadesCalificar.length === 0 && novedadesPrevias.length === 0 ? (
                          <p>{tf("no_aprobado_sin_renglones")}</p>
                        ) : (
                          novedadesCalificar.map((n) => (
                            <p key={claveNovedad(n)} className="truncate">
                              {textoNovedad(n, tf)}
                            </p>
                          ))
                        )}
                        {ronda > 1 && (
                          <div className="pt-1.5 mt-1.5 border-t border-amber-200/70 space-y-1">
                            <p className="font-semibold">{tf("verificacion.rondas_previas", { n: ronda - 1 })}</p>
                            {novedadesPrevias.map((n) => (
                              <p key={`${n.ronda}-${claveNovedad(n)}`} className="truncate">
                                {tf("verificacion.ronda", { n: n.ronda })} · {textoNovedad(n, tf)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {aspectosACalificar(mov).map((a) => (
                      <div key={a} className="space-y-2">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-900">
                            {tf(`calificar_${a}`, { name: quienDe[a] || "—" })}
                          </p>
                          <p className="text-xs text-slate-500">{tf(`calificar_${a}_ayuda`)}</p>
                        </div>
                        <StarRating value={notas[a].estrellas} onChange={(v) => cambiarNota(a, { estrellas: v })} />
                        <input
                          type="text"
                          value={notas[a].comentario}
                          onChange={(e) => cambiarNota(a, { comentario: e.target.value.slice(0, 500) })}
                          placeholder={tc("comment_placeholder")}
                          className={`${inputClases} ${
                            a === "picking" && faltaComentarioPicking ? "border-red-300 bg-red-50" : ""
                          }`}
                        />
                        {a === "picking" && faltaComentarioPicking && (
                          <p className="text-xs text-red-600">
                            {tf("comentario_picking_obligatorio", { n: notas.picking.estrellas })}
                          </p>
                        )}
                      </div>
                    ))}
                    <BotonPrimario
                      onClick={() =>
                        accionar("calificar", {
                          picking: {
                            calificacion: notas.picking.estrellas,
                            comentario: notas.picking.comentario.trim() || null,
                          },
                          // Un cancelado no lleva nota de despacho.
                          ...(aspectosACalificar(mov).includes("despacho")
                            ? {
                                despacho: {
                                  calificacion: notas.despacho.estrellas,
                                  comentario: notas.despacho.comentario.trim() || null,
                                },
                              }
                            : {}),
                        })
                      }
                      disabled={
                        enviando ||
                        notas.picking.estrellas < 1 ||
                        (aspectosACalificar(mov).includes("despacho") && notas.despacho.estrellas < 1) ||
                        faltaComentarioPicking
                      }
                      className="w-full h-12"
                    >
                      {tf("calificar_cerrar")}
                    </BotonPrimario>
                  </div>
                )}

                {enviando && (
                  <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </p>
                )}
              </PanelPaso>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Recorrido completo, con quien y cuando. */}
          <Card className="md:sticky md:top-24">
            <SectionTitle>{tf("recorrido")}</SectionTitle>
            <ol className="space-y-3">
              {recorrido.map((e, i) => {
                const hecha = i < actual || mov.etapa === "cerrado";
                const esActual = i === actual && mov.etapa !== "cerrado";
                const Icono = hecha ? CheckCircle2 : esActual ? Clock : Circle;
                return (
                  <li key={e} className="flex items-start gap-2.5">
                    <Icono
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        hecha ? "text-emerald-500" : esActual ? "text-[color:var(--portal-primary,#741DFE)]" : "text-slate-300"
                      }`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm ${
                          esActual ? "font-semibold text-slate-900" : hecha ? "text-slate-700" : "text-slate-400"
                        }`}
                      >
                        {tf(`etapa.${e}`)}
                      </p>
                      {(hecha || esActual) && detalleEtapa[e] && (
                        <p className="text-[11px] text-slate-400 truncate">{detalleEtapa[e]}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </main>
    </div>
  );
}

function EstadoActual({
  etapa,
  resultado,
  responsable,
  meToca,
  tf,
}: {
  etapa: Etapa;
  resultado: string | null;
  responsable: "almacen" | "seguridad" | null;
  meToca: boolean;
  tf: ReturnType<typeof useTranslations>;
}) {
  if (etapa === "cerrado") {
    const malo = resultado === "no_despachado";
    const regular = resultado === "no_aprobado_despachado";
    // Cancelado: no salio porque se cancelo el pedido. No es un error del
    // despacho, asi que ni rojo ni verde.
    const cancelado = resultado === "cancelado";
    return (
      <div
        className={`rounded-2xl border p-4 flex items-center gap-3 ${
          malo
            ? "border-red-200 bg-red-50"
            : regular
              ? "border-amber-200 bg-amber-50"
              : cancelado
                ? "border-slate-200 bg-slate-50"
                : "border-emerald-200 bg-emerald-50"
        }`}
      >
        {malo ? (
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
        ) : cancelado ? (
          <Circle className="w-5 h-5 text-slate-400 shrink-0" />
        ) : regular ? (
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">{tf("etapa.cerrado")}</p>
          {resultado && <p className="text-sm text-slate-700">{tf(`resultado.${resultado}`)}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 flex items-center gap-3 ${
        meToca ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white"
      }`}
    >
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          meToca ? "bg-white text-[color:var(--portal-primary,#741DFE)]" : "bg-slate-100 text-slate-400"
        }`}
      >
        {responsable === "seguridad" ? <ShieldCheck className="w-4 h-4" /> : <Package className="w-4 h-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{tf(`etapa.${etapa}`)}</p>
        <p className="text-sm text-slate-600">
          {meToca
            ? `${tf(`le_toca.${responsable}`)} · ${tf(`paso.${etapa}`)}`
            : tf("esperando", { rol: tf(`rol.${responsable}`), paso: tf(`paso.${etapa}`) })}
        </p>
      </div>
    </div>
  );
}

/**
 * Una novedad en una linea: "Producto: Falto 2 de 5", "Producto: Serial X no
 * se pistoleo"... Mismas claves (`flujo.novedad.<tipo>`) al verificar y al
 * calificar. Sin renglon (producto que no esta en la orden, serial de otra
 * orden) no lleva el nombre delante.
 */
/** Clave de React: un renglon puede tener varias (un serial_falta por serial). */
function claveNovedad(n: Novedad): string {
  return `${n.tipo}-${n.item_id ?? "x"}-${n.serial ?? n.producto}`;
}

function textoNovedad(n: Novedad, tf: ReturnType<typeof useTranslations>): string {
  const texto = tf(`novedad.${n.tipo}`, {
    contado: n.contado ?? 0,
    esperado: n.esperado,
    serial: n.serial || "",
    otra_orden: n.otra_orden || "—",
  });
  return [n.producto ? `${n.producto}: ${texto}` : texto, n.detalle].filter(Boolean).join(" · ");
}

/**
 * Novedades de la verificacion en C4. Arriba las de la ronda en curso (en
 * vivo, mientras se pistolea); abajo las de rondas cerradas, que es lo que ve
 * Almacen si Seguridad se lo devolvio.
 */
function TarjetaNovedades({
  actuales,
  faltan = 0,
  guardadas,
  tf,
}: {
  actuales: Novedad[];
  /** Mientras se pistolea: unidades que faltan (no se listan una por una). */
  faltan?: number;
  guardadas: NovedadGuardada[];
  tf: ReturnType<typeof useTranslations>;
}) {
  const rondas = [...new Set(guardadas.map((n) => n.ronda))].sort((a, b) => b - a);
  const lista = (novedades: Novedad[]) => (
    <ul className="divide-y divide-slate-100">
      {novedades.map((n) => (
        <li key={claveNovedad(n)} className="py-2 flex items-start gap-2 text-sm">
          <span
            className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${
              n.tipo === "falta" || n.tipo === "no_salio" || n.tipo === "serial_falta"
                ? "bg-red-500"
                : "bg-amber-500"
            }`}
          />
          <p className="min-w-0 flex-1 text-slate-800 break-words">{textoNovedad(n, tf)}</p>
        </li>
      ))}
    </ul>
  );
  return (
    <Card>
      <SectionTitle>{tf("novedades_titulo")}</SectionTitle>
      {faltan > 0 && (
        <p className="text-sm text-slate-500 tabular-nums">{tf("verificacion.faltan", { n: faltan })}</p>
      )}
      {actuales.length > 0 && lista(actuales)}
      {rondas.map((r) => (
        <div key={r} className="mt-3 pt-3 border-t border-slate-100 first:mt-0 first:pt-0 first:border-0">
          <p className="text-[11px] font-semibold text-slate-400 mb-1">{tf("verificacion.ronda", { n: r })}</p>
          {lista(guardadas.filter((n) => n.ronda === r))}
        </div>
      ))}
    </Card>
  );
}

/** Opciones cuando Seguridad no aprueba (ver DECISIONES en egresoFlujo). */
const DECISIONES_UI: Array<{ valor: DecisionSeguridad; etiqueta: string; activa: string }> = [
  { valor: "despachar", etiqueta: "despachar_igual", activa: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  { valor: "devolver", etiqueta: "verificacion.no_despachar", activa: "border-amber-300 bg-amber-50 text-amber-800" },
  { valor: "cancelar", etiqueta: "verificacion.cancelar", activa: "border-red-300 bg-red-50 text-red-800" },
];

function PanelPaso({ children }: { children: React.ReactNode }) {
  return <Card className="space-y-3 border-violet-200">{children}</Card>;
}

/** Chips de seriales de un renglon; con muchos, los primeros y el resto al desplegar. */
function ListaSeriales({
  seriales,
  tf,
  marcarVerificados = false,
}: {
  seriales: Serial[];
  tf: (k: string, v?: any) => string;
  /** En C4 y despues: verde lo pistoleado, rojo lo que falto (#301). */
  marcarVerificados?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const visibles = abierto ? seriales : seriales.slice(0, SERIALES_VISIBLES);
  const resto = seriales.length - visibles.length;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {visibles.map((s) => (
        <span
          key={s.id}
          title={s.verificado_por ? `${s.verificado_por} · ${hora(s.verificado_at) || ""}` : undefined}
          className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
            !marcarVerificados
              ? "bg-slate-100 text-slate-600"
              : s.verificado_at
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
          }`}
        >
          {s.serial}
        </span>
      ))}
      {resto > 0 && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75"
        >
          {tf("seriales_mas", { n: resto })}
        </button>
      )}
    </div>
  );
}

/** Etiqueta de un select de catalogo, con "Gestionar" para quien lo administra. */
function EtiquetaCatalogo({
  etiqueta,
  vacio,
  gestionar,
}: {
  etiqueta: string;
  vacio: boolean;
  gestionar: { href: string; texto: string } | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <label className={`${labelClases} mb-0`}>{etiqueta}</label>
      {gestionar && (
        <Link
          href={gestionar.href}
          className={`text-[11px] font-semibold hover:opacity-75 shrink-0 ${
            vacio ? "text-amber-700" : "text-[color:var(--portal-primary,#741DFE)]"
          }`}
        >
          {gestionar.texto}
        </Link>
      )}
    </div>
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

function Celda({
  editable,
  valor,
  diferencia,
  onChange,
  onBlur,
}: {
  editable: boolean;
  valor: string;
  diferencia: boolean;
  onChange: (v: string) => void;
  /** Al salir del campo (en C4 se guarda al momento). */
  onBlur?: (v: string) => void;
}) {
  if (!editable) {
    return (
      <span
        className={`text-sm tabular-nums text-right ${
          diferencia ? "font-semibold text-red-600" : valor === "" ? "text-slate-300" : "text-slate-700"
        }`}
      >
        {valor === "" ? "—" : valor}
      </span>
    );
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      className={`w-full h-10 px-2 text-right rounded-lg border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-100 ${
        diferencia
          ? "border-red-300 bg-red-50 text-red-700 font-semibold"
          : "border-slate-200 focus:border-[color:var(--portal-primary,#741DFE)]"
      }`}
    />
  );
}
