"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, RotateCcw, ShieldCheck, UserX, Wrench } from "lucide-react";
import {
  PageHeader,
  Card,
  EmptyState,
  BotonPrimario,
  inputClases,
  labelClases,
} from "./mercancia-ui";

/**
 * Administración del catálogo de personal de UN rol (#50).
 *
 * De acá salen los selects "Recibió por Seguridad" / "Recibió por RMA" del
 * formulario de ingreso. Cada rol administra solo a su gente: Seguridad usa
 * esta pantalla con `rol="seguridad"` y RMA con `rol="rma"` (la API rechaza
 * con 403 cualquier alta o baja sobre la lista de otro rol).
 */

type Rol = "seguridad" | "rma";
type Persona = { id: number; nombre: string; rol: Rol; activo: number; tiene_clave?: number };

/** Clave personal de Seguridad: 4 a 6 dígitos (lib/seguridad/clavePersonal.ts). */
const CLAVE_OK = /^\d{4,6}$/;
const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 6);
const claseClave =
  "w-full h-11 px-3 border border-slate-200 rounded-xl text-sm tracking-[0.3em] bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100";

const ENDPOINT = "/api/seguridad/catalogo/personal";

export default function CatalogoPersonal({
  rol,
  volverA,
}: {
  rol: Rol;
  volverA: string;
}) {
  const t = useTranslations("seguridad.personal");
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${ENDPOINT}?rol=${rol}&incluir_inactivos=1`);
      if (!res.ok) return;
      const json = await res.json();
      setPersonal(json.personal || []);
    } finally {
      setCargando(false);
    }
  }, [rol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async (rol: Rol, nombre: string, clave?: string) => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, rol, ...(clave ? { clave } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || t("error"));
    await cargar();
  };

  const cambiarActivo = async (id: number, activo: boolean) => {
    setError(null);
    try {
      const res = await fetch(`${ENDPOINT}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t("error"));
      }
      await cargar();
    } catch {
      setError(t("error"));
    }
  };

  // Asignar o cambiar la clave personal (solo Seguridad). Cambiarla pide la
  // actual: la API lo exige.
  const guardarClave = async (id: number, clave: string, claveActual?: string) => {
    const res = await fetch(`${ENDPOINT}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, ...(claveActual ? { clave_actual: claveActual } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || t("error"));
    await cargar();
  };

  const icon = rol === "rma" ? Wrench : ShieldCheck;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={icon}
        titulo={t(rol === "rma" ? "titulo_rma" : "titulo_seguridad")}
        subtitulo={t("subtitulo")}
        volverA={volverA}
      />

      <main className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}
        <ColumnaRol
          rol={rol}
          icon={icon}
          titulo={t(rol === "rma" ? "col_rma" : "col_seguridad")}
          personas={personal.filter((p) => p.rol === rol)}
          cargando={cargando}
          onAgregar={agregar}
          onCambiarActivo={cambiarActivo}
          onGuardarClave={guardarClave}
          t={t}
        />
      </main>
    </div>
  );
}

function ColumnaRol({
  rol,
  icon: Icon,
  titulo,
  personas,
  cargando,
  onAgregar,
  onCambiarActivo,
  onGuardarClave,
  t,
}: {
  rol: Rol;
  icon: typeof ShieldCheck;
  titulo: string;
  personas: Persona[];
  cargando: boolean;
  onAgregar: (rol: Rol, nombre: string, clave?: string) => Promise<void>;
  onCambiarActivo: (id: number, activo: boolean) => Promise<void>;
  onGuardarClave: (id: number, clave: string, claveActual?: string) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  // Seguridad firma el acta de mercancía con su clave: se pide al dar de alta.
  const conClave = rol === "seguridad";
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const enviar = async () => {
    const v = nombre.trim();
    if (!v) return;
    if (conClave && !CLAVE_OK.test(clave)) {
      setErrorLocal(t("clave_invalida"));
      return;
    }
    setErrorLocal(null);
    setGuardando(true);
    try {
      await onAgregar(rol, v, conClave ? clave : undefined);
      setNombre("");
      setClave("");
    } catch (e: any) {
      setErrorLocal(e?.message || t("error"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-8 rounded-xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      </div>

      <label className={labelClases}>{t("campo")}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value.slice(0, 200))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={t("campo_ph")}
          className={inputClases}
        />
        {conClave && (
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(soloDigitos(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder={t("clave_ph")}
            aria-label={t("clave")}
            title={t("clave")}
            className={`${claseClave} w-28 shrink-0`}
          />
        )}
        <BotonPrimario
          onClick={() => void enviar()}
          disabled={guardando || !nombre.trim() || (conClave && !CLAVE_OK.test(clave))}
          className="w-11 px-0 shrink-0"
        >
          {guardando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </BotonPrimario>
      </div>
      {conClave && <p className="mt-1.5 text-[11px] text-slate-500">{t("clave_nota")}</p>}
      {errorLocal && (
        <p className="mt-2 text-sm text-red-600">{errorLocal}</p>
      )}

      <div className="mt-5 space-y-2">
        {cargando ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-xl bg-slate-100 animate-pulse"
            />
          ))
        ) : personas.length === 0 ? (
          <EmptyState icon={Icon} texto={t("vacio")} />
        ) : (
          personas.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border px-3 py-2.5 ${
                p.activo
                  ? "border-slate-200 bg-white"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium truncate flex-1 ${
                  p.activo ? "text-slate-800" : "text-slate-400 line-through"
                }`}
              >
                {p.nombre}
              </span>
              {p.activo ? (
                <button
                  type="button"
                  onClick={() => void onCambiarActivo(p.id, false)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-600 shrink-0 min-h-[32px] px-1.5"
                >
                  <UserX className="w-3.5 h-3.5" />
                  {t("dar_baja")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onCambiarActivo(p.id, true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-80 shrink-0 min-h-[32px] px-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("reactivar")}
                </button>
              )}
            </div>
            {conClave && !!p.activo && (
              <ClavePersona persona={p} onGuardar={onGuardarClave} t={t} />
            )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/**
 * Clave de una persona de Seguridad: muestra si la tiene y deja asignarla (la
 * primera vez) o cambiarla (pide la actual).
 */
function ClavePersona({
  persona,
  onGuardar,
  t,
}: {
  persona: Persona;
  onGuardar: (id: number, clave: string, claveActual?: string) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const tiene = Number(persona.tiene_clave) === 1;
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const cerrar = () => {
    setAbierto(false);
    setActual("");
    setNueva("");
    setRepetir("");
    setError(null);
  };

  const guardar = async () => {
    if (!CLAVE_OK.test(nueva) || (tiene && !CLAVE_OK.test(actual))) {
      setError(t("clave_invalida"));
      return;
    }
    if (nueva !== repetir) {
      setError(t("clave_no_coincide"));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(persona.id, nueva, tiene ? actual : undefined);
      cerrar();
      setHecho(true);
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
            tiene ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          {t(tiene ? "con_clave" : "sin_clave")}
        </span>
        {hecho && <span className="text-[11px] text-emerald-600">· {t("clave_guardada")}</span>}
        {!abierto && (
          <button
            type="button"
            onClick={() => {
              setHecho(false);
              setAbierto(true);
            }}
            className="ml-auto text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-80 min-h-[32px] px-1.5"
          >
            {t(tiene ? "cambiar_clave" : "asignar_clave")}
          </button>
        )}
      </div>
      {abierto && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {tiene && (
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={actual}
              onChange={(e) => setActual(soloDigitos(e.target.value))}
              placeholder={t("clave_actual")}
              aria-label={t("clave_actual")}
              className={claseClave}
            />
          )}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(soloDigitos(e.target.value))}
            placeholder={t("clave_nueva")}
            aria-label={t("clave_nueva")}
            className={claseClave}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(soloDigitos(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void guardar();
              }
            }}
            placeholder={t("clave_repetir")}
            aria-label={t("clave_repetir")}
            className={claseClave}
          />
          <div className="sm:col-span-3 flex items-center gap-2">
            <BotonPrimario onClick={() => void guardar()} disabled={guardando} className="h-9 px-3 text-xs">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("guardar_clave")}
            </BotonPrimario>
            <button
              type="button"
              onClick={cerrar}
              className="h-9 px-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              {t("cancelar")}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
