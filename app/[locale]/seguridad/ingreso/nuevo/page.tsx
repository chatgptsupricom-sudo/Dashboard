"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ClipboardList, Loader2, Lock, PenLine, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { GarantiaBadge, GarantiaIngreso } from "@/components/seguridad/GarantiaIngreso";
import { SignaturePad } from "@/components/seguridad/SignaturePad";
import { fechaCorta } from "@/lib/seguridad/formato";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Garantia = {
  garantia_estado: string | null;
  garantia_meses: number | null;
  garantia_vence: string | null;
  garantia_marca: string | null;
};

type Ticket = Garantia & {
  id: number;
  case_number: string;
  client_name: string;
  hardware: string;
  serial: string;
  invoice_number: string;
  reported_fault: string;
  created_at: string | null;
  /** No se compró en Supricom: sin factura nuestra ni garantía. */
  producto_externo: boolean;
  // Productos del envío (issue #331); con más de uno, el ingreso lleva la
  // lista para marcar cuáles llegaron.
  items?: (Garantia & { id: number; producto: string; serial: string | null; reported_fault: string | null })[];
};

/** Lo que Seguridad marca de cada producto del envío en el mostrador. */
type ProductoMostrador = {
  id: number;
  producto: string;
  serial: string | null;
  garantia_estado: string | null;
  // null = sin responder: se exige responder uno por uno, igual que los
  // checks de estado.
  recibido: boolean | null;
  observacion: string;
};

type Persona = { id: number; nombre: string };

/**
 * Acta de recepción de un equipo de RMA en el mostrador.
 *
 * Todo ingreso sale de un ticket del portal. Los datos del equipo vienen del
 * ticket y son de solo lectura: Seguridad verifica (llegó / accesorios /
 * manipulación) y firma, no corrige lo que reportó el cliente. Quien recibe
 * por Seguridad y por RMA firma en esta misma pantalla.
 */
