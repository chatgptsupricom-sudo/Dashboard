"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileIcon,
  FileSpreadsheet,
  Headphones,
  Loader2,
  type LucideIcon,
  Mic,
  MicOff,
  PackageX,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  TrendingDown,
  TriangleAlert,
  Trophy,
  Users,
  ShieldCheck,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AttachedFile {
  name: string;
  size: string;
  type: string;
  base64: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  // Lo que el agente fue contando mientras consultaba, antes de la respuesta.
  proceso?: string;
  // Herramientas que usó para responder (panel "Usó N herramientas").
  pasos?: Paso[];
  files?: AttachedFile[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

// El backend marca cada cambio en Odoo que el agente preparó con
// [[confirmar-odoo:<token>]]; aquí se vuelve un botón. El token lleva el
// cambio en claro (firmado): se muestra tal cual para que el usuario vea
// exactamente qué va a ejecutar, no solo el resumen del modelo.
const MARCA_CAMBIO = /\n*\[\[confirmar-odoo:([A-Za-z0-9_.-]+)\]\]/g;

function cambiosDe(content: string): { token: string; detalle: any }[] {
  return [...content.matchAll(MARCA_CAMBIO)].map((m) => {
    let detalle: any = null;
    try {
      const b64 = m[1].split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      detalle = JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch {}
    return { token: m[1], detalle };
  });
}

// Archivos que creó el agente (Excel, Word, PDF, HTML…): [[archivo:<id>|<nombre>]].
const MARCA_ARCHIVO = /\n*\[\[archivo:([A-Za-z0-9_-]+)\|([^\]\n]*)\]\]/g;
const archivosDe = (content: string) => [...content.matchAll(MARCA_ARCHIVO)].map((m) => ({ id: m[1], nombre: m[2] }));
const urlArchivo = (id: string) => `/api/superadmin/agenteia/archivo?id=${encodeURIComponent(id)}`;

const sinMarcas = (content: string) => content.replace(MARCA_CAMBIO, "").replace(MARCA_ARCHIVO, "");

// Cada tabla de la respuesta trae su botón para bajarla como Excel.
function TablaConExcel({ node, ...props }: any) {
  const ref = useRef<HTMLTableElement>(null);
  const exportar = async () => {
    if (!ref.current) return;
    const XLSX = await import("xlsx");
    XLSX.writeFile(XLSX.utils.table_to_book(ref.current, { sheet: "Datos" }), `supri_ai_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  return (
    <div className="agente-tabla">
      <div className="overflow-x-auto agente-scroll">
        <table ref={ref} {...props} />
      </div>
      <button
        type="button"
        onClick={exportar}
        className="inline-flex items-center gap-1.5 h-7 px-2 -ml-2 mt-1 rounded-md text-xs font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
      >
        <FileSpreadsheet size={13} /> Descargar en Excel
      </button>
    </div>
  );
}

type ArchivoRef = { id: string; nombre: string };

type Nivel = "consultor" | "editor";
type UsuarioAcceso = { email: string; nombre: string; rol: string; superadmin: boolean; nivel: Nivel | null };
type CambioOdoo = {
  id: number;
  email: string;
  nombre: string | null;
  operacion: string;
  modelo: string;
  ids: string | null;
  resumen: string;
  estado: "ejecutando" | "ok" | "error";
  resultado: string | null;
  created_at: string;
};

const NIVELES_ACCESO: { valor: Nivel | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Sin acceso" },
  { valor: "consultor", etiqueta: "Consultor" },
  { valor: "editor", etiqueta: "Editor" },
];

const OPERACION: Record<string, string> = { create: "Crear", write: "Editar", unlink: "Borrar", execute: "Acción" };

type ConfigRol = { sede: "todas" | "propia"; propio: boolean; areas: string[] };
type RolAlcance = { rol: string; nombre: string; config: ConfigRol; porDefecto: boolean };

// Qué información ve el agente con cada rol (/api/superadmin/agenteia/roles):
// sede, "solo lo suyo" y áreas. Se guarda al cambiar.
function PanelRoles() {
  const [areas, setAreas] = useState<{ id: string; etiqueta: string; descripcion: string }[]>([]);
  const [roles, setRoles] = useState<RolAlcance[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/superadmin/agenteia/roles")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setAreas(j.areas || []);
        setRoles(j.roles || []);
      })
      .catch(() => setError("No se pudo cargar la configuración de roles."));
  }, []);

  const cambiar = async (r: RolAlcance, config: ConfigRol) => {
    const antes = r;
    const poner = (x: RolAlcance) => setRoles((prev) => prev!.map((y) => (y.rol === r.rol ? x : y)));
    poner({ ...r, config, porDefecto: false });
    setGuardando(r.rol);
    setError("");
    try {
      const res = await fetch("/api/superadmin/agenteia/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: r.rol, config }),
      });
      if (!res.ok) throw new Error();
    } catch {
      poner(antes);
      setError(`No se pudo guardar el rol ${r.nombre}. Reintenta.`);
    } finally {
      setGuardando(null);
    }
  };

  const chip = (activo: boolean) =>
    `h-7 px-2.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-60 ${
      activo ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
    }`;

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <p className="text-xs text-slate-500">
        El SuperAdmin lo ve todo. Los demás roles no tienen el SQL directo de Odoo, y solo consultan tablas del panel si
        ven todas las sedes y no están limitados a lo suyo.
      </p>
      <div className="max-h-[55vh] overflow-y-auto agente-scroll -mx-1 px-1 divide-y divide-slate-100">
        {!roles && !error && (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Cargando roles…
          </div>
        )}
        {roles?.map((r) => {
          const ocupado = guardando === r.rol;
          return (
            <div key={r.rol} className="py-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-sm font-medium text-slate-900 flex-1 min-w-0 truncate">
                  {r.nombre}
                  {r.porDefecto && <span className="ml-2 text-xs font-normal text-slate-400">por defecto</span>}
                </p>
                <div className="flex gap-1">
                  {(
                    [
                      ["todas", "Todas las sedes"],
                      ["propia", "Solo su sede"],
                    ] as const
                  ).map(([v, etiqueta]) => (
                    <button
                      key={v}
                      type="button"
                      disabled={ocupado}
                      aria-pressed={r.config.sede === v}
                      onClick={() => r.config.sede !== v && cambiar(r, { ...r.config, sede: v })}
                      className={chip(r.config.sede === v)}
                    >
                      {etiqueta}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={ocupado}
                    aria-pressed={r.config.propio}
                    onClick={() => cambiar(r, { ...r.config, propio: !r.config.propio })}
                    title="Solo sus propias ventas, clientes, cotizaciones y cobranza (vendedores)"
                    className={chip(r.config.propio)}
                  >
                    Solo lo suyo
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {areas.map((a) => {
                  const activo = r.config.areas.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={ocupado}
                      aria-pressed={activo}
                      title={a.descripcion}
                      onClick={() =>
                        cambiar(r, {
                          ...r.config,
                          areas: activo ? r.config.areas.filter((x) => x !== a.id) : [...r.config.areas, a.id],
                        })
                      }
                      className={chip(activo)}
                    >
                      {a.etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// SuperAdmin: Configuración del agente (la tuerca). Quién lo usa, por correo,
// y la bitácora de cambios hechos en Odoo (/api/superadmin/agenteia/acceso y /cambios).
function DialogoConfiguracion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [vista, setVista] = useState<"acceso" | "roles" | "cambios">("acceso");
  const [usuarios, setUsuarios] = useState<UsuarioAcceso[] | null>(null);
  const [cambios, setCambios] = useState<CambioOdoo[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!abierto) return;
    setError("");
    setUsuarios(null);
    fetch("/api/superadmin/agenteia/acceso")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setUsuarios(j.usuarios || []))
      .catch(() => setError("No se pudo cargar la lista de usuarios."));
  }, [abierto]);
  useEffect(() => {
    if (!abierto || vista !== "cambios") return;
    setCambios(null);
    fetch("/api/superadmin/agenteia/cambios")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setCambios(j.cambios || []))
      .catch(() => setError("No se pudo cargar el historial de cambios."));
  }, [abierto, vista]);

  const cambiarNivel = async (u: UsuarioAcceso, nivel: Nivel | null) => {
    if (u.nivel === nivel) return;
    const antes = u.nivel;
    const poner = (n: Nivel | null) =>
      setUsuarios((prev) => prev!.map((x) => (x.email === u.email ? { ...x, nivel: n } : x)));
    poner(nivel);
    setGuardando(u.email);
    setError("");
    try {
      const r = await fetch("/api/superadmin/agenteia/acceso", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, nivel }),
      });
      if (!r.ok) throw new Error();
    } catch {
      poner(antes);
      setError(`No se pudo guardar el acceso de ${u.nombre || u.email}. Reintenta.`);
    } finally {
      setGuardando(null);
    }
  };

  const q = filtro.trim().toLowerCase();
  const visibles = (usuarios || []).filter(
    (u) => !q || u.nombre.toLowerCase().includes(q) || u.email.includes(q) || u.rol.toLowerCase().includes(q),
  );
  const conAcceso = (usuarios || []).filter((u) => u.nivel && !u.superadmin).length;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configuración del Agente IA</DialogTitle>
          <DialogDescription>
            <b>Consultor</b>: consulta Odoo y el panel. <b>Editor</b>: además crea, edita y confirma cosas en Odoo. El
            SuperAdmin siempre es editor. Cada cambio en Odoo queda en el historial y en el chatter del registro con el
            nombre de quien lo confirmó.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 p-1 rounded-lg bg-slate-100 w-fit text-[13px] font-medium" role="tablist">
          {(
            [
              ["acceso", "Acceso"],
              ["roles", "Qué ve cada rol"],
              ["cambios", "Historial de cambios"],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={vista === id}
              onClick={() => setVista(id)}
              className={`h-7 px-3 rounded-md transition-colors ${
                vista === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {vista === "acceso" ? (
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex items-center gap-3">
              <label className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Buscar por nombre, correo o rol"
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                />
              </label>
              {usuarios && <span className="text-xs text-slate-500 shrink-0">{conAcceso} con acceso</span>}
            </div>
            <div className="max-h-[55vh] overflow-y-auto agente-scroll -mx-1 px-1 divide-y divide-slate-100">
              {!usuarios && !error && (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Cargando usuarios…
                </div>
              )}
              {usuarios && visibles.length === 0 && <p className="py-6 text-sm text-slate-500">Ningún usuario coincide.</p>}
              {visibles.map((u) => (
                <div key={u.email} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{u.nombre || u.email}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {u.email}
                      {u.rol && ` · ${u.rol}`}
                    </p>
                  </div>
                  {u.superadmin ? (
                    <span className="text-xs font-medium text-slate-500 px-2">SuperAdmin · siempre editor</span>
                  ) : (
                    <div
                      className="flex p-0.5 rounded-lg bg-slate-100 text-xs font-medium"
                      role="radiogroup"
                      aria-label={`Acceso de ${u.nombre || u.email}`}
                    >
                      {NIVELES_ACCESO.map((n) => {
                        const activo = u.nivel === n.valor;
                        return (
                          <button
                            key={n.etiqueta}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            disabled={guardando === u.email}
                            onClick={() => cambiarNivel(u, n.valor)}
                            className={`h-7 px-2.5 rounded-md transition-colors disabled:opacity-60 ${
                              activo
                                ? n.valor === "editor"
                                  ? "bg-blue-600 text-white"
                                  : n.valor === "consultor"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "bg-white text-slate-500 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            {n.etiqueta}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : vista === "roles" ? (
          <PanelRoles />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto agente-scroll -mx-1 px-1 divide-y divide-slate-100">
            {!cambios && !error && (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Cargando historial…
              </div>
            )}
            {cambios?.length === 0 && (
              <p className="py-6 text-sm text-slate-500">Todavía nadie ha hecho cambios en Odoo con el agente.</p>
            )}
            {cambios?.map((c) => (
              <div key={c.id} className="py-2.5 flex gap-3">
                <span
                  className={`mt-1.5 size-2 rounded-full shrink-0 ${
                    c.estado === "ok" ? "bg-emerald-500" : c.estado === "error" ? "bg-red-500" : "bg-amber-400"
                  }`}
                  title={c.estado === "ok" ? "Aplicado" : c.estado === "error" ? "Falló" : "Sin terminar"}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">{c.resumen}</p>
                  <p className="text-xs text-slate-500">
                    {c.nombre || c.email} ·{" "}
                    {new Date(c.created_at).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                    {OPERACION[c.operacion] || c.operacion} en <code className="text-[11px]">{c.modelo}</code>
                    {c.ids && ` ${c.ids}`}
                  </p>
                  {c.estado === "error" && c.resultado && <p className="text-xs text-red-600 mt-0.5">{c.resultado}</p>}
                  {c.estado === "ok" && c.resultado?.startsWith("nuevo id") && (
                    <p className="text-xs text-slate-500 mt-0.5">{c.resultado}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

const segundosDe = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : duracion(Math.round(ms / 1000)));

// "Usando herramientas…" mientras trabaja y "Usó N herramientas" después:
// cada consulta con lo que pidió (SQL, búsqueda, URL…), cuánto tardó y si falló.
function PasosHerramientas({
  pasos,
  activo,
  segundos,
  avance,
}: {
  pasos: Paso[];
  activo: boolean;
  segundos: number;
  avance: string;
}) {
  const fallidos = pasos.filter((p) => p.estado === "error").length;
  // Mientras trabaja se ven las últimas; al terminar, todas (al desplegar).
  const MAX_VISIBLES = 5;
  const ocultos = activo ? Math.max(0, pasos.length - MAX_VISIBLES) : 0;
  const visibles = ocultos ? pasos.slice(-MAX_VISIBLES) : pasos;
  return (
    <details className="group/pasos rounded-xl border border-slate-200 bg-white text-[13px]" open={activo || undefined}>
      <summary className="flex items-center gap-2 px-3 h-9 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-slate-600 hover:text-slate-900">
        {activo ? (
          <Loader2 size={14} className="animate-spin text-blue-600 shrink-0" />
        ) : (
          <Wrench size={14} className="text-slate-400 shrink-0" />
        )}
        <span className="font-medium truncate">
          {activo
            ? `${avance || "Usando herramientas"}…`
            : `Usó ${pasos.length} ${pasos.length === 1 ? "herramienta" : "herramientas"}`}
        </span>
        {activo && pasos.length > 1 && <span className="text-slate-400 shrink-0">· {pasos.length} pasos</span>}
        {fallidos > 0 && <span className="text-red-600">· {fallidos} con error</span>}
        {activo && <span className="text-slate-400 tabular-nums">{duracion(segundos)}</span>}
        <ChevronDown size={14} className="ml-auto text-slate-400 transition-transform group-open/pasos:rotate-180" />
      </summary>
      <ol className="border-t border-slate-100 divide-y divide-slate-100">
        {ocultos > 0 && (
          <li className="px-3 py-1.5 text-[12px] text-slate-400">
            {ocultos} {ocultos === 1 ? "paso anterior" : "pasos anteriores"}
          </li>
        )}
        {visibles.map((p) => (
          <li key={p.id} className="flex items-start gap-2.5 px-3 py-2">
            {p.estado === "corriendo" ? (
              <Loader2 size={13} className="mt-0.5 animate-spin text-blue-600 shrink-0" />
            ) : p.estado === "ok" ? (
              <Check size={13} className="mt-0.5 text-emerald-600 shrink-0" />
            ) : (
              <X size={13} className="mt-0.5 text-red-600 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-800">{p.nombre}</span>
                {p.estado === "error" && <span className="text-[12px] font-medium text-red-600">Falló</span>}
                {p.fin && <span className="ml-auto text-[12px] text-slate-400 tabular-nums shrink-0">{segundosDe(p.fin - p.inicio)}</span>}
              </div>
              {p.detalle && <p className="mt-0.5 font-mono text-[11.5px] leading-relaxed text-slate-500 break-all line-clamp-3">{p.detalle}</p>}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

// ── Errores en español ──────────────────────────────────────────────────────
// Lo que ve el usuario cuando algo falla: qué pasó y qué puede hacer. El
// servidor manda los errores de Claude ya traducidos (route.ts); aquí van los
// de la conexión y los códigos HTTP del panel.
const ERROR_RED =
  "Se perdió la conexión con el agente antes de que terminara de responder. Suele pasar cuando el servidor del panel se reinicia o la red se cae. Puedes reintentar.";

function errorHttp(status: number, detalle?: string): string {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión y reintenta.";
  if (status === 403) return "Tu usuario no tiene permiso para usar el agente.";
  if (status === 413) return "El mensaje o los archivos adjuntos son demasiado grandes. Quita algún adjunto o divide la pregunta.";
  if (status === 429) return "Se hicieron demasiadas consultas seguidas. Espera un minuto y reintenta.";
  if (status >= 502 && status <= 504)
    return "El servidor del panel no respondió: puede estar reiniciándose o la consulta tardó demasiado. Reintenta en un minuto.";
  return detalle ? `El panel respondió con un error: ${detalle}` : `El panel respondió con un error (código ${status}). Reintenta en un momento.`;
}

// Los mensajes de error se guardan con ⚠️ al final de la respuesta. Los que
// quedaron guardados en inglés (de antes) se muestran traducidos.
const traducirError = (c: string) => c.replace(/⚠️ (network error|failed to fetch|load failed|networkerror[^\n]*)$/i, `⚠️ ${ERROR_RED}`);
const terminaEnError = (c: string) => /⚠️[^\n]*$/.test(c.trim());

const SUGERENCIAS: { clave: "sugerencia_1" | "sugerencia_2" | "sugerencia_3" | "sugerencia_4"; icono: LucideIcon }[] = [
  { clave: "sugerencia_1", icono: TrendingDown },
  { clave: "sugerencia_2", icono: Trophy },
  { clave: "sugerencia_3", icono: Users },
  { clave: "sugerencia_4", icono: PackageX },
];

// La lista de conversaciones se agrupa por antigüedad, como en Claude/ChatGPT.
type GrupoFecha = "hoy" | "ayer" | "semana" | "mes" | "antes";
function agruparPorFecha(chats: Chat[]): [GrupoFecha, Chat[]][] {
  const inicioHoy = new Date().setHours(0, 0, 0, 0);
  const dia = 86_400_000;
  const grupo = (t: number): GrupoFecha =>
    t >= inicioHoy ? "hoy" : t >= inicioHoy - dia ? "ayer" : t >= inicioHoy - 7 * dia ? "semana" : t >= inicioHoy - 30 * dia ? "mes" : "antes";
  const mapa = new Map<GrupoFecha, Chat[]>();
  for (const c of chats) {
    const g = grupo(c.createdAt || 0);
    mapa.set(g, [...(mapa.get(g) || []), c]);
  }
  return (["hoy", "ayer", "semana", "mes", "antes"] as GrupoFecha[]).filter((g) => mapa.has(g)).map((g) => [g, mapa.get(g)!]);
}

// Botón de icono de la conversación (copiar, rebobinar, adjuntar, dictar).
function BotonAccion({
  etiqueta,
  onClick,
  disabled,
  grande,
  activo,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  grande?: boolean;
  activo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={etiqueta}
      aria-label={etiqueta}
      className={`grid place-items-center rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
        grande ? "h-8 w-8" : "h-7 w-7"
      } ${activo ? "bg-red-50 text-red-600 animate-pulse" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

// Tarjeta de un archivo creado por el agente: un clic lo abre en el panel lateral.
function ArchivoAgente({ id, nombre, activo, onAbrir }: ArchivoRef & { activo: boolean; onAbrir: () => void }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-2.5 transition-colors ${
        activo ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"
      }`}
    >
      <button type="button" onClick={onAbrir} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <FileIcon size={16} className="text-blue-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-700 truncate">{nombre}</span>
      </button>
      <a
        href={urlArchivo(id)}
        download={nombre}
        title="Descargar"
        aria-label="Descargar"
        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
      >
        <Download size={14} />
      </a>
    </div>
  );
}

// Vista previa en el panel lateral. Lo que escribió el modelo nunca corre en
// el origen del panel: HTML y Excel van en iframes con sandbox sin
// allow-same-origin; el PDF va como blob al visor del navegador.
function VistaArchivo({ id, nombre, onCerrar }: ArchivoRef & { onCerrar: () => void }) {
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  const [vista, setVista] = useState<
    | { tipo: "cargando" | "sin_vista" | "error" }
    | { tipo: "html" | "hojas" | "texto"; texto: string; hojas?: { nombre: string; html: string }[] }
    | { tipo: "pdf" | "imagen"; url: string }
  >({ tipo: "cargando" });
  const [hoja, setHoja] = useState(0);

  useEffect(() => {
    let url = "";
    const tipoMime = ext === "pdf" ? "application/pdf" : ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    (async () => {
      if (["docx", "doc", "pptx", "ppt"].includes(ext)) return setVista({ tipo: "sin_vista" });
      const r = await fetch(urlArchivo(id));
      if (!r.ok) return setVista({ tipo: "error" });
      if (ext === "html" || ext === "htm") return setVista({ tipo: "html", texto: await r.text() });
      if (["xlsx", "xls", "csv"].includes(ext)) {
        const XLSX = await import("xlsx");
        const libro = XLSX.read(await r.arrayBuffer());
        const hojas = libro.SheetNames.map((n) => ({ nombre: n, html: XLSX.utils.sheet_to_html(libro.Sheets[n]) }));
        return setVista({ tipo: "hojas", texto: "", hojas });
      }
      if (ext === "pdf" || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
        url = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: tipoMime }));
        return setVista({ tipo: ext === "pdf" ? "pdf" : "imagen", url });
      }
      setVista({ tipo: "texto", texto: await r.text() });
    })().catch(() => setVista({ tipo: "error" }));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, ext]);

  const estiloHoja =
    "<style>body{font:12px system-ui,sans-serif;margin:12px;color:#0f172a}table{border-collapse:collapse}td,th{border:1px solid #e2e8f0;padding:4px 8px;white-space:nowrap}tr:first-child td{background:#f1f5f9;font-weight:600}</style>";

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
        <FileIcon size={16} className="text-blue-600 shrink-0" />
        <span className="text-sm font-bold text-slate-800 truncate flex-1">{nombre}</span>
        <a
          href={urlArchivo(id)}
          download={nombre}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
        >
          <Download size={13} /> Descargar
        </a>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar"
          aria-label="Cerrar vista previa"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X size={16} />
        </button>
      </div>
      {vista.tipo === "hojas" && vista.hojas && vista.hojas.length > 1 && (
        <div className="flex gap-1 px-3 pt-2 overflow-x-auto shrink-0">
          {vista.hojas.map((h, i) => (
            <button
              key={h.nombre}
              type="button"
              onClick={() => setHoja(i)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
                i === hoja ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {h.nombre}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        {vista.tipo === "cargando" && (
          <div className="h-full flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold">
            <Loader2 size={14} className="animate-spin" /> Abriendo…
          </div>
        )}
        {(vista.tipo === "sin_vista" || vista.tipo === "error") && (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-500 text-sm">
            <FileIcon size={32} className="text-slate-300" />
            {vista.tipo === "error"
              ? "No se pudo abrir el archivo."
              : "Este tipo de archivo no tiene vista previa aquí. Descárgalo para abrirlo."}
          </div>
        )}
        {vista.tipo === "html" && (
          <iframe title={nombre} srcDoc={vista.texto} sandbox="allow-scripts" className="w-full h-full bg-white" />
        )}
        {vista.tipo === "hojas" && vista.hojas && (
          <iframe title={nombre} srcDoc={estiloHoja + (vista.hojas[hoja]?.html ?? "")} sandbox="" className="w-full h-full bg-white" />
        )}
        {vista.tipo === "pdf" && <iframe title={nombre} src={vista.url} className="w-full h-full" />}
        {vista.tipo === "imagen" && <img src={vista.url} alt={nombre} className="max-w-full mx-auto p-4" />}
        {vista.tipo === "texto" && (
          <pre className="p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{vista.texto}</pre>
        )}
      </div>
    </>
  );
}

// Herramientas que va usando el agente: el backend intercala
// [[paso:<json base64url>]] con { id, fase: inicio|detalle|fin, nombre, detalle, ok }.
interface Paso {
  id: string;
  nombre: string;
  detalle?: string;
  estado: "corriendo" | "ok" | "error";
  inicio: number;
  fin?: number;
}
const MARCA_PASO = /\[\[paso:([A-Za-z0-9_-]+)\]\]/g;
function leerPaso(b64: string): any {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/-/g, "+").replace(/_/g, "/")))));
  } catch {
    return null;
  }
}

// Mientras trabaja, el backend intercala [[avance:texto]] en la respuesta: no
// es parte del mensaje, es el estado que se muestra debajo ("Consultando…").
const MARCA_AVANCE = /\[\[avance:([^\]\n]*)\]\]/g;

const duracion = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`);

const genId = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
// Copia local de las conversaciones, una por usuario del panel: en un
// navegador compartido, el siguiente que entra no ve ni hereda (al subir los
// chats "solo locales" a su cuenta) las conversaciones del anterior.
// "agenteia-chats-v1" es la copia de antes, sin usuario: solo la escribía el
// SuperAdmin (era el único con agente), así que solo él la hereda.
const CLAVE_VIEJA = "agenteia-chats-v1";
let claveLocal: string | null = null;

function loadChats(clave: string): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistChats(chats: Chat[]) {
  if (!claveLocal) return;
  try {
    // Strip base64 files before persisting to avoid bloating localStorage
    const slim = chats.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({ ...m, files: undefined })),
    }));
    localStorage.setItem(claveLocal, JSON.stringify(slim));
  } catch {}
}

export default function AgenteIAPage() {
  const t = useTranslations("superadmin.agente_ia");
  const { user } = useAuthStore();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [archivoAbierto, setArchivoAbierto] = useState<ArchivoRef | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // ¿Puede usar el agente y es SuperAdmin? (null = cargando)
  const [acceso, setAcceso] = useState<{ puede: boolean; superadmin: boolean; editor: boolean } | null>(null);
  const [configuracion, setConfiguracion] = useState(false);
  useEffect(() => {
    fetch("/api/agenteia/acceso")
      .then((r) => r.json())
      .then((j) => setAcceso({ puede: !!j?.puede, superadmin: !!j?.superadmin, editor: !!j?.editor }))
      .catch(() => setAcceso({ puede: false, superadmin: false, editor: false }));
  }, []);

  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textRef = useRef("");
  const isConversationModeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const processMessageRef = useRef<any>(null);

  // ── Modelo elegido ("" = el del servidor); se recuerda en este navegador ────
  const [modelo, setModelo] = useState("");
  useEffect(() => {
    try {
      setModelo(localStorage.getItem("agenteia-modelo") || "");
    } catch {}
  }, []);
  const elegirModelo = (m: string) => {
    setModelo(m);
    try {
      localStorage.setItem("agenteia-modelo", m);
    } catch {}
  };

  // ── Estado mientras responde: qué está haciendo y cuánto lleva ─────────────
  const [avance, setAvance] = useState("");
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!isGenerating) return;
    setSegundos(0);
    const id = setInterval(() => setSegundos((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isGenerating]);

  // ── Copiar un mensaje / rebobinar la conversación hasta uno enviado ────────
  const [copiado, setCopiado] = useState<number | null>(null);
  const copiar = async (index: number, content: string) => {
    const texto = sinMarcas(content).trim();
    try {
      // La respuesta se copia también como HTML: al pegarla en Excel, Word o
      // un correo las tablas llegan como tablas, no como texto con barras.
      const nodo = document.querySelector(`[data-msg="${index}"]`)?.cloneNode(true) as HTMLElement | undefined;
      nodo?.querySelectorAll("button").forEach((b) => b.remove());
      const html = nodo?.innerHTML;
      if (html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([texto], { type: "text/plain" }),
          }),
        ]);
      } else await navigator.clipboard.writeText(texto);
      setCopiado(index);
      setTimeout(() => setCopiado(null), 1500);
    } catch {}
  };
  // Quita ese mensaje y todo lo posterior, y lo devuelve a la caja de texto
  // para corregirlo y reenviarlo. No deshace cambios ya confirmados en Odoo.
  const rebobinar = (index: number, content: string) => {
    if (isGenerating) return;
    setMessages((prev) => prev.slice(0, index));
    setInput(content);
    textRef.current = content;
    inputRef.current?.focus();
  };

  // ── Conexión OAuth con el MCP de Odoo (SQL directo) ────────────────────────
  // La misma consulta trae los modelos que este usuario puede elegir.
  const [faltaMcp, setFaltaMcp] = useState(false);
  const [modelos, setModelos] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    fetch("/api/superadmin/agenteia/oauth?estado=1")
      .then((r) => r.json())
      .then((e) => {
        setFaltaMcp(!!e?.configurado && !e?.conectado);
        if (Array.isArray(e?.modelos)) setModelos(e.modelos);
      })
      .catch(() => {});
  }, []);

  // ── Título de la conversación escrito por la IA (editable después) ────────
  const titularChat = async (chatId: string, pregunta: string) => {
    try {
      const r = await fetch("/api/superadmin/agenteia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titular: pregunta }),
      });
      const titulo = String((await r.json())?.titulo || "").trim();
      if (!titulo) return;
      setChats((prev) => {
        const updated = prev.map((c) => (c.id === chatId ? { ...c, title: titulo } : c));
        persistChats(updated);
        return updated;
      });
      pendientes.current.add(chatId);
    } catch {}
  };

  // ── Chats: se guardan en el servidor (por usuario) ─────────────────────────
  // localStorage queda como copia local para pintar al instante; la fuente es
  // /api/superadmin/agenteia/chats. Los chats que solo estaban en este
  // navegador (de antes de guardarlos en el servidor) se suben al cargar.
  const pendientes = useRef(new Set<string>());
  const uidSesion = user?.uid || user?.id;
  useEffect(() => {
    if (!uidSesion) return;
    claveLocal = `agenteia-chats-v2:${uidSesion}`;
    let stored = loadChats(claveLocal);
    if (stored.length === 0 && user?.role === "superAdmin") {
      stored = loadChats(CLAVE_VIEJA);
      try {
        localStorage.removeItem(CLAVE_VIEJA);
      } catch {}
    }
    if (stored.length > 0) {
      setChats(stored);
      setActiveChatId(stored[0].id);
    }
    if (window.innerWidth < 768) setSidebarOpen(false);

    fetch("/api/superadmin/agenteia/chats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ chats: remotos }: { chats: Chat[] }) => {
        setChats((prev) => {
          // De cada chat queda la copia con más mensajes: la local si no se
          // alcanzó a guardar, la del servidor si se siguió en otro equipo.
          const porId = new Map(remotos.map((c) => [c.id, c]));
          for (const c of prev) {
            const r = porId.get(c.id);
            if (!r || c.messages.length > r.messages.length) {
              porId.set(c.id, c);
              pendientes.current.add(c.id);
            }
          }
          const todos = [...porId.values()].sort((a, b) => b.createdAt - a.createdAt);
          persistChats(todos);
          return todos;
        });
        setActiveChatId((actual) => actual ?? remotos[0]?.id ?? null);
      })
      .catch(() => {});
  }, [uidSesion]);

  // ── Derived active chat data ───────────────────────────────────────────────
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages: Message[] = activeChat?.messages ?? [];

  // ── Helpers to mutate the active chat's messages ───────────────────────────
  const setMessages = (
    updater: Message[] | ((prev: Message[]) => Message[]),
    chatId?: string,
  ) => {
    const targetId = chatId ?? activeChatId;
    if (targetId) pendientes.current.add(targetId);
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== targetId) return c;
        const newMsgs =
          typeof updater === "function" ? updater(c.messages) : updater;
        // Auto-title from first user message
        const firstUser = newMsgs.find((m) => m.role === "user");
        const title =
          c.title === t("nueva_conversacion") && firstUser
            ? firstUser.content.slice(0, 45) +
              (firstUser.content.length > 45 ? "…" : "")
            : c.title;
        return { ...c, messages: newMsgs, title };
      });
      persistChats(updated);
      return updated;
    });
  };

  // ── Chat CRUD ──────────────────────────────────────────────────────────────
  // Al abrir un archivo se pliega la lista de chats para dejarle espacio.
  const abrirArchivo = (a: ArchivoRef | null) => {
    setArchivoAbierto(a);
    if (a) setSidebarOpen(false);
  };

  const createChat = () => {
    setActiveChatId(null);
    setArchivoAbierto(null);
    setInput("");
    setAttachedFiles([]);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsConversationMode(false);
    stopListening();
    inputRef.current?.focus();
  };

  // Guarda en el servidor los chats que cambiaron, cuando el agente no está
  // escribiendo (no en cada trozo del streaming).
  useEffect(() => {
    if (isGenerating || pendientes.current.size === 0) return;
    const t = setTimeout(() => {
      for (const id of [...pendientes.current]) {
        const chat = chats.find((c) => c.id === id);
        pendientes.current.delete(id);
        if (!chat) continue;
        fetch("/api/superadmin/agenteia/chats", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chat),
        })
          .then((r) => {
            if (!r.ok && r.status !== 413) pendientes.current.add(id);
          })
          .catch(() => pendientes.current.add(id));
      }
    }, 800);
    return () => clearTimeout(t);
  }, [chats, isGenerating]);

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta conversación? No se puede deshacer.")) return;
    pendientes.current.delete(id);
    fetch(`/api/superadmin/agenteia/chats?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persistChats(updated);
      if (activeChatId === id) {
        setActiveChatId(updated[0]?.id ?? null);
      }
      return updated;
    });
  };

  const selectChat = (id: string) => {
    if (id === activeChatId) return;
    setActiveChatId(id);
    setArchivoAbierto(null);
    setEditingChatId(null);
    setInput("");
    setAttachedFiles([]);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsConversationMode(false);
    stopListening();
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const startEditTitle = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveEditTitle = () => {
    if (!editingChatId) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      pendientes.current.add(editingChatId);
      setChats((prev) => {
        const updated = prev.map((c) =>
          c.id === editingChatId ? { ...c, title: trimmed } : c,
        );
        persistChats(updated);
        return updated;
      });
    }
    setEditingChatId(null);
  };

  const handleEditTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEditTitle();
    if (e.key === "Escape") setEditingChatId(null);
  };

  // ── Video control ──────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (isSpeaking) video.play().catch(() => {});
      else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, [isSpeaking]);

  // ── Sync refs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    isConversationModeRef.current = isConversationMode;
  }, [isConversationMode]);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  useEffect(() => {
    textRef.current = input;
  }, [input]);

  // ── Speech recognition setup ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.lang = "es-VE";
        rec.interimResults = false;

        rec.onresult = (event: any) => {
          const transcript = event.results[event.resultIndex][0].transcript;
          setInput((prev) => {
            const newText = prev ? `${prev} ${transcript}` : transcript;
            textRef.current = newText;
            return newText;
          });
          if (isConversationModeRef.current) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              const txt = textRef.current.trim();
              if (txt && !isGeneratingRef.current && processMessageRef.current)
                processMessageRef.current(txt, "voice");
            }, 5000);
          }
        };

        rec.onend = () => {
          setIsListening(false);
          if (
            isConversationModeRef.current &&
            !isSpeakingRef.current &&
            !isGeneratingRef.current
          ) {
            try {
              rec.start();
              setIsListening(true);
            } catch {}
          }
        };

        rec.onerror = (event: any) => {
          console.warn("⚠️ SR error:", event.error);
          if (event.error === "not-allowed") {
            alert(t("permiso_microfono"));
            setIsConversationMode(false);
          }
          setIsListening(false);
        };

        recognitionRef.current = rec;
      }
    }
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(
      (v) =>
        v.lang.startsWith("es") &&
        (v.name.includes("Google") || v.name.includes("Female")),
    );
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (isConversationModeRef.current) setTimeout(startListening, 500);
    };
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isSpeakingRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert(t("navegador_voz"));
      return;
    }
    setIsConversationMode(false);
    if (isListening) stopListening();
    else startListening();
  };

  const toggleConversationMode = () => {
    const next = !isConversationMode;
    setIsConversationMode(next);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (next) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      startListening();
    } else {
      stopListening();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // ── Process message ────────────────────────────────────────────────────────
  const processMessage = async (
    messageText: string,
    messageType: "text" | "voice" | "file" | "image" = "text",
    chatIdOverride?: string,
    // Historial sobre el que se responde. Reintentar lo pasa explícito: el
    // estado de los chats todavía no refleja que quitó el intento fallido.
    base?: Message[],
  ) => {
    const chatId = chatIdOverride ?? activeChatId;
    if (!chatId) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setInput("");
    textRef.current = "";
    stopListening();

    const userMessage: Message = {
      role: "user",
      content: messageText,
      files: attachedFiles.length > 0 ? attachedFiles : undefined,
    };

    // Use current messages for this chat (may be [] for a brand-new chat)
    const currentMsgs =
      base ?? chats.find((c) => c.id === chatId)?.messages ?? messages;
    const updatedMessages = [...currentMsgs, userMessage];
    setMessages(updatedMessages, chatId);
    setAttachedFiles([]);
    setIsGenerating(true);
    setMessages(
      (prev) => [...prev, { role: "assistant", content: "" }],
      chatId,
    );

    const control = new AbortController();
    abortRef.current = control;
    let accumulated = "";

    try {
      const response = await fetch("/api/superadmin/agenteia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages, modelo: modelo || undefined }),
        signal: control.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errorHttp(response.status, errBody?.error));
      }
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let crudo = "";
      // Pasos por id, con la hora (en este navegador) en que empezó y terminó cada uno.
      const pasos = new Map<string, Paso>();
      let leidos = 0;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        // El servidor manda espacios de ancho cero como latido: no son texto.
        crudo += decoder.decode(value, { stream: !d }).replace(/\u200B/g, "");
        // Los pasos de herramientas se leen y se sacan del texto.
        for (const m of [...crudo.matchAll(MARCA_PASO)].slice(leidos)) {
          const e = leerPaso(m[1]);
          if (!e?.id) continue;
          const actual: Paso = pasos.get(e.id) || { id: e.id, nombre: e.nombre || "Herramienta", estado: "corriendo", inicio: Date.now() };
          if (e.nombre) actual.nombre = e.nombre;
          if (e.detalle) actual.detalle = e.detalle;
          if (e.fase === "fin") {
            actual.estado = e.ok === false ? "error" : "ok";
            actual.fin = Date.now();
          }
          pasos.set(e.id, actual);
        }
        leidos = [...crudo.matchAll(MARCA_PASO)].length;
        const sinPasos = crudo.replace(MARCA_PASO, "");
        // La respuesta es lo que viene después de la última consulta. Lo que
        // el agente escribió antes (entre consulta y consulta) es su proceso:
        // se guarda aparte y se muestra plegado, no como respuesta.
        const marcas = [...sinPasos.matchAll(MARCA_AVANCE)];
        const ultima = marcas[marcas.length - 1];
        const corte = ultima ? ultima.index! + ultima[0].length : 0;
        const proceso = sinPasos.slice(0, corte).replace(MARCA_AVANCE, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
        accumulated = sinPasos.slice(corte).trimStart();
        // Una marca que llegó cortada entre dos trozos no se muestra a medias.
        if (!d) accumulated = accumulated.replace(/\[\[[^\]]*$/, "");
        setAvance(ultima && accumulated.trim() === "" ? ultima[1] : "");
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.role === "assistant")
            next[last] = {
              ...next[last],
              content: accumulated,
              proceso: proceso || undefined,
              pasos: pasos.size ? [...pasos.values()].map((p) => ({ ...p })) : undefined,
            };
          return next;
        }, chatId);
      }

      // Primer intercambio del chat: el título provisional (el inicio del
      // mensaje) se cambia por uno escrito por la IA.
      if (updatedMessages.length === 1) titularChat(chatId, messageText);

      // Como en Claude: el archivo recién creado se abre en el panel lateral.
      const nuevos = archivosDe(accumulated);
      if (nuevos.length) abrirArchivo(nuevos[nuevos.length - 1]);

      if (isConversationModeRef.current)
        speakText(sinMarcas(accumulated).replace(/[*#|`]/g, ""));
    } catch (err: any) {
      // Detenido por el usuario: queda lo que alcanzó a escribir.
      if (control.signal.aborted) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.role === "assistant")
            next[last] = { ...next[last], content: `${accumulated.trim()}\n\n_Respuesta detenida._`.trim() };
          return next;
        }, chatId);
        return;
      }
      // fetch y la lectura del streaming lanzan TypeError cuando se corta la
      // conexión (red, reinicio del servidor, proxy). Lo ya escrito se conserva.
      const motivo = err instanceof TypeError ? ERROR_RED : err?.message || "Ocurrió un error inesperado. Puedes reintentar.";
      const errorMsg = `${accumulated.trim() ? `${accumulated.trim()}\n\n` : ""}⚠️ ${motivo}`;
      setMessages((prev) => {
        const next = [...prev];
        const last = next.length - 1;
        if (next[last]?.role === "assistant")
          next[last] = { ...next[last], content: errorMsg };
        return next;
      }, chatId);
      if (isConversationModeRef.current) speakText("Ocurrió un error.");
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
      setAvance("");
      setMessages((prev) => {
        const next = [...prev];
        const last = next.length - 1;
        if (next[last]?.pasos?.some((p) => p.estado === "corriendo"))
          next[last] = { ...next[last], pasos: next[last].pasos!.map((p) => (p.estado === "corriendo" ? { ...p, estado: "error", fin: p.fin ?? Date.now() } : p)) };
        return next;
      }, chatId);
    }
  };

  // Reintenta la pregunta que terminó en error: quita la pregunta y la
  // respuesta fallida y la vuelve a enviar sobre el historial anterior.
  const reintentar = (index: number) => {
    const pregunta = messages[index - 1];
    if (!activeChatId || isGenerating || pregunta?.role !== "user") return;
    const base = messages.slice(0, index - 1);
    setMessages(base, activeChatId);
    processMessage(pregunta.content, "text", activeChatId, base);
  };

  // Confirma o cancela un cambio en Odoo preparado por el agente. La marca se
  // quita del mensaje antes de llamar, así un doble clic no lo repite.
  const resolverCambio = async (index: number, token: string, confirmar: boolean) => {
    const chatId = activeChatId;
    if (!chatId || isGenerating) return;
    const marca = `[[confirmar-odoo:${token}]]`;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, content: m.content.replace(marca, "").trimEnd() } : m)), chatId);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/superadmin/agenteia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmar ? { confirmar: token } : { cancelar: token }),
      });
      const j = await res.json().catch(() => ({}));
      const texto = j.texto || `⚠️ ${j.error || t("error_respuesta")}`;
      setMessages((prev) => [...prev, { role: "assistant", content: texto }], chatId);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    processMessageRef.current = processMessage;
  }, [messages, attachedFiles, activeChatId]);

  // Al terminar de responder, el cursor vuelve a la caja para seguir preguntando.
  useEffect(() => {
    if (!isGenerating && !isConversationMode) inputRef.current?.focus();
  }, [isGenerating, isConversationMode]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    enviar(input.trim());
  };

  const enviar = async (texto: string) => {
    if ((!texto && attachedFiles.length === 0) || isGenerating) return;
    setIsConversationMode(false);
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    // Auto-create chat if none is active
    let targetChatId = activeChatId;
    if (!targetChatId) {
      const newChat: Chat = {
        id: genId(),
        title: t("nueva_conversacion"),
        messages: [],
        createdAt: Date.now(),
      };
      targetChatId = newChat.id;
      setChats((prev) => {
        const u = [newChat, ...prev];
        persistChats(u);
        return u;
      });
      setActiveChatId(newChat.id);
    }

    const type =
      attachedFiles.length > 0
        ? attachedFiles.every((f) => f.type.startsWith("image/"))
          ? "image"
          : "file"
        : "text";
    await processMessage(texto, type, targetChatId);
  };

  const clearActiveChat = () => {
    if (window.confirm(t("vaciar_confirm"))) {
      setMessages([]);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsConversationMode(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating, isSpeaking, input]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles: AttachedFile[] = [];
    for (const f of Array.from(e.target.files)) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      });
      newFiles.push({
        name: f.name,
        size: `${(f.size / 1024).toFixed(1)} KB`,
        type: f.type,
        base64,
      });
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const hora = new Date().getHours();
  const saludo = t(hora < 12 ? "saludo_manana" : hora < 19 ? "saludo_tarde" : "saludo_noche");
  const nombre = (user?.name || "").trim().split(/\s+/)[0];
  const q = busqueda.trim().toLowerCase();
  const gruposChats = agruparPorFecha(q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats);
  const etiquetaGrupo: Record<GrupoFecha, string> = {
    hoy: t("hoy"),
    ayer: t("ayer"),
    semana: t("ultimos_7"),
    mes: t("ultimos_30"),
    antes: t("anteriores"),
  };
  const puedeEnviar = (!!input.trim() || attachedFiles.length > 0) && !isGenerating && !isConversationMode;

  if (acceso && !acceso.puede) {
    return (
      <div className="h-[calc(100dvh-8rem)] flex flex-col items-center justify-center text-center gap-3 px-6">
        <ShieldCheck size={36} className="text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-900">No tienes acceso al Agente IA</h2>
        <p className="text-sm text-slate-600 max-w-md">Pídele al SuperAdmin que te dé acceso desde la configuración del agente.</p>
      </div>
    );
  }

  return (
    // 8rem = barra superior (4rem) + el p-8 del layout: así la página no se desplaza.
    <div className="relative w-full h-[calc(100dvh-8rem)] flex font-sans overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      {/* ── LISTA DE CONVERSACIONES ───────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 264, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute md:relative inset-y-0 left-0 z-30 h-full bg-[#f8fafc] md:bg-transparent border-r border-slate-200/80 flex flex-col overflow-hidden shrink-0 shadow-xl md:shadow-none"
          >
            <div className="w-[264px] h-full flex flex-col">
              <div className="h-12 px-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <img src="/supricom.png" alt="" className="w-6 h-6 rounded-md object-cover" />
                  <span className="text-sm font-semibold text-slate-800">Supri AI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  title={t("cerrar_chats")}
                  aria-label={t("cerrar_chats")}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>

              <div className="px-3 pb-2 space-y-2 shrink-0">
                <button
                  type="button"
                  onClick={createChat}
                  className="w-full flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[13px] font-medium transition-colors shadow-[0_1px_2px_rgba(37,99,235,0.35)]"
                >
                  <SquarePen size={15} />
                  {t("nuevo_chat")}
                </button>
                <label className="relative block">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={t("buscar_chats")}
                    aria-label={t("buscar_chats")}
                    className="w-full h-8 pl-8 pr-2 rounded-lg bg-white border border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15 caret-blue-600"
                  />
                </label>
              </div>

              <nav className="flex-1 overflow-y-auto px-2 pb-3 agente-scroll" aria-label={t("titulo")}>
                {chats.length === 0 ? (
                  <p className="text-xs text-slate-500 px-3 py-6">{t("sin_conversaciones")}</p>
                ) : gruposChats.length === 0 ? (
                  <p className="text-xs text-slate-500 px-3 py-6">{t("sin_resultados")}</p>
                ) : (
                  gruposChats.map(([grupo, lista]) => (
                    <div key={grupo} className="mt-3 first:mt-1">
                      <p className="px-3 pb-1 text-[11px] font-medium text-slate-500">{etiquetaGrupo[grupo]}</p>
                      {lista.map((chat) => {
                        const activo = chat.id === activeChatId;
                        return (
                          <div
                            key={chat.id}
                            className={`group relative flex items-center rounded-lg transition-colors ${
                              activo ? "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-200" : "hover:bg-slate-200/50"
                            }`}
                          >
                            {editingChatId === chat.id ? (
                              <input
                                autoFocus
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={saveEditTitle}
                                onKeyDown={handleEditTitleKeyDown}
                                aria-label={t("renombrar")}
                                className="flex-1 min-w-0 m-1 h-7 px-2 text-[13px] bg-white border border-blue-300 rounded-md outline-none text-slate-800 caret-blue-600"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => selectChat(chat.id)}
                                aria-current={activo ? "page" : undefined}
                                className={`flex-1 min-w-0 text-left pl-3 pr-3 group-hover:pr-14 group-focus-within:pr-14 py-2 text-[13px] truncate ${
                                  activo ? "text-slate-900 font-medium" : "text-slate-600"
                                }`}
                              >
                                {chat.title}
                              </button>
                            )}
                            {editingChatId !== chat.id && (
                              <div className="absolute right-1 flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => startEditTitle(chat, e)}
                                  title={t("renombrar")}
                                  aria-label={t("renombrar")}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => deleteChat(chat.id, e)}
                                  title={t("eliminar_chat")}
                                  aria-label={t("eliminar_chat")}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </nav>

              {faltaMcp && (
                <a
                  href="/api/superadmin/agenteia/oauth"
                  className="m-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors shrink-0"
                >
                  <PlugZap size={14} />
                  {t("conectar_odoo")}
                </a>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── CONVERSACIÓN ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-12 px-2 md:px-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title={t("abrir_chats")}
                aria-label={t("abrir_chats")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <h1 className="text-sm font-semibold text-slate-800 truncate">{activeChat?.title ?? "Supri AI"}</h1>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <label className="relative">
              <span className="sr-only">{t("modelo")}</span>
              <Sparkles size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
              <select
                value={modelo}
                onChange={(e) => elegirModelo(e.target.value)}
                disabled={isGenerating}
                title={t("modelo")}
                className="appearance-none h-8 pl-7 pr-7 rounded-lg bg-transparent hover:bg-slate-200/60 text-[13px] font-medium text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-50 cursor-pointer"
              >
                <option value="">{t("modelo_auto")}</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </label>
            {acceso?.superadmin && (
              <button
                type="button"
                onClick={() => setConfiguracion(true)}
                title="Configuración: quién usa el agente e historial de cambios"
                aria-label="Configuración"
                className="flex items-center justify-center size-8 rounded-lg text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <Settings size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={toggleConversationMode}
              aria-pressed={isConversationMode}
              title={isConversationMode ? t("voz_activa") : t("activar_voz")}
              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                isConversationMode ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              <Headphones size={15} />
              <span className="hidden lg:inline">{isConversationMode ? t("voz_activa") : t("activar_voz")}</span>
            </button>
          </div>
        </header>

        {/* Estado del modo voz */}
        <AnimatePresence>
          {(isListening || isSpeaking || isGenerating) && isConversationMode && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex justify-center"
            >
              <div className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-medium" role="status">
                {isSpeaking ? (
                  <>
                    <Volume2 size={14} className="animate-pulse" /> {t("supri_hablando")}
                  </>
                ) : isGenerating ? (
                  <>
                    <BrainCircuit size={14} className="animate-pulse" /> {t("pensando")}
                  </>
                ) : (
                  <>
                    <Mic size={14} className="animate-pulse" /> {t("escuchando")}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
          {/* Video de Supri hablando (modo voz) */}
          <div
            className={`absolute inset-0 z-0 bg-[#f1f1f1] transition-opacity duration-700 ${isSpeaking ? "opacity-100" : "opacity-0"}`}
          >
            <video ref={videoRef} src="/supri-speak.mp4" className="w-full h-full object-contain" muted loop playsInline />
          </div>

          {/* Mensajes */}
          <div
            ref={chatContainerRef}
            className={`flex-1 overflow-y-auto px-3 md:px-6 agente-scroll relative z-10 transition-opacity duration-500 ${
              isSpeaking ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="min-h-full flex flex-col justify-center max-w-2xl mx-auto py-10"
              >
                <img
                  src="/supri2.png"
                  alt=""
                  className="w-12 h-12 rounded-2xl object-cover shadow-[0_6px_16px_-6px_rgba(37,99,235,0.45)]"
                />
                <h2 className="mt-5 text-2xl md:text-3xl font-semibold tracking-[-0.02em] text-slate-900 text-balance">
                  {saludo}
                  {nombre ? `, ${nombre}` : ""}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600 max-w-xl">{t("subtitulo_vacio")}</p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {SUGERENCIAS.map(({ clave, icono: Icono }) => (
                    <button
                      key={clave}
                      type="button"
                      onClick={() => enviar(t(clave))}
                      className="group inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white border border-slate-200 text-[13px] text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:shadow-[0_2px_8px_-2px_rgba(37,99,235,0.25)] transition-[border-color,color,box-shadow]"
                    >
                      <Icono size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                      {t(clave)}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="max-w-3xl mx-auto py-6 space-y-8">
                {messages.map((msg, index) => {
                  const ultimo = index === messages.length - 1;
                  const escribiendo = msg.role === "assistant" && isGenerating && ultimo;
                  return msg.role === "user" ? (
                    <div key={index} className="group flex flex-col items-end gap-1">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white border border-slate-200 px-4 py-2.5 text-[14px] leading-relaxed text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <p className="whitespace-pre-line break-words">{msg.content}</p>
                        {msg.files && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {msg.files.map((file, fIdx) => (
                              <span
                                key={fIdx}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md text-[11px] font-medium text-slate-600"
                              >
                                <FileIcon size={11} className="text-blue-600" />
                                <span className="truncate max-w-[140px]">{file.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 text-slate-400 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <BotonAccion etiqueta={t("copiar")} onClick={() => copiar(index, msg.content)}>
                          {copiado === index ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </BotonAccion>
                        <BotonAccion etiqueta={t("rebobinar")} onClick={() => rebobinar(index, msg.content)} disabled={isGenerating}>
                          <RotateCcw size={14} />
                        </BotonAccion>
                      </div>
                    </div>
                  ) : (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="group flex gap-3"
                    >
                      <img src="/supri2.png" alt="Supri" className="w-7 h-7 mt-0.5 rounded-lg object-cover shrink-0 ring-1 ring-slate-200" />
                      <div className="flex-1 min-w-0 space-y-3">
                        {msg.pasos && msg.pasos.length > 0 && (
                          <PasosHerramientas pasos={msg.pasos} activo={escribiendo} segundos={segundos} avance={avance} />
                        )}
                        {msg.proceso && (
                          <details className="text-[13px] text-slate-500 group/proceso">
                            <summary className="inline-flex items-center gap-1 cursor-pointer select-none font-medium hover:text-slate-800 list-none [&::-webkit-details-marker]:hidden">
                              <ChevronRight size={14} className="transition-transform group-open/proceso:rotate-90" />
                              {t("ver_proceso")}
                            </summary>
                            <p className="mt-2 pl-4 border-l border-slate-200 whitespace-pre-line leading-relaxed">{msg.proceso}</p>
                          </details>
                        )}
                        {msg.content !== "" && (
                          <div data-msg={index} className="agente-md text-[14.5px] leading-7 text-slate-800 break-words">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: TablaConExcel }}>
                              {traducirError(sinMarcas(msg.content))}
                            </ReactMarkdown>
                          </div>
                        )}
                        {archivosDe(msg.content).map((a) => (
                          <ArchivoAgente
                            key={a.id}
                            {...a}
                            activo={archivoAbierto?.id === a.id}
                            onAbrir={() => abrirArchivo(archivoAbierto?.id === a.id ? null : a)}
                          />
                        ))}
                        {cambiosDe(msg.content).map(({ token, detalle }) => (
                          <div key={token} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-800">
                              <TriangleAlert size={15} /> Cambio en Odoo pendiente de confirmar
                            </div>
                            <p className="text-sm text-slate-800">{detalle?.resumen || "Cambio preparado por el agente"}</p>
                            <div className={`flex gap-2 ${acceso?.editor ? "" : "hidden"}`}>
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() => resolverCambio(index, token, true)}
                                className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() => resolverCambio(index, token, false)}
                                className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ))}
                        {escribiendo && msg.pasos?.length ? null : escribiendo ? (
                          <div className="flex items-center gap-2.5 text-[13px] text-slate-500" role="status" aria-live="polite">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60 animate-ping" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                            </span>
                            <span className="font-medium text-slate-600">{avance ? `${avance}…` : t("pensando")}</span>
                            <span className="text-slate-400 tabular-nums">{duracion(segundos)}</span>
                          </div>
                        ) : (
                          msg.content !== "" && (
                            <div className="flex items-center gap-0.5 -ml-1.5 text-slate-400 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <BotonAccion etiqueta={t("copiar")} onClick={() => copiar(index, msg.content)}>
                                {copiado === index ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                              </BotonAccion>
                            </div>
                          )
                        )}
                        {!escribiendo && ultimo && terminaEnError(msg.content) && (
                          <button
                            type="button"
                            onClick={() => reintentar(index)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 transition-colors"
                          >
                            <RefreshCw size={13} />
                            {t("reintentar")}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Caja de mensaje */}
          <div className="px-3 md:px-6 pt-2 pb-3 md:pb-4 shrink-0 relative z-10">
            <form
              onSubmit={handleSend}
              className={`w-full max-w-3xl mx-auto bg-white rounded-2xl border transition-[border-color,box-shadow] shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)] ${
                isConversationMode
                  ? "border-indigo-300 ring-4 ring-indigo-500/10"
                  : "border-slate-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/10"
              }`}
            >
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {attachedFiles.map((file, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-lg bg-slate-100 text-xs font-medium text-slate-700"
                    >
                      <FileIcon size={12} className="text-blue-600" />
                      <span className="truncate max-w-[160px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles((p) => p.filter((_, i) => i !== index))}
                        aria-label={`Quitar ${file.name}`}
                        className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-white"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
              {/* Enter envía; Shift+Enter hace salto de línea. Crece hasta ~8 líneas. */}
              <textarea
                ref={inputRef}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={isConversationMode ? t("habla_espera") : isListening ? t("dictando") : t("mensaje_placeholder")}
                aria-label={t("mensaje_placeholder")}
                className="block w-full bg-transparent border-none outline-none resize-none [field-sizing:content] min-h-[3rem] max-h-48 px-4 pt-3.5 pb-1 text-[14.5px] leading-6 text-slate-900 placeholder:text-slate-400 caret-blue-600 agente-scroll"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isGenerating || isConversationMode}
              />
              <div className="flex items-center gap-1 px-2 pb-2">
                <BotonAccion
                  etiqueta={t("adjuntar")}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating || isConversationMode}
                  grande
                >
                  <Paperclip size={17} />
                </BotonAccion>
                <BotonAccion
                  etiqueta={t("dictar")}
                  onClick={toggleListening}
                  disabled={isGenerating || isConversationMode}
                  grande
                  activo={isListening && !isConversationMode}
                >
                  {isListening && !isConversationMode ? <MicOff size={17} /> : <Mic size={17} />}
                </BotonAccion>
                <div className="flex-1" />
                {isGenerating && abortRef.current && !isConversationMode ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    title={t("detener")}
                    aria-label={t("detener")}
                    className="h-8 w-8 grid place-items-center rounded-full bg-slate-900 hover:bg-slate-700 text-white transition-colors"
                  >
                    <Square size={11} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!puedeEnviar}
                    title={t("enviar")}
                    aria-label={t("enviar")}
                    className="h-8 w-8 grid place-items-center rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {isGenerating && !isConversationMode ? <Loader2 className="animate-spin" size={15} /> : <ArrowUp size={17} />}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {acceso?.superadmin && <DialogoConfiguracion abierto={configuracion} onCerrar={() => setConfiguracion(false)} />}

      {/* ── PANEL LATERAL: vista previa del archivo abierto ─────────────────── */}
      {archivoAbierto && (
        <aside className="fixed inset-0 z-40 md:static md:z-auto md:w-[45%] md:min-w-[22rem] md:max-w-3xl md:shrink-0 bg-white md:border-l border-slate-200 flex flex-col">
          <VistaArchivo key={archivoAbierto.id} {...archivoAbierto} onCerrar={() => setArchivoAbierto(null)} />
        </aside>
      )}
    </div>
  );
}
