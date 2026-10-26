"use client";

import { Pastilla } from "@/components/rrhh/seleccion/comunes";
import { SEDES_SELECCION } from "@/lib/seleccion/tipos";
import {
  diasDesde,
  ESTADOS,
  MOTIVOS,
  normRol,
  ordenRRHH,
  ROL_RRHH,
  ROLES_SOLICITAN,
  URGENCIAS,
  type EstadoSolicitud,
  type Solicitud,
  type Urgencia,
} from "@/lib/solicitudes-personal/tipos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ChevronRight, Loader2, Plus, UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DetalleSolicitud, fechaHora, LineaAvance } from "./DetalleSolicitud";
import { FormSolicitud } from "./FormSolicitud";

const selCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function PantallaSolicitudes() {
  const { locale } = useParams<{ locale: string }>();
  const { user } = useAuthStore();
  const rol = normRol(user?.role);
  const esSuper = rol === "superadmin";
  const esRRHH = rol === ROL_RRHH;
  const puedeCrear = esSuper || ROLES_SOLICITAN.includes(rol);
  const cids = Number(user?.cids);
  const sedeFija = !esSuper && SEDES_SELECCION[cids] ? cids : null;

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [estado, setEstado] = useState<EstadoSolicitud | "todas">(esSuper ? "pendiente" : "todas");
  const [urgencia, setUrgencia] = useState<Urgencia | "todas">("todas");
  const [sede, setSede] = useState("todas");
  const [area, setArea] = useState("todas");
  const [busqueda, setBusqueda] = useState("");

  const [form, setForm] = useState<{ abierto: boolean; sol: Solicitud | null }>({ abierto: false, sol: null });
  const [detalle, setDetalle] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/solicitudes-personal");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudieron cargar las solicitudes");
      setSolicitudes(j.solicitudes || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  // El estado de la sesión llega después del primer render: el SuperAdmin abre en "Por aprobar".
  useEffect(() => {
    if (esSuper) setEstado("pendiente");
  }, [esSuper]);

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;
  const areas = useMemo(() => [...new Set(solicitudes.map((s) => s.area).filter(Boolean))].sort(), [solicitudes]);

  const lista = useMemo(() => {
    const q = norm(busqueda.trim());
    const l = solicitudes.filter(
      (s) =>
        (estado === "todas" || s.estado === estado) &&
        (urgencia === "todas" || s.urgencia === urgencia) &&
        (sede === "todas" || s.sede === Number(sede)) &&
        (area === "todas" || s.area === area) &&
        (!q || norm([s.cargo, s.area, s.solicitante_nombre, s.perfil, `SP-${s.id}`].join(" ")).includes(q)),
    );
    // RRHH y "Por aprobar": lo urgente y lo más viejo primero. El resto, lo último primero (como viene).
    return esRRHH || estado === "pendiente" ? [...l].sort(ordenRRHH) : l;
  }, [solicitudes, estado, urgencia, sede, area, busqueda, esRRHH]);

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      activo ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    }`;

  const subtitulo = esSuper
    ? "Aprueba o rechaza lo que piden los gerentes; lo aprobado pasa a RRHH"
    : esRRHH
      ? "Solicitudes aprobadas por el SuperAdmin, para empezar la búsqueda"
      : "Pide personal para tu área y sigue en qué va la búsqueda";

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <UserPlus className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Solicitudes de personal</h1>
            <p className="text-sm text-slate-500">{subtitulo}</p>
          </div>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setForm({ abierto: true, sol: null })}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nueva solicitud
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!esRRHH && (
          <>
            <button onClick={() => setEstado("todas")} className={chip(estado === "todas")}>
              Todas
            </button>
            {(Object.keys(ESTADOS) as EstadoSolicitud[]).map((e) => (
              <button key={e} onClick={() => setEstado(e)} className={chip(estado === e)}>
                {ESTADOS[e].etiqueta}
                {e === "pendiente" && pendientes > 0 ? ` (${pendientes})` : ""}
              </button>
            ))}
          </>
        )}
        <select aria-label="Urgencia" className={selCls} value={urgencia} onChange={(e) => setUrgencia(e.target.value as Urgencia | "todas")}>
          <option value="todas">Toda urgencia</option>
          {(Object.keys(URGENCIAS) as Urgencia[]).map((u) => (
            <option key={u} value={u}>
              Urgencia {URGENCIAS[u].etiqueta.toLowerCase()}
            </option>
          ))}
        </select>
        {!sedeFija && (
          <select aria-label="Sede" className={selCls} value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="todas">Todas las sedes</option>
            {Object.entries(SEDES_SELECCION).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        )}
        {areas.length > 1 && (
          <select aria-label="Área" className={selCls} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="todas">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cargo, área, gerente…"
          aria-label="Buscar solicitudes"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-64"
        />
      </div>

      {cargando && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!cargando && !error && lista.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          {solicitudes.length ? "Nada coincide con los filtros." : esRRHH ? "Todavía no hay solicitudes aprobadas." : "Todavía no hay solicitudes."}
        </p>
      )}

      <div className="space-y-3">
        {lista.map((s) => {
          const dias = diasDesde(s.estado === "aprobada" ? s.decidido_at : s.created_at);
          return (
            <button
              key={s.id}
              onClick={() => setDetalle(s.id)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pastilla tono={URGENCIAS[s.urgencia].tono}>Urgencia {URGENCIAS[s.urgencia].etiqueta.toLowerCase()}</Pastilla>
                  {!esRRHH && <Pastilla tono={ESTADOS[s.estado].tono}>{ESTADOS[s.estado].etiqueta}</Pastilla>}
                  <span className="text-xs text-slate-400">SP-{s.id}</span>
                </div>
                <p className="font-bold text-slate-900">
                  {s.cargo}
                  {s.cantidad > 1 && <span className="font-semibold text-slate-500"> × {s.cantidad}</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {SEDES_SELECCION[s.sede]}
                  {s.area && ` · ${s.area}`} · {MOTIVOS[s.motivo]}
                  {!esSuper && !esRRHH ? "" : ` · pedida por ${s.solicitante_nombre}`}
                  {dias != null && ` · hace ${dias} día${dias === 1 ? "" : "s"}`}
                </p>
                {s.estado === "aprobada" && (
                  <p className="text-xs text-slate-500">
                    Aprobada por {s.decidido_por_nombre} el {fechaHora(s.decidido_at)}
                  </p>
                )}
                <LineaAvance s={s} />
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
            </button>
          );
        })}
      </div>

      <FormSolicitud
        abierto={form.abierto}
        solicitud={form.sol}
        sedeFija={sedeFija}
        onCerrar={() => setForm({ abierto: false, sol: null })}
        onGuardado={() => {
          setForm({ abierto: false, sol: null });
          cargar();
        }}
      />
      <DetalleSolicitud
        id={detalle}
        locale={locale}
        esSuper={esSuper}
        esRRHH={esRRHH}
        miEmail={String(user?.email ?? "").toLowerCase().trim()}
        onCerrar={() => setDetalle(null)}
        onEditar={(s) => {
          setDetalle(null);
          setForm({ abierto: true, sol: s });
        }}
        onCambio={cargar}
      />
    </div>
  );
}
