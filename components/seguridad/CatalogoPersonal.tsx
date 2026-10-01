"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RotateCcw, ShieldCheck, UserX, Wrench } from "lucide-react";
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
type Persona = { id: number; nombre: string; rol: Rol; activo: number };

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

  const agregar = async (rol: Rol, nombre: string) => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, rol }),
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
  t,
}: {
  rol: Rol;
  icon: typeof ShieldCheck;
  titulo: string;
  personas: Persona[];
  cargando: boolean;
  onAgregar: (rol: Rol, nombre: string) => Promise<void>;
  onCambiarActivo: (id: number, activo: boolean) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const enviar = async () => {
    const v = nombre.trim();
    if (!v) return;
    setErrorLocal(null);
    setGuardando(true);
    try {
      await onAgregar(rol, v);
      setNombre("");
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
        <BotonPrimario
          onClick={() => void enviar()}
          disabled={guardando || !nombre.trim()}
          className="w-11 px-0 shrink-0"
        >
          {guardando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </BotonPrimario>
      </div>
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
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                p.activo
                  ? "border-slate-200 bg-white"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
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
          ))
        )}
      </div>
    </Card>
  );
}
