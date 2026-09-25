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
import {
  componerDocumento,
  paisDeSucursal,
  tipoPorDefecto,
  tiposDocumento,
  validarDocumento,
} from "@/lib/servicio-tecnico/documento";
import { formatearFechaCalendario } from "@/lib/servicio-tecnico/fechas";
import { RESUMEN_KEY } from "@/lib/servicio-tecnico/resumen";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMAIL_SOPORTE = "soporte.tecnico@supricom.com.ve";

// Productos por envío: el mismo tope que valida el servidor
// (app/api/servicio-tecnico/ticket).
const MAX_PRODUCTOS = 10;

/** Lo que el cliente carga de cada producto del envío en el paso 3. */
type Detalle = {
  serialManual: string;
  falla: string;
  // Confirma que sabe que este producto ya tiene un caso de RMA y quiere
  // reportarlo otra vez de todas formas (issue #47).
  confirmarReenvio: boolean;
  adjuntos: AdjuntoEstado[];
  // Cada producto sube sus fotos con su propio token, así el servidor sabe de
  // cuál es cada una.
  uploadToken: string;
};

function nuevoToken(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function detalleNuevo(): Detalle {
  return { serialManual: "", falla: "", confirmarReenvio: false, adjuntos: [], uploadToken: nuevoToken() };
}

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

  // Paso 1. El documento es tipo (select) + número: los tipos dependen del
  // país de la sucursal (lib/servicio-tecnico/documento).
  const pais = paisDeSucursal(sucursalCid);
  const [numero, setNumero] = useState("");
  const [tipoDoc, setTipoDoc] = useState(() => tipoPorDefecto(pais));
  const [rif, setRif] = useState("");
  const documento = componerDocumento(pais, tipoDoc, rif);
  // Errores por campo. Los botones se dejan habilitados a propósito: uno
  // deshabilitado no explica por qué, y en móvil apenas se distingue. El
  // cliente toca, no pasa nada, y se queda sin saber qué le falta.
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null);

  // Paso 2: los productos que van en el envío (ids de item de la factura).
  const [factura, setFactura] = useState<Factura | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  // Paso 3: lo de cada producto, por id de item. No se borra al desmarcar uno:
  // si el cliente lo vuelve a marcar, sigue teniendo lo que escribió y las
  // fotos que ya subió.
  const [detalles, setDetalles] = useState<Record<string, Detalle>>({});
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaActivo, setCaptchaActivo] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

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

  const actualizar = (id: string, cambios: Partial<Detalle>) =>
    setDetalles((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));

  function alternar(id: string) {
    if (!seleccion.includes(id) && seleccion.length >= MAX_PRODUCTOS) {
      setErrores((p) => ({ ...p, seleccion: t("form.maxProductos", { n: MAX_PRODUCTOS }) }));
      return;
    }
    setErrores((p) => ({ ...p, seleccion: "" }));
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setDetalles((prev) => (prev[id] ? prev : { ...prev, [id]: detalleNuevo() }));
  }

  // Paso 2: primero por marca, después por producto, y dentro del producto
  // sus unidades (un serial cada una). Con 11 laptops iguales se ve un
  // producto con 11 seriales, no 11 renglones sueltos.
  const grupos = useMemo(() => agruparPorMarca(factura?.items ?? []), [factura]);

  // Las unidades en el orden en que se ven en el paso 2. `elegidos` son las
  // marcadas; `conDetalle`, las que se marcaron alguna vez (sus tarjetas del
  // paso 3 siguen montadas, ocultas, para no perder las fotos en curso).
  const unidades = useMemo(() => grupos.flatMap((g) => g.productos.flatMap((p) => p.unidades)), [grupos]);
  const elegidos = useMemo(() => unidades.filter((u) => seleccion.includes(u.id)), [unidades, seleccion]);
  const conDetalle = useMemo(() => unidades.filter((u) => detalles[u.id]), [unidades, detalles]);

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
          const unico: string | null = data.items.length === 1 ? data.items[0].id : null;
          setSeleccion(unico ? [unico] : []);
          setDetalles(unico ? { [unico]: detalleNuevo() } : {});
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
    if (!factura || !elegidos.length) return;

    setEnviando(true);
    setErrorEnvio(null);

    try {
      const res = await fetch("/api/servicio-tecnico/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: factura.factura.numero,
          rif: documento,
          sucursal: sucursalCid,
          productos: elegidos.map((i) => ({
            item_id: i.id,
            serial_manual: detalles[i.id].serialManual.trim(),
            reported_fault: detalles[i.id].falla.trim(),
            upload_token: detalles[i.id].uploadToken,
          })),
          client_phone: telefono.trim(),
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
            telefono: telefono.trim(),
            productos: elegidos.map((i) => ({
              nombre: i.nombre,
              serial: i.serial || detalles[i.id].serialManual.trim(),
            })),
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

  const telefonoValido = telefono.replace(/\D/g, "").length >= 7;
  const subiendo = elegidos.some((i) => detalles[i.id]?.adjuntos.some((a) => a.status === "uploading"));

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
        <div className="pt-formcard__body">
          <div className="pt-formcard__meta">
            <span className="pt-eyebrow">{t("eyebrow")}</span>
            <span className="pt-formcard__stepno">
              {t("form.stepOf", { n: paso, total: etiquetasPaso.length })}
            </span>
          </div>
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
              const errDoc = validarDocumento(pais, tipoDoc, rif);
              if (errDoc) {
                faltan.rif =
                  errDoc === "vacio"
                    ? t("form.required")
                    : errDoc === "caracteres"
                      ? t("form.docSoloNumeros")
                      : t("form.docLargo");
              }
              setErrores(faltan);
              if (Object.keys(faltan).length) {
                document.getElementById(Object.keys(faltan)[0])?.focus();
                return;
              }
              buscarFactura(numero, documento);
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
              {t(pais === "PA" ? "form.docLabelPa" : "form.rifLabel")}
            </label>
            {/* Tipo + número: el tipo sale de un select para que no haya que
                adivinar el formato; el número, con guiones o sin ellos. */}
            {/* En el telefono uno debajo del otro: lado a lado, el select quedaba
                en ~120 px y "V · Venezolano" se cortaba. */}
            <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-[minmax(10rem,42%)_minmax(0,1fr)]">
              <select
                id="tipoDoc"
                className="pt-input"
                aria-label={t("form.docTypeLabel")}
                value={tipoDoc}
                onChange={(e) => {
                  setTipoDoc(e.target.value);
                  setErrores((p) => ({ ...p, rif: "" }));
                }}
              >
                {tiposDocumento(pais).map((d) => (
                  <option key={d.codigo} value={d.codigo}>
                    {t(`form.docTipo.${pais}.${d.codigo}`)}
                  </option>
                ))}
              </select>
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
                aria-label={t("form.docNumberLabel")}
                placeholder={t(`form.docEjemplo.${pais}.${tipoDoc}`)}
                inputMode={tiposDocumento(pais).find((d) => d.codigo === tipoDoc)?.alfanumerico ? "text" : "numeric"}
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
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
                        buscarFactura(c.numero, documento);
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

          <div className="mt-4 space-y-6">
            {grupos.map((g) => (
              <section key={g.marca || "_"} aria-label={g.marca || t("form.otraMarca")}>
                <h2 className="flex items-baseline justify-between gap-3 text-sm font-bold uppercase tracking-wide text-[color:var(--portal-muted)]">
                  <span>{g.marca || t("form.otraMarca")}</span>
                  <span className="text-xs font-semibold normal-case tracking-normal">
                    {t("form.productosN", { n: g.productos.length })}
                  </span>
                </h2>
                <ul className="mt-2 space-y-3">
                  {g.productos.map((prod) => {
                    const primero = prod.unidades[0];
                    const garantia = primero.garantia ? textoGarantia(primero.garantia) : null;
                    // Una sola unidad sin serial: se marca el producto entero.
                    const unaSinSerial = prod.unidades.length === 1 && !primero.serial;
                    const cabecera = (
                      <span className="min-w-0">
                        <span className="block font-semibold">{prod.nombre}</span>
                        {prod.codigo && (
                          <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">{prod.codigo}</span>
                        )}
                        {(garantia || (unaSinSerial && primero.ya_reportado)) && (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {garantia && <GarantiaBadge compacto estado={garantia.estado} etiqueta={garantia.etiqueta} />}
                            {unaSinSerial && primero.ya_reportado && <BadgeReportado texto={t("form.duplicateBadge")} />}
                          </span>
                        )}
                      </span>
                    );
                    if (unaSinSerial) {
                      return (
                        <li key={prod.clave}>
                          <label className={`pt-choice ${seleccion.includes(primero.id) ? "pt-choice--on" : ""}`}>
                            <input
                              type="checkbox"
                              className="mt-1 accent-[color:var(--portal-primary)]"
                              checked={seleccion.includes(primero.id)}
                              onChange={() => alternar(primero.id)}
                            />
                            <span className="min-w-0">
                              {cabecera}
                              <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">
                                {primero.lleva_serial ? t("form.serialMissing") : t("form.units", { n: primero.cantidad })}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    }
                    return (
                      <li key={prod.clave} className="pt-panel">
                        {cabecera}
                        <p className="mt-3 text-xs font-semibold text-[color:var(--portal-muted)]">
                          {t("form.eligeSerial", { n: prod.unidades.length })}
                        </p>
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                          {prod.unidades.map((u) => (
                            <li key={u.id}>
                              <label className={`pt-choice py-2.5 ${seleccion.includes(u.id) ? "pt-choice--on" : ""}`}>
                                <input
                                  type="checkbox"
                                  className="mt-1 accent-[color:var(--portal-primary)]"
                                  checked={seleccion.includes(u.id)}
                                  onChange={() => alternar(u.id)}
                                />
                                <span className="min-w-0">
                                  <span className="block break-all font-mono text-sm">
                                    {u.serial
                                      ? u.serial
                                      : u.lleva_serial
                                        ? t("form.serialMissing")
                                        : t("form.units", { n: u.cantidad })}
                                  </span>
                                  {u.ya_reportado && (
                                    <span className="mt-1.5 flex">
                                      <BadgeReportado texto={t("form.duplicateBadge")} />
                                    </span>
                                  )}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {errores.seleccion && <MensajeError id="seleccion-error" texto={errores.seleccion} />}
          {elegidos.length > 0 && (
            <p className="pt-hint mt-6 font-semibold">{t("form.seleccionadosN", { n: elegidos.length })}</p>
          )}

          <button
            type="button"
            className={`pt-cta ${elegidos.length ? "mt-3" : "mt-7"}`}
            disabled={!elegidos.length}
            onClick={() => setPaso(3)}
          >
            {t("form.continue")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </section>
      )}

      {/* Montado desde que hay factura y oculto fuera del paso 3: si se
          desmontara al volver al paso 2, las fotos que se están subiendo se
          perderían de la pantalla aunque lleguen al servidor. */}
      {factura && (
        <section className={paso === 3 ? "mt-2" : "hidden"}>
          <h1 className="pt-h1">{t("form.faultTitle")}</h1>
          {elegidos.length > 1 && <p className="pt-sub">{t("form.faultHelpMulti")}</p>}

          <div className="mt-6 space-y-5">
            {conDetalle.map((item) => {
              // Clave estable para los id del DOM: la posición en la factura
              // (el id del item lleva el serial, con espacios a veces).
              const k = factura.items.indexOf(item);
              const d = detalles[item.id];
              const pos = elegidos.indexOf(item);
              const fallaCorta = d.falla.trim().length < 10;
              return (
                <div key={item.id} className={pos === -1 ? "hidden" : undefined}>
                  <div className="pt-panel">
                    {elegidos.length > 1 && (
                      <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--portal-muted)]">
                        {t("form.productoNdeM", { n: pos + 1, total: elegidos.length })}
                      </p>
                    )}
                    <p className={`text-sm ${elegidos.length > 1 ? "mt-1" : ""}`}>
                      <span className="font-semibold">{item.nombre}</span>
                      {item.serial && (
                        <span className="mt-1 block font-mono text-[color:var(--portal-muted)]">
                          {item.serial}
                        </span>
                      )}
                    </p>

                    {item.garantia && (
                      <div className="mt-4">
                        <GarantiaBadge
                          estado={textoGarantia(item.garantia).estado}
                          etiqueta={textoGarantia(item.garantia).etiqueta}
                          detalle={textoGarantia(item.garantia).detalle}
                        />
                      </div>
                    )}

                    {item.ya_reportado && (
                      <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="flex gap-2 font-semibold">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          {t("form.duplicateWarningTitle", { caso: item.rma_case_number ?? "" })}
                        </p>
                        <p className="mt-1.5">{t("form.duplicateWarningDesc")}</p>
                        <label className="mt-3 flex cursor-pointer items-start gap-2">
                          <input
                            id={`reenvio-${k}`}
                            type="checkbox"
                            className="mt-0.5 accent-amber-700"
                            checked={d.confirmarReenvio}
                            onChange={(e) => {
                              actualizar(item.id, { confirmarReenvio: e.target.checked });
                              setErrores((p) => ({ ...p, [`reenvio-${k}`]: "" }));
                            }}
                          />
                          <span>{t("form.duplicateConfirmLabel")}</span>
                        </label>
                        {errores[`reenvio-${k}`] && (
                          <MensajeError id={`reenvio-${k}-error`} texto={errores[`reenvio-${k}`]} />
                        )}
                      </div>
                    )}

                    {!item.serial && (
                      <div className="mt-5">
                        <label htmlFor={`serialManual-${k}`} className="pt-label">
                          {item.lleva_serial
                            ? t("form.serialManualLabel")
                            : t("form.serialManualLabelOpcional")}
                        </label>
                        <input
                          id={`serialManual-${k}`}
                          className="pt-input font-mono"
                          value={d.serialManual}
                          onChange={(e) => {
                            actualizar(item.id, { serialManual: e.target.value });
                            setErrores((p) => ({ ...p, [`serialManual-${k}`]: "" }));
                          }}
                          placeholder={t("form.serialManualPlaceholder")}
                          autoComplete="off"
                          aria-invalid={!!errores[`serialManual-${k}`]}
                        />
                        {errores[`serialManual-${k}`] && (
                          <MensajeError id={`serialManual-${k}-error`} texto={errores[`serialManual-${k}`]} />
                        )}
                        <p className="pt-hint">
                          {item.lleva_serial
                            ? t("form.serialManualHelp")
                            : t("form.serialManualHelpOpcional")}
                        </p>
                      </div>
                    )}

                    <div className="mt-5">
                      <label htmlFor={`falla-${k}`} className="pt-label">
                        {t("form.faultLabel")}
                      </label>
                      <textarea
                        id={`falla-${k}`}
                        rows={elegidos.length > 1 ? 4 : 5}
                        className="pt-textarea"
                        value={d.falla}
                        onChange={(e) => {
                          actualizar(item.id, { falla: e.target.value });
                          setErrores((p) => ({ ...p, [`falla-${k}`]: "" }));
                        }}
                        placeholder={t("form.faultPlaceholder")}
                        maxLength={5000}
                      />
                      {(errores[`falla-${k}`] || (d.falla.length > 0 && fallaCorta)) && (
                        <MensajeError id={`falla-${k}-error`} texto={t("form.faultTooShort")} />
                      )}
                    </div>

                    <div className="mt-5">
                      <p className="pt-label">{t("form.attachmentsLabelRequired")}</p>
                      <p className="pt-hint">{t("form.attachmentsHelp")}</p>
                      <div className="mt-3">
                        <AttachmentUploader
                          trackingToken={d.uploadToken}
                          onChange={(a) => {
                            actualizar(item.id, { adjuntos: a });
                            // El error de "falta una foto" solo se calcula al
                            // tocar "Enviar": se limpia apenas hay una subida.
                            if (a.some((x) => x.status === "done")) {
                              setErrores((p) => (p[`adjuntos-${k}`] ? { ...p, [`adjuntos-${k}`]: "" } : p));
                            }
                          }}
                          lang={locale === "en" ? "en" : "es"}
                        />
                      </div>
                      {errores[`adjuntos-${k}`] && (
                        <MensajeError id={`adjuntos-${k}`} texto={errores[`adjuntos-${k}`]} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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

          {/* Solo en el paso 3: el token del captcha vence a los pocos
              minutos, y montado desde el paso 2 podía llegar vencido. */}
          {paso === 3 && (
            <CaptchaTurnstile
              siteKey={turnstileSiteKey}
              locale={locale}
              onToken={setCaptchaToken}
              onDisponible={setCaptchaActivo}
            />
          )}

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
              for (const item of elegidos) {
                const k = factura.items.indexOf(item);
                const d = detalles[item.id];
                // Serial obligatorio solo cuando el producto SÍ lleva serial
                // de fábrica y el despacho no lo registró: ahí el cliente
                // puede leerlo de la etiqueta. En consumibles, cables y
                // accesorios —que Odoo marca como no rastreados— no existe
                // ningún serial que escribir, y exigirlo dejaría esos
                // productos sin poder reportarse.
                if (item.lleva_serial && !item.serial && !d.serialManual.trim())
                  faltan[`serialManual-${k}`] = t("form.serialManualRequired");
                // Ya tiene un caso de RMA: no se bloquea el reenvio (puede ser
                // una falla nueva o una que reaparece), pero hay que confirmar
                // a proposito en vez de dejar que se cree un duplicado sin
                // darse cuenta.
                if (item.ya_reportado && !d.confirmarReenvio)
                  faltan[`reenvio-${k}`] = t("form.duplicateConfirmRequired");
                if (d.falla.trim().length < 10) faltan[`falla-${k}`] = t("form.faultTooShort");
                // Al menos una foto o video por producto, ya subido. Los que
                // fallaron no cuentan: el servidor solo ve los que llegaron.
                if (!d.adjuntos.some((a) => a.status === "done"))
                  faltan[`adjuntos-${k}`] = t("form.attachmentsRequired");
              }
              if (!telefonoValido) faltan.telefono = t("form.phoneRequired");
              // Solo se exige captcha si está configurado; si no, no se puede
              // producir un token y bloquearía a todo el mundo.
              if (captchaActivo && !captchaToken)
                faltan.captcha = t("form.captchaRequired");
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

type Producto = { clave: string; nombre: string; codigo: string; unidades: Item[] };

/**
 * Marca -> producto -> unidades. Las marcas en orden alfabético y las sin
 * marca al final; los productos por nombre; las unidades, como vinieron.
 */
function agruparPorMarca(items: Item[]): { marca: string; productos: Producto[] }[] {
  const porMarca = new Map<string, Map<string, Producto>>();
  for (const i of items) {
    const marca = (i.marca || "").trim();
    const productos = porMarca.get(marca) ?? new Map<string, Producto>();
    const clave = String(i.producto_id || i.codigo || i.nombre);
    const prod = productos.get(clave) ?? { clave, nombre: i.nombre, codigo: i.codigo, unidades: [] };
    prod.unidades.push(i);
    productos.set(clave, prod);
    porMarca.set(marca, productos);
  }
  return [...porMarca.entries()]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b, "es")))
    .map(([marca, productos]) => ({
      marca,
      productos: [...productos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    }));
}

function BadgeReportado({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {texto}
    </span>
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
