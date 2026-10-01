"use client";

import Link from "next/link";
import { promedioTexto } from "@/lib/seguridad/formato";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  LayoutDashboard,
  Loader2,
  Star as StarIcon,
  User as UserIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StarRatingDisplay } from "@/components/seguridad/StarRating";

type Comentario = {
  id: number;
  calificacion: number;
  comentario: string | null;
  relacionado_a: string;
  relacionado_id: number;
  calificado_por: string | null;
  created_at: string | null;
};

type Distribucion = Record<"1" | "2" | "3" | "4" | "5", number>;

type Payload = {
  success: boolean;
  almacenista: string;
  promedio: number;
  total: number;
  distribucion: Distribucion;
  ultimos_comentarios: Comentario[];
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

// Devolvía "0.0" cuando no había calificaciones, que es peor que romperse:
// mostraba al almacenista con la peor nota posible en vez de decir que aún no
// lo han calificado.
function formatPromedio(value: number | null | undefined) {
  return promedioTexto(value);
}

export default function AlmacenistaDetailPage() {
  const t = useTranslations("seguridad.almacenista");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const rawNombre = (params?.nombre as string) || "";

  const decodedNombre = useMemo(() => {
    try {
      return decodeURIComponent(rawNombre);
    } catch {
      return rawNombre;
    }
  }, [rawNombre]);

  const base = `/${locale}/seguridad`;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!decodedNombre) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancel = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const res = await fetch(
          `/api/seguridad/almacenista/${encodeURIComponent(decodedNombre)}/calificaciones`,
        );
        if (cancel) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          setError(json.error || t("error_not_found"));
          setLoading(false);
          return;
        }
        setData(json as Payload);
      } catch {
        if (!cancel) setError(t("error_not_found"));
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    run();
    return () => {
      cancel = true;
    };
  }, [decodedNombre, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 gap-2 font-sans">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{t("loading")}</span>
      </div>
    );
  }

  if (notFound || (!loading && !data && error)) {
    return (
      <div className="min-h-screen font-sans">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <Link
              href={`${base}/almacenista`}
              className="p-2 rounded-[10px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-xl bg-violet-100 shrink-0">
                <UserIcon className="w-5 h-5 text-violet-600" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {t("title")}
              </h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center text-slate-500 text-sm">
          {error || t("error_not_found")}
        </main>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const promedio = data.promedio || 0;
  const total = data.total || 0;
  const distribucion: Distribucion = data.distribucion || {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };

  const estrellaKeys: Array<{ key: "5" | "4" | "3" | "2" | "1"; value: number }> = [
    { key: "5", value: 5 },
    { key: "4", value: 4 },
    { key: "3", value: 3 },
    { key: "2", value: 2 },
    { key: "1", value: 1 },
  ];

  const displayName = data.almacenista || decodedNombre;
  const comentarios = data.ultimos_comentarios || [];

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={`${base}/almacenista`}
            className="p-2 rounded-[10px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-violet-100 shrink-0">
              <UserIcon className="w-5 h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {displayName}
              </h1>
              <p className="text-xs text-slate-500 truncate">{t("title")}</p>
            </div>
          </div>
          <Link
            href={base}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            {t("volver")}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <section className="bg-white border border-slate-200 rounded-[10px] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <StarIcon className="w-4 h-4 text-[color:var(--portal-primary,#741DFE)]" />
            <h2 className="text-sm font-bold text-slate-900">{t("promedio")}</h2>
          </div>
          <div className="flex flex-col items-center text-center py-3">
            <p
              className="text-5xl sm:text-6xl font-black tabular-nums leading-none"
              style={{ color: "var(--portal-primary,#741DFE)" }}
            >
              {formatPromedio(promedio)}
            </p>
            <div className="mt-3">
              <StarRatingDisplay value={promedio} size="lg" />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {t("total_calificaciones", { count: total })}
            </p>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-[10px] p-5 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            {t("distribucion")}
          </h2>
          {total === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              {t("sin_comentarios")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {estrellaKeys.map(({ key, value }) => {
                const count = distribucion[key] || 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <li
                    key={value}
                    className="flex items-center gap-3 text-xs sm:text-sm"
                  >
                    <span className="w-20 sm:w-24 shrink-0 text-slate-600 font-medium">
                      {t(`estrella_${value}` as "estrella_5")}
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-violet-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 sm:w-24 shrink-0 text-right text-slate-500 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-[10px] p-5 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            {t("ultimos_comentarios")}
          </h2>
          {comentarios.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              {t("sin_comentarios")}
            </p>
          ) : (
            <ul className="space-y-3">
              {comentarios.map((c) => {
                const relLabel =
                  c.relacionado_a === "despacho"
                    ? t("despacho_label")
                    : t("ingreso_label");
                return (
                  <li
                    key={c.id}
                    className="rounded-[10px] border border-slate-200 bg-slate-50/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StarRatingDisplay
                        value={Number(c.calificacion) || 0}
                        size="sm"
                      />
                      <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                        {fmtDate(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">
                      {c.comentario && c.comentario.trim().length > 0
                        ? c.comentario
                        : t("sin_comentario")}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {t("calificado_por")}{" "}
                      <span className="font-semibold text-slate-700">
                        {c.calificado_por || "—"}
                      </span>
                      {" "}
                      {t("en")} {relLabel} #{c.relacionado_id}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="sm:hidden pt-2">
          <Link
            href={base}
            className="inline-flex items-center justify-center gap-1.5 w-full h-10 px-4 rounded-[10px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            {t("volver")}
          </Link>
        </div>
      </main>
    </div>
  );
}