export default function NuevoIngresoPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.ingreso.form");
  const td = useTranslations("seguridad.ingreso.detail");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad`;

  const [fechaEntrega] = useState(todayISO());
  const [accesorios, setAccesorios] = useState<boolean | null>(null);
  const [sinManipulacion, setSinManipulacion] = useState<boolean | null>(null);
  // Quién recibió, por cada lado del mostrador (#50), y su firma.
  const [recibidoSeguridad, setRecibidoSeguridad] = useState("");
  const [recibidoRma, setRecibidoRma] = useState("");
  const [firmaSeguridad, setFirmaSeguridad] = useState<string | null>(null);
  const [firmaRma, setFirmaRma] = useState<string | null>(null);

  const [personalSeguridad, setPersonalSeguridad] = useState<Persona[]>([]);
  const [personalRma, setPersonalRma] = useState<Persona[]>([]);

  const [ticketQuery, setTicketQuery] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [productos, setProductos] = useState<ProductoMostrador[]>([]);
  const actualizarProducto = (id: number, cambios: Partial<ProductoMostrador>) =>
    setProductos((prev) => prev.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  const [searchingTicket, setSearchingTicket] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Catálogos de personal para "Recibió por Seguridad / RMA" (#50).
  useEffect(() => {
    const cargar = async (rol: "seguridad" | "rma") => {
      try {
        const res = await fetch(`/api/seguridad/catalogo/personal?rol=${rol}`);
        if (!res.ok) return [];
        const json = await res.json();
        return (json.personal || []) as Persona[];
      } catch {
        return [];
      }
    };
    void cargar("seguridad").then(setPersonalSeguridad);
    void cargar("rma").then(setPersonalRma);
  }, []);

  // Tickets del portal que todavía no tienen ingreso (últimos 180 días).
  const [ticketsDisponibles, setTicketsDisponibles] = useState<
    { case_number: string; cliente: string; producto: string }[]
  >([]);
  const [cargandoTickets, setCargandoTickets] = useState(true);
  useEffect(() => {
    fetch("/api/seguridad/tickets-sin-ingreso?dias=180")
      .then((r) => (r.ok ? r.json() : { tickets: [] }))
      .then((j) =>
        setTicketsDisponibles(
          (j.tickets || []).map((x: any) => ({
            case_number: String(x.case_number),
            cliente: x.cliente || "",
            producto: x.producto || "",
          })),
        ),
      )
      .catch(() => setTicketsDisponibles([]))
      .finally(() => setCargandoTickets(false));
  }, []);

  // El panel de equipos por llegar manda aqui con ?ticket=0042. Se lee de
  // window y no con useSearchParams para no arrastrar el Suspense del build.
  useEffect(() => {
    const desdeUrl = new URLSearchParams(window.location.search).get("ticket")?.trim();
    if (!desdeUrl) return;
    setTicketQuery(desdeUrl);
    buscarTicket(desdeUrl);
  }, []);

  const buscarTicket = async (valor: string) => {
    const value = valor.trim();
    if (!value) return;
    setSearchingTicket(true);
    setTicketError(null);
    setTicket(null);
    setProductos([]);
    try {
      const res = await fetch(`/api/seguridad/buscar-ticket/${encodeURIComponent(value)}`);
      const data = res.ok ? await res.json() : null;
      if (!data?.success || !data.case) {
        setTicketError(tf("ticket_not_found"));
        return;
      }
      const c = data.case as Ticket;
      setTicket(c);
      const items = c.items || [];
      setProductos(
        items.length > 1
          ? items.map((x) => ({
              id: x.id,
              producto: x.producto,
              serial: x.serial,
              garantia_estado: x.garantia_estado,
              recibido: null,
              observacion: "",
            }))
          : [],
      );
    } catch {
      setTicketError(tf("ticket_not_found"));
    } finally {
      setSearchingTicket(false);
    }
  };

  const onSubmit = async () => {
    setSubmitError(null);
    if (!ticket) {
      setSubmitError(tf("error_sin_ticket"));
      return;
    }
    if (accesorios === null || sinManipulacion === null) {
      setSubmitError(tf("error_checks_requeridos"));
      return;
    }
    if (productos.length) {
      if (productos.some((x) => x.recibido === null)) {
        setSubmitError(t("productos_envio.error_sin_responder"));
        return;
      }
      if (!productos.some((x) => x.recibido)) {
        setSubmitError(t("productos_envio.error_ninguno"));
        return;
      }
    }
    if (!recibidoSeguridad || !recibidoRma) {
      setSubmitError(tf("error_required"));
      return;
    }
    if (!firmaSeguridad || !firmaRma) {
      setSubmitError(tf("error_firmas"));
      return;
    }

    setSubmitting(true);
    // Solo lo que Seguridad decide en el mostrador: los datos del equipo los
    // toma el servidor del ticket.
    const payload: Record<string, unknown> = {
      rma_case_id: ticket.id,
      fecha_entrega: fechaEntrega,
      accesorios_integros: accesorios,
      sin_manipulacion: sinManipulacion,
      recibido_seguridad_nombre: recibidoSeguridad,
      recibido_rma_nombre: recibidoRma,
      // `recibido_por` se conserva por la calificación y los KPIs: es el de Seguridad.
      recibido_por: recibidoSeguridad,
      firma_seguridad: firmaSeguridad,
      firma_rma: firmaRma,
    };
    if (productos.length) {
      payload.productos = productos.map((x) => ({
        rma_item_id: x.id,
        recibido: x.recibido,
        serial: (x.serial || "").slice(0, 200),
        observacion: x.observacion.trim().slice(0, 500),
      }));
    }

    try {
      const res = await fetch("/api/seguridad/ingreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tf("error_generic"));
      router.push(data?.id ? `${base}/ingreso/${data.id}` : `${base}/ingreso`);
    } catch (err: any) {
      setSubmitError(err?.message || tf("error_generic"));
      setSubmitting(false);
    }
  };

  const varios = productos.length > 0;

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={`${base}/ingreso`}
            className="p-2 rounded-[10px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-violet-100 shrink-0">
              <ClipboardList className="w-5 h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{tf("title")}</h1>
              <p className="text-xs text-slate-500 truncate">{tf("subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* 1. Ticket (obligatorio) */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-1">
            {tf("section_ticket")} <span className="text-red-500">*</span>
          </h2>
          <p className="text-xs text-slate-500 mb-4">{tf("ticket_obligatorio")}</p>
          <div className="flex items-center gap-2">
            <select
              value={ticketQuery}
              onChange={(e) => {
                const v = e.target.value;
                setTicketQuery(v);
                if (v) buscarTicket(v);
                else {
                  setTicket(null);
                  setProductos([]);
                  setTicketError(null);
                }
              }}
              disabled={cargandoTickets || searchingTicket}
              aria-label={tf("section_ticket")}
              className="flex-1 min-w-0 h-11 px-3 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            >
              <option value="">
                {cargandoTickets
                  ? tf("searching")
                  : ticketsDisponibles.length
                    ? tf("ticket_elegir")
                    : tf("ticket_sin_pendientes")}
              </option>
              {/* Si llegó por ?ticket= y no está en la lista, igual se muestra. */}
              {ticketQuery && !ticketsDisponibles.some((x) => x.case_number === ticketQuery) && (
                <option value={ticketQuery}>#{ticketQuery}</option>
              )}
              {ticketsDisponibles.map((x) => (
                <option key={x.case_number} value={x.case_number}>
                  #{x.case_number} · {x.cliente}
                  {x.producto ? ` · ${x.producto}` : ""}
                </option>
              ))}
            </select>
            {searchingTicket && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
          </div>
          {ticketError && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {ticketError}
            </p>
          )}
        </section>

        {!ticket ? (
          <p className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {tf("elige_ticket_primero")}
          </p>
        ) : (
          <>
            {/* 2. ¿Entra por garantía? */}
            <GarantiaIngreso
              estado={ticket.garantia_estado}
              externo={ticket.producto_externo}
              marca={ticket.garantia_marca}
              meses={ticket.garantia_meses}
              vence={ticket.garantia_vence}
            />

            {/* 3. Datos del ingreso: del ticket, solo lectura */}
            <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">{tf("section_data")}</h2>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Lock className="w-3 h-3" />
                  {tf("solo_lectura")}
                </span>
              </div>
              <p className="rounded-[10px] bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                {tf("guia_automatica")}
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <Dato etiqueta={tf("case_number")} valor={ticket.case_number} mono />
                <Dato etiqueta={tf("field_fecha")} valor={fechaCorta(fechaEntrega)} />
                <Dato
                  etiqueta={tf("field_factura")}
                  valor={
                    ticket.producto_externo ? (
                      <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {tf("producto_externo")}
                      </span>
                    ) : (
                      ticket.invoice_number || "—"
                    )
                  }
                />
                <Dato etiqueta={tf("field_cliente")} valor={ticket.client_name || "—"} />
                {!varios && (
                  <>
                    <Dato etiqueta={tf("field_hardware")} valor={ticket.hardware || "—"} />
                    <Dato etiqueta={tf("field_serial")} valor={ticket.serial || "—"} mono />
                  </>
                )}
                <div className="sm:col-span-2">
                  <Dato etiqueta={tf("field_descripcion")} valor={ticket.reported_fault || "—"} multilinea />
                </div>
              </dl>
            </section>

            {/* 3b. Productos del envío (issue #331): qué llegó de cada uno. */}
            {varios && (
              <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {t("productos_envio.titulo", { n: productos.length })}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">{t("productos_envio.ayuda")}</p>
                </div>
                {productos.map((x, idx) => (
                  <div
                    key={x.id}
                    className={`rounded-[10px] border p-3 space-y-2 ${
                      x.recibido === null ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {x.serial && <span className="font-mono">{x.serial}</span>}
                      <GarantiaBadge estado={ticket.producto_externo ? "no_aplica" : x.garantia_estado} />
                    </div>
                    <CheckRow
                      label={`${idx + 1}. ${x.producto}`}
                      value={x.recibido}
                      onChange={(v) => actualizarProducto(x.id, { recibido: v })}
                      yes={t("productos_envio.llego")}
                      no={t("productos_envio.no_llego")}
                    />
                    <input
                      type="text"
                      value={x.observacion}
                      placeholder={t("productos_envio.observacion")}
                      onChange={(e) => actualizarProducto(x.id, { observacion: e.target.value.slice(0, 500) })}
                      className="w-full h-10 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                ))}
              </section>
            )}

            {/* 4. Verificación de estado */}
            <section className="bg-white border border-slate-200 rounded-[10px] p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-4">{tf("section_checks")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CheckRow
                  label={tf("check_accesorios")}
                  value={accesorios}
                  onChange={setAccesorios}
                  yes={tf("yes")}
                  no={tf("no")}
                />
                <CheckRow
                  label={tf("check_manipulacion")}
                  value={sinManipulacion}
                  onChange={setSinManipulacion}
                  yes={tf("yes")}
                  no={tf("no")}
                />
              </div>
            </section>

            {/* 5. Recibido por y firmas: Seguridad y RMA firman aquí. */}
            <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{tf("section_received_by")}</h2>
                <p className="text-xs text-slate-500 mt-1">{tf("firmas_ayuda")}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 rounded-[10px] border border-slate-200 p-4">
                  <PersonaSelect
                    label={tf("recibido_seguridad")}
                    value={recibidoSeguridad}
                    onChange={setRecibidoSeguridad}
                    opciones={personalSeguridad}
                    placeholder={tf("recibido_placeholder")}
                    vacio={tf("recibido_sin_catalogo")}
                    gestionarHref={`/${locale}/seguridad/config/personal`}
                    gestionarLabel={tf("recibido_gestionar")}
                  />
                  <FirmaCampo etiqueta={tf("firma_seguridad")} firmada={!!firmaSeguridad}>
                    <SignaturePad onChange={setFirmaSeguridad} height={140} />
                  </FirmaCampo>
                </div>
                <div className="space-y-3 rounded-[10px] border border-slate-200 p-4">
                  <PersonaSelect
                    label={tf("recibido_rma")}
                    value={recibidoRma}
                    onChange={setRecibidoRma}
                    opciones={personalRma}
                    placeholder={tf("recibido_placeholder")}
                    // Al personal de RMA lo registra RMA, no Seguridad: sin enlace.
                    vacio={tf("recibido_sin_catalogo_rma")}
                  />
                  <FirmaCampo etiqueta={tf("firma_rma")} firmada={!!firmaRma}>
                    <SignaturePad onChange={setFirmaRma} height={140} />
                  </FirmaCampo>
                </div>
              </div>
            </section>
          </>
        )}

        {submitError && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Acciones al final del formulario, alineadas con el contenido. */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-slate-200 pt-5 pb-8">
          <Link
            href={`${base}/ingreso`}
            className="h-11 px-6 inline-flex items-center justify-center rounded-[10px] text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {t("back")}
          </Link>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !ticket}
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

