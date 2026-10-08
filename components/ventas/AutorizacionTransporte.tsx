"use client";

import { Camera, FileCheck2, ImageUp, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";

/**
 * Foto de la autorización del cliente para el transporte externo
 * (lib/ventas/autorizacionTransporte.ts): el campo para adjuntarla y el
 * visor que ven el vendedor, Almacén y Seguridad.
 */

export const urlAutorizacion = (id: number) => `/api/ventas/metodo-retiro/autorizacion/${id}`;

/** Sube la foto y devuelve su id, para mandarlo en el PUT del método. */
export async function subirAutorizacion(file: File, mensajeError: string): Promise<number> {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch("/api/ventas/metodo-retiro/autorizacion", { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success || !j.id) throw new Error(j.error || mensajeError);
  return Number(j.id);
}

/** Campo obligatorio del transporte externo: elegir / tomar la foto y verla antes de guardar. */
export function AdjuntarAutorizacion({
  archivo,
  autorizacionId,
  onArchivo,
}: {
  /** Foto nueva elegida, todavía sin subir. */
  archivo: File | null;
  /** La que ya tiene el pedido (si no se elige otra, se conserva). */
  autorizacionId: number | null;
  onArchivo: (f: File | null) => void;
}) {
  const t = useTranslations("metodoRetiro");
  const input = useRef<HTMLInputElement>(null);
  const previa = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa);
  }, [previa]);
  const imagen = previa || (autorizacionId ? urlAutorizacion(autorizacionId) : null);

  return (
    <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <Camera className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">{t("autorizacion_titulo")}</p>
          <p className="text-xs text-amber-900/80">{t("autorizacion_ayuda")}</p>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          onArchivo(e.target.files?.[0] || null);
          e.target.value = "";
        }}
      />

      {imagen ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-white p-2">
          <a href={imagen} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={imagen} alt={t("autorizacion_titulo")} className="h-16 w-16 rounded-md object-cover border border-slate-200" />
          </a>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <FileCheck2 className="w-3.5 h-3.5" />
              {archivo ? t("autorizacion_lista") : t("autorizacion_guardada")}
            </p>
            {archivo && <p className="truncate text-[11px] text-slate-500">{archivo.name}</p>}
            <p className="text-[11px] text-slate-500">{t("autorizacion_revisa")}</p>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("autorizacion_cambiar")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-amber-300 bg-white px-3 py-4 text-center hover:border-amber-400 hover:bg-amber-50"
        >
          <ImageUp className="w-6 h-6 text-amber-600" />
          <span className="text-sm font-medium text-amber-900">{t("autorizacion_adjuntar")}</span>
          <span className="text-[11px] text-slate-500">{t("autorizacion_formatos")}</span>
        </button>
      )}
    </div>
  );
}

/** Visor de solo lectura: miniatura que abre la foto completa. */
export function VerAutorizacion({ id, className = "" }: { id: number; className?: string }) {
  const t = useTranslations("metodoRetiro");
  const url = urlAutorizacion(id);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-1.5 pr-3 hover:bg-amber-100 ${className}`}
    >
      <img src={url} alt={t("autorizacion_titulo")} className="h-10 w-10 rounded object-cover border border-amber-200 bg-white" />
      <span className="text-xs font-medium text-amber-900">{t("autorizacion_ver")}</span>
    </a>
  );
}
