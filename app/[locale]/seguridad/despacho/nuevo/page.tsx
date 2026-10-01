"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Lock, MapPin, Package, Send, Store, Truck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { GarantiaBadge } from "@/components/seguridad/GarantiaIngreso";
import { SignaturePad } from "@/components/seguridad/SignaturePad";
import { CheckRow, Dato, FirmaCampo, PersonaSelect, type Persona } from "@/components/seguridad/FormActa";
import {
  firmasRequeridasDespacho,
  type MetodoEntrega,
  type RolFirmaDespacho,
} from "@/lib/seguridad/despachoFirmas";
import { fechaCorta } from "@/lib/seguridad/formato";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fila de "RMA por despachar" (/api/seguridad/despacho/ingresos-pendientes?listos=1). */
type Pendiente = {
  id: number;
  cliente_nombre: string;
  hardware: string | null;
  fecha_entrega: string;
  rma_status: string | null;
  rma_case_number: string | null;
};

type Detalle = {
  ingreso: {
    id: number;
    rma_case_id: number | null;
    nd_numero: string | null;
    cliente_nombre: string;
    hardware: string | null;
    serial: string | null;
    factura_numero: string | null;
    fecha_entrega: string;
  };
  rma_case: {
    case_number: string;
    status: string;
    invoice_number: string | null;
    garantia_estado: string | null;
    producto_externo?: boolean;
    entrega_metodo: MetodoEntrega | null;
    entrega_ciudad: string | null;
    entrega_agencia: string | null;
  } | null;
  productos: {
    rma_item_id: number | null;
    producto: string;
    serial: string | null;
    recibido: boolean;
    despachado_at: string | null;
    status: string | null;
  }[];
};

type Firma = { nombre: string; data: string | null };

