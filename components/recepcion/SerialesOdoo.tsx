"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, ScanBarcode, X } from "lucide-react";
import Pistola from "@/components/escaneo/Pistola";
import type { RenglonSinSeriales } from "@/lib/recepcion/serialesFaltantes";

/**
 * Seriales que faltan para cargar en Odoo una recepcion ya cerrada: los
 * productos que alla llevan serial y se contaron escribiendo la cantidad
 * (packing list sin codigos). Almacen los pistolea aca, uno por unidad
 * recibida, y despues carga con el boton de siempre. La cantidad no cambia.
 * Ver lib/recepcion/serialesFaltantes.ts.
 */

type SerialDeItem = { id: number; serial: string; escaneado_por: string | null };

export default function SerialesOdoo({
  recepcionId,
  clave,
  items,
  puedePistolear,
  onCambio,
}: {
  recepcionId: number;
  /** Cambia cuando cambia lo que decide que renglones esperan seriales (estado en Odoo, cruces). */
  clave: string;
  /** Los renglones de la recepcion, con sus seriales. */
  items: Array<{ id: number; seriales?: SerialDeItem[] }>;
  /** Almacen (o el SuperAdmin): Compras solo mira. */
  puedePistolear: boolean;
  /** Se agrego o quito un serial: la pantalla recarga la recepcion. */
  onCambio: () => void;
}) {
  const t = useTranslations("recepcion.seriales_odoo");
  const [renglones, setRenglones] = useState<RenglonSinSeriales[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [verSeriales, setVerSeriales] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<number | null>(null);

  const leer = useCallback(async () => {
    try {
      const res = await fetch(`/api/recepcion/${recepcionId}/seriales`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      setRenglones(j.renglones || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || t("error"));
      setRenglones([]);
    }
  }, [recepcionId, t]);

  useEffect(() => {
    void leer();
  }, [leer, clave]);

  const quitar = async (serialId: number) => {
    setError(null);
    setQuitando(serialId);
    try {
      const res = await fetch(`/api/recepcion/${recepcionId}/seriales/${serialId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      onCambio();
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setQuitando(null);
    }
  };

  if (renglones === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("buscando")}
      </p>
    );
  }
  if (renglones.length === 0) {
    return error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null;
  }

  // Los seriales salen de la recepcion (se recarga con cada lectura).
  const filas = renglones.map((r) => {
    const seriales = items.find((i) => i.id === r.item_id)?.seriales || [];
    return { ...r, seriales, faltan: r.cantidad - seriales.length };
  });
  const faltanTotal = filas.reduce((n, f) => n + Math.max(0, f.faltan), 0);
  const sobran = filas.some((f) => f.faltan < 0);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{t("titulo")}</p>
        <p className="text-xs text-slate-600">{t("ayuda")}</p>
      </div>

      {puedePistolear && faltanTotal > 0 && (
        <Pistola
          endpoint={`/api/recepcion/${recepcionId}/escaneo`}
          textos="recepcion.seriales_odoo"
          items={filas.map((f) => ({
            id: f.item_id,
            codigo: f.codigo,
            producto: f.producto,
            lleva_serial: true,
            esperado: f.cantidad,
            recibido: f.seriales.length,
          }))}
          seleccionado={seleccionado}
          permitirAprender={false}
          onResultado={(r) => {
            if (r.resultado === "seleccionado") setSeleccionado(r.item_id);
            else onCambio();
          }}
          onTerminar={() => setSeleccionado(null)}
        />
      )}

      <ul className="divide-y divide-violet-100">
        {filas.map((f) => (
          <li key={f.item_id} className="py-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 truncate">{f.producto}</p>
                <p className="text-[11px] text-slate-400">{f.codigo || "—"}</p>
              </div>
              {f.faltan > 0 ? (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                  {t("faltan", { faltan: f.faltan, cantidad: f.cantidad })}
                </span>
              ) : f.faltan < 0 ? (
                <span className="text-[11px] font-semibold text-red-700 bg-red-100 rounded px-1.5 py-0.5">
                  {t("sobran", { sobran: -f.faltan, cantidad: f.cantidad })}
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                  {t("completo", { cantidad: f.cantidad })}
                </span>
              )}
              {puedePistolear && f.faltan > 0 && (
                <button
                  type="button"
                  onClick={() => setSeleccionado(seleccionado === f.item_id ? null : f.item_id)}
                  className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold ${
                    seleccionado === f.item_id ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700 bg-white"
                  }`}
                >
                  <ScanBarcode className="w-3.5 h-3.5" />
                  {seleccionado === f.item_id ? t("pistoleando") : t("pistolear")}
                </button>
              )}
            </div>
            {f.seriales.length > 0 && (
              <button
                type="button"
                onClick={() => setVerSeriales((v) => ({ ...v, [f.item_id]: !v[f.item_id] }))}
                className="text-[11px] font-semibold text-violet-700 hover:underline"
              >
                {verSeriales[f.item_id] ? t("ocultar_seriales") : t("ver_seriales", { count: f.seriales.length })}
              </button>
            )}
            {verSeriales[f.item_id] && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 bg-white divide-y divide-slate-100">
                {f.seriales.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                    <span className="font-mono text-slate-700 flex-1 truncate">{x.serial}</span>
                    <span className="text-slate-400 truncate hidden sm:inline">{x.escaneado_por}</span>
                    {puedePistolear && (
                      <button
                        type="button"
                        onClick={() => void quitar(x.id)}
                        disabled={quitando !== null}
                        aria-label={t("quitar_serial", { serial: x.serial })}
                        className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-600 disabled:opacity-40"
                      >
                        {quitando === x.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {faltanTotal === 0 && !sobran ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t("listos")}
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {sobran ? t("quitar_sobrantes") : t("faltan_total", { faltan: faltanTotal })}
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
