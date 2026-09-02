"use client";

import { CaptchaTurnstile } from "@/components/servicio-tecnico/captcha-turnstile";
import { GarantiaBadge } from "@/components/servicio-tecnico/garantia-badge";
import AttachmentUploader, {
  type AdjuntoEstado,
} from "@/components/servicio-tecnico/adjuntos-uploader";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  Search,
} from "lucide-react";
import { formatearFechaCalendario } from "@/lib/servicio-tecnico/fechas";
import { RESUMEN_KEY } from "@/lib/servicio-tecnico/resumen";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMAIL_SOPORTE = "soporte.tecnico@supricom.com.ve";

type Item = {
  id: string;
  producto_id: number;
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
  serial: string;
  lleva_serial: boolean;
  cantidad: number;
  despacho: string;
  garantia?: {
    estado: string;
    fecha_vencimiento: string | null;
  };
  ya_reportado: boolean;
  rma_case_number: string | null;
};

type Coincidencia = {
  numero: string;
  fecha: string | null;
  compania: string;
};

type Factura = {
  estado: "ok";
  factura: { numero: string; fecha: string | null; compania: string };
  cliente: { nombre: string; telefono: string; email: string };
  items: Item[];
};

export function ReporteForm({
  locale,
  turnstileSiteKey = "",
  sucursalCid,
  sucursalSlug,
}: {
  locale: string;
  turnstileSiteKey?: string;
  /** Resuelta por la URL (/servicio-tecnico/valencia, /panama, /caracas) — ya no la elige el cliente. */
  sucursalCid: number;
  sucursalSlug: string;
}) {
  const t = useTranslations("servicioTecnico");
  const router = useRouter();

  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  // Paso 1
  const [numero, setNumero] = useState("");
  const [rif, setRif] = useState("");
  // Errores por campo. Los botones se dejan habilitados a propósito: uno
  // deshabilitado no explica por qué, y en móvil apenas se distingue. El
  // cliente toca, no pasa nada, y se queda sin saber qué le falta.
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null);

  // Paso 2
  const [factura, setFactura] = useState<Factura | null>(null);
  const [itemId, setItemId] = useState("");

  // Paso 3
  const [serialManual, setSerialManual] = useState("");
  // Checkbox que confirma que el cliente sabe que este item ya tiene un caso
  // de RMA y quiere reportarlo otra vez de todas formas (issue #47).
  const [confirmarReenvio, setConfirmarReenvio] = useState(false);
  const [falla, setFalla] = useState("");
  const [telefono, setTelefono] = useState("");
  const [adjuntos, setAdjuntos] = useState<AdjuntoEstado[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaActivo, setCaptchaActivo] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Token con el que se agrupan los adjuntos antes de que el ticket exista.
  // Se genera una sola vez por sesión del formulario.
  const [uploadToken] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36),
  );

  // Al cambiar de paso hay que volver arriba: en móvil el botón de continuar
  // queda al final de una lista larga, y sin esto el paso siguiente aparece
  // arrancado por la mitad, sin que se vea ni el título.
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [paso]);

  // Traduce el estado de garantía y arma el detalle. Se usa en el paso 2 (por
  // producto) y en el 3 (el elegido).
  const textoGarantia = (g?: Item["garantia"]) => {
    const estado = g?.estado || "indeterminada";
    const clave = ["en_garantia", "vencida", "vida_util"].includes(estado)
      ? estado
      : "indeterminada";
    const fecha = formatearFechaCalendario(g?.fecha_vencimiento, locale);
    return {
      estado: clave,
      etiqueta: t(`garantia.${clave}`),
      detalle:
        clave === "en_garantia"
          ? fecha
            ? t("garantia.en_garantia_detalle", { fecha })
            : t("garantia.en_garantia_sin_fecha")
          : t(`garantia.${clave}_detalle`),
    };
  };

  // Si cambia el producto elegido, lo que se escribió para el anterior deja de
  // aplicar.
  useEffect(() => {
    setSerialManual("");
    setConfirmarReenvio(false);
    setErrores((p) => ({ ...p, serialManual: "", reenvio: "" }));
  }, [itemId]);

  // El error de "falta adjuntar una foto" solo se calcula al tocar "Enviar",
  // así que si el cliente lo ve y sube la foto después, el mensaje se quedaba
  // en pantalla —ya no bloqueaba el envío, pero parecía que la subida había
  // fallado. Se limpia apenas hay al menos un adjunto subido con éxito.
  useEffect(() => {
    if (adjuntos.some((a) => a.status === "done")) {
      setErrores((p) => (p.adjuntos ? { ...p, adjuntos: "" } : p));
    }
  }, [adjuntos]);

  const item = useMemo(
    () => factura?.items.find((i) => i.id === itemId) ?? null,
    [factura, itemId],
  );

  const buscarFactura = useCallback(
    async (valor: string, documento: string) => {
      const consulta = valor.trim();
      const doc = documento.trim();
      if (!consulta || !doc) return;

      setBuscando(true);
      setErrorBusqueda(null);
      setCoincidencias(null);

      try {
        const res = await fetch(
          `/api/servicio-tecnico/factura?numero=${encodeURIComponent(
            consulta,
          )}&rif=${encodeURIComponent(doc)}&sucursal=${sucursalCid}`,
        );
        const data = await res.json();

        if (data.estado === "ok") {
          setFactura(data);
          // Si la factura trae un solo item, ya queda elegido.
          setItemId(data.items.length === 1 ? data.items[0].id : "");
          setPaso(2);
          return;
        }

        if (data.estado === "ambiguo") {
          setCoincidencias(data.coincidencias);
          return;
        }

        setErrorBusqueda(t("form.notFound"));
      } catch {
        setErrorBusqueda(t("form.networkError"));
      } finally {
        setBuscando(false);
      }
    },
    [t, sucursalCid],
  );

  async function enviar() {
    if (!factura || !item) return;

    setEnviando(true);
    setErrorEnvio(null);

    try {
      const res = await fetch("/api/servicio-tecnico/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: factura.factura.numero,
          rif: rif.trim(),
          sucursal: sucursalCid,
          serial_manual: serialManual.trim(),
          item_id: item.id,
          odoo_product_id: item.producto_id,
          serial: item.serial,
          reported_fault: falla.trim(),
          client_phone: telefono.trim(),
          upload_token: uploadToken,
          captcha_token: captchaToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // No se limpia nada: lo que escribió el cliente se mantiene para que
        // pueda reintentar sin volver a redactarlo.
        setErrorEnvio(data.error || t("form.sendError"));
        return;
      }

      // El resumen va por sessionStorage y no por la URL: el teléfono y el
      // serial son datos del cliente, y lo que va en el query string queda en
      // el historial del navegador y en la analítica.
      try {
        sessionStorage.setItem(
          RESUMEN_KEY,
          JSON.stringify({
            factura: factura.factura.numero,
            producto: item.nombre,
            serial: item.serial,
            telefono: telefono.trim(),
          }),
        );
      } catch {
        // Sin sessionStorage el resumen no se muestra, pero el ticket ya existe.
      }

      router.push(
        `/${locale}/servicio-tecnico/${sucursalSlug}/confirmacion?ticket=${encodeURIComponent(
          data.case_number,
        )}&token=${encodeURIComponent(data.tracking_token)}`,
      );
    } catch {
      setErrorEnvio(t("form.networkError"));
    } finally {
      setEnviando(false);
    }
  }

  const fallaValida = falla.trim().length >= 10;
  const telefonoValido = telefono.replace(/\D/g, "").length >= 7;
  const subiendo = adjuntos.some((a) => a.status === "uploading");

  const etiquetasPaso = [t("form.step1"), t("form.step2"), t("form.step3")];

  return (
    <div className="pt-page pt-page--brand min-h-full">
      <div className="pt-shell pt-shell--narrow">
      <div className="mb-6">
        <Volver
          paso={paso}
          setPaso={setPaso}
          locale={locale}
          sucursalSlug={sucursalSlug}
          label={t("back")}
        />
      </div>

      <div className="pt-formcard">
        <div className="pt-formcard__strip">
          <div className="pt-formcard__striprow">
            <span className="pt-formcard__brand">{t("eyebrow")}</span>
            <span className="pt-formcard__stepno">
              {t("form.stepOf", { n: paso, total: etiquetasPaso.length })}
            </span>
          </div>
        </div>

        <div className="pt-formcard__body">
          <Pasos actual={paso} etiquetas={etiquetasPaso} />

      {paso === 1 && (
        <section className="mt-2">
          <h1 className="pt-h1">{t("form.invoiceTitle")}</h1>
          <p className="pt-sub">{t("form.invoiceHelp")}</p>

          <form
            className="mt-7"
            onSubmit={(e) => {
              e.preventDefault();
              const faltan: Record<string, string> = {};
              if (!numero.trim()) faltan.numero = t("form.required");
              if (!rif.trim()) faltan.rif = t("form.required");
              setErrores(faltan);
              if (Object.keys(faltan).length) {
                document.getElementById(Object.keys(faltan)[0])?.focus();
                return;
              }
              buscarFactura(numero, rif);
            }}
          >
            <label htmlFor="numero" className="pt-label">
              {t("form.invoiceLabel")}
            </label>
            <input
              id="numero"
              className="pt-input"
              value={numero}
              onChange={(e) => {
                setNumero(e.target.value);
                setErrores((p) => ({ ...p, numero: "" }));
              }}
              aria-invalid={!!errores.numero}
              aria-describedby={errores.numero ? "numero-error" : undefined}
              placeholder={t("form.invoicePlaceholder")}
              autoComplete="off"
              autoFocus
              enterKeyHint="search"
            />
            {errores.numero && <MensajeError id="numero-error" texto={errores.numero} />}

            <label htmlFor="rif" className="pt-label mt-5">
              {t("form.rifLabel")}
            </label>
            <input
              id="rif"
              className="pt-input"
              value={rif}
              onChange={(e) => {
                setRif(e.target.value);
                setErrores((p) => ({ ...p, rif: "" }));
              }}
              aria-invalid={!!errores.rif}
              aria-describedby={errores.rif ? "rif-error" : undefined}
              placeholder={t("form.rifPlaceholder")}
              autoComplete="off"
              enterKeyHint="search"
            />
            {errores.rif && <MensajeError id="rif-error" texto={errores.rif} />}
            <p className="pt-hint">{t("form.rifHelp")}</p>

            <button
              type="submit"
              className="pt-cta mt-6"
              disabled={buscando}
            >
              {buscando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("form.searching")}
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" aria-hidden />
                  {t("form.searchCta")}
                </>
              )}
            </button>
          </form>

          {coincidencias && (
            <div className="pt-panel mt-6">
              <p className="text-sm font-semibold">{t("form.multipleTitle")}</p>
              <p className="pt-hint">{t("form.multipleHelp")}</p>
              <ul className="mt-3 space-y-2">
                {coincidencias.map((c) => (
                  <li key={c.numero}>
                    <button
                      type="button"
                      onClick={() => {
                        setNumero(c.numero);
                        buscarFactura(c.numero, rif);
                      }}
                      className="w-full rounded-[11px] border border-[color:var(--portal-line-strong)] px-4 py-3 text-left transition-colors hover:border-[color:var(--portal-primary)] hover:bg-[color:var(--portal-primary-soft)]"
                    >
                      <span className="font-semibold">{c.numero}</span>
                      <span className="block text-sm text-[color:var(--portal-muted)]">
                        {[c.fecha, c.compania].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errorBusqueda && <Aviso texto={errorBusqueda} ayuda={t("form.emailInstead")} />}
        </section>
      )}

      {paso === 2 && factura && (
        <section className="mt-2">
          <h1 className="pt-h1">{t("form.productTitle")}</h1>

          <dl className="pt-panel mt-6">
            <Dato etiqueta={t("form.invoiceLabel")} valor={factura.factura.numero} />
            <Dato etiqueta={t("form.client")} valor={factura.cliente.nombre} />
            {factura.factura.fecha && (
              <Dato etiqueta={t("form.date")} valor={factura.factura.fecha} />
            )}
          </dl>

          <p className="pt-sub mt-6">{t("form.productHelp")}</p>

          <ul className="mt-4 space-y-3">
            {factura.items.map((i) => (
              <li key={i.id}>
                <label
                  className={`pt-choice ${itemId === i.id ? "pt-choice--on" : ""}`}
                >
                  <input
                    type="radio"
                    name="item"
                    className="mt-1 accent-[color:var(--portal-primary)]"
                    checked={itemId === i.id}
                    onChange={() => setItemId(i.id)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{i.nombre}</span>
                    <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">
                      {[i.marca, i.codigo].filter(Boolean).join(" · ")}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {i.garantia && (
                        <GarantiaBadge
                          compacto
                          estado={textoGarantia(i.garantia).estado}
                          etiqueta={textoGarantia(i.garantia).etiqueta}
                        />
                      )}
                      {i.ya_reportado && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {t("form.duplicateBadge")}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm">
                      {i.serial ? (
                        <span className="font-mono text-[color:var(--portal-primary)]">
                          {t("form.serial")}: {i.serial}
                        </span>
                      ) : i.lleva_serial ? (
                        <span className="text-[color:var(--portal-muted)]">
                          {t("form.serialMissing")}
                        </span>
                      ) : (
                        <span className="text-[color:var(--portal-muted)]">
                          {t("form.units", { n: i.cantidad })}
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="pt-cta mt-7"
            disabled={!itemId}
            onClick={() => setPaso(3)}
          >
            {t("form.continue")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </section>
      )}

      {paso === 3 && factura && item && (
        <section className="mt-2">
          <h1 className="pt-h1">{t("form.faultTitle")}</h1>

          <p className="pt-panel mt-6 text-sm">
            <span className="font-semibold">{item.nombre}</span>
            {item.serial && (
              <span className="mt-1 block font-mono text-[color:var(--portal-muted)]">
                {item.serial}
              </span>
            )}
          </p>

          {item.ya_reportado && (
            <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="flex gap-2 font-semibold">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {t("form.duplicateWarningTitle", { caso: item.rma_case_number ?? "" })}
              </p>
              <p className="mt-1.5">{t("form.duplicateWarningDesc")}</p>
              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  id="reenvio"
                  type="checkbox"
                  className="mt-0.5 accent-amber-700"
                  checked={confirmarReenvio}
                  onChange={(e) => {
                    setConfirmarReenvio(e.target.checked);
                    setErrores((p) => ({ ...p, reenvio: "" }));
                  }}
                />
                <span>{t("form.duplicateConfirmLabel")}</span>
              </label>
              {errores.reenvio && (
                <MensajeError id="reenvio-error" texto={errores.reenvio} />
              )}
            </div>
          )}

          {item.garantia && (
            <div className="mt-4">
              <GarantiaBadge
                estado={textoGarantia(item.garantia).estado}
                etiqueta={textoGarantia(item.garantia).etiqueta}
                detalle={textoGarantia(item.garantia).detalle}
              />
            </div>
          )}

          {!item.serial && (
            <div className="mt-6">
              <label htmlFor="serialManual" className="pt-label">
                {item.lleva_serial
                  ? t("form.serialManualLabel")
                  : t("form.serialManualLabelOpcional")}
              </label>
              <input
                id="serialManual"
                className="pt-input font-mono"
                value={serialManual}
                onChange={(e) => {
                  setSerialManual(e.target.value);
                  setErrores((p) => ({ ...p, serialManual: "" }));
                }}
                placeholder={t("form.serialManualPlaceholder")}
                autoComplete="off"
                aria-invalid={!!errores.serialManual}
              />
              {errores.serialManual && (
                <MensajeError id="serialManual-error" texto={errores.serialManual} />
              )}
              <p className="pt-hint">
                {item.lleva_serial
                  ? t("form.serialManualHelp")
                  : t("form.serialManualHelpOpcional")}
              </p>
            </div>
          )}

          <div className="mt-6">
            <label htmlFor="falla" className="pt-label">
              {t("form.faultLabel")}
            </label>
            <textarea
              id="falla"
              rows={5}
              className="pt-textarea"
              value={falla}
              onChange={(e) => {
                setFalla(e.target.value);
                setErrores((p) => ({ ...p, falla: "" }));
              }}
              placeholder={t("form.faultPlaceholder")}
              maxLength={5000}
            />
            {(errores.falla || (falla.length > 0 && !fallaValida)) && (
              <MensajeError id="falla-error" texto={t("form.faultTooShort")} />
            )}
          </div>

          <div className="mt-6">
            <label htmlFor="telefono" className="pt-label">
              {t("form.phoneLabel")}
            </label>
            <input
              id="telefono"
              type="tel"
              inputMode="tel"
              className="pt-input"
              value={telefono}
              onChange={(e) => {
                setTelefono(e.target.value);
                setErrores((p) => ({ ...p, telefono: "" }));
              }}
              placeholder="0414 1234567"
            />
            {errores.telefono && (
              <MensajeError id="telefono-error" texto={errores.telefono} />
            )}
            {errores.captcha && (
              <MensajeError id="captcha-error" texto={errores.captcha} />
            )}
            {factura.cliente.telefono && (
              <p className="pt-hint">
                {t("form.phoneOnFile", { telefono: factura.cliente.telefono })}
              </p>
            )}
          </div>

          <div className="mt-6">
            <p className="pt-label">{t("form.attachmentsLabelRequired")}</p>
            <p className="pt-hint">{t("form.attachmentsHelp")}</p>
            <div className="mt-3">
              <AttachmentUploader
                trackingToken={uploadToken}
                onChange={setAdjuntos}
                lang={locale === "en" ? "en" : "es"}
              />
            </div>
          </div>

          {errores.adjuntos && (
            <MensajeError id="adjuntos-error" texto={errores.adjuntos} />
          )}

          <CaptchaTurnstile
            siteKey={turnstileSiteKey}
            locale={locale}
            onToken={setCaptchaToken}
            onDisponible={setCaptchaActivo}
          />

          {errorEnvio && <Aviso texto={errorEnvio} ayuda={t("form.emailInstead")} />}

          <button
            type="button"
            className="pt-cta mt-7"
            // Se deshabilita solo mientras hay algo en curso. Lo que falte por
            // llenar se avisa con un mensaje al tocar, no dejando el botón
            // muerto sin explicación.
            disabled={enviando || subiendo}
            onClick={() => {
              const faltan: Record<string, string> = {};
              // Serial obligatorio solo cuando el producto SÍ lleva serial de
              // fábrica y el despacho no lo registró: ahí el cliente puede
              // leerlo de la etiqueta. En consumibles, cables y accesorios
              // —que Odoo marca como no rastreados— no existe ningún serial
              // que escribir, y exigirlo dejaría esos productos sin poder
              // reportarse.
              if (item.lleva_serial && !item.serial && !serialManual.trim())
                faltan.serialManual = t("form.serialManualRequired");
              // Ya tiene un caso de RMA: no se bloquea el reenvio (puede ser
              // una falla nueva o una que reaparece), pero hay que confirmar
              // a proposito en vez de dejar que se cree un duplicado sin
              // darse cuenta.
              if (item.ya_reportado && !confirmarReenvio)
                faltan.reenvio = t("form.duplicateConfirmRequired");
              if (!fallaValida) faltan.falla = t("form.faultTooShort");
              if (!telefonoValido) faltan.telefono = t("form.phoneRequired");
              // Solo se exige captcha si está configurado; si no, no se puede
              // producir un token y bloquearía a todo el mundo.
              if (captchaActivo && !captchaToken)
                faltan.captcha = t("form.captchaRequired");
              // Al menos una foto o video, ya subido. Los que fallaron no
              // cuentan: el servidor solo ve los que llegaron.
              if (!adjuntos.some((a) => a.status === "done"))
                faltan.adjuntos = t("form.attachmentsRequired");
              setErrores(faltan);
              if (Object.keys(faltan).length) {
                document.getElementById(Object.keys(faltan)[0])?.focus();
                return;
              }
              enviar();
            }}
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("form.sending")}
              </>
            ) : subiendo ? (
              t("form.waitUploads")
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden />
                {t("form.submit")}
              </>
            )}
          </button>
        </section>
      )}
        </div>
      </div>
      </div>
    </div>
  );
}

function MensajeError({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} role="alert" className="pt-error">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

function Volver({
  paso,
  setPaso,
  locale,
  sucursalSlug,
  label,
}: {
  paso: 1 | 2 | 3;
  setPaso: (p: 1 | 2 | 3) => void;
  locale: string;
  sucursalSlug: string;
  label: string;
}) {
  if (paso === 1) {
    return (
      <a
        href={`/${locale}/servicio-tecnico/${sucursalSlug}`}
        className="pt-back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPaso((paso - 1) as 1 | 2 | 3)}
      className="pt-back"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

function Pasos({ actual, etiquetas }: { actual: number; etiquetas: string[] }) {
  const pct = Math.round((actual / etiquetas.length) * 100);
  return (
    <div
      className="pt-progress"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={etiquetas.length}
      aria-valuenow={actual}
      aria-label={etiquetas.join(" › ")}
    >
      <div className="pt-progress__track">
        <div className="pt-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="pt-progress__crumbs">
        {etiquetas.map((etiqueta, i) => {
          const n = i + 1;
          const cls = n === actual ? "is-now" : n < actual ? "is-done" : undefined;
          return (
            <span key={etiqueta}>
              <span className={cls}>{etiqueta}</span>
              {i < etiquetas.length - 1 && (
                <span className="pt-progress__sep" aria-hidden>
                  ›
                </span>
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="pt-summary__row">
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function Aviso({ texto, ayuda }: { texto: string; ayuda: string }) {
  return (
    <div className="pt-panel mt-6">
      <p className="flex gap-2 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{texto}</span>
      </p>
      <a
        href={`mailto:${EMAIL_SOPORTE}`}
        className="portal-btn portal-btn-outline mt-3 w-full"
      >
        <Mail className="h-4 w-4" aria-hidden />
        {ayuda}
      </a>
    </div>
  );
}
