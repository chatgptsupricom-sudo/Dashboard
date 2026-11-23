"use client";

/**
 * Panel de actividades (`/gestion/actividades` y `/vendedores/actividad`):
 * "Mi día" (lista por vencimiento con alta rápida), "Tablero" (Kanban) y,
 * para quien ve a otros, "Equipo" (quién va atrasado). Datos y permisos en
 * `lib/actividades/datos.ts`; APIs `app/api/activities/panel/*`.
 */
import {
  CalendarCheck,
  KanbanSquare,
  Loader2,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useAuthStore } from "@/lib/stores/auth.store";
import { connectSocket } from "@/lib/socket-client";
import {
  type Actividad,
  type PersonaVisible,
  type Prioridad,
  NOMBRE_SEDE,
  fechaCaracas,
  grupoDe,
} from "@/lib/actividades/tipos";
import Equipo from "./Equipo";
import FormActividad, { type DatosFormulario } from "./FormActividad";
import MiDia from "./MiDia";
import Tablero from "./Tablero";

type Vista = "dia" | "tablero" | "equipo";
type Quien = "mias" | "asignadas" | number;

interface Respuesta {
  actividades: Actividad[];
  personas: PersonaVisible[];
  permisos: {
    yo: number;
    veEquipo: boolean;
    puedeAsignar: boolean;
    soloLee: boolean;
  };
}

const CLAVE_VISTA = "actividades:vista";

const fetcher = async (url: string): Promise<Respuesta> => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "No se pudieron leer las actividades");
  return j;
};

async function pedir(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
  return j;
}

