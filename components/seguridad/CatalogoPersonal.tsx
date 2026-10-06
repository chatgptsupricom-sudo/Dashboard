"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  UserX,
  Wrench,
} from "lucide-react";
import { PageHeader, Card, EmptyState, BotonPrimario } from "./mercancia-ui";

/**
 * Administración del catálogo de personal de UN rol (#50).
 *
 * De acá salen los selects "Recibió por Seguridad" / "Recibió por RMA" del
 * formulario de ingreso, y quién firma las actas. Cada rol administra solo a
 * su gente: Seguridad usa esta pantalla con `rol="seguridad"` y RMA con
 * `rol="rma"` (la API rechaza con 403 cualquier alta o baja sobre la lista de
 * otro rol).
 *
 * Seguridad además registra la clave personal de cada uno (4 a 6 números):
 * con ella firma el acta del despacho de mercancía (lib/seguridad/
 * clavePersonal.ts). Al dar de alta se pide; a quien ya estaba se le asigna, y
 * cambiarla pide la actual.
 */

type Rol = "seguridad" | "rma";
type Persona = { id: number; nombre: string; rol: Rol; activo: number; tiene_clave?: number };
type Filtro = "todos" | "activos" | "sin_clave" | "inactivos";

const ENDPOINT = "/api/seguridad/catalogo/personal";
/** Clave personal de Seguridad: 4 a 6 dígitos (lib/seguridad/clavePersonal.ts). */
const CLAVE_OK = /^\d{4,6}$/;
const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 6);
const claseInput =
  "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-4 focus:ring-violet-100 transition";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

export default function CatalogoPersonal({ rol, volverA }: { rol: Rol; volverA: string }) {
  const t = useTranslations("seguridad.personal");
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const conClave = rol === "seguridad";

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${ENDPOINT}?rol=${rol}&incluir_inactivos=1`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("error"));
      setPersonal(json.personal || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setCargando(false);
    }
  }, [rol, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async (nombre: string, clave?: string) => {
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("error"));
      await cargar();
    } catch (e: any) {
      setError(e?.message || t("error"));
    }
  };

  // Asignar o cambiar la clave (solo Seguridad). Cambiarla pide la actual.
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

  const propios = useMemo(() => personal.filter((p) => p.rol === rol), [personal, rol]);
  const activos = propios.filter((p) => p.activo);
  const sinClave = activos.filter((p) => !Number(p.tiene_clave));
  const inactivos = propios.filter((p) => !p.activo);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return propios
      .filter((p) =>
        filtro === "activos"
          ? p.activo
          : filtro === "inactivos"
            ? !p.activo
            : filtro === "sin_clave"
              ? p.activo && !Number(p.tiene_clave)
              : true,
      )
      .filter((p) => !q || p.nombre.toLowerCase().includes(q));
  }, [propios, filtro, busqueda]);

  const Icono = rol === "rma" ? Wrench : ShieldCheck;
  const filtros: Array<{ id: Filtro; n: number }> = [
    { id: "activos", n: activos.length },
    ...(conClave ? [{ id: "sin_clave" as Filtro, n: sinClave.length }] : []),
    { id: "inactivos", n: inactivos.length },
    { id: "todos", n: propios.length },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Icono}
        titulo={t(rol === "rma" ? "titulo_rma" : "titulo_seguridad")}
        subtitulo={t(rol === "rma" ? "subtitulo" : "subtitulo_seguridad")}
        volverA={volverA}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Resumen */}
        <div className={`grid gap-3 ${conClave ? "grid-cols-3" : "grid-cols-2"}`}>
          <Indicador icono={Users} etiqueta={t("resumen_activos")} valor={activos.length} cargando={cargando} tono="violeta" />
          {conClave ? (
            <>
              <Indicador
                icono={KeyRound}
                etiqueta={t("resumen_con_clave")}
                valor={activos.length - sinClave.length}
                cargando={cargando}
                tono="verde"
              />
              <Indicador
                icono={AlertTriangle}
                etiqueta={t("resumen_sin_clave")}
                valor={sinClave.length}
                cargando={cargando}
                tono={sinClave.length ? "ambar" : "gris"}
              />
            </>
          ) : (
            <Indicador icono={UserX} etiqueta={t("resumen_inactivos")} valor={inactivos.length} cargando={cargando} tono="gris" />
          )}
        </div>

        {conClave && !cargando && sinClave.length > 0 && (
          <button
            type="button"
            onClick={() => setFiltro("sin_clave")}
            className="w-full flex items-start sm:items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100/70 transition-colors"
          >
            <KeyRound className="w-4 h-4 mt-0.5 sm:mt-0 shrink-0 text-amber-600" />
            <span className="flex-1">{t("aviso_sin_clave", { count: sinClave.length })}</span>
            <span className="hidden sm:inline text-xs font-semibold text-amber-700">{t("ver")}</span>
          </button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-5 items-start">
          <FormAlta conClave={conClave} onAgregar={agregar} t={t} />

          {/* Lista */}
          <Card padded={false} className="overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={t("buscar")}
                  aria-label={t("buscar")}
                  className={`${claseInput} pl-10`}
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist">
                {filtros.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors ${
                      filtro === f.id
                        ? "bg-[color:var(--portal-primary,#741DFE)] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t(`filtro_${f.id}`)}
                    <span className={`tabular-nums ${filtro === f.id ? "text-white/80" : "text-slate-400"}`}>{f.n}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 sm:p-4">
              {cargando ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[72px] rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : propios.length === 0 ? (
                <EmptyState icon={Icono} texto={t("vacio")} />
              ) : visibles.length === 0 ? (
                <EmptyState icon={Search} texto={t("sin_resultados")} />
              ) : (
                <ul className="space-y-2">
                  {visibles.map((p) => (
                    <TarjetaPersona
                      key={p.id}
                      persona={p}
                      conClave={conClave}
                      onCambiarActivo={cambiarActivo}
                      onGuardarClave={guardarClave}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

const TONOS = {
  violeta: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]",
  verde: "bg-emerald-50 text-emerald-600",
  ambar: "bg-amber-50 text-amber-600",
  gris: "bg-slate-100 text-slate-400",
};

function Indicador({
  icono: Icono,
  etiqueta,
  valor,
  cargando,
  tono,
}: {
  icono: typeof Users;
  etiqueta: string;
  valor: number;
  cargando: boolean;
  tono: keyof typeof TONOS;
}) {
  return (
    <Card padded={false} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TONOS[tono]}`}>
        <Icono className="w-[18px] h-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-semibold text-slate-900 tabular-nums leading-none">
          {cargando ? <span className="inline-block w-6 h-5 rounded bg-slate-100 animate-pulse align-middle" /> : valor}
        </p>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-1 truncate">{etiqueta}</p>
      </div>
    </Card>
  );
}

