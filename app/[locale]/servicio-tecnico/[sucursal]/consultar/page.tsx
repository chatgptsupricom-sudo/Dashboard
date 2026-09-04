"use client";

import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
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
    <div className="pt-page min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <div className="mb-7">
          <Link
            href={`/${locale}/servicio-tecnico/${sucursal}`}
            className="pt-back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("consultar_link_volver")}
          </Link>
        </div>

        {/* Header */}
        <p className="pt-eyebrow">{t("eyebrow")}</p>
        <h1 className="pt-h1">{t("consultar_titulo")}</h1>
        <p className="pt-sub">{t("consultar_subtitulo")}</p>

        <div className="mt-8">
        {/* Cargando el ticket del token de la URL. Sin esto, entre el clic en
            el enlace y la respuesta del servidor solo se veia el titulo, sin
            ninguna pista de que la pagina estaba haciendo algo. */}
        {tokenFromUrl && buscando && !ticket && (
          <div className="flex items-center justify-center gap-2 py-10 text-[color:var(--portal-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span className="text-sm font-medium">{t("consultar_buscando")}</span>
          </div>
        )}

        {/* Form de busqueda: sin token de entrada, o con un token que fallo
            (vencido, mal copiado). Sin el `|| error`, un enlace de consulta
            invalido dejaba al cliente sin formulario, sin mensaje y sin forma
            de reintentar — solo el titulo, un callejon sin salida. */}
        {!ticket && (!tokenFromUrl || error) && (
          <form onSubmit={handleBuscar} className="pt-panel">
            <div>
              <label className="pt-label">
                {t("consultar_label_numero")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder={t("consultar_placeholder_numero")}
                className="pt-input"
                autoComplete="off"
              />
            </div>
            <div className="mt-5">
              <label className="pt-label">
                {t("consultar_label_factura")}
              </label>
              <input
                type="text"
                value={factura}
                onChange={(e) => setFactura(e.target.value)}
                placeholder={t("consultar_placeholder_factura")}
                className="pt-input font-mono"
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="pt-error mt-4">{error}</p>
            )}
            <button type="submit" disabled={buscando} className="pt-cta mt-6">
              {buscando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("consultar_buscando")}
                </>
              ) : (
                t("consultar_boton")
              )}
            </button>
          </form>
        )}

        {/* Estado del ticket */}
        {ticket && (
          <div className="space-y-4">
            {/* Estatus card */}
            <div className="pt-panel">
              <p className="pt-panel__eyebrow">
                {t("consultar_status_titulo")}
              </p>
              <div className="mt-1 mb-5">
                <code className="pt-code">{ticket.case_number}</code>
              </div>
              <p className="pt-panel__eyebrow">
                {t("consultar_status_label")}
              </p>
              <div
                className={`mt-2 inline-flex items-center px-4 py-2 rounded-xl border text-sm font-semibold ${
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
            <div className="pt-panel">
              <p className="pt-panel__eyebrow">
                {t("consultar_datos_reporte")}
              </p>
              <dl className="mt-3">
                {ticket.product_name && (
                  <div className="pt-summary__row">
                    <dt>{t("consultar_producto")}</dt>
                    <dd className="break-words">{ticket.product_name}</dd>
                  </div>
                )}
                {ticket.invoice_number && (
                  <div className="pt-summary__row">
                    <dt>{t("consultar_factura")}</dt>
                    <dd className="font-mono">{ticket.invoice_number}</dd>
                  </div>
                )}
                {ticket.serial && (
                  <div className="pt-summary__row">
                    <dt>Serial</dt>
                    <dd className="font-mono">{ticket.serial}</dd>
                  </div>
                )}
                {ticket.client_phone_masked && (
                  <div className="pt-summary__row">
                    <dt>Teléfono</dt>
                    <dd className="font-mono">{ticket.client_phone_masked}</dd>
                  </div>
                )}
                <div className="pt-summary__row">
                  <dt>{t("consultar_fecha_creacion")}</dt>
                  <dd>{new Date(ticket.created_at).toLocaleString("es-VE")}</dd>
                </div>
              </dl>
            </div>

            {/* Timeline */}
            <div className="pt-panel">
              <p className="pt-panel__eyebrow">
                {t("consultar_timeline_titulo")}
              </p>
              {ticket.timeline.length === 0 ? (
                <p className="mt-3 text-sm text-[color:var(--portal-muted)] text-center py-4">
                  {t("consultar_sin_historial")}
                </p>
              ) : (
                <div className="mt-4">
                  {ticket.timeline.map((h, idx) => (
                    <div key={idx} className="pt-timeline__item">
                      <div className="pt-timeline__rail">
                        <div
                          className={`pt-timeline__node ${
                            idx === ticket.timeline.length - 1
                              ? "pt-timeline__node--last"
                              : ""
                          }`}
                        />
                        {idx < ticket.timeline.length - 1 && (
                          <div className="pt-timeline__stem" />
                        )}
                      </div>
                      <div className="pt-timeline__body">
                        <p className="text-sm font-semibold text-[color:var(--portal-ink)]">
                          {h.from_status
                            ? `${etiquetaEstado(h.from_status)} → ${etiquetaEstado(h.to_status)}`
                            : etiquetaEstado(h.to_status)}
                        </p>
                        <p className="text-xs text-[color:var(--portal-muted)] mt-1">
                          {new Date(h.created_at).toLocaleString("es-VE")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contacto */}
            <div className="pt-callout">
              <p className="pt-callout__eyebrow">
                {t("consultar_contacto_titulo")}
              </p>
              <p className="mt-2 text-sm text-[color:var(--portal-ink)]">
                {t("consultar_contacto_desc")}
              </p>
              <a
                href="mailto:soporte.tecnico@supricom.com.ve"
                className="pt-ghost mt-4"
              >
                soporte.tecnico@supricom.com.ve
              </a>
            </div>

            {/* Botones de navegacion */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href={`/${locale}/servicio-tecnico/${sucursal}`}
                className="pt-ghost flex-1"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t("consultar_link_volver")}
              </Link>
              <Link
                href={`/${locale}/servicio-tecnico/${sucursal}/nuevo`}
                className="pt-cta"
                style={{ flex: 1 }}
              >
                {t("consultar_link_nuevo_reporte")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}