function fechaLarga(hoy: string) {
  const s = new Date(`${hoy}T12:00:00Z`).toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Indicador({
  titulo,
  valor,
  tono,
}: {
  titulo: string;
  valor: number;
  tono: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p
        className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${valor ? tono : "text-slate-300"}`}
      >
        {valor}
      </p>
    </div>
  );
}

export default function PanelActividades() {
  const user = useAuthStore((s) => s.user);
  const params = useSearchParams();
  const [hoy, setHoy] = useState(() => fechaCaracas());
  const [quien, setQuien] = useState<Quien>(() => {
    const p = Number(params.get("persona"));
    return p > 0 ? p : "mias";
  });
  const [vista, setVista] = useState<Vista>("dia");
  const [buscar, setBuscar] = useState("");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<{
    abierto: boolean;
    actividad: Actividad | null;
  }>({
    abierto: false,
    actividad: null,
  });

  // La vista elegida se recuerda en este navegador.
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLAVE_VISTA);
      if (v === "dia" || v === "tablero" || v === "equipo") setVista(v);
    } catch {
      // sin almacenamiento: queda "Mi día"
    }
  }, []);
  const elegirVista = (v: Vista) => {
    setVista(v);
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      // nada
    }
  };

  // El día cambia a medianoche de Caracas aunque la pantalla siga abierta.
  useEffect(() => {
    const t = setInterval(() => setHoy(fechaCaracas()), 60_000);
    return () => clearInterval(t);
  }, []);

  const clave =
    quien === "mias"
      ? "/api/activities/panel?vista=mias"
      : quien === "asignadas"
        ? "/api/activities/panel?vista=asignadas"
        : `/api/activities/panel?vista=persona&userId=${quien}`;
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(clave, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: true,
  });

  const permisos = data?.permisos;
  const yo = permisos?.yo ?? Number(user?.id ?? 0);
  const personas = data?.personas ?? [];
  const otros = personas.filter((p) => p.id !== yo);
  const verSelector =
    !!permisos &&
    (permisos.veEquipo || permisos.puedeAsignar) &&
    otros.length > 0;
  const quienEsOtro = typeof quien === "number" && quien !== yo;
  const nombreQuien =
    typeof quien === "number"
      ? personas.find((p) => p.id === quien)?.name
      : undefined;

  // Equipo es solo para quien ve a otros.
  useEffect(() => {
    if (vista === "equipo" && permisos && !permisos.veEquipo) setVista("dia");
  }, [vista, permisos]);

  // Cambios de otros (o de otra pestaña) en vivo.
  useEffect(() => {
    if (!yo) return;
    const s = connectSocket(yo);
    const alCambiar = () => {
      void mutate();
      setVersion((v) => v + 1);
    };
    s.on("activity-updated", alCambiar);
    return () => {
      s.off("activity-updated", alCambiar);
    };
  }, [yo, mutate]);

  const actividades = useMemo(() => {
    const lista = data?.actividades ?? [];
    const q = buscar.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        (a.user_name ?? "").toLowerCase().includes(q) ||
        a.checklist.some((i) => i.texto.toLowerCase().includes(q)),
    );
  }, [data, buscar]);

  const conteo = useMemo(() => {
    const c = { vencidas: 0, hoy: 0, enCurso: 0, hechas: 0 };
    for (const a of data?.actividades ?? []) {
      const g = grupoDe(a, hoy);
      if (g === "vencidas") c.vencidas++;
      if (g === "hoy") c.hoy++;
      if (g === "hechas") c.hechas++;
      if (a.status === "in-progress") c.enCurso++;
    }
    return c;
  }, [data, hoy]);
  const totalDia = conteo.vencidas + conteo.hoy + conteo.hechas;

  const reemplazar = useCallback(
    (act: Actividad) =>
      mutate(
        (d) =>
          d
            ? {
                ...d,
                actividades: d.actividades.map((a) =>
                  a.id === act.id ? act : a,
                ),
              }
            : d,
        {
          revalidate: false,
        },
      ),
    [mutate],
  );

  const cambiar = async (
    id: number,
    cambios: Partial<Actividad>,
    deshacer = true,
  ): Promise<void> => {
    const antes = data?.actividades.find((a) => a.id === id);
    await mutate(
      (d) =>
        d
          ? {
              ...d,
              actividades: d.actividades.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      ...cambios,
                      ...(cambios.status === "culminated"
                        ? { completed_at: new Date().toISOString() }
                        : {}),
                    }
                  : a,
              ),
            }
          : d,
      { revalidate: false },
    );
    try {
      const { actividad } = await pedir(
        `/api/activities/panel/${id}`,
        "PATCH",
        cambios,
      );
      await reemplazar(actividad);
      if (
        deshacer &&
        antes &&
        cambios.status === "culminated" &&
        antes.status !== "culminated"
      ) {
        toast({
          title: "Actividad culminada",
          description: antes.title,
          action: (
            <ToastAction
              altText="Deshacer"
              onClick={() => void cambiar(id, { status: antes.status }, false)}
            >
              Deshacer
            </ToastAction>
          ),
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e.message,
      });
      void mutate();
    }
  };

  const destino = typeof quien === "number" ? quien : yo;

  const crearRapida = async (d: {
    title: string;
    due_date: string | null;
    priority: Prioridad;
  }) => {
    try {
      const { actividad } = await pedir("/api/activities/panel", "POST", {
        ...d,
        user_id: destino,
      });
      await mutate(
        (x) => (x ? { ...x, actividades: [actividad, ...x.actividades] } : x),
        { revalidate: false },
      );
      setVersion((v) => v + 1);
      return true;
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "No se pudo crear",
        description: e.message,
      });
      return false;
    }
  };

  const guardarForm = async (d: DatosFormulario) => {
    const cuerpo = {
      title: d.title,
      description: d.description,
      observacion: d.observacion,
      due_date: d.due_date,
      priority: d.priority,
      checklist: d.checklist,
      // Solo quien asigna elige la persona (una fila vieja sin dueño no se reasigna sola).
      ...(permisos?.puedeAsignar ? { user_id: d.user_id } : {}),
      ...(form.actividad ? { status: d.status } : {}),
    };
    try {
      if (form.actividad) {
        const { actividad } = await pedir(
          `/api/activities/panel/${form.actividad.id}`,
          "PATCH",
          cuerpo,
        );
        await reemplazar(actividad);
      } else {
        await pedir("/api/activities/panel", "POST", cuerpo);
      }
      // La actividad pudo cambiar de persona: se vuelve a leer la lista.
      void mutate();
      setVersion((v) => v + 1);
      return true;
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e.message,
      });
      return false;
    }
  };

  const borrar = async (id: number) => {
    try {
      await pedir(`/api/activities/panel/${id}`, "DELETE");
      await mutate(
        (x) =>
          x
            ? { ...x, actividades: x.actividades.filter((a) => a.id !== id) }
            : x,
        {
          revalidate: false,
        },
      );
      setVersion((v) => v + 1);
      toast({ title: "Actividad borrada" });
      return true;
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "No se pudo borrar",
        description: e.message,
      });
      return false;
    }
  };

  const abrir = (a: Actividad) => setForm({ abierto: true, actividad: a });
  const puedeCrear =
    !!permisos && !permisos.soloLee && (!quienEsOtro || permisos.puedeAsignar);
  const textoAlta =
    !puedeCrear || quien === "asignadas"
      ? null
      : quienEsOtro
        ? `Asignar a ${nombreQuien ?? "esta persona"}: escribe y presiona Enter`
        : "¿Qué tienes que hacer? Escribe y presiona Enter";

  const porSede = useMemo(() => {
    const m = new Map<string, PersonaVisible[]>();
    for (const p of otros) {
      const s =
        p.cids != null ? (NOMBRE_SEDE[p.cids] ?? `Sede ${p.cids}`) : "Sin sede";
      if (!m.has(s)) m.set(s, []);
      m.get(s)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [otros]);

  const pestana = (v: Vista, Icono: typeof Users, texto: string) => (
    <button
      type="button"
      onClick={() => elegirVista(v)}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        vista === v
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-800"
      }`}
      aria-pressed={vista === v}
    >
      <Icono size={15} /> {texto}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">
            {fechaLarga(hoy)}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {quien === "asignadas"
              ? "Asignadas por mí"
              : quienEsOtro
                ? `Actividades de ${nombreQuien ?? "…"}`
                : `Hola${user?.name ? `, ${String(user.name).split(" ")[0]}` : ""}`}
          </h1>
          {totalDia > 0 && vista !== "equipo" && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(conteo.hechas / totalDia) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">
                {conteo.hechas} de {totalDia} del día culminadas
              </span>
            </div>
          )}
        </div>
        {puedeCrear && (
          <Button
            onClick={() => setForm({ abierto: true, actividad: null })}
            className="self-start sm:self-auto"
          >
            <Plus size={16} className="mr-1.5" /> Nueva actividad
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
          {pestana("dia", CalendarCheck, "Mi día")}
          {pestana("tablero", KanbanSquare, "Tablero")}
          {permisos?.veEquipo && pestana("equipo", Users, "Equipo")}
        </div>
        {vista !== "equipo" && (
          <div className="flex flex-wrap items-center gap-2">
            {verSelector && (
              <select
                value={String(quien)}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuien(
                    v === "mias" || v === "asignadas"
                      ? v
                      : Number(v) === yo
                        ? "mias"
                        : Number(v),
                  );
                }}
                className="max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                aria-label="Ver actividades de"
              >
                <option value="mias">Mis actividades</option>
                {permisos?.puedeAsignar && (
                  <option value="asignadas">Asignadas por mí</option>
                )}
                {porSede.map(([sede, lista]) => (
                  <optgroup key={sede} label={sede}>
                    {lista.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                        {p.role ? ` — ${p.role}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar"
                className="w-44 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                aria-label="Buscar actividades"
              />
            </div>
          </div>
        )}
      </div>

      {vista !== "equipo" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Indicador
            titulo="Vencidas"
            valor={conteo.vencidas}
            tono="text-red-600"
          />
          <Indicador
            titulo="Para hoy"
            valor={conteo.hoy}
            tono="text-amber-600"
          />
          <Indicador
            titulo="En curso"
            valor={conteo.enCurso}
            tono="text-blue-600"
          />
          <Indicador
            titulo="Culminadas hoy"
            valor={conteo.hechas}
            tono="text-emerald-600"
          />
        </div>
      )}

      {error && vista !== "equipo" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {String(error.message)}
        </p>
      ) : isLoading && !data && vista !== "equipo" ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Cargando actividades…
        </div>
      ) : vista === "dia" ? (
        <MiDia
          actividades={actividades}
          hoy={hoy}
          mostrarPersona={quien === "asignadas"}
          altaRapida={textoAlta}
          onAbrir={abrir}
          onCambiar={(id, c) => void cambiar(id, c)}
          onCrear={crearRapida}
        />
      ) : vista === "tablero" ? (
        <Tablero
          actividades={actividades}
          hoy={hoy}
          mostrarPersona={quien === "asignadas"}
          onAbrir={abrir}
          onCambiar={(id, c) => void cambiar(id, c)}
        />
      ) : (
        <Equipo
          hoy={hoy}
          version={version}
          onElegir={(id) => {
            setQuien(id === yo ? "mias" : id);
            elegirVista("dia");
          }}
        />
      )}

      <FormActividad
        abierto={form.abierto}
        actividad={form.actividad}
        hoy={hoy}
        yo={yo}
        usuarioInicial={destino}
        personas={personas}
        puedeAsignar={!!permisos?.puedeAsignar}
        onCerrar={() => setForm((f) => ({ ...f, abierto: false }))}
        onGuardar={guardarForm}
        onBorrar={borrar}
      />
    </div>
  );
}
