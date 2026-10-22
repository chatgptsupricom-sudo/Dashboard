"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Inbox, Loader2, Phone, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getSocket } from "@/lib/socket-client";
import { fechaCorta } from "@/lib/fecha";
import { PlazoBadge } from "@/components/rma/PlazoBadge";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import { PLAZOS } from "@/lib/rma/plazos";
import type { CasoConPlazo } from "@/lib/rma/plazosCasos";

/**
 * Por llegar: casos con ticket abierto cuyo equipo todavía no llegó (estado
 * "por_llegar", lib/rma/plazos.ts). Salen de aquí cuando Seguridad registra el
 * ingreso (en una sede sin Seguridad, cuando RMA registra la recepción en el
 * caso, lib/rma/sedesSeguridad.ts): el equipo pasa a diagnóstico y empieza su
 * plazo de 48 horas.
 *
 * Los más viejos primero: son los que hay que perseguir con el cliente.
 */
export default function RmaPorLlegarPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [casos, setCasos] = useState<CasoConPlazo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/rma/plazos?etapa=por_llegar");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error();
      setCasos(json.casos || []);
      setError(false);
    } catch {
      // Se deja lo que ya está en pantalla.
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => clearInterval(id);
  }, [cargar]);

  // Ticket nuevo del portal: aparece sin recargar (lo emite el servidor desde el issue #24).
  useEffect(() => {
    let socket: any;
    try {
      socket = getSocket();
      socket.on("rma_ticket_nuevo", cargar);
    } catch {
      // Sin socket, el refresco periódico cubre igual.
    }
    return () => {
      try {
        socket?.off("rma_ticket_nuevo", cargar);
      } catch {}
    };
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return casos;
    return casos.filter((c) =>
      [c.case_number, c.client_name, c.producto, c.serial, c.invoice_number, c.brand]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [casos, busqueda]);

  const atrasados = casos.filter((c) => c.plazo.nivel !== "ok").length;

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-100 rounded-xl">
            <Inbox className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("por_llegar_titulo")}</h1>
            <p className="text-sm text-slate-500">
              {t("por_llegar_subtitulo", { aviso: PLAZOS.porLlegar.aviso })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("search_placeholder")}
              className="pl-9 bg-white"
            />
          </div>
          <button
            type="button"
            onClick={() => cargar()}
            aria-label={t("por_llegar_refrescar")}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!cargando && casos.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-violet-100 text-violet-700 px-3 py-1 font-medium">
            {t("por_llegar_total", { n: casos.length })}
          </span>
          {atrasados > 0 && (
            <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 font-medium">
              {t("por_llegar_atrasados", { n: atrasados, dias: PLAZOS.porLlegar.aviso })}
            </span>
          )}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : error && !casos.length ? (
        <div className="rounded-3xl bg-white py-16 text-center text-sm text-red-600 shadow-sm">{t("por_llegar_error")}</div>
      ) : visibles.length === 0 ? (
        <div className="rounded-3xl bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
          {busqueda ? t("no_cases") : t("por_llegar_vacio")}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-violet-300 transition-colors"
            >
              <Link href={`/${locale}/rma/casos/${c.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-violet-700">#{c.case_number}</span>
                  <span className="text-[11px] text-slate-400">
                    {t("por_llegar_ticket_del", { fecha: fechaCorta(c.created_at) })}
                  </span>
                  {c.company_id && NOMBRES_SUCURSAL[c.company_id] && (
                    <span className="text-[11px] text-slate-400">· {NOMBRES_SUCURSAL[c.company_id]}</span>
                  )}
                  {c.externo && (
                    <span className="text-[10px] font-semibold uppercase text-amber-700">{t("badge_externo")}</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">{c.client_name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {c.producto}
                  {c.brand ? ` · ${c.brand}` : ""}
                  {c.serial ? ` · ${c.serial}` : ""}
                  {c.invoice_number ? ` · ${t("invoice_number")} ${c.invoice_number}` : ""}
                </p>
              </Link>
              {c.client_phone && (
                <a
                  href={`tel:${c.client_phone}`}
                  className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-700 shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {c.client_phone}
                </a>
              )}
              <PlazoBadge plazo={c.plazo} />
              <Link href={`/${locale}/rma/casos/${c.id}`} aria-label={t("detail")}>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
