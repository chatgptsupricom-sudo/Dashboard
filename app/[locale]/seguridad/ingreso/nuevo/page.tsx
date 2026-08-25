"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Ticket = {
  id: number;
  case_number: string;
  client_name: string;
  hardware: string;
  serial: string;
  invoice_number: string;
  reported_fault: string;
};

type FormState = {
  fecha_entrega: string;
  factura_numero: string;
  cliente_nombre: string;
  hardware: string;
  serial: string;
  descripcion_falla: string;
  accesorios_integros: boolean;
  sin_manipulacion: boolean;
  dentro_de_fecha: boolean;
  falla_cubierta_garantia: boolean;
  recibido_por: string;
};

const MAX = {
  factura_numero: 100,
  cliente_nombre: 200,
  hardware: 200,
  serial: 200,
  descripcion_falla: 5000,
};

export default function NuevoIngresoPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.ingreso.form");
  const tl = useTranslations("seguridad.ingreso.list");
  const td = useTranslations("seguridad.ingreso.detail");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();

  const base = `/${locale}/seguridad`;
  const ticketInputUrl = (caseNumber: string) =>
    `/api/seguridad/buscar-ticket/${encodeURIComponent(caseNumber.trim())}`;

  const [form, setForm] = useState<FormState>({
    fecha_entrega: todayISO(),
    factura_numero: "",
    cliente_nombre: "",
    hardware: "",
    serial: "",
    descripcion_falla: "",
    accesorios_integros: true,
    sin_manipulacion: true,
    dentro_de_fecha: true,
    falla_cubierta_garantia: true,
    recibido_por: user?.name || "",
  });

  const [ticketQuery, setTicketQuery] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [searchingTicket, setSearchingTicket] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name && !form.recibido_por) {
      setForm((prev) => ({ ...prev, recibido_por: user.name }));
    }
  }, [user?.name]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const searchTicket = async () => {
    const value = ticketQuery.trim();
    if (!value) return;
    setSearchingTicket(true);
    setTicketError(null);
    setTicket(null);
    try {
      const res = await fetch(ticketInputUrl(value));
      if (res.status === 404) {
        setTicketError(tf("ticket_not_found"));
        return;
      }
      if (!res.ok) {
        setTicketError(tf("ticket_not_found"));
        return;
      }
      const data = await res.json();
      if (data.success && data.case) {
        const c = data.case;
        setTicket(c);
        setForm((prev) => ({
          ...prev,
          cliente_nombre: prev.cliente_nombre || c.client_name || "",
          hardware: prev.hardware || c.hardware || "",
          serial: prev.serial || c.serial || "",
          descripcion_falla:
            prev.descripcion_falla || c.reported_fault || "",
          factura_numero: prev.factura_numero || c.invoice_number || "",
        }));
      }
    } catch {
      setTicketError(tf("ticket_not_found"));
    } finally {
      setSearchingTicket(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!form.cliente_nombre.trim() || !form.recibido_por.trim()) {
      setSubmitError(tf("error_required"));
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        fecha_entrega: form.fecha_entrega,
        factura_numero: form.factura_numero.trim() || undefined,
        cliente_nombre: form.cliente_nombre.trim().slice(0, MAX.cliente_nombre),
        hardware: form.hardware.trim() || undefined,
        serial: form.serial.trim() || undefined,
        descripcion_falla: form.descripcion_falla.trim() || undefined,
        accesorios_integros: form.accesorios_integros,
        sin_manipulacion: form.sin_manipulacion,
        dentro_de_fecha: form.dentro_de_fecha,
        falla_cubierta_garantia: form.falla_cubierta_garantia,
        recibido_por: form.recibido_por.trim().slice(0, 200),
      };
      if (ticket?.id) {
        payload.rma_case_id = ticket.id;
      }

      const res = await fetch("/api/seguridad/ingreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || tf("error_generic"));
      }

      const data = await res.json();
      if (data?.id) {
        router.push(`${base}/ingreso/${data.id}`);
      } else {
        router.push(`${base}/ingreso`);
      }
    } catch (err: any) {
      setSubmitError(err?.message || tf("error_generic"));
      setSubmitting(false);
    }
  };

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
                {tf("title")}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {tf("subtitle")}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-32">
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Section A: Ticket search */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              {tf("section_ticket")}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {t("module_subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={ticketQuery}
                onChange={(e) => setTicketQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchTicket();
                  }
                }}
                placeholder={tf("search_ticket_placeholder")}
                className="flex-1 h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={searchTicket}
                disabled={searchingTicket || !ticketQuery.trim()}
                className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
              >
                {searchingTicket ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {searchingTicket ? tf("searching") : tf("search_ticket")}
              </button>
            </div>

            {ticketError && (
              <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                {ticketError}
              </p>
            )}

            {ticket && (
              <div className="mt-4 rounded-[10px] border border-violet-200 bg-violet-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-violet-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {tf("ticket_found")}
                  </span>
                  <span className="ml-auto text-xs font-mono text-violet-900 bg-white border border-violet-200 px-2 py-0.5 rounded">
                    {tf("case_number")} {ticket.case_number}
                  </span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("label_cliente")}
                    </dt>
                    <dd className="text-slate-800">{ticket.client_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("label_hardware")}
                    </dt>
                    <dd className="text-slate-800">{ticket.hardware || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("label_serial")}
                    </dt>
                    <dd className="text-slate-800 font-mono">
                      {ticket.serial || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("label_factura")}
                    </dt>
                    <dd className="text-slate-800">
                      {ticket.invoice_number || "—"}
                    </dd>
                  </div>
                  {ticket.reported_fault && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        {td("label_descripcion")}
                      </dt>
                      <dd className="text-slate-800 whitespace-pre-wrap">
                        {ticket.reported_fault}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </section>

          {/* Section B: Data */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              {tf("section_data")}
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_fecha")} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.fecha_entrega}
                onChange={(e) => update("fecha_entrega", e.target.value)}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_factura")}{" "}
                <span className="text-slate-400 font-normal">
                  ({tf("check_garantia") ? "" : ""})
                </span>
              </label>
              <input
                type="text"
                value={form.factura_numero}
                onChange={(e) =>
                  update("factura_numero", e.target.value.slice(0, MAX.factura_numero))
                }
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.factura_numero}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_cliente")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.cliente_nombre}
                onChange={(e) =>
                  update("cliente_nombre", e.target.value.slice(0, MAX.cliente_nombre))
                }
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                required
                maxLength={MAX.cliente_nombre}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {tf("field_hardware")}
                </label>
                <input
                  type="text"
                  value={form.hardware}
                  onChange={(e) =>
                    update("hardware", e.target.value.slice(0, MAX.hardware))
                  }
                  className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                  maxLength={MAX.hardware}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {tf("field_serial")}
                </label>
                <input
                  type="text"
                  value={form.serial}
                  onChange={(e) =>
                    update("serial", e.target.value.slice(0, MAX.serial))
                  }
                  className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100 font-mono"
                  maxLength={MAX.serial}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_descripcion")}
              </label>
              <textarea
                value={form.descripcion_falla}
                onChange={(e) =>
                  update(
                    "descripcion_falla",
                    e.target.value.slice(0, MAX.descripcion_falla),
                  )
                }
                className="w-full min-h-[110px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.descripcion_falla}
              />
              <p className="text-[11px] text-slate-400 mt-1 text-right">
                {form.descripcion_falla.length} / {MAX.descripcion_falla}
              </p>
            </div>
          </section>

          {/* Section C: 4 checks */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4">
              {tf("section_checks")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CheckRow
                label={tf("check_accesorios")}
                value={form.accesorios_integros}
                onChange={(v) => update("accesorios_integros", v)}
                yes={tf("yes")}
                no={tf("no")}
              />
              <CheckRow
                label={tf("check_manipulacion")}
                value={form.sin_manipulacion}
                onChange={(v) => update("sin_manipulacion", v)}
                yes={tf("yes")}
                no={tf("no")}
              />
              <CheckRow
                label={tf("check_fecha")}
                value={form.dentro_de_fecha}
                onChange={(v) => update("dentro_de_fecha", v)}
                yes={tf("yes")}
                no={tf("no")}
              />
              <CheckRow
                label={tf("check_garantia")}
                value={form.falla_cubierta_garantia}
                onChange={(v) => update("falla_cubierta_garantia", v)}
                yes={tf("yes")}
                no={tf("no")}
              />
            </div>
          </section>

          {/* Section D: Received by */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              {tf("section_received_by")}
            </h2>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-100 shrink-0">
                <ShieldCheck className="w-4 h-4 text-violet-600" />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={form.recibido_por}
                  onChange={(e) => update("recibido_por", e.target.value)}
                  className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                  required
                  maxLength={200}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {tf("recibido_por_help")}
                </p>
              </div>
            </div>
          </section>

          {submitError && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </form>
      </main>

      {/* Sticky submit bar (mobile-first) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={`${base}/ingreso`}
            className="h-11 px-4 inline-flex items-center justify-center rounded-[10px] text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {t("back")}
          </Link>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? tf("submitting") : tf("submit")}
          </button>
        </div>
      </div>
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
  value: boolean;
  onChange: (v: boolean) => void;
  yes: string;
  no: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-slate-200 px-3 py-2.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div
        role="group"
        className="inline-flex rounded-[10px] border border-slate-200 overflow-hidden text-xs font-semibold"
      >
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={value === true}
          className={`px-3 h-8 transition-colors ${
            value
              ? "bg-emerald-500 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {yes}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={value === false}
          className={`px-3 h-8 border-l border-slate-200 transition-colors ${
            !value
              ? "bg-red-500 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {no}
        </button>
      </div>
    </div>
  );
}
