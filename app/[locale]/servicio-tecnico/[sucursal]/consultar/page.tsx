"use client";

import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type TicketData = {
  case_number: string;
  status: string;
  product_name: string;
  product_code: string;
  invoice_number: string;
  serial: string | null;
  client_phone_masked: string | null;
  created_at: string;
  // Fecha de entrega del equipo (issue #32), o null si sigue en el taller.
  // Es independiente de `status`: un caso resuelto con nota de credito
  // tambien se entrega.
  despachado_at: string | null;
  timeline: Array<{
    from_status: string | null;
    to_status: string;
    created_at: string;
  }>;
};

/**
 * Formatea una fecha de calendario (YYYY-MM-DD) sin pasar por `new Date`.
 *
 * `new Date("2026-08-26")` se interpreta como medianoche UTC, que en Venezuela
 * (UTC-4) cae el dia 25: al cliente le apareceria que su equipo se entrego un
 * dia antes de lo que dice el acta. Los timestamps del resto de la pantalla si
 * pueden usar Date, porque llevan hora real.
 */
function fechaLegible(valor: string): string {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return valor;
  const [, año, mes, dia] = m;
  return `${dia}/${mes}/${año}`;
}

const STATUS_LABELS: Record<string, string> = {
  recibido: "status_recibido",
  reparado: "status_reparado",
  nota_credito: "status_nota_credito",
  no_procesado: "status_no_procesado",
  reingresado: "status_reingresado",
};

