"use client";

import { CaptchaTurnstile } from "@/components/servicio-tecnico/captcha-turnstile";
import { Aviso, Dato, MensajeError, Pasos } from "@/components/servicio-tecnico/form-ui";
import type { ProductoCliente } from "@/lib/notas-credito/cliente";
import { MOTIVOS_CLIENTE, type MotivoCliente } from "@/lib/notas-credito/tipos";
import { componerDocumento, paisDeSucursal, tipoPorDefecto, tiposDocumento, validarDocumento } from "@/lib/servicio-tecnico/documento";
import { ArrowLeft, ArrowRight, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Coincidencia = { numero: string; fecha: string | null; compania: string };
type Factura = { factura: { numero: string; fecha: string | null }; cliente: string; productos: ProductoCliente[] };
/** Lo elegido de cada línea de la factura: seriales marcados, escritos a mano o cantidad. */
type Eleccion = { seriales: string[]; manual: string; cantidad: string };

const MAX_PRODUCTOS = 30;
const sinMarca = (m: string) => !m || m === "Sin marca";
const serialesManuales = (t: string) => [...new Set(t.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))];

/**
 * Solicitud de nota de crédito del cliente, servicio aparte en su dominio
 * (lib/notas-credito/cliente.ts, lib/notas-credito/hostCliente.ts):
 *   1. factura + documento (igual que el reporte de servicio técnico)
 *   2. productos de la factura agrupados por marca, con el serial de cada unidad
 *   3. motivo, detalle y contacto
 * Al enviar va a la página de seguimiento con su token. Sin precios: el monto
 * lo calcula Supricom.
 */
