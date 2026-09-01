"use client";

import {
  RESUMEN_KEY,
  type ResumenReporte,
} from "@/lib/servicio-tecnico/resumen";
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10 sm:py-16">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 mb-4">
            <svg
              className="w-8 h-8 text-violet-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
            {t("confirmacion_titulo")}
          </h1>
          <p className="text-base text-slate-600">{t("confirmacion_subtitulo")}</p>
        </div>

        {/* Numero de ticket */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            {t("ticket_numero")}
          </p>
          <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl p-4">
            <code className="text-2xl sm:text-3xl font-black text-violet-600 tracking-wider">
              {caseNumber || "—"}
            </code>
            <button
              onClick={() => copy(caseNumber, setCopiedTicket)}
              disabled={!caseNumber}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {copiedTicket ? t("copiado") : t("copiar")}
            </button>
          </div>
        </div>

        {/* Enlace de consulta */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            {t("enlace_consulta")}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={consultationUrl}
              className="flex-1 px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono truncate"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={() => copy(consultationUrl, setCopiedLink)}
              disabled={!consultationUrl}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {copiedLink ? t("copiado") : t("copiar_enlace")}
            </button>
          </div>
        </div>

        {/* Resumen del reporte */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            {t("resumen")}
          </p>
          <dl className="space-y-3">
            {product && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                <dt className="text-sm font-semibold text-slate-500">
                  {t("producto")}
                </dt>
                <dd className="text-sm text-slate-900 sm:text-right break-words">
                  {product}
                </dd>
              </div>
            )}
            {serial && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                <dt className="text-sm font-semibold text-slate-500">
                  {t("serial")}
                </dt>
                <dd className="text-sm text-slate-900 sm:text-right font-mono break-words">
                  {serial}
                </dd>
              </div>
            )}
            {invoice && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                <dt className="text-sm font-semibold text-slate-500">
                  {t("factura")}
                </dt>
                <dd className="text-sm text-slate-900 sm:text-right font-mono">
                  {invoice}
                </dd>
              </div>
            )}
            {phone && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                <dt className="text-sm font-semibold text-slate-500">
                  {t("telefono")}
                </dt>
                <dd className="text-sm text-slate-900 sm:text-right font-mono">
                  {phone}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Que sigue */}
        <div className="bg-violet-50 rounded-2xl border border-violet-100 p-6 sm:p-8">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-3">
            {t("que_sigue")}
          </p>
          <p className="text-sm text-slate-700 mb-4">
            {t("tiempo_respuesta")}
          </p>
          <div className="border-t border-violet-200 pt-4">
            <p className="text-xs text-slate-500 mb-2">
              {t("contacto_whatsapp")}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="mailto:soporte.tecnico@supricom.com.ve"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <span>soporte.tecnico@supricom.com.ve</span>
              </a>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          {t("imprimible")}
        </p>
      </div>
    </div>
  );
}