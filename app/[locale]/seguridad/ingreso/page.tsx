"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Download,
  Plus,
  Search,
  ShieldCheck,
  Star,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StarRatingDisplay } from "@/components/seguridad/StarRating";

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
  promedio_calificacion: number | null;
  created_at: string;
};

const PAGE_SIZE = 20;

function fmtDate(value: string) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

export default function IngresoListPage() {
  const t = useTranslations("seguridad");
  const tf = useTranslations("seguridad.ingreso.form");
  const tl = useTranslations("seguridad.ingreso.list");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad`;

  const [items, setItems] = useState<Ingreso[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedDesde, setAppliedDesde] = useState("");
  const [appliedHasta, setAppliedHasta] = useState("");

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (appliedSearch) sp.set("search", appliedSearch);
    if (appliedDesde) sp.set("desde", appliedDesde);
    if (appliedHasta) sp.set("hasta", appliedHasta);
    sp.set("page", String(page));
    sp.set("limit", String(PAGE_SIZE));
    return sp.toString();
  }, [appliedSearch, appliedDesde, appliedHasta, page]);

  // Export a Excel (issue #38). Reusa los MISMOS filtros aplicados, menos la
  // paginación: se exporta todo lo filtrado, no la página que se está viendo.
  const exportarExcel = () => {
    const sp = new URLSearchParams(queryString);
    sp.delete("page");
    sp.delete("limit");
    window.location.href = `/api/seguridad/ingreso/export?${sp.toString()}`;
  };

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/seguridad/ingreso?${queryString}`);
        const data = await res.json();
        if (cancel) return;
        if (data.success) {
          setItems(data.ingresos || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
        }
      } catch (e) {
        if (!cancel) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    run();
    return () => {
      cancel = true;
    };
  }, [queryString]);

  const visible = onlyPending ? items : items;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const applyFilters = () => {
    setPage(1);
    setAppliedSearch(search.trim());
    setAppliedDesde(desde);
    setAppliedHasta(hasta);
  };

  const clearFilters = () => {
    setSearch("");
    setDesde("");
    setHasta("");
    setAppliedSearch("");
    setAppliedDesde("");
    setAppliedHasta("");
    setOnlyPending(false);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={base}
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
                {tl("list_title")}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {tl("list_subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportarExcel}
              className="h-10 px-3 inline-flex items-center gap-2 rounded-[10px] border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              title={tl("export_excel")}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{tl("export_excel")}</span>
            </button>
          <Link
            href={`${base}/ingreso/nuevo`}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-[10px] text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{tl("new_ingreso")}</span>
            <span className="sm:hidden">+</span>
          </Link>
        </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Filters */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                {tl("search_placeholder")}
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyFilters();
                  }}
                  placeholder={tl("search_placeholder")}
                  className="w-full h-10 pl-9 pr-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  {tl("from")}
                </label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="h-10 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  {tl("to")}
                </label>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="h-10 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
              >
                <Search className="w-4 h-4" />
                <span className="hidden md:inline">{tl("search_placeholder")}</span>
                <span className="md:hidden">OK</span>
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 px-3 inline-flex items-center gap-1 rounded-[10px] text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                title={tl("clear_filters")}
              >
                <X className="w-4 h-4" />
                <span className="hidden md:inline">{tl("clear_filters")}</span>
              </button>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <span
              role="checkbox"
              aria-checked={onlyPending}
              tabIndex={0}
              onClick={() => setOnlyPending((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setOnlyPending((v) => !v);
                }
              }}
              className={`relative inline-block w-9 h-5 rounded-full transition-colors ${
                onlyPending
                  ? "bg-[color:var(--portal-primary,#741DFE)]"
                  : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  onlyPending ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
            {tl("only_pending_dispatch")}
          </label>
        </section>

        {/* Table */}
        <section className="bg-white border border-slate-200 rounded-[10px] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-slate-500 py-16">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">...</span>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-slate-500 py-16 gap-2">
              <ShieldCheck className="w-8 h-8 text-slate-300" />
              <p className="text-sm">{tl("no_results")}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold">
                        {tl("col_fecha")}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {tl("col_cliente")}
                      </th>
                      <th className="px-4 py-3 font-semibold hidden md:table-cell">
                        {tl("col_hardware")}
                      </th>
                      <th className="px-4 py-3 font-semibold hidden lg:table-cell">
                        {tl("col_checks")}
                      </th>
                      <th className="px-4 py-3 font-semibold hidden sm:table-cell">
                        {tl("col_recibido")}
                      </th>
                      <th className="px-4 py-3 font-semibold hidden md:table-cell">
                        {tl("col_rating")}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {tl("col_despachado")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-right">
                        {tl("col_actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((ing) => (
                      <tr
                        key={ing.id}
                        onClick={() => router.push(`${base}/ingreso/${ing.id}`)}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 cursor-pointer"
                      >
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap align-top">
                          {fmtDate(ing.fecha_entrega)}
                        </td>
                        <td className="px-4 py-3 text-slate-800 font-medium align-top">
                          <div className="truncate max-w-[200px]">
                            {ing.cliente_nombre}
                          </div>
                          <div className="md:hidden text-[11px] text-slate-500 truncate max-w-[200px]">
                            {ing.hardware || "—"}
                            {ing.serial ? ` · ${ing.serial}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 align-top hidden md:table-cell">
                          <div className="truncate max-w-[220px]">
                            {ing.hardware || "—"}
                          </div>
                          {ing.serial && (
                            <div className="text-[11px] text-slate-500 font-mono truncate max-w-[220px]">
                              {ing.serial}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            <CheckBadge
                              value={ing.accesorios_integros}
                              yes={tf("yes")}
                              no={tf("no")}
                            />
                            <CheckBadge
                              value={ing.sin_manipulacion}
                              yes={tf("yes")}
                              no={tf("no")}
                            />
                            <CheckBadge
                              value={ing.dentro_de_fecha}
                              yes={tf("yes")}
                              no={tf("no")}
                            />
                            <CheckBadge
                              value={ing.falla_cubierta_garantia}
                              yes={tf("yes")}
                              no={tf("no")}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 align-top hidden sm:table-cell">
                          <div className="truncate max-w-[160px]">
                            {ing.recibido_por}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top hidden md:table-cell">
                          {ing.promedio_calificacion !== null &&
                          ing.promedio_calificacion !== undefined ? (
                            <StarRatingDisplay
                              value={Number(ing.promedio_calificacion)}
                              size="sm"
                              showValue
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Star className="w-3 h-3" />
                              {tl("not_rated")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                            <XCircle className="w-3 h-3" />
                            {tf("no")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <Link
                            href={`${base}/ingreso/${ing.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
                          >
                            {tl("view")} →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50/40">
                <p className="text-xs text-slate-500">
                  {tl("showing", { from, to, total })}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    {tl("prev")}
                  </button>
                  <span className="text-xs text-slate-600 px-2">
                    {tl("page")} {page} {tl("of")} {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-white transition-colors"
                  >
                    {tl("next")}
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function CheckBadge({
  value,
  yes,
  no,
}: {
  value: number | boolean;
  yes: string;
  no: string;
}) {
  const ok = value === 1 || value === true;
  return (
    <span
      title={ok ? yes : no}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[10px] font-bold ${
        ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-600 border-red-200"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
    </span>
  );
}
