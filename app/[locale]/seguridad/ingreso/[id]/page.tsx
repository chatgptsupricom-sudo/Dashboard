"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send as SendIcon,
  ShieldCheck,
  Star as StarIcon,
  Ticket as TicketIcon,
  Video,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StarRating, StarRatingDisplay } from "@/components/seguridad/StarRating";
import { useAuthStore } from "@/lib/stores/auth.store";

type Ingreso = {
  id: number;
  rma_case_id: number | null;
  fecha_entrega: string;
  factura_numero: string | null;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  descripcion_falla: string | null;
  accesorios_integros: number;
  sin_manipulacion: number;
  dentro_de_fecha: number;
  falla_cubierta_garantia: number;
  recibido_por: string;
  foto_estado_url: string | null;
  created_at: string;
};

type RmaCase = {
  id: number;
  case_number: string;
  status: string;
  invoice_number: string;
} | null;

type Adjunto = {
  id: number;
  filename: string;
  mime: string;
  size: number;
  created_at: string;
  url: string;
};

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

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
};

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export default function IngresoDetailPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.ingreso.form");
  const td = useTranslations("seguridad.ingreso.detail");
  const tc = useTranslations("seguridad.calificacion");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;
  const base = `/${locale}/seguridad`;

  const { user } = useAuthStore();

  const [ingreso, setIngreso] = useState<Ingreso | null>(null);
  const [rmaCase, setRmaCase] = useState<RmaCase>(null);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [calificacion, setCalificacion] = useState<Calificacion>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState("");
  const [savingRating, setSavingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSaved, setRatingSaved] = useState(false);

  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/seguridad/ingreso/${id}`);
        const data = await res.json();
        if (cancel) return;
        if (!res.ok || !data.success) {
          setError(data.error || td("not_found"));
          setLoading(false);
          return;
        }
        setIngreso(data.ingreso);
        setRmaCase(data.rma_case);
        setCalificacion(data.calificacion ?? null);

        if (data.ingreso?.rma_case_id) {
          const adjRes = await fetch(`/api/seguridad/ingreso/${id}/adjuntos`);
          if (!cancel) {
            const adjData = await adjRes.json().catch(() => ({}));
            if (adjData.success) {
              setAdjuntos(adjData.adjuntos || []);
            }
          }
        }
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

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    let url: string | null = null;
    fetch(`/api/seguridad/ingreso/${id}/foto`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelado || !blob) return;
        if (blob.size === 0) return;
        url = URL.createObjectURL(blob);
        setFotoUrl(url);
      })
      .catch(() => {
        // ignore — no photo
      });
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const refetchCalificacion = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/seguridad/ingreso/${id}`);
      const data = await res.json();
      if (data.success) {
        setCalificacion(data.calificacion ?? null);
      }
    } catch {
      // ignore
    }
  };

  const submitCalificacion = async () => {
    if (!ingreso || draftRating < 1) return;
    setSavingRating(true);
    setRatingError(null);
    setRatingSaved(false);
    const calificadoPor = user?.name || user?.email || "Seguridad";
    try {
      const res = await fetch("/api/seguridad/calificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          almacenista_nombre: ingreso.recibido_por,
          calificacion: draftRating,
          relacionado_a: "ingreso",
          relacionado_id: ingreso.id,
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

  if (error || !ingreso) {
    return (
      <div className="min-h-screen font-sans">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <Link
              href={`${base}/ingreso`}
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
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {td("title", { id: ingreso.id })}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {td("subtitle")}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Data card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            {td("section_data")}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <DataField label={td("label_fecha")} value={fmtDate(ingreso.fecha_entrega)} />
            <DataField
              label={td("label_factura")}
              value={ingreso.factura_numero || td("no_value")}
            />
            <DataField
              label={td("label_cliente")}
              value={ingreso.cliente_nombre}
              full
            />
            <DataField
              label={td("label_hardware")}
              value={ingreso.hardware || td("no_value")}
            />
            <DataField
              label={td("label_serial")}
              value={ingreso.serial || td("no_value")}
              mono
            />
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                {td("label_descripcion")}
              </dt>
              <dd className="text-slate-800 whitespace-pre-wrap text-sm bg-slate-50/60 border border-slate-200 rounded-[10px] p-3 min-h-[60px]">
                {ingreso.descripcion_falla || td("no_value")}
              </dd>
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                {td("label_created")}
              </dt>
              <dd className="text-xs text-slate-500 mt-0.5">
                {fmtDateTime(ingreso.created_at)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Checks card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            {td("section_checks")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CheckField
              label={tf("check_accesorios")}
              value={ingreso.accesorios_integros}
              yes={tf("yes")}
              no={tf("no")}
            />
            <CheckField
              label={tf("check_manipulacion")}
              value={ingreso.sin_manipulacion}
              yes={tf("yes")}
              no={tf("no")}
            />
            <CheckField
              label={tf("check_fecha")}
              value={ingreso.dentro_de_fecha}
              yes={tf("yes")}
              no={tf("no")}
            />
            <CheckField
              label={tf("check_garantia")}
              value={ingreso.falla_cubierta_garantia}
              yes={tf("yes")}
              no={tf("no")}
            />
          </div>
        </section>

        {/* Received by card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            {td("section_recibido")}
          </h2>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100 shrink-0">
              <ShieldCheck className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-sm text-slate-800 font-medium">
              {ingreso.recibido_por}
            </p>
          </div>
        </section>

        {/* Calificación card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <StarIcon className="w-4 h-4 text-[color:var(--portal-primary,#741DFE)]" />
              {tc("ingreso_title")}
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              {ingreso.recibido_por}
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
                  {tc("rate_for", { name: ingreso.recibido_por })}
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

        {/* Foto del estado */}
        {fotoUrl && (
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-500" />
                {t("foto_estado.title")}
              </h2>
              <span className="text-[11px] text-slate-400">
                {t("foto_estado.click_to_enlarge")}
              </span>
            </div>
            <div
              className="cursor-zoom-in rounded-[10px] border border-slate-200 bg-slate-50/40 p-2 flex items-center justify-center"
              onClick={() => setLightboxOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setLightboxOpen(true);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoUrl}
                alt="Foto del estado del equipo"
                className="max-w-full max-h-96 object-contain rounded-lg"
              />
            </div>
          </section>
        )}

        {/* Ticket card (if linked) */}
        {ingreso.rma_case_id && (
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
                  label={td("case_number")}
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
                  label={td("ticket_hardware")}
                  value={ingreso.hardware || td("no_value")}
                />
                <DataField
                  label={td("ticket_serial")}
                  value={ingreso.serial || td("no_value")}
                  mono
                />
                <DataField
                  label={td("ticket_factura")}
                  value={rmaCase.invoice_number || td("no_value")}
                />
              </dl>
            ) : (
              <p className="text-sm text-slate-500">{td("no_ticket")}</p>
            )}
          </section>
        )}

        {/* Adjuntos (if linked and has any) */}
        {ingreso.rma_case_id && (
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-500" />
                {td("section_adjuntos")}
              </h2>
              <span className="text-xs text-slate-400">
                {td("adjuntos_count", { count: adjuntos.length })}
              </span>
            </div>
            {adjuntos.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                {td("no_adjuntos")}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {adjuntos.map((adj) => {
                  const isVideo = adj.mime?.startsWith("video/");
                  return (
                    <a
                      key={adj.id}
                      href={adj.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      <div className="relative aspect-square rounded-[10px] border border-slate-200 overflow-hidden bg-slate-50">
                        {isVideo ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-1">
                            <Video className="w-8 h-8" />
                            <span className="text-[10px] font-semibold uppercase">
                              {td("adjunto_video")}
                            </span>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={adj.url}
                            alt={adj.filename}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        )}
                        <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-white/90 border border-slate-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {isVideo ? (
                            <Video className="w-3 h-3" />
                          ) : (
                            <ImageIcon className="w-3 h-3" />
                          )}
                          {isVideo ? td("adjunto_video") : td("adjunto_imagen")}
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500 truncate">
                        {adj.filename}
                      </p>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {lightboxOpen && fotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}
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
      className={`flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 ${
        ok
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-red-200 bg-red-50/50"
      }`}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-xs font-bold ${
          ok ? "text-emerald-700" : "text-red-600"
        }`}
      >
        {ok ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        {ok ? yes : no}
      </span>
    </div>
  );
}
