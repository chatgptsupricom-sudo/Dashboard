"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, type LucideIcon, Plus, Search, User, Users, XCircle } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { EditorClave } from "./CatalogoPersonal";
import {
  PageHeader,
  Card,
  EmptyState,
  BotonPrimario,
  Buscador,
  iniciales,
  inputClases,
  labelClases,
  normalizar,
  tonoAvatar,
} from "./mercancia-ui";

/**
 * Catalogo simple de un solo campo (nombre): sirve tanto para Almacenistas
 * como para Choferes, que son la misma forma con distinto endpoint y texto.
 * Registrar aca es lo que alimenta el select del formulario de mercancia —
 * antes esos campos eran texto libre.
 *
 * Un panel por catalogo: cabecera con el total, el alta arriba (un campo, se
 * agrega con Enter) y la lista debajo, con buscador cuando ya son varios. El
 * que se acaba de agregar queda resaltado unos segundos, para ver que entro.
 */

type Item = { id: number; nombre: string; tiene_clave?: number };

// Con pocos nombres el buscador estorba mas de lo que ayuda.
const BUSCADOR_DESDE = 7;

export default function MercanciaCatalogoNombre({
  endpoint,
  listKey,
  namespace,
  titulo,
  subtitulo,
  campoLabel,
  campoPlaceholder,
  vacioTexto,
  errorTexto,
  volverA,
  embebido = false,
  icon: Icono = Users,
  conClave = false,
}: {
  endpoint: string;
  listKey: string;
  /** Namespace de i18n (ej. "seguridad.mercancia.almacenistas_catalogo") —
   * solo para el contador plural, que necesita el `count` en el momento
   * de renderizar y no se puede precalcular en el server component padre. */
  namespace: string;
  titulo: string;
  subtitulo: string;
  campoLabel: string;
  campoPlaceholder: string;
  vacioTexto: string;
  errorTexto: string;
  volverA?: string;
  /**
   * Sin pagina propia (cabecera, fondo): solo el panel, para poner varios
   * catalogos en una misma pantalla — la de Personal de Almacen junta
   * almacenistas y choferes.
   */
  embebido?: boolean;
  icon?: LucideIcon;
  /**
   * Con clave personal (almacenistas): cada uno la asigna o la cambia con
   * PATCH `<endpoint>/<id>` y firma con ella al abrir y cerrar contenedores
   * en la recepción (lib/seguridad/clavePersonal.ts).
   */
  conClave?: boolean;
}) {
  const t = useTranslations(namespace);
  const tui = useTranslations("seguridad.mercancia.catalogo_ui");
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // El recien agregado, resaltado unos segundos.
  const [nuevo, setNuevo] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  // Clave personal: a quién se le está poniendo, y a quién se le acaba de guardar.
  const tp = useTranslations("seguridad.personal");
  const { user } = useAuthStore();
  const esSuperadmin = (user?.role || "").toLowerCase().trim() === "superadmin";
  const [editandoClave, setEditandoClave] = useState<Item | null>(null);
  const [claveGuardada, setClaveGuardada] = useState<number | null>(null);
  const sinClave = conClave ? items.filter((it) => !Number(it.tiene_clave)) : [];

  const guardarClave = async (persona: Item, clave: string, claveActual?: string) => {
    const res = await fetch(`${endpoint}/${persona.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, ...(claveActual ? { clave_actual: claveActual } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || tp("error"));
    setEditandoClave(null);
    setClaveGuardada(persona.id);
    await cargar();
  };

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const json = await res.json();
      setItems(json[listKey] || []);
    } finally {
      setCargando(false);
    }
  }, [endpoint, listKey]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!nuevo) return;
    const timer = setTimeout(() => setNuevo(null), 4000);
    return () => clearTimeout(timer);
  }, [nuevo]);

  const agregar = async () => {
    const v = nombre.trim();
    if (!v) return;
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: v }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "error");
      setNombre("");
      setBusqueda("");
      setNuevo(v);
      await cargar();
    } catch {
      setError(errorTexto);
    } finally {
      setGuardando(false);
      campo.current?.focus();
    }
  };

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return q ? items.filter((it) => normalizar(it.nombre).includes(q)) : items;
  }, [items, busqueda]);

  const contenido = (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center gap-3.5 p-5 border-b border-slate-100 bg-gradient-to-br from-violet-50/70 to-white">
        <span className="w-11 h-11 rounded-2xl bg-[color:var(--portal-primary,#741DFE)] text-white flex items-center justify-center shrink-0 shadow-sm">
          <Icono className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{titulo}</h2>
          <p className="text-xs text-slate-500">{subtitulo}</p>
        </div>
        {!cargando && (
          <span className="shrink-0 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700">
            {t("contador", { count: items.length })}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className={labelClases}>{campoLabel}</label>
          <div className="flex gap-2">
            <input
              ref={campo}
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.slice(0, 200))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void agregar();
                }
              }}
              placeholder={campoPlaceholder}
              className={inputClases}
            />
            <BotonPrimario
              onClick={() => void agregar()}
              disabled={guardando || !nombre.trim()}
              icon={guardando ? undefined : Plus}
              className="shrink-0"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="hidden sm:inline">{tui("agregar")}</span>
            </BotonPrimario>
          </div>
          {error && (
            <p className="mt-2.5 text-sm text-red-600 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </p>
          )}
        </div>

        {conClave && !cargando && (
          <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
            <KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
            {t("con_clave_ayuda")}
          </p>
        )}
        {conClave && !cargando && sinClave.length > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("aviso_sin_clave", { count: sinClave.length })}
          </p>
        )}

        {items.length >= BUSCADOR_DESDE && (
          <Buscador valor={busqueda} onChange={setBusqueda} placeholder={tui("buscar")} limpiar={tui("limpiar")} />
        )}

        {cargando ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={User} texto={vacioTexto} className="py-8" />
        ) : visibles.length === 0 ? (
          <EmptyState icon={Search} texto={tui("sin_resultados")} className="py-8" />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
            {visibles.map((it) => {
              const esNuevo = nuevo !== null && it.nombre === nuevo;
              return (
                <li
                  key={it.id}
                  className={`group flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.08)] ${
                    esNuevo ? "border-violet-300 ring-2 ring-violet-100 animate-in fade-in zoom-in-95" : "border-slate-200/80"
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${tonoAvatar(it.nombre)}`}
                  >
                    {iniciales(it.nombre)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-800 truncate" title={it.nombre}>
                    {it.nombre}
                  </span>
                  {esNuevo && (
                    <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--portal-primary,#741DFE)]">
                      {tui("nuevo")}
                    </span>
                  )}
                  {conClave && (
                    <button
                      type="button"
                      onClick={() => {
                        setClaveGuardada(null);
                        setEditandoClave(it);
                      }}
                      title={tp(Number(it.tiene_clave) ? "cambiar_clave" : "asignar_clave")}
                      aria-label={`${tp(Number(it.tiene_clave) ? "cambiar_clave" : "asignar_clave")}: ${it.nombre}`}
                      className={`shrink-0 inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[11px] font-semibold ${
                        claveGuardada === it.id
                          ? "bg-emerald-50 text-emerald-700"
                          : Number(it.tiene_clave)
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      {claveGuardada === it.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                      {tp(Number(it.tiene_clave) ? "con_clave" : "sin_clave")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Clave de la persona elegida, debajo de la lista (las tarjetas son chicas). */}
        {conClave && editandoClave && (
          <div>
            <p className="text-sm font-semibold text-slate-800">{editandoClave.nombre}</p>
            <EditorClave
              tiene={!!Number(editandoClave.tiene_clave)}
              pideActual={!!Number(editandoClave.tiene_clave) && !esSuperadmin}
              onCancelar={() => setEditandoClave(null)}
              onGuardar={(nueva, actual) => guardarClave(editandoClave, nueva, actual)}
              t={tp}
            />
          </div>
        )}
      </div>
    </Card>
  );

  if (embebido) return contenido;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={Users} titulo={titulo} subtitulo={subtitulo} volverA={volverA} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{contenido}</main>
    </div>
  );
}