/** Campo de clave numérica con botón para verla. */
function CampoClave({
  valor,
  onChange,
  etiqueta,
  placeholder,
  onEnter,
  autoComplete = "off",
  t,
}: {
  valor: string;
  onChange: (v: string) => void;
  etiqueta: string;
  placeholder?: string;
  onEnter?: () => void;
  autoComplete?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [ver, setVer] = useState(false);
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">{etiqueta}</span>
      <span className="relative block">
        <input
          type={ver ? "text" : "password"}
          inputMode="numeric"
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onChange(soloDigitos(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder={placeholder}
          aria-label={etiqueta}
          className={`${claseInput} pr-11 font-mono tracking-[0.35em] placeholder:tracking-normal placeholder:font-sans`}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={t(ver ? "ocultar_clave" : "mostrar_clave")}
          title={t(ver ? "ocultar_clave" : "mostrar_clave")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </span>
    </label>
  );
}

function FormAlta({
  conClave,
  onAgregar,
  t,
}: {
  conClave: boolean;
  onAgregar: (nombre: string, clave?: string) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const listo = !!nombre.trim() && (!conClave || CLAVE_OK.test(clave));

  const enviar = async () => {
    const v = nombre.trim();
    if (!v) return;
    if (conClave && !CLAVE_OK.test(clave)) {
      setError(t("clave_invalida"));
      return;
    }
    setError(null);
    setHecho(null);
    setGuardando(true);
    try {
      await onAgregar(v, conClave ? clave : undefined);
      setNombre("");
      setClave("");
      setHecho(t("agregado", { nombre: v }));
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card className="lg:sticky lg:top-20">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-9 h-9 rounded-xl bg-violet-50 text-[color:var(--portal-primary,#741DFE)] flex items-center justify-center">
          <UserPlus className="w-[18px] h-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t("nueva_persona")}</h2>
          {conClave && <p className="text-[11px] text-slate-500">{t("nueva_persona_ayuda")}</p>}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1.5">{t("campo")}</span>
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
            autoComplete="off"
            className={claseInput}
          />
        </label>
        {conClave && (
          <div>
            <CampoClave
              valor={clave}
              onChange={setClave}
              etiqueta={t("clave")}
              placeholder={t("clave_ph")}
              onEnter={() => void enviar()}
              autoComplete="new-password"
              t={t}
            />
            <p className="mt-1.5 text-[11px] text-slate-500">{t("clave_nota")}</p>
          </div>
        )}
        <BotonPrimario onClick={() => void enviar()} disabled={guardando || !listo} className="w-full h-11">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t("agregar")}
        </BotonPrimario>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {hecho && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            {hecho}
          </p>
        )}
      </div>
    </Card>
  );
}

function TarjetaPersona({
  persona: p,
  conClave,
  onCambiarActivo,
  onGuardarClave,
  t,
}: {
  persona: Persona;
  conClave: boolean;
  onCambiarActivo: (id: number, activo: boolean) => Promise<void>;
  onGuardarClave: (id: number, clave: string, claveActual?: string) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const activo = !!p.activo;
  const tiene = Number(p.tiene_clave) === 1;
  const [editandoClave, setEditandoClave] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState(false);

  const alternar = async () => {
    setOcupado(true);
    try {
      await onCambiarActivo(p.id, !activo);
    } finally {
      setOcupado(false);
    }
  };
  const abrirClave = () => {
    setHecho(false);
    setEditandoClave(true);
  };

  return (
    <li
      className={`rounded-xl border p-3 sm:p-3.5 transition-colors ${
        activo ? "border-slate-200 bg-white hover:border-violet-200" : "border-slate-200 bg-slate-50/70"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            activo ? "bg-violet-100 text-[color:var(--portal-primary,#741DFE)]" : "bg-slate-200 text-slate-500"
          }`}
        >
          {iniciales(p.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${activo ? "text-slate-900" : "text-slate-400 line-through"}`}>
            {p.nombre}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {!activo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-600">
                {t("inactivo")}
              </span>
            )}
            {conClave && activo && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  tiene ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                <KeyRound className="w-3 h-3" />
                {t(tiene ? "con_clave" : "sin_clave")}
              </span>
            )}
            {hecho && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="w-3 h-3" />
                {t("clave_guardada")}
              </span>
            )}
          </div>
        </div>
        {/* Acciones: en escritorio a la derecha; en el teléfono, abajo. */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <Acciones
            activo={activo}
            conClave={conClave}
            tiene={tiene}
            editandoClave={editandoClave}
            ocupado={ocupado}
            onClave={abrirClave}
            onAlternar={() => void alternar()}
            t={t}
          />
        </div>
      </div>
      <div className="flex sm:hidden items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
        <Acciones
          activo={activo}
          conClave={conClave}
          tiene={tiene}
          editandoClave={editandoClave}
          ocupado={ocupado}
          onClave={abrirClave}
          onAlternar={() => void alternar()}
          t={t}
        />
      </div>

      {editandoClave && (
        <EditorClave
          tiene={tiene}
          onCancelar={() => setEditandoClave(false)}
          onGuardar={async (nueva, actual) => {
            await onGuardarClave(p.id, nueva, actual);
            setEditandoClave(false);
            setHecho(true);
          }}
          t={t}
        />
      )}
    </li>
  );
}

function Acciones({
  activo,
  conClave,
  tiene,
  editandoClave,
  ocupado,
  onClave,
  onAlternar,
  t,
}: {
  activo: boolean;
  conClave: boolean;
  tiene: boolean;
  editandoClave: boolean;
  ocupado: boolean;
  onClave: () => void;
  onAlternar: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50";
  return (
    <>
      {conClave && activo && !editandoClave && (
        <button
          type="button"
          onClick={onClave}
          className={`${base} flex-1 sm:flex-none ${
            tiene
              ? "border border-slate-200 text-slate-700 hover:bg-slate-50"
              : "bg-[color:var(--portal-primary,#741DFE)] text-white hover:opacity-90"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          {t(tiene ? "cambiar_clave" : "asignar_clave")}
        </button>
      )}
      <button
        type="button"
        onClick={onAlternar}
        disabled={ocupado}
        className={`${base} flex-1 sm:flex-none ${
          activo
            ? "text-slate-500 hover:text-red-600 hover:bg-red-50"
            : "border border-violet-200 text-[color:var(--portal-primary,#741DFE)] hover:bg-violet-50"
        }`}
      >
        {ocupado ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : activo ? (
          <UserX className="w-3.5 h-3.5" />
        ) : (
          <RotateCcw className="w-3.5 h-3.5" />
        )}
        {t(activo ? "dar_baja" : "reactivar")}
      </button>
    </>
  );
}

function EditorClave({
  tiene,
  onCancelar,
  onGuardar,
  t,
}: {
  tiene: boolean;
  onCancelar: () => void;
  onGuardar: (nueva: string, actual?: string) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onGuardar(nueva, tiene ? actual : undefined);
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3 sm:p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-700">{t(tiene ? "cambiar_clave" : "asignar_clave")}</p>
      <div className={`grid grid-cols-1 gap-3 ${tiene ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {tiene && <CampoClave valor={actual} onChange={setActual} etiqueta={t("clave_actual")} t={t} />}
        <CampoClave valor={nueva} onChange={setNueva} etiqueta={t("clave_nueva")} autoComplete="new-password" t={t} />
        <CampoClave
          valor={repetir}
          onChange={setRepetir}
          etiqueta={t("clave_repetir")}
          autoComplete="new-password"
          onEnter={() => void guardar()}
          t={t}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="h-10 px-4 rounded-lg text-sm font-semibold text-slate-600 hover:bg-white"
        >
          {t("cancelar")}
        </button>
        <BotonPrimario onClick={() => void guardar()} disabled={guardando} className="h-10 px-4">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {t("guardar_clave")}
        </BotonPrimario>
      </div>
    </div>
  );
}