export function FormularioNC({
  locale,
  turnstileSiteKey = "",
  sucursalCid,
  base,
}: {
  locale: string;
  turnstileSiteKey?: string;
  sucursalCid: number;
  /** /<idioma>/notas-credito/<sucursal> en el dominio propio, /<idioma>/credito-clientes/<sucursal> en otro. */
  base: string;
}) {
  const t = useTranslations("creditoClientes");
  // Los textos del formulario de factura + documento son los del portal de servicio técnico.
  const tf = useTranslations("servicioTecnico");
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  // Paso 1
  const pais = paisDeSucursal(sucursalCid);
  const [numero, setNumero] = useState("");
  const [tipoDoc, setTipoDoc] = useState(() => tipoPorDefecto(pais));
  const [rif, setRif] = useState("");
  const documento = componerDocumento(pais, tipoDoc, rif);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null);

  // Paso 2
  const [factura, setFactura] = useState<Factura | null>(null);
  const [elegidos, setElegidos] = useState<Record<number, Eleccion>>({});

  // Paso 3
  const [motivo, setMotivo] = useState<MotivoCliente | "">("");
  const [detalle, setDetalle] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaActivo, setCaptchaActivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Al cambiar de paso, arriba (en móvil el botón queda al final de la lista).
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [paso]);

  const grupos = useMemo(() => {
    const m = new Map<string, ProductoCliente[]>();
    for (const p of factura?.productos ?? []) m.set(p.marca, [...(m.get(p.marca) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => (sinMarca(a) ? 1 : sinMarca(b) ? -1 : a.localeCompare(b, "es")));
  }, [factura]);

  const conSerialesOdoo = (p: ProductoCliente) => p.con_serial && p.seriales.length > 0;
  const serialesDe = (p: ProductoCliente, e: Eleccion) => (conSerialesOdoo(p) ? e.seriales : p.con_serial ? serialesManuales(e.manual) : []);
  const cantidadDe = (p: ProductoCliente, e: Eleccion) => (p.con_serial ? serialesDe(p, e).length : Number(e.cantidad) || 0);

  const lista = (factura?.productos ?? []).filter((p) => elegidos[p.linea_id]);

  async function buscarFactura(valor: string) {
    if (!valor.trim() || !documento.trim()) return;
    setBuscando(true);
    setErrorBusqueda(null);
    setCoincidencias(null);
    try {
      const res = await fetch(
        `/api/credito-clientes/factura?numero=${encodeURIComponent(valor.trim())}&rif=${encodeURIComponent(documento.trim())}&sucursal=${sucursalCid}`,
      );
      const data = await res.json().catch(() => ({}));
      if (data.estado === "ok") {
        setFactura(data);
        setElegidos({});
        setPaso(2);
        return;
      }
      if (data.estado === "ambiguo") {
        setCoincidencias(data.coincidencias);
        return;
      }
      setErrorBusqueda(data.estado === "no_encontrada" ? tf("form.notFound") : data.error || tf("form.networkError"));
    } catch {
      setErrorBusqueda(tf("form.networkError"));
    } finally {
      setBuscando(false);
    }
  }

  function alternar(p: ProductoCliente) {
    setErrores((x) => ({ ...x, productos: "" }));
    setElegidos((x) => {
      if (x[p.linea_id]) {
        const { [p.linea_id]: _fuera, ...resto } = x;
        return resto;
      }
      if (Object.keys(x).length >= MAX_PRODUCTOS) return x;
      const libres = p.seriales.filter((s) => !s.ocupado);
      return {
        ...x,
        [p.linea_id]: {
          seriales: conSerialesOdoo(p) && libres.length === 1 ? [libres[0].serial] : [],
          manual: "",
          cantidad: p.con_serial ? "" : String(Math.min(1, p.disponible) || ""),
        },
      };
    });
  }

  const cambiar = (id: number, c: Partial<Eleccion>) => setElegidos((x) => ({ ...x, [id]: { ...x[id], ...c } }));

  /** Primer problema de los productos elegidos (para el paso 2). */
  function problemaProductos(): string {
    if (!lista.length) return t("eligeProducto");
    for (const p of lista) {
      const n = cantidadDe(p, elegidos[p.linea_id]);
      if (n <= 0) return t(p.con_serial ? "faltaSerial" : "faltaCantidad", { producto: p.producto });
      if (n > p.disponible) return t("maxCantidad", { producto: p.producto, n: p.disponible });
    }
    return "";
  }

  async function enviar() {
    if (!factura) return;
    const faltan: Record<string, string> = {};
    if (!motivo) faltan.motivo = t("motivoRequerido");
    if (detalle.trim().length < 15) faltan.detalle = t("detalleCorto");
    if (telefono.replace(/\D/g, "").length < 7) faltan.telefono = tf("form.phoneRequired");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) faltan.email = t("emailInvalido");
    if (captchaActivo && !captchaToken) faltan.captcha = tf("form.captchaRequired");
    setErrores(faltan);
    if (Object.keys(faltan).length) {
      document.getElementById(Object.keys(faltan)[0])?.focus();
      return;
    }
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch("/api/credito-clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: factura.factura.numero,
          rif: documento,
          sucursal: sucursalCid,
          lineas: lista.map((p) => {
            const e = elegidos[p.linea_id];
            return { linea_id: p.linea_id, cantidad: cantidadDe(p, e), seriales: serialesDe(p, e) };
          }),
          motivo_tipo: motivo,
          detalle: detalle.trim(),
          telefono: telefono.trim(),
          email: email.trim(),
          captcha_token: captchaToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorEnvio(data.error || tf("form.sendError"));
        return;
      }
      router.push(`${base}/${encodeURIComponent(data.tracking_token)}`);
    } catch {
      setErrorEnvio(tf("form.networkError"));
    } finally {
      setEnviando(false);
    }
  }

  const etiquetas = [t("step1"), t("step2"), t("step3")];

  return (
    <div className="pt-page pt-page--brand min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <div className="mb-6">
          {paso === 1 ? (
            <a href={base.slice(0, base.lastIndexOf("/"))} className="pt-back">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {tf("back")}
            </a>
          ) : (
            <button type="button" onClick={() => setPaso((paso - 1) as 1 | 2)} className="pt-back">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {tf("back")}
            </button>
          )}
        </div>

        <div className="pt-formcard">
          <div className="pt-formcard__body">
            <div className="pt-formcard__meta">
              <span className="pt-eyebrow">{t("eyebrow")}</span>
              <span className="pt-formcard__stepno">{tf("form.stepOf", { n: paso, total: etiquetas.length })}</span>
            </div>
            <Pasos actual={paso} etiquetas={etiquetas} />

            {paso === 1 && (
              <section className="mt-2">
                <h1 className="pt-h1">{t("titulo")}</h1>
                <p className="pt-sub">{t("subtitulo")}</p>
                <form
                  className="mt-7"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const faltan: Record<string, string> = {};
                    if (!numero.trim()) faltan.numero = tf("form.required");
                    const errDoc = validarDocumento(pais, tipoDoc, rif);
                    if (errDoc) {
                      faltan.rif = errDoc === "vacio" ? tf("form.required") : errDoc === "caracteres" ? tf("form.docSoloNumeros") : tf("form.docLargo");
                    }
                    setErrores(faltan);
                    if (Object.keys(faltan).length) {
                      document.getElementById(Object.keys(faltan)[0])?.focus();
                      return;
                    }
                    buscarFactura(numero);
                  }}
                >
                  <label htmlFor="numero" className="pt-label">
                    {tf("form.invoiceLabel")}
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
                    placeholder={tf("form.invoicePlaceholder")}
                    autoComplete="off"
                    autoFocus
                    enterKeyHint="search"
                  />
                  {errores.numero && <MensajeError id="numero-error" texto={errores.numero} />}

                  <label htmlFor="rif" className="pt-label mt-5">
                    {tf(pais === "PA" ? "form.docLabelPa" : "form.rifLabel")}
                  </label>
                  <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-[minmax(10rem,42%)_minmax(0,1fr)]">
                    <select
                      id="tipoDoc"
                      className="pt-input"
                      aria-label={tf("form.docTypeLabel")}
                      value={tipoDoc}
                      onChange={(e) => {
                        setTipoDoc(e.target.value);
                        setErrores((p) => ({ ...p, rif: "" }));
                      }}
                    >
                      {tiposDocumento(pais).map((d) => (
                        <option key={d.codigo} value={d.codigo}>
                          {tf(`form.docTipo.${pais}.${d.codigo}`)}
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
                      aria-label={tf("form.docNumberLabel")}
                      placeholder={tf(`form.docEjemplo.${pais}.${tipoDoc}`)}
                      inputMode={tiposDocumento(pais).find((d) => d.codigo === tipoDoc)?.alfanumerico ? "text" : "numeric"}
                      autoComplete="off"
                      enterKeyHint="search"
                    />
                  </div>
                  {errores.rif && <MensajeError id="rif-error" texto={errores.rif} />}
                  <p className="pt-hint">{tf("form.rifHelp")}</p>

                  <button type="submit" className="pt-cta mt-6" disabled={buscando}>
                    {buscando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {tf("form.searching")}
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" aria-hidden />
                        {tf("form.searchCta")}
                      </>
                    )}
                  </button>
                </form>

                {coincidencias && (
                  <div className="pt-panel mt-6">
                    <p className="text-sm font-semibold">{tf("form.multipleTitle")}</p>
                    <p className="pt-hint">{tf("form.multipleHelp")}</p>
                    <ul className="mt-3 space-y-2">
                      {coincidencias.map((c) => (
                        <li key={c.numero}>
                          <button
                            type="button"
                            onClick={() => {
                              setNumero(c.numero);
                              buscarFactura(c.numero);
                            }}
                            className="w-full rounded-[11px] border border-[color:var(--portal-line-strong)] px-4 py-3 text-left transition-colors hover:border-[color:var(--portal-primary)] hover:bg-[color:var(--portal-primary-soft)]"
                          >
                            <span className="font-semibold">{c.numero}</span>
                            <span className="block text-sm text-[color:var(--portal-muted)]">{[c.fecha, c.compania].filter(Boolean).join(" · ")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {errorBusqueda && <Aviso texto={errorBusqueda} ayuda={tf("form.emailInstead")} />}
              </section>
            )}

            {paso === 2 && factura && (
              <section className="mt-2">
                <h1 className="pt-h1">{t("productosTitulo")}</h1>
                <dl className="pt-panel mt-6">
                  <Dato etiqueta={tf("form.invoiceLabel")} valor={factura.factura.numero} />
                  <Dato etiqueta={tf("form.client")} valor={factura.cliente} />
                  {factura.factura.fecha && <Dato etiqueta={tf("form.date")} valor={factura.factura.fecha} />}
                </dl>
                <p className="pt-sub mt-6">{t("productosAyuda")}</p>

                <div className="mt-4 space-y-6">
                  {grupos.map(([marca, productos]) => (
                    <section key={marca} aria-label={sinMarca(marca) ? tf("form.otraMarca") : marca}>
                      <h2 className="flex items-baseline justify-between gap-3 text-sm font-bold uppercase tracking-wide text-[color:var(--portal-muted)]">
                        <span>{sinMarca(marca) ? tf("form.otraMarca") : marca}</span>
                        <span className="text-xs font-semibold normal-case tracking-normal">{tf("form.productosN", { n: productos.length })}</span>
                      </h2>
                      <ul className="mt-2 space-y-3">
                        {productos.map((p) => {
                          const e = elegidos[p.linea_id];
                          const agotado = p.disponible <= 0;
                          return (
                            <li key={p.linea_id} className={e ? "pt-panel" : ""}>
                              <label className={`pt-choice ${e ? "pt-choice--on" : ""} ${agotado ? "opacity-50" : ""}`}>
                                <input
                                  type="checkbox"
                                  className="mt-1 accent-[color:var(--portal-primary)]"
                                  checked={!!e}
                                  disabled={agotado && !e}
                                  onChange={() => alternar(p)}
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold">{p.producto}</span>
                                  {p.codigo && <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">{p.codigo}</span>}
                                  <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">
                                    {agotado ? t("sinDisponible") : t("facturados", { n: p.cantidad })}
                                  </span>
                                </span>
                              </label>
                              {e && (
                                <div className="mt-3">
                                  {conSerialesOdoo(p) ? (
                                    <>
                                      <p className="text-xs font-semibold text-[color:var(--portal-muted)]">{t("serialesTitulo")}</p>
                                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {p.seriales.map((s) => {
                                          const marcado = e.seriales.includes(s.serial);
                                          return (
                                            <li key={s.serial}>
                                              <label className={`pt-choice py-2.5 ${marcado ? "pt-choice--on" : ""} ${s.ocupado ? "opacity-50" : ""}`}>
                                                <input
                                                  type="checkbox"
                                                  className="mt-1 accent-[color:var(--portal-primary)]"
                                                  checked={marcado}
                                                  disabled={s.ocupado}
                                                  onChange={() =>
                                                    cambiar(p.linea_id, {
                                                      seriales: marcado ? e.seriales.filter((x) => x !== s.serial) : [...e.seriales, s.serial],
                                                    })
                                                  }
                                                />
                                                <span className="min-w-0 break-all font-mono text-sm">
                                                  {s.serial}
                                                  {s.ocupado && (
                                                    <span className="block font-sans text-xs text-[color:var(--portal-muted)]">{t("serialOcupado")}</span>
                                                  )}
                                                </span>
                                              </label>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </>
                                  ) : p.con_serial ? (
                                    <>
                                      <label htmlFor={`manual-${p.linea_id}`} className="pt-label">
                                        {t("serialesManual")}
                                      </label>
                                      <textarea
                                        id={`manual-${p.linea_id}`}
                                        rows={2}
                                        className="pt-textarea font-mono"
                                        value={e.manual}
                                        onChange={(ev) => cambiar(p.linea_id, { manual: ev.target.value })}
                                      />
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <label htmlFor={`cant-${p.linea_id}`} className="pt-label !mt-0">
                                        {t("cantidad")}
                                      </label>
                                      <input
                                        id={`cant-${p.linea_id}`}
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={p.disponible}
                                        step="any"
                                        className="pt-input !w-28"
                                        value={e.cantidad}
                                        onChange={(ev) => cambiar(p.linea_id, { cantidad: ev.target.value })}
                                      />
                                      <span className="text-sm text-[color:var(--portal-muted)]">{t("deN", { n: p.disponible })}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>

                {errores.productos && <MensajeError id="productos-error" texto={errores.productos} />}
                {lista.length > 0 && <p className="pt-hint mt-4">{t("seleccionados", { n: lista.length })}</p>}
                <button
                  type="button"
                  className="pt-cta mt-6"
                  onClick={() => {
                    const problema = problemaProductos();
                    setErrores((x) => ({ ...x, productos: problema }));
                    if (!problema) setPaso(3);
                  }}
                >
                  {tf("form.continue")}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </section>
            )}

            {paso === 3 && factura && (
              <section className="mt-2">
                <h1 className="pt-h1">{t("motivoTitulo")}</h1>
                <fieldset className="mt-6">
                  <legend className="pt-label">{t("motivoLabel")}</legend>
                  <div className="mt-2 space-y-2">
                    {MOTIVOS_CLIENTE.map((m, i) => (
                      <label key={m} className={`pt-choice py-2.5 ${motivo === m ? "pt-choice--on" : ""}`}>
                        <input
                          id={i === 0 ? "motivo" : undefined}
                          type="radio"
                          name="motivo"
                          className="mt-1 accent-[color:var(--portal-primary)]"
                          checked={motivo === m}
                          onChange={() => {
                            setMotivo(m);
                            setErrores((x) => ({ ...x, motivo: "" }));
                          }}
                        />
                        <span>{t(`motivos.${m}`)}</span>
                      </label>
                    ))}
                  </div>
                  {errores.motivo && <MensajeError id="motivo-error" texto={errores.motivo} />}
                </fieldset>

                <div className="mt-6">
                  <label htmlFor="detalle" className="pt-label">
                    {t("detalleLabel")}
                  </label>
                  <textarea
                    id="detalle"
                    rows={5}
                    className="pt-textarea"
                    value={detalle}
                    maxLength={3000}
                    onChange={(e) => {
                      setDetalle(e.target.value);
                      setErrores((x) => ({ ...x, detalle: "" }));
                    }}
                    placeholder={t("detallePlaceholder")}
                  />
                  {errores.detalle && <MensajeError id="detalle-error" texto={errores.detalle} />}
                </div>

                <div className="mt-6">
                  <label htmlFor="telefono" className="pt-label">
                    {tf("form.phoneLabel")}
                  </label>
                  <input
                    id="telefono"
                    type="tel"
                    inputMode="tel"
                    className="pt-input"
                    value={telefono}
                    onChange={(e) => {
                      setTelefono(e.target.value);
                      setErrores((x) => ({ ...x, telefono: "" }));
                    }}
                    placeholder="0414 1234567"
                  />
                  {errores.telefono && <MensajeError id="telefono-error" texto={errores.telefono} />}
                </div>

                <div className="mt-5">
                  <label htmlFor="email" className="pt-label">
                    {t("emailLabel")}
                  </label>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    className="pt-input"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrores((x) => ({ ...x, email: "" }));
                    }}
                    autoComplete="email"
                  />
                  {errores.email && <MensajeError id="email-error" texto={errores.email} />}
                </div>

                <CaptchaTurnstile siteKey={turnstileSiteKey} locale={locale} onToken={setCaptchaToken} onDisponible={setCaptchaActivo} />
                {errores.captcha && <MensajeError id="captcha-error" texto={errores.captcha} />}
                {errorEnvio && <Aviso texto={errorEnvio} ayuda={tf("form.emailInstead")} />}

                <button type="button" className="pt-cta mt-7" disabled={enviando} onClick={enviar}>
                  {enviando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {t("enviando")}
                    </>
                  ) : (
                    t("enviar")
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
