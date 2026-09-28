"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Productos de un envío de servicio técnico en un acta de Seguridad (issue
 * #331): en el ingreso, qué llegó y con qué serial; en el despacho, qué salió.
 * No se muestra nada si el acta no los registró (actas de antes, o de un solo
 * producto).
 */
export type FilaProducto = {
  producto: string;
  serial: string | null;
  recibido?: boolean;
  observacion?: string | null;
  despachado_at?: string | null;
};

export default function ProductosEnvioLista({
  productos,
  titulo,
  conRecibido,
}: {
  productos: FilaProducto[];
  titulo: string;
  conRecibido: boolean;
}) {
  const t = useTranslations("seguridad.productos_envio");
  if (!productos.length) return null;
  return (
    <section className="bg-white border border-slate-200 rounded-[10px] p-5">
      <h2 className="text-sm font-bold text-slate-900 mb-3">{titulo}</h2>
      <ul className="divide-y divide-slate-100">
        {productos.map((p, i) => (
          <li key={i} className="py-2.5 flex items-start gap-3">
            {conRecibido &&
              (p.recibido ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" aria-label={t("llego")} />
              ) : (
                <XCircle className="w-4 h-4 mt-0.5 text-red-600 shrink-0" aria-label={t("no_llego")} />
              ))}
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-800 break-words">
                {i + 1}. {p.producto}
              </p>
              {p.serial && <p className="font-mono text-xs text-slate-500 break-all">{p.serial}</p>}
              {conRecibido && !p.recibido && (
                <p className="text-xs font-semibold text-red-600">{t("no_llego_etiqueta")}</p>
              )}
              {p.observacion && <p className="text-xs text-slate-600 mt-0.5">{p.observacion}</p>}
              {conRecibido && p.despachado_at && (
                <p className="text-xs font-semibold text-emerald-700">
                  {t("ya_salio", { fecha: String(p.despachado_at).slice(0, 10) })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
