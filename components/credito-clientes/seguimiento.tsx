"use client";

import type { EtapaCliente, SeguimientoCliente } from "@/lib/notas-credito/tipos";
import { Check, CheckCircle2, Circle, CircleDot, Copy, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const ORDEN: EtapaCliente[] = ["en_revision", "aprobada", "emitida"];

/**
 * Lo que ve el cliente con su enlace de la nota de crédito
 * (GET /api/credito-clientes/[token]): en qué etapa va, sus
 * productos y, al final, el número de la NC o por qué no procede.
 */
export function SeguimientoNC({ locale, base, token }: { locale: string; base: string; token: string }) {
  const t = useTranslations("creditoClientes");
  const [s, setS] = useState<SeguimientoCliente | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enlace, setEnlace] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setEnlace(window.location.href);
    fetch(`/api/credito-clientes/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.status === 404) throw new Error(t("seguimiento.noEncontrada"));
        if (!r.ok) throw new Error(t("seguimiento.error"));
        setS(j.solicitud);
      })
      .catch((e) => setError(e?.message || t("seguimiento.error")))
      .finally(() => setCargando(false));
  }, [token, t]);

  const fecha = (v: string | null | undefined) =>
    v
      ? new Date(v).toLocaleDateString(locale === "en" ? "en-US" : "es-VE", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "America/Caracas",
        })
      : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles el enlace sigue a la vista para copiarlo a mano.
    }
  };


  return (
    <div className="pt-page min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <p className="pt-eyebrow">{t("eyebrow")}</p>
        <h1 className="pt-h1">{t("seguimiento.titulo")}</h1>

        {cargando ? (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[color:var(--portal-muted)]" aria-hidden />
          </div>
        ) : error || !s ? (
          <div className="pt-panel mt-8">
            <p className="text-sm">{error || t("seguimiento.noEncontrada")}</p>
          </div>
        ) : (
          <>
            <p className="pt-sub">{t("seguimiento.guardaEnlace")}</p>

            <div className="pt-stub mt-8">
              <div className="pt-stub__strip" aria-hidden />
              <div className="pt-stub__body">
                <p className="pt-panel__eyebrow">{t("seguimiento.numero")}</p>
                <p className="mt-2">
                  <code className="pt-code">{s.numero}</code>
                </p>
                <p className="mt-4 text-lg font-semibold">{t(`seguimiento.etapas.${s.etapa}`)}</p>
                <p className="mt-1 text-sm text-[color:var(--portal-ink)]">
                  {s.etapa === "emitida"
                    ? s.nota_odoo
                      ? t("seguimiento.desc.emitida", { nc: s.nota_odoo })
                      : t("seguimiento.desc.emitidaSinNumero")
                    : t(`seguimiento.desc.${s.etapa}`)}
                </p>
                {s.etapa === "rechazada" && s.motivo_rechazo && (
                  <p className="mt-3 whitespace-pre-wrap text-sm">
                    <b>{t("seguimiento.motivoRechazo")}:</b> {s.motivo_rechazo}
                  </p>
                )}
                {s.actualizado && (
                  <p className="mt-3 text-xs text-[color:var(--portal-muted)]">
                    {t("seguimiento.actualizado", { fecha: fecha(s.actualizado) })}
                  </p>
                )}
              </div>
              <div className="pt-stub__tear" aria-hidden />
              <div className="pt-stub__foot">
                <div className="pt-copyrow">
                  <input readOnly value={enlace} onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button onClick={copiar} disabled={!enlace} className="pt-ghost whitespace-nowrap">
                    {copiado ? (
                      <>
                        <Check className="h-4 w-4" aria-hidden />
                        {t("seguimiento.copiado")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden />
                        {t("seguimiento.copiar")}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Etapas: recibida → en revisión → aprobada → emitida (o no procede). */}
            <ol className="pt-panel mt-4 space-y-3">
              <Etapa hecha texto={t("seguimiento.recibida")} detalle={fecha(s.fecha)} />
              {s.etapa === "rechazada" ? (
                <Etapa no texto={t("seguimiento.etapas.rechazada")} />
              ) : (
                ORDEN.map((e) => (
                  <Etapa
                    key={e}
                    hecha={ORDEN.indexOf(e) < ORDEN.indexOf(s.etapa) || (e === "emitida" && s.etapa === "emitida")}
                    actual={e === s.etapa && e !== "emitida"}
                    texto={t(`seguimiento.etapas.${e}`)}
                  />
                ))
              )}
            </ol>

            <div className="pt-panel mt-4">
              <dl>
                <div className="pt-summary__row">
                  <dt>{t("seguimiento.factura")}</dt>
                  <dd className="font-mono">{s.factura}</dd>
                </div>
                <div className="pt-summary__row">
                  <dt>{t("seguimiento.fecha")}</dt>
                  <dd>{fecha(s.fecha)}</dd>
                </div>
                {s.motivo && (
                  <div className="pt-summary__row">
                    <dt>{t("seguimiento.motivo")}</dt>
                    <dd>{s.motivo}</dd>
                  </div>
                )}
                <div className="pt-summary__row">
                  <dt>{t("seguimiento.productos")}</dt>
                  <dd>
                    <ul className="space-y-1.5">
                      {s.productos.map((p, i) => (
                        <li key={i} className="break-words">
                          {p.producto}
                          <span className="block text-xs text-[color:var(--portal-muted)]">
                            {p.seriales.length ? (
                              <span className="font-mono">{p.seriales.join(", ")}</span>
                            ) : (
                              t("seguimiento.cantidad", { n: p.cantidad })
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <a href={base} className="pt-ghost">
            {t("seguimiento.nueva")}
          </a>
          <a href={base.slice(0, base.lastIndexOf("/"))} className="pt-ghost">
            {t("seguimiento.volver")}
          </a>
        </div>
      </div>
    </div>
  );
}

function Etapa({ texto, detalle, hecha, actual, no }: { texto: string; detalle?: string; hecha?: boolean; actual?: boolean; no?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {no ? (
        <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
      ) : hecha ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
      ) : actual ? (
        <CircleDot className="h-5 w-5 shrink-0 text-[color:var(--portal-primary)]" aria-hidden />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-[color:var(--portal-line-strong)]" aria-hidden />
      )}
      <span className={actual || no ? "font-semibold" : hecha ? "" : "text-[color:var(--portal-muted)]"}>{texto}</span>
      {detalle && <span className="text-xs text-[color:var(--portal-muted)]">{detalle}</span>}
    </li>
  );
}
