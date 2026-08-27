"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import SignaturePad from "@/components/seguridad/SignaturePad";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Ingreso = {
  id: number;
  rma_case_id: number | null;
  fecha_entrega: string;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
};

type FormState = {
  nd_numero: string;
  fecha_despacho: string;
  almacenista_nombre: string;
  cliente_retira: string;
  accesorios_integros: boolean;
  observaciones: string;
  firma_cliente_nombre: string;
};

const MAX = {
  nd_numero: 50,
  almacenista_nombre: 200,
  cliente_retira: 200,
  observaciones: 5000,
  firma_cliente_nombre: 200,
  factura: 100,
};
const MAX_FACTURAS = 50;

export default function NuevoDespachoPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.despacho.form");
  const td = useTranslations("seguridad.despacho.detail");
  const tfl = useTranslations("seguridad.ingreso.form");
  const tdl = useTranslations("seguridad.ingreso.detail");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();

  const base = `/${locale}/seguridad`;

  const [form, setForm] = useState<FormState>({
    nd_numero: "",
    fecha_despacho: todayISO(),
    almacenista_nombre: user?.name || "",
    cliente_retira: "",
    accesorios_integros: true,
    observaciones: "",
    firma_cliente_nombre: "",
  });

  const [ingresoQuery, setIngresoQuery] = useState("");
  const [ingresoResults, setIngresoResults] = useState<Ingreso[]>([]);
  const [selectedIngreso, setSelectedIngreso] = useState<Ingreso | null>(null);
  const [searchingIngreso, setSearchingIngreso] = useState(false);
  const [ingresoError, setIngresoError] = useState<string | null>(null);
  const [ingresoSearched, setIngresoSearched] = useState(false);

  const [facturas, setFacturas] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name && !form.almacenista_nombre) {
      setForm((prev) => ({ ...prev, almacenista_nombre: user.name }));
    }
  }, [user?.name]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const searchIngreso = async () => {
    const value = ingresoQuery.trim();
    if (!value) return;
    setSearchingIngreso(true);
    setIngresoError(null);
    setIngresoResults([]);
    setIngresoSearched(true);
    try {
      const res = await fetch(
        `/api/seguridad/despacho/ingresos-pendientes?search=${encodeURIComponent(value)}`,
      );
      if (!res.ok) {
        setIngresoError(tf("ingreso_not_found"));
        return;
      }
      const data = await res.json();
      if (data.success) {
        setIngresoResults(data.ingresos || []);
        if ((data.ingresos || []).length === 0) {
          setIngresoError(tf("ingreso_not_found"));
        }
      } else {
        setIngresoError(tf("ingreso_not_found"));
      }
    } catch {
      setIngresoError(tf("ingreso_not_found"));
    } finally {
      setSearchingIngreso(false);
    }
  };

  const selectIngreso = (ing: Ingreso) => {
    setSelectedIngreso(ing);
    setIngresoResults([]);
    setIngresoQuery("");
    setIngresoError(null);
    setIngresoSearched(false);
    setForm((prev) => ({
      ...prev,
      cliente_retira: prev.cliente_retira || ing.cliente_nombre || "",
    }));
  };

  const skipIngreso = () => {
    setSelectedIngreso(null);
    setIngresoResults([]);
    setIngresoQuery("");
    setIngresoError(null);
    setIngresoSearched(false);
  };

  const addFactura = () => {
    if (facturas.length >= MAX_FACTURAS) return;
    setFacturas((prev) => [...prev, ""]);
  };

  const updateFactura = (idx: number, value: string) => {
    setFacturas((prev) =>
      prev.map((f, i) => (i === idx ? value.slice(0, MAX.factura) : f)),
    );
  };

  const removeFactura = (idx: number) => {
    setFacturas((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!form.almacenista_nombre.trim()) {
      setSubmitError(tf("error_required"));
      return;
    }

    setSubmitting(true);
    try {
      const cleanFacturas = facturas
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      const payload: Record<string, unknown> = {
        nd_numero: form.nd_numero.trim() || undefined,
        fecha_despacho: form.fecha_despacho,
        almacenista_nombre: form.almacenista_nombre
          .trim()
          .slice(0, MAX.almacenista_nombre),
        cliente_retira: form.cliente_retira.trim().slice(0, MAX.cliente_retira) || undefined,
        accesorios_integros: form.accesorios_integros,
        observaciones: form.observaciones.trim().slice(0, MAX.observaciones) || undefined,
        firma_cliente_nombre:
          form.firma_cliente_nombre.trim().slice(0, MAX.firma_cliente_nombre) || undefined,
        facturas: cleanFacturas,
      };
      if (selectedIngreso) {
        payload.ingreso_id = selectedIngreso.id;
        if (selectedIngreso.rma_case_id) {
          payload.rma_case_id = selectedIngreso.rma_case_id;
        }
      }

      const res = await fetch("/api/seguridad/despacho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || tf("error_generic"));
      }

      const data = await res.json();
      if (data?.id && firmaDataUrl) {
        try {
          await fetch(`/api/seguridad/despacho/${data.id}/firma`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ firma_data_url: firmaDataUrl }),
          });
        } catch {
          // non-fatal
        }
      }
      if (data?.id) {
        router.push(`${base}/despacho/${data.id}`);
      } else {
        router.push(`${base}/despacho`);
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
          {/* Section A: Ingreso vinculado */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              {tf("section_ingreso")}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {t("module_subtitle")}
            </p>

            {selectedIngreso ? (
              <div className="rounded-[10px] border border-violet-200 bg-violet-50/60 p-4 space-y-3">
                <div className="flex items-center gap-2 text-violet-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {tf("ingreso_found")}
                  </span>
                  <span className="ml-auto text-xs font-mono text-violet-900 bg-white border border-violet-200 px-2 py-0.5 rounded">
                    #{selectedIngreso.id}
                  </span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {tdl("label_cliente")}
                    </dt>
                    <dd className="text-slate-800">{selectedIngreso.cliente_nombre}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {tdl("label_hardware")}
                    </dt>
                    <dd className="text-slate-800">{selectedIngreso.hardware || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {tdl("label_serial")}
                    </dt>
                    <dd className="text-slate-800 font-mono">
                      {selectedIngreso.serial || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {tdl("label_fecha")}
                    </dt>
                    <dd className="text-slate-800">
                      {selectedIngreso.fecha_entrega?.slice(0, 10) || "—"}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-center gap-2 pt-2 border-t border-violet-200/60">
                  <Link
                    href={`${base}/ingreso/${selectedIngreso.id}`}
                    className="text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
                  >
                    {td("open_ingreso")} →
                  </Link>
                  <button
                    type="button"
                    onClick={skipIngreso}
                    className="ml-auto text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    {tf("factura_remove")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={ingresoQuery}
                    onChange={(e) => setIngresoQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchIngreso();
                      }
                    }}
                    placeholder={tf("search_ingreso_placeholder")}
                    className="flex-1 h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                  />
                  <button
                    type="button"
                    onClick={searchIngreso}
                    disabled={searchingIngreso || !ingresoQuery.trim()}
                    className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
                  >
                    {searchingIngreso ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    {searchingIngreso ? tf("searching") : tf("search_ingreso")}
                  </button>
                </div>

                {ingresoError && (
                  <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {ingresoError}
                  </p>
                )}

                {ingresoResults.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-[10px] overflow-hidden">
                    {ingresoResults.map((ing) => (
                      <li key={ing.id}>
                        <button
                          type="button"
                          onClick={() => selectIngreso(ing)}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3"
                        >
                          <Package className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {ing.cliente_nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {ing.hardware || "—"}
                              {ing.serial ? ` · ${ing.serial}` : ""}
                              {" · "}
                              {ing.fecha_entrega?.slice(0, 10)}
                            </p>
                          </div>
                          <span className="text-xs font-mono text-slate-500">
                            #{ing.id}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {ingresoSearched && !searchingIngreso && (
                  <button
                    type="button"
                    onClick={skipIngreso}
                    className="mt-3 w-full h-10 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    {tf("toggle_direct")}
                  </button>
                )}
              </>
            )}
          </section>

          {/* Section B: Datos del despacho */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              {tf("section_data")}
            </h2>

            {/* Numero ND del encabezado de la planilla: el correlativo que
                el almacen lleva a mano en el papel. */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_nd")}
              </label>
              <input
                type="text"
                value={form.nd_numero}
                onChange={(e) =>
                  update("nd_numero", e.target.value.slice(0, MAX.nd_numero))
                }
                placeholder={tf("field_nd_placeholder")}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.nd_numero}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_fecha")} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.fecha_despacho}
                onChange={(e) => update("fecha_despacho", e.target.value)}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_almacenista")} <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-violet-100 shrink-0">
                  <ShieldCheck className="w-4 h-4 text-violet-600" />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={form.almacenista_nombre}
                    onChange={(e) =>
                      update(
                        "almacenista_nombre",
                        e.target.value.slice(0, MAX.almacenista_nombre),
                      )
                    }
                    className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                    required
                    maxLength={MAX.almacenista_nombre}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {tf("almacenista_help")}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_facturas")}
              </label>
              <div className="space-y-2">
                {facturas.map((fact, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={fact}
                      onChange={(e) => updateFactura(idx, e.target.value)}
                      placeholder={tf("factura_placeholder")}
                      className="flex-1 h-10 px-3 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                      maxLength={MAX.factura}
                    />
                    <button
                      type="button"
                      onClick={() => removeFactura(idx)}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-[10px] text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors"
                      title={tf("factura_remove")}
                      aria-label={tf("factura_remove")}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {facturas.length < MAX_FACTURAS && (
                  <button
                    type="button"
                    onClick={addFactura}
                    className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-slate-700 border border-dashed border-slate-300 hover:bg-slate-50 hover:border-violet-300 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {tf("factura_add")}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_cliente_retira")}
              </label>
              <input
                type="text"
                value={form.cliente_retira}
                onChange={(e) =>
                  update("cliente_retira", e.target.value.slice(0, MAX.cliente_retira))
                }
                placeholder={tf("cliente_retira_placeholder")}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.cliente_retira}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-slate-200 px-3 py-2.5">
              <span className="text-sm font-medium text-slate-700">
                {tf("field_accesorios")}
              </span>
              {/* h-12: mismo criterio de 48px que el formulario de ingreso. */}
              <div
                role="group"
                className="inline-flex shrink-0 rounded-[10px] border border-slate-200 overflow-hidden text-sm font-semibold"
              >
                <button
                  type="button"
                  onClick={() => update("accesorios_integros", true)}
                  aria-pressed={form.accesorios_integros === true}
                  className={`min-w-[56px] px-4 h-12 transition-colors ${
                    form.accesorios_integros
                      ? "bg-emerald-500 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {tf("yes")}
                </button>
                <button
                  type="button"
                  onClick={() => update("accesorios_integros", false)}
                  aria-pressed={form.accesorios_integros === false}
                  className={`min-w-[56px] px-4 h-12 border-l border-slate-200 transition-colors ${
                    !form.accesorios_integros
                      ? "bg-red-500 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {tf("no")}
                </button>
              </div>
            </div>
          </section>

          {/* Section C: Observaciones y firma */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              {tf("section_observations")}
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_observaciones")}
              </label>
              <textarea
                value={form.observaciones}
                onChange={(e) =>
                  update("observaciones", e.target.value.slice(0, MAX.observaciones))
                }
                placeholder={tf("observaciones_placeholder")}
                className="w-full min-h-[110px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.observaciones}
              />
              <p className="text-[11px] text-slate-400 mt-1 text-right">
                {form.observaciones.length} / {MAX.observaciones}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_firma_nombre")}
              </label>
              <input
                type="text"
                value={form.firma_cliente_nombre}
                onChange={(e) =>
                  update(
                    "firma_cliente_nombre",
                    e.target.value.slice(0, MAX.firma_cliente_nombre),
                  )
                }
                placeholder={tf("firma_nombre_placeholder")}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.firma_cliente_nombre}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t("firma_digital.label")}
              </label>
              <SignaturePad
                onChange={setFirmaDataUrl}
                label={t("firma_digital.label")}
              />
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
            href={`${base}/despacho`}
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
