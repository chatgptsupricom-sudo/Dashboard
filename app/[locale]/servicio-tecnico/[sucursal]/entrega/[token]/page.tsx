"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Store, Truck, PackageCheck, Check } from "lucide-react";

type Agencia = { id: number; nombre: string };

type Caso = {
  case_number: string;
  product_name: string;
  status: string;
  sucursal_nombre: string | null;
  entrega_metodo: "sucursal" | "ruta" | "agencia" | null;
  entrega_ciudad: string | null;
  entrega_agencia: string | null;
};

type Metodo = "sucursal" | "ruta" | "agencia";

export default function EntregaPage() {
  const t = useTranslations("servicioTecnico");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const sucursal = (params?.sucursal as string) || "";
  const token = (params?.token as string) || "";

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caso, setCaso] = useState<Caso | null>(null);
  const [agencias, setAgencias] = useState<Agencia[]>([]);

  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [ciudad, setCiudad] = useState("");
  const [agenciaElegida, setAgenciaElegida] = useState("");
  const [datosAgencia, setDatosAgencia] = useState({ nombre: "", cedula: "", telefono: "", direccion: "" });

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ metodo: Metodo; rutaNombre?: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const res = await fetch(`/api/servicio-tecnico/entrega/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelado) return;
        if (data.success && data.caso) {
          setCaso(data.caso);
          setAgencias(data.agencias || []);
        } else {
          setError(t("entrega_error_no_encontrado"));
        }
      } catch {
        if (!cancelado) setError(t("entrega_error_no_encontrado"));
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token, t]);

  async function elegir(body: any) {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch(`/api/servicio-tecnico/entrega/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorEnvio(data.error || t("entrega_error_generico"));
        return;
      }
      setResultado({ metodo: data.entrega_metodo, rutaNombre: data.rutaNombre });
    } catch {
      setErrorEnvio(t("entrega_error_generico"));
    } finally {
      setEnviando(false);
    }
  }

  function handleSucursal() {
    elegir({ metodo: "sucursal" });
  }

  function handleRuta(e: React.FormEvent) {
    e.preventDefault();
    if (!ciudad.trim()) return;
    elegir({ metodo: "ruta", ciudad: ciudad.trim() });
  }

  function handleAgencia(e: React.FormEvent) {
    e.preventDefault();
    if (!agenciaElegida || !datosAgencia.nombre || !datosAgencia.cedula || !datosAgencia.telefono || !datosAgencia.direccion) return;
    elegir({ metodo: "agencia", agencia: agenciaElegida, ...datosAgencia });
  }

  const yaElegido = resultado?.metodo || caso?.entrega_metodo || null;

  return (
    <div className="pt-page min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <div className="mb-7">
          <Link href={`/${locale}/servicio-tecnico/${sucursal}`} className="pt-back">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("consultar_link_volver")}
          </Link>
        </div>

        <p className="pt-eyebrow">{t("eyebrow")}</p>
        <h1 className="pt-h1">{t("entrega_titulo")}</h1>
        <p className="pt-sub">{t("entrega_subtitulo")}</p>

        <div className="mt-8">
          {cargando && (
            <div className="flex items-center justify-center gap-2 py-10 text-[color:var(--portal-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span className="text-sm font-medium">{t("consultar_buscando")}</span>
            </div>
          )}

          {!cargando && error && (
            <div className="pt-panel">
              <p className="pt-error">{error}</p>
            </div>
          )}

          {!cargando && caso && caso.status !== "reparado" && !yaElegido && (
            <div className="pt-panel">
              <p className="text-sm text-[color:var(--portal-ink)]">{t("entrega_no_listo")}</p>
            </div>
          )}

          {!cargando && caso && caso.status === "reparado" && yaElegido && (
            <div className="pt-panel">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden />
                <p className="text-sm font-semibold text-emerald-800">
                  {yaElegido === "sucursal" && t("entrega_confirmado_sucursal")}
                  {yaElegido === "ruta" && t("entrega_confirmado_ruta", { ciudad: caso.entrega_ciudad || "" })}
                  {yaElegido === "agencia" && t("entrega_confirmado_agencia", { agencia: caso.entrega_agencia || "" })}
                </p>
              </div>
              <p className="mt-4 text-sm text-[color:var(--portal-muted)]">{t("entrega_confirmado_nota")}</p>
            </div>
          )}

          {!cargando && caso && caso.status === "reparado" && !yaElegido && (
            <div className="space-y-4">
              <div className="pt-panel">
                <p className="pt-panel__eyebrow">{t("consultar_datos_reporte")}</p>
                <dl className="mt-3">
                  {caso.product_name && (
                    <div className="pt-summary__row">
                      <dt>{t("consultar_producto")}</dt>
                      <dd className="break-words">{caso.product_name}</dd>
                    </div>
                  )}
                  <div className="pt-summary__row">
                    <dt>{t("consultar_status_titulo")}</dt>
                    <dd className="font-mono">{caso.case_number}</dd>
                  </div>
                </dl>
              </div>

              <div className="pt-panel">
                <p className="pt-panel__eyebrow">{t("entrega_elegir_titulo")}</p>

                <div className="mt-4 space-y-3">
                  <label className={`pt-choice ${metodo === "sucursal" ? "pt-choice--on" : ""}`}>
                    <input
                      type="radio"
                      name="metodo"
                      className="mt-1 accent-[color:var(--portal-primary)]"
                      checked={metodo === "sucursal"}
                      onChange={() => setMetodo("sucursal")}
                    />
                    <span className="min-w-0 flex items-start gap-2">
                      <Store className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--portal-primary)]" aria-hidden />
                      <span>
                        <span className="block font-semibold">{t("entrega_opcion_sucursal")}</span>
                        <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">
                          {caso.sucursal_nombre
                            ? t("entrega_opcion_sucursal_desc", { sucursal: caso.sucursal_nombre })
                            : t("entrega_opcion_sucursal_desc_generico")}
                        </span>
                      </span>
                    </span>
                  </label>

                  <label className={`pt-choice ${metodo === "ruta" ? "pt-choice--on" : ""}`}>
                    <input
                      type="radio"
                      name="metodo"
                      className="mt-1 accent-[color:var(--portal-primary)]"
                      checked={metodo === "ruta"}
                      onChange={() => setMetodo("ruta")}
                    />
                    <span className="min-w-0 flex items-start gap-2">
                      <Truck className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--portal-primary)]" aria-hidden />
                      <span>
                        <span className="block font-semibold">{t("entrega_opcion_ruta")}</span>
                        <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">
                          {t("entrega_opcion_ruta_desc")}
                        </span>
                      </span>
                    </span>
                  </label>

                  <label className={`pt-choice ${metodo === "agencia" ? "pt-choice--on" : ""}`}>
                    <input
                      type="radio"
                      name="metodo"
                      className="mt-1 accent-[color:var(--portal-primary)]"
                      checked={metodo === "agencia"}
                      onChange={() => setMetodo("agencia")}
                    />
                    <span className="min-w-0 flex items-start gap-2">
                      <PackageCheck className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--portal-primary)]" aria-hidden />
                      <span>
                        <span className="block font-semibold">{t("entrega_opcion_agencia")}</span>
                        <span className="mt-1 block text-sm text-[color:var(--portal-muted)]">
                          {t("entrega_opcion_agencia_desc")}
                        </span>
                      </span>
                    </span>
                  </label>
                </div>

                {metodo === "sucursal" && (
                  <div className="mt-5">
                    <button onClick={handleSucursal} disabled={enviando} className="pt-cta">
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("entrega_confirmar")}
                    </button>
                  </div>
                )}

                {metodo === "ruta" && (
                  <form onSubmit={handleRuta} className="mt-5">
                    <label className="pt-label">{t("entrega_ciudad_label")}</label>
                    <input
                      type="text"
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                      placeholder={t("entrega_ciudad_placeholder")}
                      className="pt-input"
                      autoComplete="off"
                    />
                    <button type="submit" disabled={enviando || !ciudad.trim()} className="pt-cta mt-4">
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("entrega_confirmar")}
                    </button>
                  </form>
                )}

                {metodo === "agencia" && (
                  <form onSubmit={handleAgencia} className="mt-5 space-y-4">
                    <div>
                      <label className="pt-label">{t("entrega_agencia_label")}</label>
                      <select
                        value={agenciaElegida}
                        onChange={(e) => setAgenciaElegida(e.target.value)}
                        className="pt-input"
                      >
                        <option value="">{t("entrega_agencia_placeholder")}</option>
                        {agencias.map((a) => (
                          <option key={a.id} value={a.nombre}>{a.nombre}</option>
                        ))}
                        <option value="otra">{t("entrega_agencia_otra")}</option>
                      </select>
                    </div>
                    <div>
                      <label className="pt-label">{t("entrega_nombre_label")}</label>
                      <input
                        type="text"
                        value={datosAgencia.nombre}
                        onChange={(e) => setDatosAgencia((d) => ({ ...d, nombre: e.target.value }))}
                        className="pt-input"
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <label className="pt-label">{t("entrega_cedula_label")}</label>
                      <input
                        type="text"
                        value={datosAgencia.cedula}
                        onChange={(e) => setDatosAgencia((d) => ({ ...d, cedula: e.target.value }))}
                        className="pt-input"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="pt-label">{t("entrega_telefono_label")}</label>
                      <input
                        type="text"
                        value={datosAgencia.telefono}
                        onChange={(e) => setDatosAgencia((d) => ({ ...d, telefono: e.target.value }))}
                        className="pt-input"
                        autoComplete="tel"
                      />
                    </div>
                    <div>
                      <label className="pt-label">{t("entrega_direccion_label")}</label>
                      <input
                        type="text"
                        value={datosAgencia.direccion}
                        onChange={(e) => setDatosAgencia((d) => ({ ...d, direccion: e.target.value }))}
                        className="pt-input"
                        autoComplete="street-address"
                      />
                    </div>
                    <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {t("entrega_pago_destino")}
                    </p>
                    <button
                      type="submit"
                      disabled={enviando || !agenciaElegida || !datosAgencia.nombre || !datosAgencia.cedula || !datosAgencia.telefono || !datosAgencia.direccion}
                      className="pt-cta"
                    >
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("entrega_confirmar")}
                    </button>
                  </form>
                )}

                {errorEnvio && <p className="pt-error mt-4">{errorEnvio}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
