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
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(value: string) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

type IngresoPendiente = {
  id: number;
  fecha_entrega: string;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  factura_numero: string | null;
  rma_case_id: number | null;
};

const MAX = {
  almacenista_nombre: 200,
  factura: 100,
  cliente_retira: 200,
  observaciones: 5000,
  max_facturas: 50,
};

export default function NuevoDespachoPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.despacho.form");
  const tl = useTranslations("seguridad.despacho.list");
  const td = useTranslations("seguridad.despacho.detail");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const base = `/${locale}/seguridad`;

  const [fechaDespacho, setFechaDespacho] = useState(todayISO());
  const [almacenista, setAlmacenista] = useState(user?.name || "");
  const [clienteRetira, setClienteRetira] = useState("");
  const [accesoriosIntegros, setAccesoriosIntegros] = useState(true);
  const [observaciones, setObservaciones] = useState("");

  const [facturas, setFacturas] = useState<string[]>([""]);

  const [ingresos, setIngresos] = useState<IngresoPendiente[]>([]);
  const [loadingIngresos, setLoadingIngresos] = useState(false);
  const [ingresoQuery, setIngresoQuery] = useState("");
  const [selectedIngreso, setSelectedIngreso] =
    useState<IngresoPendiente | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name && !almacenista) {
      setAlmacenista(user.name);
    }
  }, [user?.name]);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      setLoadingIngresos(true);
      try {
        const res = await fetch("/api/seguridad/ingresos-pendientes");
        const data = await res.json().catch(() => ({}));
        if (cancel) return;
        if (res.ok && data.success) {
          setIngresos(data.ingresos || data.items || []);
        }
      } catch {
        if (!cancel) setIngresos([]);
      } finally {
        if (!cancel) setLoadingIngresos(false);
      }
    };
    run();
    return () => {
      cancel = true;
    };
  }, []);

  const filteredIngresos = useMemo(() => {
    const q = ingresoQuery.trim().toLowerCase();
    if (!q) return ingresos;
    return ingresos.filter((i) => {
      return (
        (i.cliente_nombre || "").toLowerCase().includes(q) ||
        (i.serial || "").toLowerCase().includes(q) ||
        (i.hardware || "").toLowerCase().includes(q) ||
        (i.factura_numero || "").toLowerCase().includes(q)
      );
    });
  }, [ingresos, ingresoQuery]);

  const selectIngreso = (ing: IngresoPendiente) => {
    setSelectedIngreso(ing);
    setClienteRetira((prev) => prev || ing.cliente_nombre || "");
    setDropdownOpen(false);
    setIngresoQuery("");
  };

  const clearIngreso = () => {
    setSelectedIngreso(null);
  };

  const addFactura = () => {
    if (facturas.length >= MAX.max_facturas) return;
    setFacturas((prev) => [...prev, ""]);
  };

  const updateFactura = (idx: number, value: string) => {
    const trimmed = value.slice(0, MAX.factura);
    setFacturas((prev) => prev.map((f, i) => (i === idx ? trimmed : f)));
  };

  const removeFactura = (idx: number) => {
    setFacturas((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!fechaDespacho.trim() || !almacenista.trim()) {
      setSubmitError(tf("error_required"));
      return;
    }

    const cleanedFacturas = facturas
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        fecha_despacho: fechaDespacho.trim(),
        almacenista_nombre: almacenista.trim().slice(0, MAX.almacenista_nombre),
        cliente_retira: clienteRetira.trim().slice(0, MAX.cliente_retira) || undefined,
        accesorios_integros: accesoriosIntegros,
        observaciones: observaciones.trim().slice(0, MAX.observaciones) || undefined,
        facturas: cleanedFacturas,
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
              <p className="text-xs text-slate-500 truncate">{tf("subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-32">
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Section A: Ingreso vinculado */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-sm font-bold text-slate-900">
                {tf("section_ingreso")}
              </h2>
              {selectedIngreso && (
                <button
                  type="button"
                  onClick={clearIngreso}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  {tf("toggle_direct")}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {selectedIngreso ? tf("ingreso_found") : tf("toggle_from_ingreso")}
            </p>

            {selectedIngreso ? (
              <div className="rounded-[10px] border border-violet-200 bg-violet-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-violet-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {tf("ingreso_id_label")} #{selectedIngreso.id}
                  </span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("ingreso_label_fecha")}
                    </dt>
                    <dd className="text-slate-800">
                      {fmtDate(selectedIngreso.fecha_entrega)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("ingreso_label_cliente")}
                    </dt>
                    <dd className="text-slate-800">
                      {selectedIngreso.cliente_nombre}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("ingreso_label_hardware")}
                    </dt>
                    <dd className="text-slate-800">
                      {selectedIngreso.hardware || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {td("ingreso_label_serial")}
                    </dt>
                    <dd className="text-slate-800 font-mono">
                      {selectedIngreso.serial || "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="relative">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={ingresoQuery}
                      onChange={(e) => {
                        setIngresoQuery(e.target.value);
                        setDropdownOpen(true);
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setDropdownOpen(false), 150);
                      }}
                      placeholder={tf("search_ingreso_placeholder")}
                      className="w-full h-11 pl-9 pr-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearIngreso}
                    className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    {tf("toggle_direct")}
                  </button>
                </div>

                {dropdownOpen && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-[10px] shadow-lg">
                    {loadingIngresos ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-slate-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {tf("searching")}
                      </div>
                    ) : filteredIngresos.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-slate-500 text-sm">
                        <Package className="w-4 h-4 text-slate-300" />
                        {tf("ingreso_not_found")}
                      </div>
                    ) : (
                      filteredIngresos.map((ing) => (
                        <button
                          key={ing.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectIngreso(ing)}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {ing.cliente_nombre}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 shrink-0">
                              #{ing.id} · {fmtDate(ing.fecha_entrega)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {ing.hardware || "—"}
                            {ing.serial ? ` · ${ing.serial}` : ""}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section B: Datos del despacho */}
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
                value={fechaDespacho}
                onChange={(e) => setFechaDespacho(e.target.value)}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_almacenista")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-violet-100 shrink-0">
                  <ShieldCheck className="w-4 h-4 text-violet-600" />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={almacenista}
                    onChange={(e) =>
                      setAlmacenista(e.target.value.slice(0, MAX.almacenista_nombre))
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
                {tf("field_cliente_retira")}
              </label>
              <input
                type="text"
                value={clienteRetira}
                onChange={(e) =>
                  setClienteRetira(e.target.value.slice(0, MAX.cliente_retira))
                }
                placeholder={tf("cliente_retira_placeholder")}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={MAX.cliente_retira}
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">
                {tf("field_accesorios")}
              </span>
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-slate-200 px-3 py-2.5">
                <span className="text-sm font-medium text-slate-700">
                  {tf("field_accesorios")}
                </span>
                <div
                  role="group"
                  className="inline-flex rounded-[10px] border border-slate-200 overflow-hidden text-xs font-semibold"
                >
                  <button
                    type="button"
                    onClick={() => setAccesoriosIntegros(true)}
                    aria-pressed={accesoriosIntegros === true}
                    className={`px-3 h-8 transition-colors ${
                      accesoriosIntegros
                        ? "bg-emerald-500 text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {tf("yes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccesoriosIntegros(false)}
                    aria-pressed={accesoriosIntegros === false}
                    className={`px-3 h-8 border-l border-slate-200 transition-colors ${
                      !accesoriosIntegros
                        ? "bg-red-500 text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {tf("no")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Section C: Facturas */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">
              {tf("section_facturas")}
            </h2>
            <div className="space-y-2">
              {facturas.map((factura, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={factura}
                    onChange={(e) => updateFactura(idx, e.target.value)}
                    placeholder={tf("factura_placeholder")}
                    className="flex-1 h-11 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                    maxLength={MAX.factura}
                  />
                  <button
                    type="button"
                    onClick={() => removeFactura(idx)}
                    disabled={facturas.length === 1 && !facturas[0]}
                    className="h-11 w-11 inline-flex items-center justify-center rounded-[10px] text-slate-500 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-500 disabled:hover:border-slate-200 transition-colors"
                    aria-label={tf("factura_remove")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addFactura}
              disabled={facturas.length >= MAX.max_facturas}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[10px] text-sm font-semibold text-[color:var(--portal-primary,#741DFE)] border border-violet-200 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <Plus className="w-4 h-4" />
              {tf("factura_add")}
            </button>
            <p className="text-[11px] text-slate-400">
              {facturas.filter((f) => f.trim()).length} / {MAX.max_facturas}
            </p>
          </section>

          {/* Section D: Observaciones */}
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              {tf("section_observations")}
            </h2>
            <textarea
              value={observaciones}
              onChange={(e) =>
                setObservaciones(e.target.value.slice(0, MAX.observaciones))
              }
              placeholder={tf("observaciones_placeholder")}
              className="w-full min-h-[110px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
              maxLength={MAX.observaciones}
            />
            <p className="text-[11px] text-slate-400 mt-1 text-right">
              {observaciones.length} / {MAX.observaciones}
            </p>
          </section>

          {submitError && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </form>
      </main>

      {/* Sticky submit bar */}
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
