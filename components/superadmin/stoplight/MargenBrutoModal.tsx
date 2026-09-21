"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, ArrowLeft, Percent, Search, AlertTriangle, ChevronRight } from "lucide-react";
import ModalMonthPicker from "./ModalMonthPicker";

interface MargenBrutoModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id a enviar, o null en los modos que no lo mandan. */
  companyId: number | null;
  defaultMes: string;
  /** Gerencia de Ventas ve el margen % pero no el detalle de costo/ganancia
   *  (issue #178). La API ya no manda esos montos a ese rol; esto solo decide
   *  las columnas. */
  ocultarCostoGanancia?: boolean;
}

type Tab = "vendedor" | "producto" | "semanal";

interface Montos { revenue: number; costo?: number; ganancia?: number; margen: number | null }
interface Semana extends Montos { numero: number; inicio: string; fin: string; futura: boolean }
interface Vendedor extends Montos { nombre: string | null; esOtros: boolean; semanas: Semana[] }
interface Producto extends Montos { productId: number; nombre: string; cantidadVendida: number }
interface Detalle {
  mes: string;
  meta: number;
  costoOculto: boolean;
  totales: Montos & { productos: number };
  sellers: Vendedor[];
  products: Producto[];
}

// Semáforo del margen contra la meta, con los mismos cortes que el resto del
// Stoplight (verde ≥100% de la meta, amarillo ≥70%, rojo debajo). Sin meta
// configurada no hay semáforo: el margen se muestra neutro.
type Nivel = "verde" | "amarillo" | "rojo" | "neutro";
function nivelMargen(margen: number | null, meta: number): Nivel {
  if (margen == null || meta <= 0) return "neutro";
  const pct = (margen / meta) * 100;
  return pct >= 100 ? "verde" : pct >= 70 ? "amarillo" : "rojo";
}
const NIVEL_TEXTO: Record<Nivel, string> = {
  verde: "text-emerald-700",
  amarillo: "text-amber-700",
  rojo: "text-red-700",
  neutro: "text-slate-800",
};
const NIVEL_CHIP: Record<Nivel, string> = {
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amarillo: "bg-amber-50 text-amber-700 ring-amber-600/20",
  rojo: "bg-red-50 text-red-700 ring-red-600/20",
  neutro: "bg-slate-50 text-slate-700 ring-slate-500/20",
};

