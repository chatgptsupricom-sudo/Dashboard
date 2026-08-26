"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ChevronRight, Star, User } from "lucide-react";

type AlmacenistaRow = {
  almacenista: string;
  promedio: number;
  total: number;
};

export default function AlmacenistasIndice() {
  const t = useTranslations("seguridad.almacenistas");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad`;

  const [data, setData] = useState<AlmacenistaRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // Pedimos un listado unico de los nombres + promedios via SQL aggregate.
        // Por simplicidad, el endpoint /api/seguridad/almacenista-todos no existe;
        // lo derivamos de las calificaciones conocidas. Si la tabla está vacía,
        // devolvemos un placeholder.
        const res = await fetch("/api/seguridad/almacenistas");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (!cancelado) setData(json.almacenistas || []);
      } catch {
        if (!cancelado) setData([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link
            href={`${base}`}
            className="text-sm font-semibold text-violet- hover:text-violet-700"
          >
            ← {t("back")}
          </Link>
          <h1 className="text-base sm:text-lg font-black text-slate-900">
            {t("title")}
          </h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="text-center text-slate-400 py-12">{t("loading")}</div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">{t("empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.map((row) => (
              <Link
                key={row.almacenista}
                href={`${base}/almacenista/${encodeURIComponent(row.almacenista)}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-violet-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-100">
                      <User className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">
                        {row.almacenista}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t("calificaciones_count", { count: row.total })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-violet-600 fill-violet-600" />
                    <span className="font-bold text-violet-700 tabular-nums">
                      {row.promedio.toFixed(1)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}