const TERMINADOS = ["reparado", "nota_credito", "no_procesado"];
const ESTADO: Record<string, { texto: string; clase: string }> = {
  reparado: { texto: "Reparado", clase: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  nota_credito: { texto: "Nota de crédito", clase: "bg-violet-100 text-violet-700 border-violet-200" },
  no_procesado: { texto: "No procesado", clase: "bg-rose-100 text-rose-700 border-rose-200" },
};

/**
 * Acta de despacho: devolver al cliente un equipo que RMA ya terminó.
 *
 * Se elige de "RMA por despachar" (obligatorio). Los datos del equipo, la
 * factura y el resultado de RMA salen del ingreso y del ticket, de solo
 * lectura; Seguridad solo escribe quién retira y su observación. Firman el
 * cliente que retira, RMA y Seguridad (retiro físico o ruta / encomienda).
 */
export default function NuevoDespachoPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.despacho.form");
  const tfi = useTranslations("seguridad.ingreso.form");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad`;

  const [fechaDespacho] = useState(todayISO());
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(true);
  const [elegido, setElegido] = useState("");
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [salen, setSalen] = useState<number[]>([]);
  const [accesorios, setAccesorios] = useState<boolean | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [clienteRetira, setClienteRetira] = useState("");
  const [firmas, setFirmas] = useState<Partial<Record<RolFirmaDespacho, Firma>>>({});
  const setFirma = (rol: RolFirmaDespacho, cambios: Partial<Firma>) =>
    setFirmas((prev) => ({ ...prev, [rol]: { nombre: "", data: null, ...prev[rol], ...cambios } }));

  const [personal, setPersonal] = useState<Record<"seguridad" | "tecnico", Persona[]>>({
    seguridad: [],
    tecnico: [],
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogos de quienes firman.
  useEffect(() => {
    const cargar = async (url: string, clave: string) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return [];
        const j = await r.json();
        return (j[clave] || []) as Persona[];
      } catch {
        return [];
      }
    };
    void Promise.all([
      cargar("/api/seguridad/catalogo/personal?rol=seguridad", "personal"),
      cargar("/api/seguridad/catalogo/personal?rol=rma", "personal"),
    ]).then(([seguridad, tecnico]) => setPersonal({ seguridad, tecnico }));
  }, []);

  // RMA por despachar: lo que el taller ya terminó y falta devolver.
  useEffect(() => {
    fetch("/api/seguridad/despacho/ingresos-pendientes?listos=1&limit=100")
      .then((r) => (r.ok ? r.json() : { ingresos: [] }))
      .then((j) => setPendientes(j.ingresos || []))
      .catch(() => setPendientes([]))
      .finally(() => setCargandoPendientes(false));
  }, []);

  // Desde el Dashboard o "Listos para despachar" se llega con ?ingreso=ID.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("ingreso");
    if (id) elegir(id);
  }, []);

  const elegir = async (id: string) => {
    setElegido(id);
    setDetalle(null);
    setSalen([]);
    setFirmas({});
    setClienteRetira("");
    setError(null);
    if (!id) return;
    setCargandoDetalle(true);
    try {
      const r = await fetch(`/api/seguridad/ingreso/${encodeURIComponent(id)}`);
      const j = r.ok ? await r.json() : null;
      if (!j?.ingreso) {
        setError(tf("ingreso_not_found"));
        return;
      }
      const d: Detalle = { ingreso: j.ingreso, rma_case: j.rma_case || null, productos: j.productos || [] };
      setDetalle(d);
      // Salen por defecto todos los que llegaron, RMA terminó y siguen aquí.
      if (d.productos.length > 1) {
        setSalen(
          d.productos
            .filter((x) => x.recibido && !x.despachado_at && x.rma_item_id && TERMINADOS.includes(x.status || ""))
            .map((x) => x.rma_item_id as number),
        );
      }
    } catch {
      setError(tf("ingreso_not_found"));
    } finally {
      setCargandoDetalle(false);
    }
  };

  const metodo: MetodoEntrega = detalle?.rma_case?.entrega_metodo || "sucursal";
  const requeridas = firmasRequeridasDespacho();
  const varios = (detalle?.productos.length || 0) > 1;
  const externo = !!detalle?.rma_case?.producto_externo;

  const onSubmit = async () => {
    setError(null);
    if (!detalle) {
      setError(tf("error_sin_ingreso"));
      return;
    }
    if (varios && !salen.length) {
      setError(t("productos_envio.error_salen"));
      return;
    }
    if (accesorios === null) {
      setError(tf("error_accesorios"));
      return;
    }
    if (!clienteRetira.trim()) {
      setError(tf("error_cliente_retira"));
      return;
    }
    const faltan = requeridas.filter((r) => {
      const f = firmas[r.rol];
      return !f?.data || (r.rol !== "cliente" && !f.nombre);
    });
    if (faltan.length) {
      setError(tf("error_firmas", { quienes: faltan.map((r) => tf(`firma_${r.rol}`)).join(", ") }));
      return;
    }

    setSubmitting(true);
    const payload: Record<string, unknown> = {
      ingreso_id: detalle.ingreso.id,
      fecha_despacho: fechaDespacho,
      accesorios_integros: accesorios,
      observaciones: observaciones.trim().slice(0, 5000) || undefined,
      cliente_retira: clienteRetira.trim().slice(0, 200),
      firmas: Object.fromEntries(
        requeridas.map((r) => [
          r.rol,
          { nombre: r.rol === "cliente" ? clienteRetira.trim() : firmas[r.rol]?.nombre, data: firmas[r.rol]?.data },
        ]),
      ),
    };
    if (varios) payload.item_ids = salen;

    try {
      const res = await fetch("/api/seguridad/despacho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tf("error_generic"));
      router.push(data?.id ? `${base}/despacho/${data.id}` : `${base}/despacho`);
    } catch (err: any) {
      setError(err?.message || tf("error_generic"));
      setSubmitting(false);
    }
  };

  const estado = detalle?.rma_case ? ESTADO[detalle.rma_case.status] : null;
  const IconoEntrega = metodo === "ruta" ? Truck : metodo === "agencia" ? Package : Store;

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={`${base}/despacho`}
            className="p-2 rounded-[10px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-violet-100 shrink-0">
              <Send className="w-5 h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{tf("title")}</h1>
              <p className="text-xs text-slate-500 truncate">{tf("subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* 1. RMA por despachar (obligatorio) */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-1">
            {tf("section_ingreso")} <span className="text-red-500">*</span>
          </h2>
          <p className="text-xs text-slate-500 mb-4">{tf("ingreso_obligatorio")}</p>
          <div className="flex items-center gap-2">
            <select
              value={elegido}
              onChange={(e) => elegir(e.target.value)}
              disabled={cargandoPendientes || cargandoDetalle}
              aria-label={tf("section_ingreso")}
              className="flex-1 min-w-0 h-11 px-3 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            >
              <option value="">
                {cargandoPendientes ? tf("searching") : pendientes.length ? tf("elegir") : tf("sin_pendientes")}
              </option>
              {/* Si llegó por ?ingreso= y no está en la lista, igual se muestra. */}
              {elegido && !pendientes.some((x) => String(x.id) === elegido) && (
                <option value={elegido}>#{elegido}</option>
              )}
              {pendientes.map((x) => (
                <option key={x.id} value={String(x.id)}>
                  {x.rma_case_number ? `RMA ${x.rma_case_number}` : `#${x.id}`} · {x.cliente_nombre}
                  {x.hardware ? ` · ${x.hardware}` : ""}
                  {x.rma_status && ESTADO[x.rma_status] ? ` · ${ESTADO[x.rma_status].texto}` : ""}
                </option>
              ))}
            </select>
            {cargandoDetalle && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
          </div>
        </section>

        {!detalle ? (
          <p className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {tf("elige_primero")}
          </p>
        ) : (
          <>
            {/* 2. Resultado de RMA y cómo lo recibe el cliente */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-[10px] border-2 border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{tf("resultado_rma")}</p>
                {estado ? (
                  <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-bold ${estado.clase}`}>
                    {estado.texto}
                  </span>
                ) : (
                  <span className="text-sm text-slate-500">—</span>
                )}
              </div>
              <div className="rounded-[10px] border-2 border-violet-200 bg-violet-50/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700/70 mb-2">{tf("entrega")}</p>
                <p className="flex items-center gap-2 text-sm font-bold text-violet-900">
                  <IconoEntrega className="w-5 h-5" />
                  {tf(`entrega_${metodo}`)}
                </p>
                {metodo === "ruta" && detalle.rma_case?.entrega_ciudad && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-violet-800">
                    <MapPin className="w-3 h-3" />
                    {detalle.rma_case.entrega_ciudad}
                  </p>
                )}
                {metodo === "agencia" && detalle.rma_case?.entrega_agencia && (
                  <p className="mt-1 text-xs text-violet-800">{detalle.rma_case.entrega_agencia}</p>
                )}
                {!detalle.rma_case?.entrega_metodo && (
                  <p className="mt-1 text-xs text-violet-800">{tf("entrega_sin_elegir")}</p>
                )}
              </div>
            </section>

            {/* 3. Datos del despacho: del ingreso y del ticket, solo lectura */}
            <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">{tf("section_data")}</h2>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Lock className="w-3 h-3" />
                  {tf("solo_lectura")}
                </span>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <Dato etiqueta={tfi("case_number")} valor={detalle.rma_case?.case_number || "—"} mono />
                <Dato etiqueta={tf("field_nd")} valor={detalle.ingreso.nd_numero || "—"} mono />
                <Dato etiqueta={tf("field_fecha")} valor={fechaCorta(fechaDespacho)} />
                <Dato etiqueta={tf("fecha_ingreso")} valor={fechaCorta(detalle.ingreso.fecha_entrega)} />
                <Dato etiqueta={tfi("field_cliente")} valor={detalle.ingreso.cliente_nombre || "—"} />
                <Dato
                  etiqueta={tf("section_facturas")}
                  valor={
                    externo ? (
                      <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {tfi("producto_externo")}
                      </span>
                    ) : (
                      detalle.rma_case?.invoice_number || detalle.ingreso.factura_numero || "—"
                    )
                  }
                />
                {!varios && (
                  <>
                    <Dato etiqueta={tfi("field_hardware")} valor={detalle.ingreso.hardware || "—"} />
                    <Dato etiqueta={tfi("field_serial")} valor={detalle.ingreso.serial || "—"} mono />
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
                    {tf("field_cliente_retira")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={clienteRetira}
                    onChange={(e) => setClienteRetira(e.target.value.slice(0, 200))}
                    placeholder={tf("cliente_retira_placeholder")}
                    className="w-full h-11 px-3 border border-violet-300 rounded-[10px] text-sm bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{tf("garantia")}</dt>
                  <dd>
                    {externo ? (
                      <span className="text-sm text-slate-700">{tfi("garantia_externo")}</span>
                    ) : (
                      <GarantiaBadge estado={detalle.rma_case?.garantia_estado} />
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {/* 3b. Envío con varios productos: cuáles salen (issue #331). */}
            {varios && (
              <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{t("productos_envio.salen_titulo")}</h2>
                  <p className="text-xs text-slate-500 mt-1">{t("productos_envio.salen_ayuda")}</p>
                </div>
                {detalle.productos.map((x, idx) => {
                  const id = x.rma_item_id;
                  const terminado = TERMINADOS.includes(x.status || "");
                  const puede = !!id && x.recibido && !x.despachado_at && terminado;
                  const motivo = !x.recibido
                    ? t("productos_envio.no_llego_etiqueta")
                    : x.despachado_at
                      ? t("productos_envio.ya_salio")
                      : !terminado
                        ? tf("producto_en_taller")
                        : null;
                  return (
                    <label
                      key={`${id}-${idx}`}
                      className={`flex items-start gap-3 rounded-[10px] border p-3 ${puede ? "cursor-pointer border-slate-200" : "border-slate-100 bg-slate-50 opacity-70"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        disabled={!puede}
                        checked={!!id && salen.includes(id)}
                        onChange={(e) =>
                          id && setSalen((prev) => (e.target.checked ? [...prev, id] : prev.filter((v) => v !== id)))
                        }
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-800">
                            {idx + 1}. {x.producto}
                          </span>
                          {x.status && ESTADO[x.status] && (
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ESTADO[x.status].clase}`}>
                              {ESTADO[x.status].texto}
                            </span>
                          )}
                        </div>
                        {x.serial && <p className="font-mono text-xs text-slate-500">{x.serial}</p>}
                        {motivo && <p className="text-xs text-slate-400">{motivo}</p>}
                      </div>
                    </label>
                  );
                })}
              </section>
            )}

            {/* 4. Verificación y observaciones */}
            <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">{tfi("section_checks")}</h2>
              <CheckRow
                label={tf("field_accesorios")}
                value={accesorios}
                onChange={setAccesorios}
                yes={tf("yes")}
                no={tf("no")}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {tf("field_observaciones")} <span className="text-slate-400 font-normal">({tfi("opcional")})</span>
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value.slice(0, 5000))}
                  placeholder={tf("observaciones_placeholder")}
                  className="w-full min-h-[90px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </section>

            {/* 5. Entrega y firmas: dependen de cómo lo recibe el cliente. */}
            <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{tf("section_firmas")}</h2>
                <p className="text-xs text-slate-500 mt-1">{tf("firmas_ayuda")}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {requeridas.map((r) => (
                  <div key={r.rol} className="space-y-3 rounded-[10px] border border-slate-200 p-4">
                    {r.rol === "cliente" ? (
                      <div>
                        <p className="block text-xs font-semibold text-slate-600 mb-1.5">{tf("field_cliente_retira")}</p>
                        <p className="h-11 px-3 flex items-center rounded-[10px] bg-slate-50 border border-slate-100 text-sm text-slate-800 truncate">
                          {clienteRetira.trim() || <span className="text-slate-400">{tf("cliente_retira_arriba")}</span>}
                        </p>
                      </div>
                    ) : (
                      <PersonaSelect
                        label={tf(`quien_${r.rol}`)}
                        value={firmas[r.rol]?.nombre || ""}
                        onChange={(v) => setFirma(r.rol, { nombre: v })}
                        opciones={personal[r.rol as "seguridad" | "tecnico"]}
                        placeholder={tfi("recibido_placeholder")}
                        vacio={tfi(r.rol === "seguridad" ? "recibido_sin_catalogo" : "recibido_sin_catalogo_rma")}
                        gestionarHref={r.rol === "seguridad" ? `/${locale}/seguridad/config/personal` : undefined}
                        gestionarLabel={tfi("recibido_gestionar")}
                      />
                    )}
                    <FirmaCampo etiqueta={tf(`firma_${r.rol}`)} firmada={!!firmas[r.rol]?.data}>
                      <SignaturePad onChange={(d) => setFirma(r.rol, { data: d })} height={130} />
                    </FirmaCampo>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Acciones al final del formulario, alineadas con el contenido. */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-slate-200 pt-5 pb-8">
          <Link
            href={`${base}/despacho`}
            className="h-11 px-6 inline-flex items-center justify-center rounded-[10px] text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {t("back")}
          </Link>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !detalle}
            className="h-11 px-8 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? tf("submitting") : tf("submit")}
          </button>
        </div>
      </main>
    </div>
  );
}
