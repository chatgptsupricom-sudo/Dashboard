"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Package,
  PackageCheck,
  Play,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";
import FirmasActa from "@/components/seguridad/FirmasActa";
import { StarRating, StarRatingDisplay } from "@/components/seguridad/StarRating";
import {
  RESPONSABLE,
  esEtapa,
  esTipoEntrega,
  etapasDelRecorrido,
  indiceEtapa,
  requiereVehiculo,
  resultadoEgreso,
  type Accion,
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
};

type Movimiento = {
  id: number;
  fecha: string;
  odoo_picking_name: string | null;
  contraparte: string | null;
  facturas: string[];
  etapa: Etapa;
  tipo_entrega: TipoEntrega | null;
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
};

type Calificacion = {
  id: number;
  almacenista_nombre: string;
  calificacion: number | string;
  comentario: string | null;
  calificado_por: string | null;
};

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
  const [despacharIgual, setDespacharIgual] = useState<boolean | null>(null);
  const [motivoNoAprobado, setMotivoNoAprobado] = useState("");

  // Calificacion final.
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");

  const aplicar = useCallback((json: any) => {
    const m = json.movimiento as Movimiento;
    setMov(m);
    const its = (json.items || []) as Item[];
    setItems(its);
    setCalificaciones(json.calificaciones || []);
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
    setArmado(a);
    setPorton(p);
    setNoSalio(ns);
    setMotivos(mo);
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
      if (res.status === 409) {
        // Otra persona ya lo movio: se muestra lo que hay ahora.
        setAviso(json.error || null);
        await cargar();
        return;
      }
      if (!res.ok) throw new Error(json.error || tm("error"));
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

  // Conteo del porton en pantalla: aprobar exige todo contado y cuadrando
  // (la API lo vuelve a validar).
  const portonCuadra = items.every(
    (it) => !noSalio[it.id] && porton[it.id] !== "" && Number(porton[it.id]) === Number(it.cantidad_cargada),
  );
  const faltaMotivoRenglon = items.some((it) => noSalio[it.id] && !motivos[it.id]?.trim());

  const contandoArmado = mov.etapa === "pre_despacho" && meToca;
  const contandoPorton = mov.etapa === "por_verificar" && meToca;

  const cuerpoPorton = () =>
    items.map((it) => ({
      id: it.id,
      cantidad_verificada: porton[it.id] === "" || porton[it.id] === undefined ? null : Number(porton[it.id]),
      no_salio: !!noSalio[it.id],
      observacion: noSalio[it.id] ? (motivos[it.id] || "").trim() : null,
    }));

  const calificacion = calificaciones.find(
    (c) => c.almacenista_nombre === (mov.almacenista_despacho || ""),
  );

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
              {contandoPorton && <p className="text-xs text-slate-500 -mt-1 mb-3">{tf("verificar_ayuda")}</p>}

              <div className={`grid ${COLUMNAS} gap-x-2 items-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100`}>
                <span>{tm("producto")}</span>
                <span className="text-right">{tf("col_orden")}</span>
                <span className="text-right">{tf("col_armado")}</span>
                <span className="text-right">{tf("col_porton")}</span>
              </div>

              {items.map((it) => {
                const orden = Number(it.cantidad_cargada);
                const vArm = armado[it.id] ?? "";
                const vPor = porton[it.id] ?? "";
                const difArm = vArm !== "" && Number(vArm) !== orden;
                const difPor = !noSalio[it.id] && vPor !== "" && Number(vPor) !== orden;
                return (
                  <div key={it.id} className="py-2.5 border-b border-slate-50 last:border-0">
                    <div className={`grid ${COLUMNAS} gap-x-2 items-center`}>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{it.producto}</p>
                        {it.codigo && <p className="text-[11px] font-mono text-slate-400 truncate">{it.codigo}</p>}
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-slate-700 text-right">{orden}</span>
                      <Celda
                        editable={contandoArmado}
                        valor={vArm}
                        diferencia={difArm}
                        onChange={(v) => setArmado((p) => ({ ...p, [it.id]: v }))}
                      />
                      <Celda
                        editable={contandoPorton}
                        valor={noSalio[it.id] ? "—" : vPor}
                        diferencia={difPor}
                        onChange={(v) => setPorton((p) => ({ ...p, [it.id]: v }))}
                      />
                    </div>

                    {/* "No salio" solo en el porton, que es donde se ve si salio. */}
                    {(contandoPorton || noSalio[it.id]) && (
                      <div className="mt-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!noSalio[it.id]}
                            disabled={!contandoPorton}
                            onChange={(e) => setNoSalio((p) => ({ ...p, [it.id]: e.target.checked }))}
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
                              setMotivos((p) => ({ ...p, [it.id]: e.target.value.slice(0, 300) }))
                            }
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

            {/* Resultado del porton, cuando ya lo hay */}
            {resultado && (
              <Card>
                <SectionTitle>{tf("resultado." + resultado)}</SectionTitle>
                {mov.motivo_no_aprobado && (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{tf("motivo")}:</span> {mov.motivo_no_aprobado}
                  </p>
                )}
                {calificacion && (
                  <div className="mt-3 flex items-center gap-2">
                    <StarRatingDisplay value={Number(calificacion.calificacion)} showValue />
                    {calificacion.comentario && (
                      <span className="text-xs text-slate-500">{calificacion.comentario}</span>
                    )}
                  </div>
                )}
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
                          onClick={() => accionar("verificar_seguridad", { aprobado: true, items: cuerpoPorton() })}
                          disabled={enviando || !portonCuadra}
                          icon={ShieldCheck}
                          className="w-full h-12"
                        >
                          {tf("aprobar")}
                        </BotonPrimario>
                        {!portonCuadra && (
                          <p className="text-xs text-slate-500 text-center">{tf("aprobar_requiere")}</p>
                        )}
                        <BotonSecundario onClick={() => setNoAprobar(true)} disabled={enviando} icon={XCircle} className="w-full">
                          {tf("no_aprobar")}
                        </BotonSecundario>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className={labelClases}>{tf("decision")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[true, false].map((v) => (
                            <button
                              key={String(v)}
                              type="button"
                              onClick={() => setDespacharIgual(v)}
                              className={`h-11 rounded-xl border text-[13px] font-semibold transition-colors ${
                                despacharIgual === v
                                  ? v
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-red-300 bg-red-50 text-red-800"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {v ? tf("despachar_igual") : tf("no_despachar")}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={motivoNoAprobado}
                          onChange={(e) => setMotivoNoAprobado(e.target.value.slice(0, 500))}
                          placeholder={tf("motivo_no_aprobado")}
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
                                despachar: despacharIgual,
                                motivo: motivoNoAprobado.trim(),
                                items: cuerpoPorton(),
                              })
                            }
                            disabled={
                              enviando ||
                              despacharIgual === null ||
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
                  <div className="space-y-3">
                    <p className="text-[13px] font-semibold text-slate-900">
                      {tc("rate_for", { name: mov.almacenista_despacho || "—" })}
                    </p>
                    <StarRating value={estrellas} onChange={setEstrellas} />
                    <input
                      type="text"
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                      placeholder={tc("comment_placeholder")}
                      className={inputClases}
                    />
                    <BotonPrimario
                      onClick={() =>
                        accionar("calificar", { calificacion: estrellas, comentario: comentario.trim() || null })
                      }
                      disabled={enviando || estrellas < 1}
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
    return (
      <div
        className={`rounded-2xl border p-4 flex items-center gap-3 ${
          malo
            ? "border-red-200 bg-red-50"
            : regular
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
        }`}
      >
        {malo ? (
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
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

function PanelPaso({ children }: { children: React.ReactNode }) {
  return <Card className="space-y-3 border-violet-200">{children}</Card>;
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
}: {
  editable: boolean;
  valor: string;
  diferencia: boolean;
  onChange: (v: string) => void;
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
      className={`w-full h-10 px-2 text-right rounded-lg border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-100 ${
        diferencia
          ? "border-red-300 bg-red-50 text-red-700 font-semibold"
          : "border-slate-200 focus:border-[color:var(--portal-primary,#741DFE)]"
      }`}
    />
  );
}
