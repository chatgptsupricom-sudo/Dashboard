"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

export type ArchivoRecepcion = {
  id: number;
  item_id: number | null;
  contenedor_id: number | null;
  tipo: string;
  nombre: string | null;
  mime: string;
  /** Cuando se subio: la primera foto de llegada marca el inicio del tiempo de recepcion. */
  created_at?: string | null;
};

/**
 * Tomar (o elegir) una foto y subirla a la recepcion.
 *
 * La foto se achica en el telefono antes de subirla: una foto de camara pesa
 * 3–8 MB, y en el almacen, con senal irregular, eso es esperar un minuto por
 * cada foto. A 1600 px de lado sigue leyendose el numero del precinto y pesa
 * unos cientos de KB. Si el navegador no puede procesarla (ej. HEIC fuera de
 * Safari), se sube la original.
 */

const LADO_MAX = 1600;

async function comprimir(archivo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return blob && blob.size < archivo.size ? blob : archivo;
  } catch {
    return archivo;
  }
}

export default function FotoCaptura({
  recepcionId,
  tipo,
  itemId,
  contenedorId,
  titulo,
  fotos,
  editable,
  obligatoria = false,
  onCambio,
}: {
  recepcionId: number;
  tipo: string;
  itemId?: number;
  /** Fotos de llegada/precinto/cierre: el contenedor al que pertenecen. */
  contenedorId?: number;
  titulo: string;
  /** Fotos ya subidas de este tipo (y renglon, si aplica). */
  fotos: ArchivoRecepcion[];
  /** false = solo mirar (otra etapa u otro rol). */
  editable: boolean;
  obligatoria?: boolean;
  /** Se llama despues de subir o quitar, para recargar. */
  onCambio: () => void;
}) {
  const t = useTranslations("recepcion");
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (archivo: File) => {
    setError(null);
    setSubiendo(true);
    try {
      const blob = await comprimir(archivo);
      const fd = new FormData();
      fd.append("tipo", tipo);
      if (itemId) fd.append("item_id", String(itemId));
      if (contenedorId) fd.append("contenedor_id", String(contenedorId));
      fd.append("archivo", blob, archivo.name.replace(/\.[^.]+$/, "") + ".jpg");
      const res = await fetch(`/api/recepcion/${recepcionId}/archivos`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("error"));
      onCambio();
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };

  const quitar = async (id: number) => {
    setError(null);
    const res = await fetch(`/api/recepcion/${recepcionId}/archivos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || t("error"));
      return;
    }
    onCambio();
  };

  const falta = obligatoria && fotos.length === 0;

  return (
    <div>
      <p className={`text-[12px] font-medium mb-1.5 ${falta && editable ? "text-red-600" : "text-slate-500"}`}>
        {titulo}
        {obligatoria && " *"}
      </p>
      <div className="flex flex-wrap gap-2">
        {fotos.map((f) => (
          <div key={f.id} className="relative">
            <a href={`/api/recepcion/${recepcionId}/archivos/${f.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/recepcion/${recepcionId}/archivos/${f.id}`}
                alt={titulo}
                className="w-20 h-20 rounded-xl object-cover border border-slate-200 bg-slate-50"
              />
            </a>
            {editable && (
              <button
                type="button"
                onClick={() => void quitar(f.id)}
                aria-label={t("quitar_foto")}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 flex items-center justify-center shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {editable && (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={subiendo}
              className={`w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                falta
                  ? "border-red-300 text-red-600 bg-red-50/50"
                  : "border-slate-300 text-slate-500 hover:border-violet-300 hover:text-[color:var(--portal-primary,#741DFE)]"
              }`}
            >
              {subiendo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              {subiendo ? t("subiendo") : fotos.length ? t("otra_foto") : t("tomar_foto")}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              // En el telefono abre directo la camara trasera.
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subir(f);
              }}
            />
          </>
        )}
        {!editable && fotos.length === 0 && <span className="text-sm text-slate-300">—</span>}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