// Modal "Margen bruto": resumen del mes + tabs por vendedor / por producto /
// detalle semanal (con drill-down a un vendedor). Autocontenido.
export default function MargenBrutoModal({ isOpen, onClose, apiPrefix, companyId, defaultMes, ocultarCostoGanancia = false }: MargenBrutoModalProps) {
  const t = useTranslations("stoplight");
  const locale = useLocale();

  const [mes, setMes] = useState(defaultMes);
  const [tab, setTab] = useState<Tab>("vendedor");
  const [selectedSeller, setSelectedSeller] = useState<Vendedor | null>(null);
  const [filtroProducto, setFiltroProducto] = useState("");
  const [data, setData] = useState<Detalle | null>(null);
  const [error, setError] = useState<"permisos" | "general" | null>(null);
  const [loading, setLoading] = useState(false);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
      setTab("vendedor");
      setSelectedSeller(null);
      setFiltroProducto("");
    }
  }, [isOpen, defaultMes]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedSeller(null);
    (async () => {
      try {
        const params = new URLSearchParams({ mes });
        if (companyId != null) params.set("company_id", String(companyId));
        const res = await fetch(`${apiPrefix}/margen-detail?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success) setData(json.data);
        else setError(res.status === 401 || res.status === 403 ? "permisos" : "general");
      } catch (e) {
        console.error("Error fetching margen detail:", e);
        if (!cancelled) setError("general");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, mes, companyId, apiPrefix, reintento]);

  const productosFiltrados = useMemo(() => {
    const q = filtroProducto.trim().toLowerCase();
    if (!data) return [];
    return q ? data.products.filter((p) => p.nombre.toLowerCase().includes(q)) : data.products;
  }, [data, filtroProducto]);

  if (!isOpen) return null;

  // Costo/ganancia visibles solo si el rol los puede ver y la API los mandó.
  const conCosto = !ocultarCostoGanancia && !data?.costoOculto;
  const meta = data?.meta ?? 0;

  const dinero = (n: number | undefined) =>
    n == null ? "–" : `$${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number | null) =>
    n == null ? "–" : `${n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const fechaCorta = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const nombreVendedor = (v: Vendedor) => (v.esOtros ? t("margen_otros") : v.nombre);

  const MargenChip = ({ margen }: { margen: number | null }) => {
    const nivel = nivelMargen(margen, meta);
    return (
      <span className={`inline-flex min-w-[64px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${NIVEL_CHIP[nivel]}`}>
        {pct(margen)}
      </span>
    );
  };

  const abrirSemanal = (seller: Vendedor) => {
    setSelectedSeller(seller);
    setTab("semanal");
  };

  const th = "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const nivelTotal = nivelMargen(data?.totales.margen ?? null, meta);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="margen-bruto-title"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-violet-100 rounded-lg shrink-0">
              <Percent size={20} className="text-violet-600" />
            </div>
            <div className="min-w-0">
              <h2 id="margen-bruto-title" className="text-lg font-semibold text-slate-900 tracking-tight">{t("margen_bruto_title")}</h2>
              {data && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {meta > 0 ? t("margen_meta_label", { meta: pct(meta) }) : t("margen_sin_meta")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModalMonthPicker value={mes} onChange={setMes} />
            <button onClick={onClose} aria-label={t("margen_cerrar")} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-5 px-4 sm:px-5 border-b border-slate-100 overflow-x-auto">
          {(["vendedor", "producto", "semanal"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => { setTab(tb); if (tb !== "semanal") setSelectedSeller(null); }}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === tb ? "text-violet-700 border-violet-600" : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              {tb === "vendedor" ? t("tab_por_vendedor") : tb === "producto" ? t("tab_por_producto") : t("tab_detalle_semanal")}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-5">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100" />)}
              </div>
              <div className="h-64 rounded-xl bg-slate-100" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertTriangle size={28} className="text-amber-500" />
              <p className="text-sm text-slate-600 max-w-sm">
                {error === "permisos" ? t("margen_error_permisos") : t("margen_error")}
              </p>
              {error === "general" && (
                <button
                  onClick={() => setReintento((n) => n + 1)}
                  className="px-3 h-8 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  {t("margen_reintentar")}
                </button>
              )}
            </div>
          ) : !data || data.totales.revenue === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-400">
              {t("margen_sin_ventas")}
            </div>
          ) : (
            <>
              {/* Resumen del mes: mismo total que la fila de la grilla */}
              <div className={`grid gap-3 mb-5 ${conCosto ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">{t("revenue_total")}</p>
                  <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">{dinero(data.totales.revenue)}</p>
                </div>
                {conCosto && (
                  <>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-medium text-slate-500">{t("costo_total")}</p>
                      <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">{dinero(data.totales.costo)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-medium text-slate-500">{t("ganancia_total")}</p>
                      <p className={`text-xl font-semibold tabular-nums mt-1 ${(data.totales.ganancia ?? 0) < 0 ? "text-red-700" : "text-slate-900"}`}>
                        {dinero(data.totales.ganancia)}
                      </p>
                    </div>
                  </>
                )}
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">{t("margen_del_mes")}</p>
                  <p className={`text-xl font-semibold tabular-nums mt-1 ${NIVEL_TEXTO[nivelTotal]}`}>{pct(data.totales.margen)}</p>
                  {meta > 0 && data.totales.margen != null && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t("margen_vs_meta", { pct: Math.round((data.totales.margen / meta) * 100) })}
                    </p>
                  )}
                </div>
                {!conCosto && (
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-medium text-slate-500">{t("total_productos")}</p>
                    <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">{data.totales.productos}</p>
                  </div>
                )}
              </div>

              {/* POR VENDEDOR */}
              {tab === "vendedor" && (
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className={`${th} text-left`}>{t("vendedor")}</th>
                        <th className={`${th} text-right`}>{t("revenue")}</th>
                        {conCosto && <th className={`${th} text-right`}>{t("costo")}</th>}
                        {conCosto && <th className={`${th} text-right`}>{t("ganancia")}</th>}
                        <th className={`${th} text-center`}>{t("margen_pct")}</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.sellers.map((seller) => (
                        <tr
                          key={seller.nombre ?? "otros"}
                          className="hover:bg-violet-50/40 transition-colors cursor-pointer"
                          onClick={() => abrirSemanal(seller)}
                        >
                          <td className={`px-3 py-2.5 font-medium ${seller.esOtros ? "text-slate-500 italic" : "text-slate-800"}`}>
                            {nombreVendedor(seller)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{dinero(seller.revenue)}</td>
                          {conCosto && <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{dinero(seller.costo)}</td>}
                          {conCosto && (
                            <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${(seller.ganancia ?? 0) < 0 ? "text-red-700" : "text-slate-800"}`}>
                              {dinero(seller.ganancia)}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-center"><MargenChip margen={seller.margen} /></td>
                          <td className="pr-3 text-slate-300"><ChevronRight size={16} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* POR PRODUCTO */}
              {tab === "producto" && (
                <div className="space-y-3">
                  <div className="relative max-w-sm">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={filtroProducto}
                      onChange={(e) => setFiltroProducto(e.target.value)}
                      placeholder={t("margen_buscar_producto")}
                      className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className={`${th} text-left`}>{t("producto")}</th>
                          <th className={`${th} text-right`}>{t("cant_vendida")}</th>
                          <th className={`${th} text-right`}>{t("revenue")}</th>
                          {conCosto && <th className={`${th} text-right`}>{t("costo")}</th>}
                          {conCosto && <th className={`${th} text-right`}>{t("ganancia")}</th>}
                          <th className={`${th} text-center`}>{t("margen_pct")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productosFiltrados.map((product) => (
                          <tr key={product.productId} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[320px] truncate" title={product.nombre}>
                              {product.nombre}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{product.cantidadVendida.toLocaleString(locale)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{dinero(product.revenue)}</td>
                            {conCosto && <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{dinero(product.costo)}</td>}
                            {conCosto && (
                              <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${(product.ganancia ?? 0) < 0 ? "text-red-700" : "text-slate-800"}`}>
                                {dinero(product.ganancia)}
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-center"><MargenChip margen={product.margen} /></td>
                          </tr>
                        ))}
                        {productosFiltrados.length === 0 && (
                          <tr>
                            <td colSpan={conCosto ? 6 : 4} className="px-3 py-8 text-center text-slate-400">{t("no_available_data")}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DETALLE SEMANAL */}
              {tab === "semanal" && (
                !selectedSeller ? (
                  <div>
                    <p className="text-sm text-slate-500 mb-3">{t("selecciona_vendedor_margen")}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {data.sellers.map((seller) => (
                        <button
                          key={seller.nombre ?? "otros"}
                          onClick={() => setSelectedSeller(seller)}
                          className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className={`font-medium truncate ${seller.esOtros ? "text-slate-500 italic" : "text-slate-800"}`}>
                            {nombreVendedor(seller)}
                          </span>
                          <MargenChip margen={seller.margen} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <button
                        onClick={() => setSelectedSeller(null)}
                        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
                      >
                        <ArrowLeft size={15} /> {t("back")}
                      </button>
                      <h3 className="font-semibold text-slate-800">{nombreVendedor(selectedSeller)}</h3>
                      <MargenChip margen={selectedSeller.margen} />
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className={`${th} text-left`}>{t("semana")}</th>
                            <th className={`${th} text-right`}>{t("revenue")}</th>
                            {conCosto && <th className={`${th} text-right`}>{t("costo")}</th>}
                            {conCosto && <th className={`${th} text-right`}>{t("ganancia")}</th>}
                            <th className={`${th} text-center`}>{t("margen_pct")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedSeller.semanas.map((sem) => (
                            <tr key={sem.numero} className={sem.futura ? "text-slate-400" : ""}>
                              <td className="px-3 py-2.5">
                                <span className="font-medium">{t("semana_numero", { num: sem.numero })}</span>
                                <span className="ml-2 text-xs text-slate-400">{fechaCorta(sem.inicio)} – {fechaCorta(sem.fin)}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{sem.futura ? "–" : dinero(sem.revenue)}</td>
                              {conCosto && <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{sem.futura ? "–" : dinero(sem.costo)}</td>}
                              {conCosto && (
                                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${(sem.ganancia ?? 0) < 0 ? "text-red-700" : ""}`}>
                                  {sem.futura ? "–" : dinero(sem.ganancia)}
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-center">
                                {sem.futura || sem.margen == null ? <span className="text-slate-400">–</span> : <MargenChip margen={sem.margen} />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}

              <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{t("margen_nota_costo")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
