"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Loader2,
  MessageSquare,
  PenLine,
  Printer,
  Send,
  Send as SendIcon,
  ShieldCheck,
  Star as StarIcon,
  Ticket as TicketIcon,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StarRating, StarRatingDisplay } from "@/components/seguridad/StarRating";
import { useAuthStore } from "@/lib/stores/auth.store";
import FirmasActa from "@/components/seguridad/FirmasActa";

type Despacho = {
  id: number;
  ingreso_id: number | null;
  rma_case_id: number | null;
  fecha_despacho: string;
  almacenista_nombre: string;
  facturas_json: string | null;
  cliente_retira: string | null;
  nd_numero: string | null;
  accesorios_integros: number;
  observaciones: string | null;
  firma_url: string | null;
  firma_cliente_nombre: string | null;
  created_at: string;
};

type Ingreso = {
  id: number;
  fecha_entrega: string;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  accesorios_integros: number;
  sin_manipulacion: number;
  recibido_por: string;
  factura_numero: string | null;
};

type RmaCase = {
  id: number;
  case_number: string;
  status: string;
  invoice_number: string;
} | null;

type Calificacion = {
  id: number;
  calificacion: number;
  comentario: string | null;
  calificado_por: string | null;
  created_at: string;
} | null;

function fmtDate(value: string) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function fmtDateTime(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("es-VE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseFacturas(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  despachado: "Despachado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
};

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  despachado: "bg-violet-100 text-violet-700 border-violet-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export default function DespachoDetailPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.despacho.form");
  const td = useTranslations("seguridad.despacho.detail");
  const tc = useTranslations("seguridad.calificacion");
  const tfl = useTranslations("seguridad.ingreso.form");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;
  const base = `/${locale}/seguridad`;

  const { user } = useAuthStore();

  const [despacho, setDespacho] = useState<Despacho | null>(null);
  const [ingreso, setIngreso] = useState<Ingreso | null>(null);
  const [rmaCase, setRmaCase] = useState<RmaCase>(null);
  const [calificacion, setCalificacion] = useState<Calificacion>(null);
  const [loading, setLoading] = useState(true);
  // Nombre del tecnico que firma como OSC. Viene de seguridad_config,
  // no del codigo, para no tener que desplegar el dia que cambie.
  const [tecnico, setTecnico] = useState<{ nombre: string; cargo: string } | null>(null);
  useEffect(() => {
    fetch("/api/seguridad/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.tecnico && setTecnico(j.tecnico))
      .catch(() => {});
  }, []);
  const [error, setError] = useState<string | null>(null);

  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState("");
  const [savingRating, setSavingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSaved, setRatingSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/seguridad/despacho/${id}`);
        const data = await res.json();
        if (cancel) return;
        if (!res.ok || !data.success) {
          setError(data.error || td("not_found"));
          setLoading(false);
          return;
        }
        setDespacho(data.despacho);
        setIngreso(data.ingreso);
        setRmaCase(data.rma_case);
        setCalificacion(data.calificacion ?? null);
      } catch {
        if (!cancel) setError(td("not_found"));
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    run();
    return () => {
      cancel = true;
    };
  }, [id]);

  const refetchCalificacion = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/seguridad/despacho/${id}`);
      const data = await res.json();
      if (data.success) {
        setCalificacion(data.calificacion ?? null);
      }
    } catch {
      // ignore
    }
  };

  const submitCalificacion = async () => {
    if (!despacho || draftRating < 1) return;
    setSavingRating(true);
    setRatingError(null);
    setRatingSaved(false);
    // NOTE: For now we always use the logged-in user as calificado_por.
    // Future enhancement: if despacho has firma_url / cliente_retira,
    // offer a "Calificar como cliente" toggle and pre-fill calificado_por
    // with cliente_retira instead.
    const calificadoPor = user?.name || user?.email || "Seguridad";
    try {
      const res = await fetch("/api/seguridad/calificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          almacenista_nombre: despacho.almacenista_nombre,
          calificacion: draftRating,
          relacionado_a: "despacho",
          relacionado_id: despacho.id,
          comentario: draftComment.trim() || null,
          calificado_por: calificadoPor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 409) {
          setRatingError(tc("duplicate_error"));
        } else {
          setRatingError(data.error || tc("error_save"));
        }
        return;
      }
      setRatingSaved(true);
      setDraftRating(0);
      setDraftComment("");
      await refetchCalificacion();
    } catch {
      setRatingError(tc("error_save"));
    } finally {
      setSavingRating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 gap-2 font-sans">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{td("loading")}</span>
      </div>
    );
  }

  if (error || !despacho) {
    return (
      <div className="min-h-screen font-sans">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <Link
              href={`${base}/despacho`}
              className="p-2 rounded-[10px] text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              aria-label={t("back")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              {td("not_found")}
            </h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 text-center text-slate-500 text-sm">
          {error || td("not_found")}
        </main>
      </div>
    );
  }

  const statusKey = rmaCase?.status ? statusLabels[rmaCase.status] || rmaCase.status : "";
  const statusClass = rmaCase?.status
    ? statusColors[rmaCase.status] || "bg-slate-100 text-slate-600 border-slate-200"
    : "";
  const facturas = parseFacturas(despacho.facturas_json);
  const accesoriosOk = Number(despacho.accesorios_integros) === 1;

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
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {td("title", { id: despacho.id })}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {td("subtitle")}
              </p>
            </div>
          </div>
          <a
            href={`/api/seguridad/despacho/${despacho.id}/comprobante`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-3 sm:px-4 inline-flex items-center gap-2 rounded-[10px] text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">{td("print")}</span>
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Data card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            {td("section_data")}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <DataField label={td("label_fecha")} value={fmtDate(despacho.fecha_despacho)} />
            <DataField
              label={td("label_nd")}
              value={despacho.nd_numero || td("no_value")}
            />
            <DataField
              label={td("label_almacenista")}
              value={despacho.almacenista_nombre}
            />
            <DataField
              label={td("label_cliente_retira")}
              value={despacho.cliente_retira || td("no_value")}
              full
            />
            <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-[10px] border border-slate-200 px-3 py-2.5">
              <span className="text-sm font-medium text-slate-700">
                {td("label_accesorios")}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold ${
                  accesoriosOk ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {accesoriosOk ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {accesoriosOk ? tfl("yes") : tfl("no")}
              </span>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                {td("label_observaciones")}
              </dt>
              <dd className="text-slate-800 whitespace-pre-wrap text-sm bg-slate-50/60 border border-slate-200 rounded-[10px] p-3 min-h-[60px]">
                {despacho.observaciones || td("no_value")}
              </dd>
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                {td("label_created")}
              </dt>
              <dd className="text-xs text-slate-500 mt-0.5">
                {fmtDateTime(despacho.created_at)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Las 4 firmas de la planilla, arriba y no al final: es lo que hay
            que hacer con el cliente todavia en el mostrador. */}
        <FirmasActa
          tipo="despacho"
          actaId={despacho.id}
          nombresSugeridos={{
            tecnico: tecnico?.nombre,
            almacen: despacho.almacenista_nombre,
            seguridad: user?.name,
            cliente: despacho.cliente_retira || undefined,
          }}
          permitirRehacer={
            (user?.role || "").toLowerCase().trim() === "superadmin"
          }
        />

        {/* Facturas card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            {td("section_facturas")}
          </h2>
          {facturas.length === 0 ? (
            <p className="text-sm text-slate-500">{td("no_facturas")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-[10px] overflow-hidden">
              {facturas.map((f, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white"
                >
                  <span className="text-[11px] font-mono text-slate-400 w-6 text-right">
                    {idx + 1}.
                  </span>
                  <span className="text-sm font-mono text-slate-800">{f}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Almacenista card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            {td("label_almacenista")}
          </h2>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100 shrink-0">
              <ShieldCheck className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-sm text-slate-800 font-medium">
              {despacho.almacenista_nombre}
            </p>
          </div>
        </section>

        {/* Calificación card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <StarIcon className="w-4 h-4 text-[color:var(--portal-primary,#741DFE)]" />
              {tc("despacho_title")}
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              {despacho.almacenista_nombre}
            </span>
          </div>

          {calificacion ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <StarRatingDisplay
                  value={calificacion.calificacion}
                  size="md"
                  showValue
                />
                <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap">
                  {tc("already_rated", {
                    date: fmtDateTime(calificacion.created_at),
                  })}
                </span>
              </div>
              {calificacion.comentario && (
                <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1 inline-flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {tc("comment_label")}
                  </p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">
                    {calificacion.comentario}
                  </p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                {tc("calificado_por")}:{" "}
                <span className="font-semibold text-slate-700">
                  {calificacion.calificado_por || "—"}
                </span>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50/40 px-3 py-4">
                <StarRating
                  value={draftRating}
                  onChange={(v) => {
                    setDraftRating(v);
                    setRatingError(null);
                    setRatingSaved(false);
                  }}
                  size="lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  {tc("comment_label")}
                </label>
                <textarea
                  value={draftComment}
                  onChange={(e) => setDraftComment(e.target.value)}
                  placeholder={tc("comment_placeholder")}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100 resize-none"
                />
              </div>
              {ratingError && (
                <p className="text-xs font-semibold text-red-600">
                  {ratingError}
                </p>
              )}
              {ratingSaved && (
                <p className="text-xs font-semibold text-emerald-600">
                  {tc("saved")}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-slate-500 truncate">
                  {tc("rate_for", { name: despacho.almacenista_nombre })}
                </p>
                <button
                  type="button"
                  onClick={submitCalificacion}
                  disabled={savingRating || draftRating < 1}
                  className="h-10 px-4 inline-flex items-center gap-2 rounded-[10px] text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
                >
                  {savingRating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <SendIcon className="w-4 h-4" />
                  )}
                  {savingRating ? tc("saving") : tc("save")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Firma card */}
        {(despacho.firma_url || despacho.firma_cliente_nombre) && (
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
              <PenLine className="w-4 h-4 text-slate-500" />
              Firma del cliente
            </h2>
            {despacho.firma_url ? (
              <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={despacho.firma_url}
                  alt="Firma del cliente"
                  className="max-h-40 object-contain"
                />
              </div>
            ) : null}
            {despacho.firma_cliente_nombre && (
              <p className="text-sm text-slate-800 font-medium mt-3">
                {despacho.firma_cliente_nombre}
              </p>
            )}
          </section>
        )}

        {/* Ingreso vinculado card */}
        {despacho.ingreso_id && (
          <section className="bg-white border border-violet-200 rounded-[10px] p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-violet-600" />
                {td("section_ingreso")}
              </h2>
              {ingreso && (
                <Link
                  href={`${base}/ingreso/${ingreso.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
                >
                  {td("open_ingreso")}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            {ingreso ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <DataField
                  label={td("ingreso_label_fecha")}
                  value={fmtDate(ingreso.fecha_entrega)}
                />
                <DataField
                  label={td("ingreso_label_cliente")}
                  value={ingreso.cliente_nombre}
                />
                <DataField
                  label={td("ingreso_label_hardware")}
                  value={ingreso.hardware || td("no_value")}
                />
                <DataField
                  label={td("ingreso_label_serial")}
                  value={ingreso.serial || td("no_value")}
                  mono
                />
                <div className="col-span-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                    Verificación de estado
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CheckField
                      label={tfl("check_accesorios")}
                      value={ingreso.accesorios_integros}
                      yes={tfl("yes")}
                      no={tfl("no")}
                    />
                    <CheckField
                      label={tfl("check_manipulacion")}
                      value={ingreso.sin_manipulacion}
                      yes={tfl("yes")}
                      no={tfl("no")}
                    />
                  </div>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-100">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    {td("ingreso_label_recibido")}
                  </dt>
                  <dd className="mt-1 text-slate-800">{ingreso.recibido_por}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">{td("no_ingreso")}</p>
            )}
          </section>
        )}

        {/* Ticket card */}
        {despacho.rma_case_id && (
          <section className="bg-white border border-violet-200 rounded-[10px] p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <TicketIcon className="w-4 h-4 text-violet-600" />
                {td("section_ticket")}
              </h2>
              {rmaCase && (
                <Link
                  href={`/${locale}/rma/casos/${rmaCase.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
                >
                  {td("open_ticket")}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            {rmaCase ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <DataField
                  label={td("ticket_case")}
                  value={`#${rmaCase.case_number}`}
                  mono
                />
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    {td("ticket_status")}
                  </dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${statusClass}`}
                    >
                      {statusKey}
                    </span>
                  </dd>
                </div>
                <DataField
                  label={td("ticket_invoice")}
                  value={rmaCase.invoice_number || td("no_value")}
                />
              </dl>
            ) : (
              <p className="text-sm text-slate-500">{td("no_ticket")}</p>
            )}
          </section>
        )}

      </main>
    </div>
  );
}

function DataField({
  label,
  value,
  full,
  mono,
}: {
  label: string;
  value: string;
  full?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 text-slate-800 ${mono ? "font-mono" : ""} break-words`}
      >
        {value}
      </dd>
    </div>
  );
}

function CheckField({
  label,
  value,
  yes,
  no,
}: {
  label: string;
  value: number | boolean;
  yes: string;
  no: string;
}) {
  const ok = value === 1 || value === true;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2 ${
        ok
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-red-200 bg-red-50/50"
      }`}
    >
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold ${
          ok ? "text-emerald-700" : "text-red-600"
        }`}
      >
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <XCircle className="w-3.5 h-3.5" />
        )}
        {ok ? yes : no}
      </span>
    </div>
  );
}