/** Un dato del ticket, de solo lectura. */
function Dato({
  etiqueta,
  valor,
  mono,
  multilinea,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  mono?: boolean;
  multilinea?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{etiqueta}</dt>
      <dd
        className={`rounded-[10px] bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm text-slate-800 ${
          mono ? "font-mono" : ""
        } ${multilinea ? "whitespace-pre-wrap min-h-[60px]" : ""}`}
      >
        {valor}
      </dd>
    </div>
  );
}

function FirmaCampo({
  etiqueta,
  firmada,
  children,
}: {
  etiqueta: string;
  firmada: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
        <PenLine className="w-3.5 h-3.5" />
        {etiqueta} <span className="text-red-500">*</span>
      </label>
      <div className={`rounded-[10px] ${firmada ? "" : "ring-1 ring-amber-300"}`}>{children}</div>
    </div>
  );
}

function PersonaSelect({
  label,
  value,
  onChange,
  opciones,
  placeholder,
  vacio,
  gestionarHref,
  gestionarLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: Persona[];
  placeholder: string;
  vacio: string;
  gestionarHref?: string;
  gestionarLabel?: string;
}) {
  // Si el catálogo está vacío no hay nada que elegir: se manda a la pantalla
  // de administración en vez de dejar un select muerto.
  const sinOpciones = opciones.length === 0;
  // El valor guardado podría no estar en la lista actual (alguien dado de baja
  // después de empezar el acta). Se muestra igual para no perder la selección.
  const faltaValor = value !== "" && !opciones.some((o) => o.nombre === value);

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} <span className="text-red-500">*</span>
      </label>
      {sinOpciones ? (
        <p className="text-sm text-slate-500">
          {vacio}{" "}
          {gestionarHref && (
            <Link
              href={gestionarHref}
              className="font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
            >
              {gestionarLabel}
            </Link>
          )}
        </p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
        >
          <option value="">{placeholder}</option>
          {faltaValor && <option value={value}>{value}</option>}
          {opciones.map((o) => (
            <option key={o.id} value={o.nombre}>
              {o.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CheckRow({
  label,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yes: string;
  no: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 ${
        value === null ? "border-amber-300 bg-amber-50" : "border-slate-200"
      }`}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {/* h-12 y no h-8: son los controles mas tocados del formulario y se usan
          de pie con el telefono en una mano. El criterio de #39 pide 48px. */}
      <div
        role="group"
        className="inline-flex shrink-0 rounded-[10px] border border-slate-200 overflow-hidden text-sm font-semibold"
      >
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={value === true}
          className={`min-w-[56px] px-4 h-12 transition-colors ${
            value === true ? "bg-emerald-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {yes}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={value === false}
          className={`min-w-[56px] px-4 h-12 border-l border-slate-200 transition-colors ${
            // `value === false`, no `!value`: con null ninguno va resaltado, que
            // es la señal de que falta responder.
            value === false ? "bg-red-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {no}
        </button>
      </div>
    </div>
  );
}