const STATUS_COLORS: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nota_credito: "bg-violet-100 text-violet-700 border-violet-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export default function ConsultarPage() {
  const t = useTranslations("servicioTecnico");

  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "es";
  const sucursal = (params?.sucursal as string) || "";
  const tokenFromUrl = searchParams.get("token") || "";

  const [numero, setNumero] = useState("");
  const [factura, setFactura] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketData | null>(null);

  // Si viene con ?token=..., cargamos directo via el endpoint por token
  useEffect(() => {
    if (!tokenFromUrl) return;
    let cancelado = false;
    (async () => {
      setBuscando(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/servicio-tecnico/ticket/${encodeURIComponent(tokenFromUrl)}`,
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.success && data.ticket) {
          setTicket(data.ticket);
        } else {
          setError(t("consultar_error_no_encontrado"));
        }
      } catch {
        if (!cancelado) setError(t("consultar_error_no_encontrado"));
      } finally {
        if (!cancelado) setBuscando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tokenFromUrl, t]);

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTicket(null);

    if (!numero.trim() || !factura.trim()) {
      setError(t("consultar_error_vacio"));
      return;
    }

    setBuscando(true);
    try {
      const params = new URLSearchParams({
        numero: numero.trim(),
        factura: factura.trim(),
      });
      const res = await fetch(`/api/servicio-tecnico/ticket?${params}`);
      const data = await res.json();

      if (data.success && data.ticket) {
        setTicket(data.ticket);
      } else {
        // Mensaje generico para "no existe" y "dato de verificacion no coincide"
        setError(t("consultar_error_no_encontrado"));
      }
    } catch {
      setError(t("consultar_error_no_encontrado"));
    } finally {
      setBuscando(false);
    }
  }

  // Traduce cualquier valor del ENUM. La línea de tiempo lo mostraba en crudo
  // ("recibido", "no_procesado"), que es jerga interna: el issue #23 pide
  // explícitamente no enseñarle al cliente los valores de la base.
  const etiquetaEstado = (estado: string) =>
    STATUS_LABELS[estado] ? t(STATUS_LABELS[estado]) : estado;

  // "Reparado" lleva pegado un "listo para retirar / entregar" que deja de ser
  // cierto en cuanto el equipo se entrega: quedaba diciendole al cliente que
  // pasara a buscar algo que ya tiene en la mano, justo encima del aviso de
  // entrega. Los demas estados son desenlaces neutros y conviven bien con el
  // aviso, asi que solo se cambia este.
  const statusLabel = !ticket
    ? ""
    : ticket.despachado_at && ticket.status === "reparado"
      ? t("status_reparado_entregado")
      : etiquetaEstado(ticket.status);


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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
            {t("consultar_titulo")}
          </h1>
          <p className="text-base text-slate-600">{t("consultar_subtitulo")}</p>
        </div>

        {/* Form de busqueda (solo si NO viene con token) */}
        {!tokenFromUrl && !ticket && (
          <form
            onSubmit={handleBuscar}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-4 space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t("consultar_label_numero")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder={t("consultar_placeholder_numero")}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t("consultar_label_factura")}
              </label>
              <input
                type="text"
                value={factura}
                onChange={(e) => setFactura(e.target.value)}
                placeholder={t("consultar_placeholder_factura")}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={buscando}
              className="w-full px-4 py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {buscando ? t("consultar_buscando") : t("consultar_boton")}
            </button>
          </form>
        )}

        {/* Estado del ticket */}
        {ticket && (
          <div className="space-y-4">
            {/* Estatus card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {t("consultar_status_titulo")}
              </p>
              <div className="flex items-center justify-between gap-3 mb-4">
                <code className="text-2xl sm:text-3xl font-black text-violet-600 tracking-wider">
                  {ticket.case_number}
                </code>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {t("consultar_status_label")}
              </p>
              <div
                className={`inline-flex items-center px-4 py-2 rounded-xl border text-sm font-semibold ${
                  STATUS_COLORS[ticket.status] || STATUS_COLORS.recibido
                }`}
              >
                {statusLabel}
              </div>

              {/* Entrega del equipo (issue #32).
                  Se muestra ADEMAS del estado, no en su lugar: el cliente
                  necesita las dos cosas —como se resolvio su caso y si ya
                  puede dejar de esperar el equipo. */}
              {ticket.despachado_at && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <svg
                    className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <p className="text-sm font-semibold text-emerald-800">
                    {t("consultar_entregado", {
                      fecha: fechaLegible(ticket.despachado_at),
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Datos del reporte */}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                {t("consultar_datos_reporte")}
              </p>
              <dl className="space-y-3">
                {ticket.product_name && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                    <dt className="text-sm font-semibold text-slate-500">
                      {t("consultar_producto")}
                    </dt>
                    <dd className="text-sm text-slate-900 sm:text-right break-words">
                      {ticket.product_name}
                    </dd>
                  </div>
                )}
                {ticket.invoice_number && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                    <dt className="text-sm font-semibold text-slate-500">
                      {t("consultar_factura")}
                    </dt>
                    <dd className="text-sm text-slate-900 sm:text-right font-mono">
                      {ticket.invoice_number}
                    </dd>
                  </div>
                )}
                {ticket.serial && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                    <dt className="text-sm font-semibold text-slate-500">
                      Serial
                    </dt>
                    <dd className="text-sm text-slate-900 sm:text-right font-mono">
                      {ticket.serial}
                    </dd>
                  </div>
                )}
                {ticket.client_phone_masked && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                    <dt className="text-sm font-semibold text-slate-500">
                      Teléfono
                    </dt>
                    <dd className="text-sm text-slate-900 sm:text-right font-mono">
                      {ticket.client_phone_masked}
                    </dd>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                  <dt className="text-sm font-semibold text-slate-500">
                    {t("consultar_fecha_creacion")}
                  </dt>
                  <dd className="text-sm text-slate-900 sm:text-right">
                    {new Date(ticket.created_at).toLocaleString("es-VE")}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                {t("consultar_timeline_titulo")}
              </p>
              {ticket.timeline.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  {t("consultar_sin_historial")}
                </p>
              ) : (
                <div className="space-y-4">
                  {ticket.timeline.map((h, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            idx === ticket.timeline.length - 1
                              ? "bg-violet-500"
                              : "bg-slate-300"
                          }`}
                        />
                        {idx < ticket.timeline.length - 1 && (
                          <div className="w-0.5 flex-1 bg-slate-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-4 flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {h.from_status
                            ? `${etiquetaEstado(h.from_status)} → ${etiquetaEstado(h.to_status)}`
                            : etiquetaEstado(h.to_status)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(h.created_at).toLocaleString("es-VE")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contacto */}
            <div className="bg-violet-50 rounded-2xl border border-violet-100 p-6 sm:p-8">
              <p className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-3">
                {t("consultar_contacto_titulo")}
              </p>
              <p className="text-sm text-slate-700 mb-4">
                {t("consultar_contacto_desc")}
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://wa.me/584228008204"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors"
                >
                  <span>WhatsApp</span>
                  <span className="font-mono">+58 422 8008204</span>
                </a>
                <a
                  href="mailto:webstore.valencia@supricom.com.ve"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  <span>Email</span>
                </a>
              </div>
            </div>

            {/* Botones de navegacion */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Link
                href={`/${locale}/servicio-tecnico/${sucursal}`}
                className="inline-flex items-center justify-center px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                {t("consultar_link_volver")}
              </Link>
              <Link
                href={`/${locale}/servicio-tecnico/${sucursal}/nuevo`}
                className="inline-flex items-center justify-center px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
              >
                {t("consultar_link_nuevo_reporte")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}