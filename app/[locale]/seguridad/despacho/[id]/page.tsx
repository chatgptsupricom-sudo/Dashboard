"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Package,
  Send,
  Ticket as TicketIcon,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

type Despacho = {
  id: number;
  ingreso_id: number | null;
  rma_case_id: number | null;
  fecha_despacho: string;
  almacenista_nombre: string;
  facturas: string[];
  cliente_retira: string | null;
  accesorios_integros: number;
  observaciones: string | null;
  created_at: string;
};

type Ingreso = {
  id: number;
  fecha_entrega: string;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  recibido_por: string;
} | null;

type RmaCase = {
  id: number;
  case_number: string;
  status: string;
  invoice_number: string;
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
  despachado: "Despachado",
};

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-cyan-100 text-cyan-700 border-cyan-200",
  despachado: "bg-violet-100 text-violet-700 border-violet-200",
};

export default function DespachoDetailPage() {
  const t = useTranslations("seguridad");
  const td = useTranslations("seguridad.despacho.detail");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;
  const base = `/${locale}/seguridad`;

  const [despacho, setDespacho] = useState<Despacho | null>(null);
  const [ingreso, setIngreso] = useState<Ingreso>(null);
  const [rmaCase, setRmaCase] = useState<RmaCase>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/seguridad/despacho/${id}`);
        const data = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok || !data.success) {
          setError(data.error || td("not_found"));
          setLoading(false);
          return;
        }
        setDespacho(data.despacho);
        setIngreso(data.ingreso || null);
        setRmaCase(data.rma_case || null);
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

  const statusKey = rmaCase?.status
    ? statusLabels[rmaCase.status] || rmaCase.status
    : "";
  const statusClass = rmaCase?.status
    ? statusColors[rmaCase.status] ||
      "bg-slate-100 text-slate-600 border-slate-200"
    : "";
  const accesoriosOk = despacho.accesorios_integros === 1;

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
              <p className="text-xs text-slate-500 truncate">{td("subtitle")}</p>
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
            <DataField label={td("label_fecha")} value={fmtDate(despacho.fecha_despacho)} />
            <DataField
              label={td("label_almacenista")}
              value={despacho.almacenista_nombre}
            />
            <DataField
              label={td("label_cliente_retira")}
              value={despacho.cliente_retira || td("no_value")}
              full
            />
            <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 border-slate-200 bg-slate-50/60">
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
                {accesoriosOk ? td("yes") : td("no")}
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

        {/* Facturas card */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              {td("section_facturas")}
            </h2>
            <span className="text-xs text-slate-400">
              {despacho.facturas?.length || 0}
            </span>
          </div>
          {despacho.facturas && despacho.facturas.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {despacho.facturas.map((f, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border bg-violet-50 text-violet-700 border-violet-200"
                >
                  <FileText className="w-3 h-3" />
                  {f}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-3">
              {td("no_facturas")}
            </p>
          )}
        </section>

        {/* Ingreso card */}
        {despacho.ingreso_id && (
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-500" />
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
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
                <div className="sm:col-span-2">
                  <DataField
                    label={td("ingreso_label_recibido")}
                    value={ingreso.recibido_por}
                  />
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">{td("no_ingreso")}</p>
            )}
          </section>
        )}

        {/* RMA case card */}
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
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
                <div className="sm:col-span-2">
                  <DataField
                    label={td("ticket_invoice")}
                    value={rmaCase.invoice_number || td("no_value")}
                  />
                </div>
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
