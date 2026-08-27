"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, PenLine, Trash2 } from "lucide-react";
import SignaturePad from "@/components/seguridad/SignaturePad";

/**
 * Las 4 firmas del acta de RMA, como en la planilla de papel.
 *
 * Firman el tecnico de OSC, el almacen, el de Seguridad y la persona que
 * entrega o retira el equipo. Los cuatro estan en el mostrador y firman el
 * mismo telefono, uno detras de otro.
 *
 * Cada firma se guarda en cuanto se levanta el dedo, no al final: si los
 * cuatro firmaran contra un unico boton "guardar", un toque en atras a mitad
 * de la ronda tiraria las tres firmas ya hechas y habria que empezar de nuevo
 * con el cliente esperando.
 */

const TODOS_LOS_ROLES = ["tecnico", "almacen", "seguridad", "cliente"] as const;
type Rol = (typeof TODOS_LOS_ROLES)[number];

type Firma = { rol: Rol; firmante_nombre: string; created_at: string };

export default function FirmasActa({
  tipo,
  actaId,
  nombresSugeridos,
  roles = TODOS_LOS_ROLES as unknown as Rol[],
}: {
  tipo: "ingreso" | "despacho" | "mercancia";
  actaId: number;
  /** Nombre que se propone para cada rol; el usuario puede corregirlo. */
  nombresSugeridos: Partial<Record<Rol, string>>;
  /**
   * Quien firma. Por defecto los cuatro de la planilla de RMA.
   *
   * Mercancia pasa solo ["seguridad"]: ahi no hay cliente que reciba ni
   * tecnico que intervenga — es el almacen cargando un camion y Seguridad
   * dando fe de lo que salio. Pedir cuatro firmas seria pedir tres que nadie
   * puede dar.
   */
  roles?: Rol[];
}) {
  const t = useTranslations("seguridad.firmas");

  const [firmas, setFirmas] = useState<Firma[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<Rol | null>(null);
  const [nombre, setNombre] = useState("");
  const [trazo, setTrazo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/seguridad/firmas/${tipo}/${actaId}`;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      setFirmas(json.firmas || []);
    } catch {
      // Sin conexion se deja lo que haya en pantalla.
    } finally {
      setCargando(false);
    }
  }, [url]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const firmaDe = (rol: Rol) => firmas.find((f) => f.rol === rol);

  const abrir = (rol: Rol) => {
    setAbierta(rol);
    setNombre(firmaDe(rol)?.firmante_nombre || nombresSugeridos[rol] || "");
    setTrazo(null);
    setError(null);
  };

  const guardar = async () => {
    if (!abierta || !trazo || !nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rol: abierta,
          firmante_nombre: nombre.trim(),
          firma_data_url: trazo,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("error"));
      setFirmas(json.firmas || []);
      setAbierta(null);
      setTrazo(null);
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (rol: Rol) => {
    try {
      const res = await fetch(`${url}?rol=${rol}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setFirmas(json.firmas || []);
    } catch {
      // Se deja como esta: borrar una firma no es urgente.
    }
  };

  const ROLES = roles;
  const faltan = ROLES.filter((r) => !firmaDe(r)).length;

  return (
    <section className="bg-white border border-slate-200 rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-slate-900">{t("titulo")}</h2>
        {!cargando && (
          <span
            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              faltan === 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {faltan === 0 ? t("completa") : t("faltan", { count: faltan })}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {ROLES.length > 1 ? t("ayuda") : t("ayuda_una")}
      </p>

      <div className={`grid gap-3 ${ROLES.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {ROLES.map((rol) => {
          const firmada = firmaDe(rol);
          return (
            <div
              key={rol}
              className={`rounded-[10px] border p-3 ${
                firmada ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t(`rol.${rol}`)}
              </p>
              {firmada ? (
                <>
                  <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
                    {firmada.firmante_nombre}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("firmado")}
                    </span>
                    <button
                      type="button"
                      onClick={() => abrir(rol)}
                      className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-slate-900 min-h-[32px] px-2"
                    >
                      {t("rehacer")}
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(rol)}
                      aria-label={t("borrar")}
                      className="text-slate-400 hover:text-red-600 min-h-[32px] px-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mt-1 truncate">
                    {nombresSugeridos[rol] || t("sin_nombre")}
                  </p>
                  <button
                    type="button"
                    onClick={() => abrir(rol)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[10px] text-sm font-semibold text-white"
                    style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
                  >
                    <PenLine className="w-4 h-4" />
                    {t("firmar")}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Panel de firma. A pantalla completa en movil: el pad necesita todo el
          ancho que haya para que la firma no salga apretada. */}
      {abierta && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t(`rol.${abierta}`)}
              </p>
              <h3 className="text-base font-bold text-slate-900">{t("firmar")}</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {t("nombre")}
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value.slice(0, 200))}
                className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
                maxLength={200}
              />
            </div>

            <SignaturePad onChange={setTrazo} label={t("trazo")} />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setAbierta(null); setTrazo(null); }}
                className="min-h-[48px] px-4 rounded-[10px] text-sm font-semibold text-slate-700 border border-slate-200"
              >
                {t("cancelar")}
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !trazo || !nombre.trim()}
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("guardar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
