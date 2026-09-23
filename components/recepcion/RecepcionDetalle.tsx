"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Container,
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
  type Contenedor,
  type Etapa,
  type TipoDano,
} from "@/lib/recepcion/flujo";
import { useRecepcionEnVivo } from "@/lib/recepcion/useRecepcionEnVivo";
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
  /** En que estado llego la caja: danada, humeda y/o abierta. */
  golpeado_tipos: TipoDano[];
  golpeado_nota: string | null;
};

type Conteo = { recibida: string; motivo: string; tipos: TipoDano[]; nota: string };

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
          tipos: Array.isArray(i.golpeado_tipos) ? i.golpeado_tipos : [],
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
        golpeado_tipos: c?.tipos || [],
        golpeado_nota: c?.tipos?.length ? c.nota || null : null,
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
      golpeado: (conteo[i.id]?.tipos?.length ?? 0) > 0,
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

              <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_5rem_6rem] gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100">
                <span>{t("producto")}</span>
                <span className="text-right">{t("esperado")}</span>
                <span className="text-right">{t("recibido")}</span>
              </div>

              {items.map((i) => {
                const c = conteo[i.id] || { recibida: "", motivo: "", tipos: [], nota: "" };
                const conDano = c.tipos.length > 0;
                const esperado = Number(i.cantidad_esperada);
                const hayDif = c.recibida !== "" && Number(c.recibida) !== esperado;
                const set = (p: Partial<Conteo>) => {
                  setConteo((prev) => ({ ...prev, [i.id]: { ...c, ...p } }));
                  setEditado((n) => n + 1);
                };
                return (
                  <div key={i.id} className="py-3 border-b border-slate-50 last:border-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_5rem_6rem] gap-x-2 items-center">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{i.producto}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {[i.codigo, i.cajas_esperadas !== null ? `${i.cajas_esperadas} ${t("cajas").toLowerCase()}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-slate-700 text-right">{esperado}</span>
                      {contando ? (
                        <input
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
                            {TIPOS_DANO.map((tipo) => (
                              <label
                                key={tipo}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 select-none cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={c.tipos.includes(tipo)}
                                  onChange={(e) =>
                                    set({
                                      tipos: e.target.checked
                                        ? [...c.tipos, tipo]
                                        : c.tipos.filter((x) => x !== tipo),
                                    })
                                  }
                                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                                />
                                {t(`dano_${tipo}`)}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs font-medium text-amber-800">
                            {t("dano_titulo")}: {c.tipos.map((tipo) => t(`dano_${tipo}`)).join(", ")}
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
