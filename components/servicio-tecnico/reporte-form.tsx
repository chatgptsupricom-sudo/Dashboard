"use client";

import { GarantiaBadge } from "@/components/servicio-tecnico/garantia-badge";
import AttachmentUploader, {
  type AdjuntoEstado,
} from "@/components/portal-rma/AttachmentUploader";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Phone,
  Search,
} from "lucide-react";
import { formatearFechaCalendario } from "@/lib/servicio-tecnico/fechas";
import { RESUMEN_KEY } from "@/lib/servicio-tecnico/resumen";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TELEFONO = "+584228008204";

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

export function ReporteForm({ locale }: { locale: string }) {
  const t = useTranslations("servicioTecnico");
  const router = useRouter();

  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  // Paso 1
  const [numero, setNumero] = useState("");
  const [rif, setRif] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null);

  // Paso 2
  const [factura, setFactura] = useState<Factura | null>(null);
  const [itemId, setItemId] = useState("");

  // Paso 3
  const [falla, setFalla] = useState("");
  const [telefono, setTelefono] = useState("");
  const [adjuntos, setAdjuntos] = useState<AdjuntoEstado[]>([]);
  const [enviando, setEnviando] = useState(false);
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
        clave === "en_garantia" && fecha
          ? t("garantia.en_garantia_detalle", { fecha })
          : t(`garantia.${clave}_detalle`),
    };
  };

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
          )}&rif=${encodeURIComponent(doc)}`,
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
    [t],
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
          item_id: item.id,
          odoo_product_id: item.producto_id,
          serial: item.serial,
          reported_fault: falla.trim(),
          client_phone: telefono.trim(),
          upload_token: uploadToken,
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
        `/${locale}/servicio-tecnico/confirmacion?ticket=${encodeURIComponent(
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

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
      <Volver paso={paso} setPaso={setPaso} locale={locale} label={t("back")} />
      <Pasos actual={paso} etiquetas={[t("form.step1"), t("form.step2"), t("form.step3")]} />

      {paso === 1 && (
        <section className="mt-8">
          <h1 className="text-[1.75rem] sm:text-[2.25rem]">{t("form.invoiceTitle")}</h1>
          <p className="mt-3 text-[color:var(--portal-muted)]">
            {t("form.invoiceHelp")}
          </p>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              buscarFactura(numero, rif);
            }}
          >
            <label htmlFor="numero" className="text-sm font-semibold">
              {t("form.invoiceLabel")}
            </label>
            <input
              id="numero"
              className="portal-field mt-2"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder={t("form.invoicePlaceholder")}
              autoComplete="off"
              autoFocus
              enterKeyHint="search"
            />
            <label htmlFor="rif" className="mt-5 block text-sm font-semibold">
              {t("form.rifLabel")}
            </label>
            <input
              id="rif"
              className="portal-field mt-2"
              value={rif}
              onChange={(e) => setRif(e.target.value)}
              placeholder={t("form.rifPlaceholder")}
              autoComplete="off"
              enterKeyHint="search"
            />
            <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
              {t("form.rifHelp")}
            </p>

            <button
              type="submit"
              className="portal-btn portal-btn-primary mt-5 w-full"
              disabled={buscando || !numero.trim() || !rif.trim()}
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
            <div className="mt-6 rounded-[10px] border border-[color:var(--portal-line)] p-4">
              <p className="text-sm font-semibold">{t("form.multipleTitle")}</p>
              <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
                {t("form.multipleHelp")}
              </p>
              <ul className="mt-3 space-y-2">
                {coincidencias.map((c) => (
                  <li key={c.numero}>
                    <button
                      type="button"
                      onClick={() => {
                        setNumero(c.numero);
                        buscarFactura(c.numero, rif);
                      }}
                      className="w-full rounded-[10px] border border-[color:var(--portal-line)] px-4 py-3 text-left hover:border-[color:var(--portal-primary)]"
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

          {errorBusqueda && <Aviso texto={errorBusqueda} ayuda={t("form.callInstead")} />}
        </section>
      )}

      {paso === 2 && factura && (
        <section className="mt-8">
          <h1 className="text-[1.75rem] sm:text-[2.25rem]">{t("form.productTitle")}</h1>

          <dl className="mt-5 rounded-[10px] bg-[color:var(--portal-surface-soft)] p-4 text-sm">
            <Dato etiqueta={t("form.invoiceLabel")} valor={factura.factura.numero} />
            <Dato etiqueta={t("form.client")} valor={factura.cliente.nombre} />
            {factura.factura.fecha && (
              <Dato etiqueta={t("form.date")} valor={factura.factura.fecha} />
            )}
          </dl>

          <p className="mt-6 text-[color:var(--portal-muted)]">{t("form.productHelp")}</p>

          <ul className="mt-4 space-y-3">
            {factura.items.map((i) => (
              <li key={i.id}>
                <label
                  className={`flex cursor-pointer gap-3 rounded-[10px] border p-4 transition-colors ${
                    itemId === i.id
                      ? "border-[color:var(--portal-primary)] bg-[color:var(--portal-primary-soft)]"
                      : "border-[color:var(--portal-line)]"
                  }`}
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
                    {i.garantia && (
                      <span className="mt-2 block">
                        <GarantiaBadge
                          compacto
                          estado={textoGarantia(i.garantia).estado}
                          etiqueta={textoGarantia(i.garantia).etiqueta}
                        />
                      </span>
                    )}
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
            className="portal-btn portal-btn-primary mt-6 w-full"
            disabled={!itemId}
            onClick={() => setPaso(3)}
          >
            {t("form.continue")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </section>
      )}

      {paso === 3 && factura && item && (
        <section className="mt-8">
          <h1 className="text-[1.75rem] sm:text-[2.25rem]">{t("form.faultTitle")}</h1>

          <p className="mt-4 rounded-[10px] bg-[color:var(--portal-surface-soft)] p-4 text-sm">
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

          <div className="mt-6">
            <label htmlFor="falla" className="text-sm font-semibold">
              {t("form.faultLabel")}
            </label>
            <textarea
              id="falla"
              rows={5}
              className="mt-2 w-full rounded-[10px] border border-[color:var(--portal-line)] p-3 focus:border-[color:var(--portal-primary)] focus:outline-none"
              value={falla}
              onChange={(e) => setFalla(e.target.value)}
              placeholder={t("form.faultPlaceholder")}
              maxLength={5000}
            />
            {falla.length > 0 && !fallaValida && (
              <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
                {t("form.faultTooShort")}
              </p>
            )}
          </div>

          <div className="mt-5">
            <label htmlFor="telefono" className="text-sm font-semibold">
              {t("form.phoneLabel")}
            </label>
            <input
              id="telefono"
              type="tel"
              inputMode="tel"
              className="portal-field mt-2"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="0414 1234567"
            />
            {factura.cliente.telefono && (
              <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
                {t("form.phoneOnFile", { telefono: factura.cliente.telefono })}
              </p>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold">{t("form.attachmentsLabel")}</p>
            <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
              {t("form.attachmentsHelp")}
            </p>
            <div className="mt-3">
              <AttachmentUploader
                trackingToken={uploadToken}
                onChange={setAdjuntos}
                lang={locale === "en" ? "en" : "es"}
              />
            </div>
          </div>

          {errorEnvio && <Aviso texto={errorEnvio} ayuda={t("form.callInstead")} />}

          <button
            type="button"
            className="portal-btn portal-btn-primary mt-6 w-full"
            disabled={enviando || subiendo || !fallaValida || !telefonoValido}
            onClick={enviar}
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
  );
}

function Volver({
  paso,
  setPaso,
  locale,
  label,
}: {
  paso: 1 | 2 | 3;
  setPaso: (p: 1 | 2 | 3) => void;
  locale: string;
  label: string;
}) {
  if (paso === 1) {
    return (
      <a
        href={`/${locale}/servicio-tecnico`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-primary)]"
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
      className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-primary)]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

function Pasos({ actual, etiquetas }: { actual: number; etiquetas: string[] }) {
  return (
    <ol className="mt-6 flex gap-2" aria-label={etiquetas.join(", ")}>
      {etiquetas.map((etiqueta, i) => {
        const n = i + 1;
        return (
          <li key={etiqueta} className="flex-1">
            <span
              className={`block h-1 rounded-full ${
                n <= actual
                  ? "bg-[color:var(--portal-primary)]"
                  : "bg-[color:var(--portal-line)]"
              }`}
            />
            <span
              className={`mt-2 block text-xs ${
                n === actual
                  ? "font-semibold text-[color:var(--portal-primary)]"
                  : "text-[color:var(--portal-muted)]"
              }`}
            >
              {etiqueta}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-[color:var(--portal-muted)]">{etiqueta}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}

function Aviso({ texto, ayuda }: { texto: string; ayuda: string }) {
  return (
    <div className="mt-6 rounded-[10px] border border-[color:var(--portal-line)] bg-[color:var(--portal-surface-soft)] p-4">
      <p className="flex gap-2 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{texto}</span>
      </p>
      <a
        href={`tel:${TELEFONO}`}
        className="portal-btn portal-btn-outline mt-3 w-full"
      >
        <Phone className="h-4 w-4" aria-hidden />
        {ayuda}
      </a>
    </div>
  );
}
