"use client";

import AdjuntosGaleria from "@/components/rma/AdjuntosGaleria";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fechaCorta } from "@/lib/fecha";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Globe,
  MapPin,
  Package,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Shield,
  Store,
  Ticket,
  Truck,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { COLOR_ESTADO, diasDelCaso, ESTADOS_RESUELTOS, fechaDia, fechaHora, pasoDelCaso } from "./etapas";

type Datos = {
  case: any;
  history: any[];
  items: any[];
  adjuntos: any[];
  ingresos: any[];
  despachos: any[];
  notas: any[];
};

type Evento = {
  fecha: string;
  icono: typeof Ticket;
  color: string;
  titulo: string;
  detalle?: string | null;
  quien?: string | null;
  nota?: string | null;
};

const ICONO_ENTREGA: Record<string, typeof Store> = { sucursal: Store, ruta: Truck, agencia: PackageCheck };

const COLOR_NOTA: Record<string, string> = {
  pendiente: "bg-blue-100 text-blue-700 border-blue-200",
  aprobada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rechazada: "bg-rose-100 text-rose-700 border-rose-200",
};

const COLOR_GARANTIA: Record<string, string> = {
  en_garantia: "bg-emerald-100 text-emerald-700 border-emerald-200",
  vida_util: "bg-violet-100 text-violet-700 border-violet-200",
  vencida: "bg-amber-100 text-amber-800 border-amber-200",
};

function Tarjeta({ titulo, icono: Icono, extra, children }: { titulo: string; icono: typeof Ticket; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Icono className="w-4 h-4 text-slate-400" />
          {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <p className={`mt-0.5 text-sm text-slate-700 break-words ${mono ? "font-mono" : ""}`}>{valor || "—"}</p>
    </div>
  );
}

function SiNo({ valor, si, no }: { valor: any; si: string; no: string }) {
  if (valor == null) return null;
  const ok = Number(valor) === 1;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? "text-emerald-700" : "text-rose-700"}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {ok ? si : no}
    </span>
  );
}

/** La guía de la agencia que RMA adjunta al entregar (`tipo` = "guia_agencia"). */
const esGuia = (a: { tipo?: string | null }) => String(a.tipo || "").startsWith("guia");

function datosEntrega(v: any): Record<string, string> | null {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
}

