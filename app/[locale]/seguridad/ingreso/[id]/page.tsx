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
  ShieldCheck,
  Ticket as TicketIcon,
  Video,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

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
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;
  const base = `/${locale}/seguridad`;

  const [ingreso, setIngreso] = useState<Ingreso | null>(null);
  const [rmaCase, setRmaCase] = useState<RmaCase>(null);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
