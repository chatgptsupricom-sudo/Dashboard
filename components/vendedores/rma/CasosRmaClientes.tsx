"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fechaCorta } from "@/lib/fecha";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Inbox,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { COLOR_ESTADO, diasDelCaso, fechaDia, filtroDelCaso, pasoDelCaso, type Filtro } from "./etapas";

type Caso = {
  id: number;
  case_number: string;
  client_name: string;
  invoice_number: string | null;
  product_code: string | null;
  hardware: string | null;
  brand: string | null;
  model: string | null;
  serial_quantity: string | null;
  serial: string | null;
  status: string;
  origen: string | null;
  company_id: number | null;
  despachado_at: string | null;
  created_at: string;
  ultimo_movimiento: string | null;
  productos_count: number;
};

const TARJETAS: { id: Filtro; icono: typeof Inbox; color: string; activo: string }[] = [
  { id: "todos", icono: Inbox, color: "bg-slate-100 text-slate-600", activo: "ring-slate-400 border-slate-300" },
  { id: "en_proceso", icono: Wrench, color: "bg-blue-100 text-blue-600", activo: "ring-blue-400 border-blue-300" },
  { id: "por_entregar", icono: PackageCheck, color: "bg-amber-100 text-amber-600", activo: "ring-amber-400 border-amber-300" },
  { id: "entregados", icono: CheckCircle2, color: "bg-emerald-100 text-emerald-600", activo: "ring-emerald-400 border-emerald-300" },
];

/** "RMA de mis clientes": los casos de servicio técnico de los clientes del vendedor. */
export function CasosRmaClientes() {
  const t = useTranslations("rmaVendedor");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [casos, setCasos] = useState<Caso[]>([]);
  const [loading, setLoading] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async (inicial = false) => {
    if (inicial) setLoading(true);
    else setRecargando(true);
    setError(null);
    try {
      const res = await fetch("/api/vendedores/rma", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setCasos(data.cases || []);
    } catch {
      setError(t("error_cargar"));
    } finally {
      setLoading(false);
      setRecargando(false);
    }
  }, [t]);

  useEffect(() => {
    cargar(true);
  }, [cargar]);

  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todos: casos.length, en_proceso: 0, por_entregar: 0, entregados: 0 };
    for (const x of casos) c[filtroDelCaso(x)]++;
    return c;
  }, [casos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return casos.filter((c) => {
      if (filtro !== "todos" && filtroDelCaso(c) !== filtro) return false;
      if (!q) return true;
      return [c.case_number, c.client_name, c.invoice_number, c.product_code, c.hardware, c.brand, c.model, c.serial, c.serial_quantity]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [casos, filtro, busqueda]);

  return (
    <div className="px-3 py-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-md shadow-blue-500/20">
            <Wrench className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{t("titulo")}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{t("descripcion")}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => cargar()}
          disabled={loading || recargando}
          className="shrink-0 rounded-lg"
          aria-label={t("recargar")}
        >
          <RefreshCw className={`w-4 h-4 ${recargando ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline ml-2">{t("recargar")}</span>
        </Button>
      </div>

      {/* Resumen: cada tarjeta filtra */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {TARJETAS.map(({ id, icono: Icono, color, activo }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltro(id)}
            aria-pressed={filtro === id}
            className={`text-left rounded-2xl border bg-white p-3 sm:p-4 shadow-sm transition-all hover:shadow-md ${
              filtro === id ? `ring-2 ${activo}` : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`p-1.5 sm:p-2 rounded-lg ${color}`}>
                <Icono className="w-4 h-4" />
              </span>
              {loading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{conteo[id]}</span>
              )}
            </div>
            <p className="mt-2 text-xs sm:text-sm font-medium text-slate-600 leading-tight">{t(`kpi_${id}`)}</p>
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("buscar")}
          className="pl-10 pr-9 h-11 rounded-xl bg-white shadow-sm"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            aria-label={t("limpiar")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-red-500 mx-auto" />
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => cargar(true)}>
            {t("reintentar")}
          </Button>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {casos.length === 0 ? t("vacio") : t("sin_resultados")}
          </p>
          {casos.length === 0 && <p className="mt-1 text-xs text-slate-400">{t("vacio_desc")}</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibles.map((c) => {
            const paso = pasoDelCaso(c);
            const producto = c.model || c.hardware || c.product_code || t("producto_sin_nombre");
            const extra = Number(c.productos_count) > 1 ? Number(c.productos_count) - 1 : 0;
            const dias = diasDelCaso(c);
            return (
              <li key={c.id}>
                <Link
                  href={`/${locale}/vendedores/casos-rma/${c.id}`}
                  className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-blue-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">RMA N.º {c.case_number}</span>
                        <Badge className={`${COLOR_ESTADO[c.status] || "bg-slate-100 text-slate-600"} border text-[11px]`}>
                          {t(`estado_${c.status}`)}
                        </Badge>
                        {c.despachado_at && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-[11px]">
                            {t("entregado_el", { fecha: fechaCorta(c.despachado_at) })}
                          </Badge>
                        )}
                        {c.company_id && NOMBRES_SUCURSAL[c.company_id] && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <MapPin className="w-3 h-3" />
                            {NOMBRES_SUCURSAL[c.company_id]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-700 truncate">{c.client_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {producto}
                        {extra > 0 && ` ${t("mas_productos", { count: extra })}`}
                        {c.invoice_number && ` · ${t("factura")} ${c.invoice_number}`}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500" />
                  </div>

                  {/* Avance: ticket → recepción → revisión → resuelto → entregado */}
                  <div className="mt-3 flex items-center gap-1" aria-label={t(`paso_${Math.min(paso, 4)}`)}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < paso || paso === 4 ? "bg-blue-500" : i === paso ? "bg-blue-300 animate-pulse" : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">{t(`paso_${paso}`)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("abierto_el", { fecha: fechaDia(c.created_at, locale) })} · {t("dias", { count: dias })}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
