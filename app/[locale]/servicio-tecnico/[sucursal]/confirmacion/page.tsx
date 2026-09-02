"use client";

import {
  RESUMEN_KEY,
  type ResumenReporte,
} from "@/lib/servicio-tecnico/resumen";
import { Check, Copy } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function ConfirmacionPage() {
  const t = useTranslations("servicioTecnico");
  const params = useSearchParams();
  const caseNumber = params.get("ticket") || "";
  const trackingToken = params.get("token") || "";

  // El resumen NO viaja por la URL. El teléfono del cliente y el serial del
  // equipo son datos suyos, y esta app carga @vercel/analytics en producción:
  // todo lo que esté en el query string termina en analítica y en el historial
  // del navegador. El formulario lo deja en sessionStorage y se lee acá.
  // Se aceptan igual los parámetros por si alguien llega con un enlace viejo.
  const [resumen, setResumen] = useState<ResumenReporte>({});

  useEffect(() => {
    try {
      const crudo = sessionStorage.getItem(RESUMEN_KEY);
      if (crudo) setResumen(JSON.parse(crudo) as ResumenReporte);
    } catch {
      // sessionStorage puede no estar disponible (modo privado, permisos).
    }
  }, []);

  const invoice = resumen.factura || params.get("factura") || "";
  const product = resumen.producto || params.get("producto") || "";
  const serial = resumen.serial || params.get("serial") || "";
  const phone = resumen.telefono || params.get("telefono") || "";

  const [copiedTicket, setCopiedTicket] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Se arma después de montar: construirlo con `typeof window !== "undefined"`
  // hacía que el servidor renderizara "" y el cliente la URL, y el botón salía
  // deshabilitado en el primer pintado con un error de hidratación.
  const [consultationUrl, setConsultationUrl] = useState("");

  useEffect(() => {
    if (!trackingToken) return;
    // pathname: /{locale}/servicio-tecnico/{sucursal}/confirmacion
    const [, locale, , sucursal] = window.location.pathname.split("/");
    setConsultationUrl(
      `${window.location.origin}/${locale}/servicio-tecnico/${sucursal}/consultar?token=${trackingToken}`,
    );
  }, [trackingToken]);

  async function copy(value: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(value);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // Clipboard puede fallar (permisos, http). Silenciar.
    }
  }

  return (
    <div className="pt-page min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <p className="pt-eyebrow">{t("eyebrow")}</p>
        <h1 className="pt-h1">{t("confirmacion_titulo")}</h1>
        <p className="pt-sub">{t("confirmacion_subtitulo")}</p>

        {/* El comprobante impreso: la tira perforada y la línea de corte del
            .pt-ticket de la landing, ahora con el número de caso ya emitido. */}
        <div className="pt-stub mt-8">
          <div className="pt-stub__strip" aria-hidden />
          <div className="pt-stub__body">
            <p className="pt-panel__eyebrow">{t("ticket_numero")}</p>
            <p className="mt-2">
              <code className="pt-code">{caseNumber || "—"}</code>
            </p>
            <button
              onClick={() => copy(caseNumber, setCopiedTicket)}
              disabled={!caseNumber}
              className="pt-ghost mt-4"
            >
              {copiedTicket ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  {t("copiado")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden />
                  {t("copiar")}
                </>
              )}
            </button>
          </div>
          <div className="pt-stub__tear" aria-hidden />
          <div className="pt-stub__foot">
            <p className="pt-panel__eyebrow">{t("enlace_consulta")}</p>
            <div className="pt-copyrow mt-2">
              <input
                readOnly
                value={consultationUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => copy(consultationUrl, setCopiedLink)}
                disabled={!consultationUrl}
                className="pt-ghost whitespace-nowrap"
              >
                {copiedLink ? t("copiado") : t("copiar_enlace")}
              </button>
            </div>
          </div>
        </div>

        {/* Resumen del reporte. Sólo si hay algo que mostrar: sin
            sessionStorage (modo privado, enlace viejo) quedaría una tarjeta
            vacía. */}
        {(product || serial || invoice || phone) && (
        <div className="pt-panel mt-4">
          <p className="pt-panel__eyebrow">{t("resumen")}</p>
          <dl className="mt-3">
            {product && (
              <div className="pt-summary__row">
                <dt>{t("producto")}</dt>
                <dd className="break-words">{product}</dd>
              </div>
            )}
            {serial && (
              <div className="pt-summary__row">
                <dt>{t("serial")}</dt>
                <dd className="font-mono break-words">{serial}</dd>
              </div>
            )}
            {invoice && (
              <div className="pt-summary__row">
                <dt>{t("factura")}</dt>
                <dd className="font-mono">{invoice}</dd>
              </div>
            )}
            {phone && (
              <div className="pt-summary__row">
                <dt>{t("telefono")}</dt>
                <dd className="font-mono">{phone}</dd>
              </div>
            )}
          </dl>
        </div>
        )}

        {/* Que sigue */}
        <div className="pt-callout mt-4">
          <p className="pt-callout__eyebrow">{t("que_sigue")}</p>
          <p className="mt-2 text-sm text-[color:var(--portal-ink)]">
            {t("tiempo_respuesta")}
          </p>
          <p className="mt-4 text-xs text-[color:var(--portal-muted)]">
            {t("contacto_whatsapp")}
          </p>
          <a
            href="mailto:soporte.tecnico@supricom.com.ve"
            className="pt-ghost mt-2"
          >
            soporte.tecnico@supricom.com.ve
          </a>
        </div>

        <p className="text-center text-xs text-[color:var(--portal-muted)] mt-6">
          {t("imprimible")}
        </p>
      </div>
    </div>
  );
}