/** Todo el proceso de un caso de RMA de un cliente del vendedor, solo lectura. */
export function DetalleCasoRma() {
  const t = useTranslations("rmaVendedor");
  const tr = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;

  const [datos, setDatos] = useState<Datos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"no_encontrado" | "error" | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendedores/rma/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (res.status === 404) {
        setError("no_encontrado");
        return;
      }
      if (!res.ok || !data.success) throw new Error(data.error);
      setDatos(data);
    } catch {
      setError("error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) cargar();
  }, [id, cargar]);

  const volver = `/${locale}/vendedores/casos-rma`;
  const estado = (s: string) => t.has(`estado_${s}`) ? t(`estado_${s}`) : s;

  // Productos del envío: los de rma_case_items o, en casos sin esa tabla, el del caso.
  const productos = useMemo(() => {
    if (!datos) return [];
    if (datos.items.length) return datos.items;
    const c = datos.case;
    return [{
      id: null,
      product_code: c.product_code,
      hardware: c.hardware,
      brand: c.brand,
      model: c.model,
      serial: c.serial || c.serial_quantity,
      reported_fault: c.reported_fault,
      status: c.status,
      diagnosis: c.diagnosis,
      garantia_estado: c.garantia_estado,
      garantia_meses: c.garantia_meses,
      garantia_vence: c.garantia_vence,
      garantia_marca: c.garantia_marca,
      despachado_at: c.despachado_at,
    }];
  }, [datos]);

  const varios = productos.length > 1;
  const nombreProducto = useCallback(
    (itemId: number | null) => {
      const p = productos.find((x: any) => x.id === itemId);
      return p ? p.model || p.hardware || p.product_code || "" : "";
    },
    [productos],
  );

  // Línea de tiempo con todo lo que le pasó al caso, de cualquier módulo.
  const eventos = useMemo<Evento[]>(() => {
    if (!datos) return [];
    const c = datos.case;
    const ev: Evento[] = [];
    ev.push({
      fecha: c.created_at,
      icono: Ticket,
      color: "bg-violet-100 text-violet-600",
      titulo: c.origen === "portal" ? t("ev_ticket_portal") : t("ev_ticket_interno"),
      quien: c.created_by,
    });
    for (const i of datos.ingresos) {
      ev.push({
        fecha: i.created_at,
        icono: Shield,
        color: "bg-sky-100 text-sky-600",
        titulo: t("ev_ingreso"),
        quien: [i.recibido_seguridad_nombre || i.recibido_por, i.recibido_rma_nombre].filter(Boolean).join(" · "),
      });
    }
    datos.history.forEach((h, idx) => {
      // La primera fila ("Caso creado") es el ticket, que ya está arriba.
      if (idx === 0 && !h.from_status) return;
      const producto = varios && h.item_id ? `${nombreProducto(h.item_id)}: ` : "";
      ev.push({
        fecha: h.created_at,
        icono: ESTADOS_RESUELTOS.includes(h.to_status) ? CheckCircle2 : Wrench,
        color: ESTADOS_RESUELTOS.includes(h.to_status) ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600",
        titulo: producto + (h.from_status ? `${estado(h.from_status)} → ${estado(h.to_status)}` : estado(h.to_status)),
        quien: h.changed_by,
        nota: h.notes,
      });
    });
    for (const n of datos.notas) {
      const producto = varios && n.item_id ? `${nombreProducto(n.item_id)}: ` : "";
      ev.push({
        fecha: n.created_at,
        icono: ReceiptText,
        color: "bg-purple-100 text-purple-600",
        titulo: producto + t("ev_nc_solicitada"),
        quien: n.created_by,
        nota: n.motivo || n.detail,
      });
      if (n.decidido_at) {
        ev.push({
          fecha: n.decidido_at,
          icono: ReceiptText,
          color: n.estado === "rechazada" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600",
          titulo: producto + t(`ev_nc_${n.estado === "rechazada" ? "rechazada" : "aprobada"}`),
          quien: n.decidido_por,
          nota: n.motivo_rechazo,
        });
      }
    }
    if (c.entrega_elegida_at && c.entrega_metodo) {
      ev.push({
        fecha: c.entrega_elegida_at,
        icono: ICONO_ENTREGA[c.entrega_metodo] || Truck,
        color: "bg-amber-100 text-amber-600",
        titulo: t("ev_entrega_elegida", { metodo: t(`entrega_${c.entrega_metodo}`) }),
        detalle: c.entrega_ciudad || c.entrega_agencia,
      });
    }
    for (const a of datos.adjuntos.filter((x) => esGuia(x))) {
      ev.push({ fecha: a.created_at, icono: FileText, color: "bg-slate-100 text-slate-600", titulo: t("ev_guia") });
    }
    for (const d of datos.despachos) {
      ev.push({
        fecha: d.created_at,
        icono: PackageCheck,
        color: "bg-emerald-100 text-emerald-600",
        titulo: t("ev_despacho"),
        detalle: d.cliente_retira ? t("retira", { nombre: d.cliente_retira }) : null,
        quien: d.almacenista_nombre,
        nota: d.observaciones,
      });
    }
    if (c.despachado_at && datos.despachos.length === 0) {
      ev.push({ fecha: c.despachado_at, icono: PackageCheck, color: "bg-emerald-100 text-emerald-600", titulo: t("ev_entregado") });
    }
    return ev.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  }, [datos, varios, nombreProducto, t]);

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6 lg:p-8 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-72 w-full rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !datos) {
    return (
      <div className="px-3 py-10 max-w-md mx-auto text-center">
        <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="mt-3 text-sm text-slate-600">{t(error === "no_encontrado" ? "no_encontrado" : "error_cargar_caso")}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={volver}>{t("volver")}</Link>
          </Button>
          {error === "error" && (
            <Button variant="outline" size="sm" onClick={cargar}>
              {t("reintentar")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const c = datos.case;
  const externo = Number(c.producto_externo) === 1;
  const recibido = datos.ingresos.length > 0 || c.origen !== "portal" || c.status !== "recibido" || datos.history.some((h) => h.from_status);
  const paso = pasoDelCaso(c, recibido);
  const resueltoEn = [...datos.history].reverse().find((h) => ESTADOS_RESUELTOS.includes(h.to_status))?.created_at;
  const pasos = [
    { etiqueta: t("etapa_ticket"), fecha: fechaDia(c.created_at, locale) },
    {
      etiqueta: t("etapa_recepcion"),
      fecha: datos.ingresos[0] ? fechaCorta(datos.ingresos[0].fecha_entrega) : recibido ? fechaDia(c.created_at, locale) : null,
    },
    { etiqueta: t("etapa_revision"), fecha: null },
    {
      etiqueta: ESTADOS_RESUELTOS.includes(c.status) ? estado(c.status) : t("etapa_resuelto"),
      fecha: paso >= 3 && resueltoEn ? fechaDia(resueltoEn, locale) : null,
    },
    { etiqueta: t("etapa_entregado"), fecha: c.despachado_at ? fechaCorta(c.despachado_at) : null },
  ];

  const fotosGenerales = datos.adjuntos.filter((a) => !esGuia(a) && (!varios || !a.item_id));
  const guias = datos.adjuntos.filter((a) => esGuia(a));
  const entrega = datosEntrega(c.entrega_datos);
  const dias = diasDelCaso(c);

  return (
    <div className="px-3 py-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild className="shrink-0 mt-0.5">
            <Link href={volver} aria-label={t("volver")}>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">RMA N.º {c.case_number}</h1>
              <Badge className={`${COLOR_ESTADO[c.status] || "bg-slate-100 text-slate-600"} border text-[11px]`}>{estado(c.status)}</Badge>
              {c.origen === "portal" && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 border text-[11px]">{t("origen_portal")}</Badge>
              )}
              {externo && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 border text-[11px]">{t("externo")}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500 truncate">
              {c.client_name}
              {c.company_id && NOMBRES_SUCURSAL[c.company_id] && (
                <span className="inline-flex items-center gap-1 ml-2 text-xs">
                  <MapPin className="w-3 h-3" />
                  {NOMBRES_SUCURSAL[c.company_id]}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} className="shrink-0 rounded-lg" aria-label={t("recargar")}>
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline ml-2">{t("recargar")}</span>
        </Button>
      </div>

      {/* Avance del caso */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-sm font-semibold text-slate-900">{t(`paso_${paso}`)}</p>
          <p className="text-xs text-slate-500">
            {c.despachado_at ? t("dias_total", { count: dias }) : t("dias_abierto", { count: dias })}
          </p>
        </div>
        <ol className="grid grid-cols-5 gap-1 sm:gap-2">
          {pasos.map((p, i) => {
            const hecho = i < paso || paso === 4;
            const actual = i === paso && paso < 4;
            return (
              <li key={i} className="flex flex-col items-center text-center min-w-0">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${i === 0 ? "invisible" : hecho || actual ? "bg-blue-500" : "bg-slate-200"}`} />
                  <span
                    className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      hecho
                        ? "border-blue-500 bg-blue-500 text-white"
                        : actual
                          ? "border-blue-500 bg-white text-blue-600 ring-4 ring-blue-100"
                          : "border-slate-200 bg-white text-slate-400"
                    }`}
                  >
                    {hecho ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </span>
                  <span className={`h-0.5 flex-1 ${i === pasos.length - 1 ? "invisible" : hecho ? "bg-blue-500" : "bg-slate-200"}`} />
                </div>
                <p className={`mt-2 text-[10px] sm:text-xs font-medium leading-tight ${hecho || actual ? "text-slate-800" : "text-slate-400"}`}>
                  {p.etiqueta}
                </p>
                {p.fecha && <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500">{p.fecha}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Productos */}
          <Tarjeta titulo={varios ? t("productos", { count: productos.length }) : t("producto")} icono={Package}>
            <div className="space-y-4">
              {productos.map((p: any, idx: number) => {
                const fotos = varios ? datos.adjuntos.filter((a) => a.item_id === p.id && !esGuia(a)) : [];
                return (
                  <div key={p.id ?? idx} className={varios ? "rounded-xl border border-slate-200 p-3 sm:p-4" : ""}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {p.model || p.hardware || p.product_code || t("producto_sin_nombre")}
                        </p>
                        <p className="text-xs text-slate-500">{[p.brand, p.hardware !== p.model ? p.hardware : null, p.product_code].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={`${COLOR_ESTADO[p.status] || "bg-slate-100 text-slate-600"} border text-[11px]`}>{estado(p.status)}</Badge>
                        {p.despachado_at && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-[11px]">
                            {t("entregado_el", { fecha: fechaCorta(p.despachado_at) })}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Dato etiqueta={t("serial")} valor={p.serial} mono />
                      <Dato
                        etiqueta={t("garantia")}
                        valor={
                          externo ? (
                            t("externo_sin_garantia")
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Badge className={`${COLOR_GARANTIA[p.garantia_estado] || "bg-slate-100 text-slate-600 border-slate-200"} border text-[11px]`}>
                                {tr(`warranty_${p.garantia_estado || "indeterminada"}`)}
                              </Badge>
                              {p.garantia_vence && (
                                <span className="text-xs text-slate-500">{t("vence", { fecha: fechaCorta(p.garantia_vence) })}</span>
                              )}
                            </span>
                          )
                        }
                      />
                    </div>
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("falla")}</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{p.reported_fault || "—"}</p>
                      </div>
                      <div className="rounded-xl bg-blue-50/60 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-blue-500">{t("diagnostico")}</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{p.diagnosis || t("sin_diagnostico")}</p>
                      </div>
                    </div>
                    {fotos.length > 0 && (
                      <div className="mt-3">
                        <AdjuntosGaleria adjuntos={fotos} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Tarjeta>

          {/* Fotos del reporte */}
          <Tarjeta titulo={t("fotos")} icono={FileText} extra={<span className="text-xs text-slate-400">{fotosGenerales.length}</span>}>
            <AdjuntosGaleria adjuntos={fotosGenerales} />
          </Tarjeta>

          {/* Recepción en Seguridad */}
          <Tarjeta titulo={t("recepcion")} icono={Shield}>
            {datos.ingresos.length === 0 ? (
              <p className="text-sm text-slate-500">{c.origen === "portal" && c.status === "recibido" ? t("sin_recepcion_portal") : t("sin_recepcion")}</p>
            ) : (
              <div className="space-y-3">
                {datos.ingresos.map((i) => (
                  <div key={i.id} className="rounded-xl border border-slate-200 p-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <Dato etiqueta={t("fecha")} valor={fechaCorta(i.fecha_entrega)} />
                      <Dato etiqueta={t("recibio_seguridad")} valor={i.recibido_seguridad_nombre || i.recibido_por} />
                      <Dato etiqueta={t("recibio_rma")} valor={i.recibido_rma_nombre} />
                      {i.nd_numero && <Dato etiqueta={t("nota_entrega")} valor={i.nd_numero} mono />}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <SiNo valor={i.accesorios_integros} si={t("accesorios_ok")} no={t("accesorios_no")} />
                      <SiNo valor={i.sin_manipulacion} si={t("sin_manipulacion_ok")} no={t("sin_manipulacion_no")} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>

          {/* Nota de crédito */}
          {datos.notas.length > 0 && (
            <Tarjeta titulo={t("nota_credito")} icono={ReceiptText}>
              <div className="space-y-3">
                {datos.notas.map((n) => (
                  <div key={n.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        {varios && n.item_id ? nombreProducto(n.item_id) : t("nc_solicitada_el", { fecha: fechaDia(n.created_at, locale) })}
                      </span>
                      <Badge className={`${COLOR_NOTA[n.estado] || COLOR_NOTA.pendiente} border text-[11px]`}>{t(`nc_${n.estado}`)}</Badge>
                    </div>
                    {(n.motivo || n.detail) && <p className="text-sm text-slate-600 whitespace-pre-line">{n.motivo || n.detail}</p>}
                    {n.motivo_rechazo && (
                      <p className="text-xs text-rose-700 bg-rose-50 rounded-lg p-2">{t("motivo_rechazo", { motivo: n.motivo_rechazo })}</p>
                    )}
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          {/* Entrega */}
          <Tarjeta titulo={t("entrega")} icono={Truck}>
            <div className="space-y-3">
              {c.entrega_metodo ? (
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {(() => {
                    const Icono = ICONO_ENTREGA[c.entrega_metodo] || Truck;
                    return <Icono className="w-4 h-4 text-slate-400" />;
                  })()}
                  {t(`entrega_${c.entrega_metodo}`)}
                  {c.entrega_metodo === "ruta" && c.entrega_ciudad && ` — ${c.entrega_ciudad}`}
                  {c.entrega_metodo === "agencia" && c.entrega_agencia && ` — ${c.entrega_agencia}`}
                </div>
              ) : (
                !c.despachado_at && <p className="text-sm text-slate-500">{t("sin_metodo_entrega")}</p>
              )}
              {c.entrega_metodo === "agencia" && entrega && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                  <Dato etiqueta={t("recibe")} valor={entrega.nombre} />
                  <Dato etiqueta={t("cedula")} valor={entrega.cedula} />
                  <Dato etiqueta={t("telefono")} valor={entrega.telefono} />
                  <Dato etiqueta={t("direccion")} valor={entrega.direccion} />
                </div>
              )}
              {datos.despachos.map((d) => (
                <div key={d.id} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Dato etiqueta={t("fecha")} valor={fechaCorta(d.fecha_despacho)} />
                    <Dato etiqueta={t("entrego")} valor={d.almacenista_nombre} />
                    <Dato etiqueta={t("retiro")} valor={d.cliente_retira} />
                  </div>
                  <SiNo valor={d.accesorios_integros} si={t("accesorios_ok")} no={t("accesorios_no")} />
                  {d.observaciones && <p className="text-xs text-slate-600">{d.observaciones}</p>}
                </div>
              ))}
              {c.despachado_at ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm font-semibold text-emerald-800">{t("entregado_el", { fecha: fechaCorta(c.despachado_at) })}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">{t("aun_no_entregado")}</p>
              )}
              {guias.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("guias")}</p>
                  <AdjuntosGaleria adjuntos={guias} />
                </div>
              )}
            </div>
          </Tarjeta>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Cliente y ticket */}
          <Tarjeta titulo={t("cliente_ticket")} icono={User}>
            <div className="grid grid-cols-1 gap-3">
              <Dato etiqueta={t("cliente")} valor={c.client_name} />
              <Dato etiqueta={t("telefono")} valor={c.client_phone} />
              {(c.client_email || c.contacto_email) && <Dato etiqueta={t("correo")} valor={c.client_email || c.contacto_email} />}
              <Dato etiqueta={t("factura")} valor={c.invoice_number} mono />
              <Dato
                etiqueta={t("origen")}
                valor={
                  <span className="inline-flex items-center gap-1">
                    {c.origen === "portal" ? <Globe className="w-3.5 h-3.5 text-violet-500" /> : <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" />}
                    {c.origen === "portal" ? t("origen_portal_desc") : t("origen_interno_desc")}
                  </span>
                }
              />
              <Dato etiqueta={t("abierto")} valor={fechaHora(c.created_at, locale)} />
              <Dato etiqueta={t("ultima_actualizacion")} valor={fechaHora(c.updated_at, locale)} />
            </div>
          </Tarjeta>

          {/* Historial completo */}
          <Tarjeta titulo={t("historial")} icono={Wrench}>
            <ol className="space-y-0">
              {eventos.map((e, idx) => {
                const Icono = e.icono;
                return (
                  <li key={idx} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${e.color}`}>
                        <Icono className="w-3.5 h-3.5" />
                      </span>
                      {idx < eventos.length - 1 && <span className="w-px flex-1 bg-slate-200 my-1" />}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{e.titulo}</p>
                      {e.detalle && <p className="text-xs text-slate-600">{e.detalle}</p>}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {fechaHora(e.fecha, locale)}
                        {e.quien && ` · ${e.quien}`}
                      </p>
                      {e.nota && <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 whitespace-pre-line">{e.nota}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
