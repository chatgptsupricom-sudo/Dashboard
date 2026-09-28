"use client";

import AttachmentUploader, {
  type AdjuntoEstado,
} from "@/components/servicio-tecnico/adjuntos-uploader";
import { CaptchaTurnstile } from "@/components/servicio-tecnico/captcha-turnstile";
import { Aviso, MensajeError, Pasos } from "@/components/servicio-tecnico/form-ui";
import {
  paisDeSucursal,
  tipoPorDefecto,
  tiposDocumento,
  validarDocumento,
} from "@/lib/servicio-tecnico/documento";
import {
  LARGOS,
  MAX_EQUIPOS,
  TIPOS_SUGERIDOS,
  emailValido,
  erroresEquipo,
  nombreValido,
  telefonoValido,
} from "@/lib/servicio-tecnico/externo";
import { RESUMEN_KEY } from "@/lib/servicio-tecnico/resumen";
import { ArrowLeft, ArrowRight, Check, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Un equipo del envío, tal como lo va llenando el cliente. */
type Equipo = {
  // Clave estable para React y para los id del DOM. Correlativa y no un uuid:
  // el primer equipo se renderiza también en el servidor, y un id al azar
  // salía distinto en el cliente (error de hidratación).
  clave: string;
  tipo: string;
  marca: string;
  modelo: string;
  serial: string;
  falla: string;
  adjuntos: AdjuntoEstado[];
  // Cada equipo sube sus fotos con su propio token, así el servidor sabe de
  // cuál es cada una.
  uploadToken: string;
};

function nuevoToken(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function equipoNuevo(clave: string): Equipo {
  return {
    clave,
    tipo: "",
    marca: "",
    modelo: "",
    serial: "",
    falla: "",
    adjuntos: [],
    uploadToken: nuevoToken(),
  };
}

/**
 * Reporte de un equipo que NO se compró en Supricom. Dos pasos: los datos del
 * cliente (no hay factura de la que sacarlos) y los equipos, cada uno con su
 * falla y sus fotos. El envío va a POST /api/servicio-tecnico/externo.
 */
export function ReporteExternoForm({
  locale,
  turnstileSiteKey = "",
  sucursalCid,
  sucursalSlug,
}: {
  locale: string;
  turnstileSiteKey?: string;
  sucursalCid: number;
  sucursalSlug: string;
}) {
  const t = useTranslations("servicioTecnico");
  const router = useRouter();

  const [paso, setPaso] = useState<1 | 2>(1);

  // Paso 1
  const pais = paisDeSucursal(sucursalCid);
  const [nombre, setNombre] = useState("");
  const [tipoDoc, setTipoDoc] = useState(() => tipoPorDefecto(pais));
  const [documento, setDocumento] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  // Paso 2
  const [equipos, setEquipos] = useState<Equipo[]>(() => [equipoNuevo("e1")]);
  const siguienteClave = useRef(2);
  const [acepta, setAcepta] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaActivo, setCaptchaActivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Errores por campo; los botones quedan habilitados y avisan al tocar (ver
  // el mismo criterio en reporte-form).
  const [errores, setErrores] = useState<Record<string, string>>({});
  const limpiar = (campo: string) =>
    setErrores((p) => (p[campo] ? { ...p, [campo]: "" } : p));

  // Al cambiar de paso, arriba: en móvil el botón queda al final de la página.
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [paso]);

  const actualizar = (clave: string, cambios: Partial<Equipo>) =>
    setEquipos((prev) => prev.map((e) => (e.clave === clave ? { ...e, ...cambios } : e)));

  function agregarEquipo() {
    if (equipos.length >= MAX_EQUIPOS) return;
    const nuevo = equipoNuevo(`e${siguienteClave.current++}`);
    setEquipos((prev) => [...prev, nuevo]);
    // Que el cliente vea el equipo que acaba de agregar.
    setTimeout(() => document.getElementById(`tipo-${nuevo.clave}`)?.focus(), 50);
  }

  function quitarEquipo(clave: string) {
    setEquipos((prev) => (prev.length > 1 ? prev.filter((e) => e.clave !== clave) : prev));
  }

  const subiendo = equipos.some((e) => e.adjuntos.some((a) => a.status === "uploading"));

  function validarPaso1(): boolean {
    const faltan: Record<string, string> = {};
    if (!nombreValido(nombre)) faltan.nombre = t("externo.nombreRequerido");
    const errDoc = validarDocumento(pais, tipoDoc, documento);
    if (errDoc) {
      faltan.documento =
        errDoc === "vacio"
          ? t("form.required")
          : errDoc === "caracteres"
            ? t("form.docSoloNumeros")
            : t("form.docLargo");
    }
    if (!telefonoValido(telefono)) faltan.telefono = t("form.phoneRequired");
    if (!emailValido(email)) faltan.email = t("externo.emailInvalido");
    setErrores(faltan);
    if (Object.keys(faltan).length) {
      document.getElementById(Object.keys(faltan)[0])?.focus();
      return false;
    }
    return true;
  }

  function validarPaso2(): boolean {
    const faltan: Record<string, string> = {};
    for (const e of equipos) {
      for (const campo of erroresEquipo(e)) {
        faltan[`${campo}-${e.clave}`] =
          campo === "falla" ? t("form.faultTooShort") : t("form.required");
      }
      // Al menos una foto o video por equipo, ya subido: el servidor solo ve
      // los que llegaron.
      if (!e.adjuntos.some((a) => a.status === "done"))
        faltan[`adjuntos-${e.clave}`] = t("form.attachmentsRequired");
    }
    if (!acepta) faltan.acepta = t("externo.aceptaRequerido");
    if (captchaActivo && !captchaToken) faltan.captcha = t("form.captchaRequired");
    setErrores(faltan);
    if (Object.keys(faltan).length) {
      document.getElementById(Object.keys(faltan)[0])?.focus();
      return false;
    }
    return true;
  }

  async function enviar() {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch("/api/servicio-tecnico/externo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal: sucursalCid,
          nombre: nombre.trim(),
          tipo_documento: tipoDoc,
          documento: documento.trim(),
          client_phone: telefono.trim(),
          email: email.trim(),
          acepta_condiciones: acepta,
          productos: equipos.map((e) => ({
            tipo: e.tipo.trim(),
            marca: e.marca.trim(),
            modelo: e.modelo.trim(),
            serial: e.serial.trim(),
            reported_fault: e.falla.trim(),
            upload_token: e.uploadToken,
          })),
          captcha_token: captchaToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // No se limpia nada, para que pueda reintentar sin reescribir.
        setErrorEnvio(data.error || t("form.sendError"));
        return;
      }

      // Por sessionStorage y no por la URL (ver lib/servicio-tecnico/resumen).
      try {
        sessionStorage.setItem(
          RESUMEN_KEY,
          JSON.stringify({
            externo: true,
            telefono: telefono.trim(),
            productos: equipos.map((e) => ({
              nombre: [e.tipo, e.marca, e.modelo].map((x) => x.trim()).filter(Boolean).join(" "),
              serial: e.serial.trim(),
            })),
          }),
        );
      } catch {
        // Sin sessionStorage no se muestra el resumen; el ticket ya existe.
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

  const etiquetasPaso = [t("externo.step1"), t("externo.step2")];

  return (
    <div className="pt-page pt-page--brand min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <div className="mb-6">
          {paso === 1 ? (
            <a href={`/${locale}/servicio-tecnico/${sucursalSlug}`} className="pt-back">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("back")}
            </a>
          ) : (
            <button type="button" onClick={() => setPaso(1)} className="pt-back">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("back")}
            </button>
          )}
        </div>

        <div className="pt-formcard">
          <div className="pt-formcard__body">
            <div className="pt-formcard__meta">
              <span className="pt-eyebrow">{t("externo.eyebrow")}</span>
              <span className="pt-formcard__stepno">
                {t("form.stepOf", { n: paso, total: etiquetasPaso.length })}
              </span>
            </div>
            <Pasos actual={paso} etiquetas={etiquetasPaso} />

            {paso === 1 && (
              <section className="mt-2">
                <h1 className="pt-h1">{t("externo.titulo")}</h1>
                <p className="pt-sub">{t("externo.subtitulo")}</p>

                <AvisoCosto titulo={t("externo.costoTitulo")} texto={t("externo.costoTexto")} />

                <form
                  className="mt-7"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validarPaso1()) setPaso(2);
                  }}
                >
                  <label htmlFor="nombre" className="pt-label">
                    {t("externo.nombreLabel")}
                  </label>
                  <input
                    id="nombre"
                    className="pt-input"
                    value={nombre}
                    maxLength={LARGOS.nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      limpiar("nombre");
                    }}
                    aria-invalid={!!errores.nombre}
                    placeholder={t("externo.nombrePlaceholder")}
                    autoComplete="name"
                    autoFocus
                  />
                  {errores.nombre && <MensajeError id="nombre-error" texto={errores.nombre} />}

                  <label htmlFor="documento" className="pt-label mt-5">
                    {t(pais === "PA" ? "externo.docLabelPa" : "externo.docLabel")}
                  </label>
                  <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-[minmax(10rem,42%)_minmax(0,1fr)]">
                    <select
                      id="tipoDoc"
                      className="pt-input"
                      aria-label={t("form.docTypeLabel")}
                      value={tipoDoc}
                      onChange={(e) => {
                        setTipoDoc(e.target.value);
                        limpiar("documento");
                      }}
                    >
                      {tiposDocumento(pais).map((d) => (
                        <option key={d.codigo} value={d.codigo}>
                          {t(`form.docTipo.${pais}.${d.codigo}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      id="documento"
                      className="pt-input"
                      value={documento}
                      onChange={(e) => {
                        setDocumento(e.target.value);
                        limpiar("documento");
                      }}
                      aria-invalid={!!errores.documento}
                      aria-label={t("form.docNumberLabel")}
                      placeholder={t(`form.docEjemplo.${pais}.${tipoDoc}`)}
                      inputMode={tiposDocumento(pais).find((d) => d.codigo === tipoDoc)?.alfanumerico ? "text" : "numeric"}
                      autoComplete="off"
                    />
                  </div>
                  {errores.documento && <MensajeError id="documento-error" texto={errores.documento} />}
                  <p className="pt-hint">{t("externo.docHelp")}</p>

                  <label htmlFor="telefono" className="pt-label mt-5">
                    {t("form.phoneLabel")}
                  </label>
                  <input
                    id="telefono"
                    type="tel"
                    inputMode="tel"
                    className="pt-input"
                    value={telefono}
                    maxLength={LARGOS.telefono}
                    onChange={(e) => {
                      setTelefono(e.target.value);
                      limpiar("telefono");
                    }}
                    aria-invalid={!!errores.telefono}
                    placeholder="0414 1234567"
                    autoComplete="tel"
                  />
                  {errores.telefono && <MensajeError id="telefono-error" texto={errores.telefono} />}

                  <label htmlFor="email" className="pt-label mt-5">
                    {t("externo.emailLabel")}
                  </label>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    className="pt-input"
                    value={email}
                    maxLength={LARGOS.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      limpiar("email");
                    }}
                    aria-invalid={!!errores.email}
                    placeholder={t("externo.emailPlaceholder")}
                    autoComplete="email"
                  />
                  {errores.email && <MensajeError id="email-error" texto={errores.email} />}
                  <p className="pt-hint">{t("externo.emailHelp")}</p>

                  <button type="submit" className="pt-cta mt-7">
                    {t("form.continue")}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </form>

                <p className="pt-hint mt-6">
                  {t("externo.enlaceAFactura")}{" "}
                  <a
                    href={`/${locale}/servicio-tecnico/${sucursalSlug}/nuevo`}
                    className="font-semibold text-[color:var(--portal-primary)] underline underline-offset-2"
                  >
                    {t("externo.enlaceAFacturaCta")}
                  </a>
                </p>
              </section>
            )}

            {/* Montado siempre y oculto en el paso 1: si se desmontara al
                volver atrás, las fotos que se están subiendo desaparecerían
                de la pantalla aunque lleguen al servidor. */}
            <section className={paso === 2 ? "mt-2" : "hidden"}>
              <h1 className="pt-h1">{t("externo.equiposTitulo")}</h1>
              <p className="pt-sub">{t("externo.equiposHelp")}</p>

              <datalist id="tipos-equipo">
                {TIPOS_SUGERIDOS.map((tipo) => (
                  <option key={tipo} value={tipo} />
                ))}
              </datalist>

              <div className="mt-6 space-y-5">
                {equipos.map((e, i) => (
                  <div key={e.clave} className="pt-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--portal-muted)]">
                        {equipos.length > 1
                          ? t("externo.equipoNdeM", { n: i + 1, total: equipos.length })
                          : t("externo.tuEquipo")}
                      </p>
                      {equipos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarEquipo(e.clave)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {t("externo.quitar")}
                        </button>
                      )}
                    </div>

                    <Campo
                      id={`tipo-${e.clave}`}
                      etiqueta={t("externo.tipoLabel")}
                      valor={e.tipo}
                      max={LARGOS.tipo}
                      placeholder={t("externo.tipoPlaceholder")}
                      lista="tipos-equipo"
                      error={errores[`tipo-${e.clave}`]}
                      onChange={(v) => {
                        actualizar(e.clave, { tipo: v });
                        limpiar(`tipo-${e.clave}`);
                      }}
                    />
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      <Campo
                        id={`marca-${e.clave}`}
                        etiqueta={t("externo.marcaLabel")}
                        valor={e.marca}
                        max={LARGOS.marca}
                        placeholder={t("externo.marcaPlaceholder")}
                        error={errores[`marca-${e.clave}`]}
                        onChange={(v) => {
                          actualizar(e.clave, { marca: v });
                          limpiar(`marca-${e.clave}`);
                        }}
                      />
                      <Campo
                        id={`modelo-${e.clave}`}
                        etiqueta={t("externo.modeloLabel")}
                        valor={e.modelo}
                        max={LARGOS.modelo}
                        placeholder={t("externo.modeloPlaceholder")}
                        error={errores[`modelo-${e.clave}`]}
                        onChange={(v) => {
                          actualizar(e.clave, { modelo: v });
                          limpiar(`modelo-${e.clave}`);
                        }}
                      />
                    </div>
                    <Campo
                      id={`serial-${e.clave}`}
                      etiqueta={t("externo.serialLabel")}
                      valor={e.serial}
                      max={LARGOS.serial}
                      placeholder={t("form.serialManualPlaceholder")}
                      mono
                      error={errores[`serial-${e.clave}`]}
                      onChange={(v) => {
                        actualizar(e.clave, { serial: v });
                        limpiar(`serial-${e.clave}`);
                      }}
                    />

                    <div className="mt-5">
                      <label htmlFor={`falla-${e.clave}`} className="pt-label">
                        {t("form.faultLabel")}
                      </label>
                      <textarea
                        id={`falla-${e.clave}`}
                        rows={equipos.length > 1 ? 4 : 5}
                        className="pt-textarea"
                        value={e.falla}
                        onChange={(ev) => {
                          actualizar(e.clave, { falla: ev.target.value });
                          limpiar(`falla-${e.clave}`);
                        }}
                        placeholder={t("form.faultPlaceholder")}
                        maxLength={LARGOS.falla}
                      />
                      {(errores[`falla-${e.clave}`] ||
                        (e.falla.length > 0 && e.falla.trim().length < 10)) && (
                        <MensajeError id={`falla-${e.clave}-error`} texto={t("form.faultTooShort")} />
                      )}
                    </div>

                    <div className="mt-5">
                      <p className="pt-label">{t("form.attachmentsLabelRequired")}</p>
                      <p className="pt-hint">{t("form.attachmentsHelp")}</p>
                      <div className="mt-3">
                        <AttachmentUploader
                          trackingToken={e.uploadToken}
                          onChange={(a) => {
                            actualizar(e.clave, { adjuntos: a });
                            if (a.some((x) => x.status === "done")) limpiar(`adjuntos-${e.clave}`);
                          }}
                          lang={locale === "en" ? "en" : "es"}
                        />
                      </div>
                      {errores[`adjuntos-${e.clave}`] && (
                        <MensajeError id={`adjuntos-${e.clave}`} texto={errores[`adjuntos-${e.clave}`]} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {equipos.length < MAX_EQUIPOS ? (
                <button type="button" onClick={agregarEquipo} className="pt-ghost mt-4 w-full">
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("externo.agregar")}
                </button>
              ) : (
                <p className="pt-hint mt-4">{t("form.maxProductos", { n: MAX_EQUIPOS })}</p>
              )}

              <label className="mt-7 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[color:var(--portal-line-strong)] p-4 text-sm">
                <input
                  id="acepta"
                  type="checkbox"
                  className="mt-0.5 accent-[color:var(--portal-primary)]"
                  checked={acepta}
                  onChange={(ev) => {
                    setAcepta(ev.target.checked);
                    limpiar("acepta");
                  }}
                />
                <span>{t("externo.aceptaLabel")}</span>
              </label>
              {errores.acepta && <MensajeError id="acepta-error" texto={errores.acepta} />}

              {/* Solo en el paso 2: el token del captcha vence a los pocos minutos. */}
              {paso === 2 && (
                <CaptchaTurnstile
                  siteKey={turnstileSiteKey}
                  locale={locale}
                  onToken={setCaptchaToken}
                  onDisponible={setCaptchaActivo}
                />
              )}
              {errores.captcha && <MensajeError id="captcha-error" texto={errores.captcha} />}

              {errorEnvio && <Aviso texto={errorEnvio} ayuda={t("form.emailInstead")} />}

              <button
                type="button"
                className="pt-cta mt-7"
                disabled={enviando || subiendo}
                onClick={() => {
                  if (validarPaso2()) enviar();
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
                    {t("externo.submit")}
                  </>
                )}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  max,
  placeholder,
  lista,
  mono = false,
  error,
  onChange,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  max: number;
  placeholder?: string;
  lista?: string;
  mono?: boolean;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-5">
      <label htmlFor={id} className="pt-label">
        {etiqueta}
      </label>
      <input
        id={id}
        className={`pt-input ${mono ? "font-mono" : ""}`}
        value={valor}
        maxLength={max}
        list={lista}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        autoComplete="off"
      />
      {error && <MensajeError id={`${id}-error`} texto={error} />}
    </div>
  );
}

/** El servicio se cobra: se dice antes de pedir un solo dato. */
function AvisoCosto({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mt-6 flex gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="mt-1 block">{texto}</span>
      </span>
    </div>
  );
}
