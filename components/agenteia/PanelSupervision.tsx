"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// SuperAdmin: conversaciones del Agente IA de los demás usuarios
// (/api/superadmin/agenteia/supervision). Usuarios → sus conversaciones → los
// mensajes. Las alertas las pone la revisión automática (lib/agenteia/supervision.ts).

type Usuario = { uid: string; email: string; nombre: string; chats: number; ultimo: string | null; alertas: number; pendientes: number };
type Alerta = { categoria: string; motivo: string; extracto: string; vista: boolean };
type ChatResumen = { id: string; titulo: string; actualizado: string | null; alerta: Alerta | null };
type Mensaje = { role: "user" | "assistant"; content: string };

const API = "/api/superadmin/agenteia/supervision";

const ETIQUETA: Record<string, string> = { ajeno: "Uso ajeno a la empresa", sospechoso: "Actitud sospechosa" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

// Marcas internas del agente (botón de confirmar cambio) que no son texto.
const limpio = (t: string) => t.replace(/\n*\[\[confirmar-odoo:[A-Za-z0-9_.-]+\]\]/g, "\n[cambio en Odoo propuesto]");

function AvisoAlerta({ alerta }: { alerta: Alerta }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={14} className="shrink-0" /> {ETIQUETA[alerta.categoria] || "Alerta"}
      </p>
      {alerta.motivo && <p className="mt-0.5">{alerta.motivo}</p>}
      {alerta.extracto && <p className="mt-1 italic text-amber-800">«{alerta.extracto}»</p>}
    </div>
  );
}

export default function PanelSupervision({ onPendientes }: { onPendientes?: (n: number) => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [chats, setChats] = useState<ChatResumen[] | null>(null);
  const [chat, setChat] = useState<ChatResumen | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [error, setError] = useState("");

  const cargarUsuarios = () =>
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setUsuarios(j.usuarios || []);
        onPendientes?.(Number(j.pendientes) || 0);
      })
      .catch(() => setError("No se pudo cargar la lista de usuarios."));

  useEffect(() => {
    cargarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirUsuario = (u: Usuario) => {
    setUsuario(u);
    setChats(null);
    setError("");
    fetch(`${API}?uid=${encodeURIComponent(u.uid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setChats(j.chats || []))
      .catch(() => setError("No se pudieron cargar las conversaciones."));
  };

  const abrirChat = (c: ChatResumen) => {
    if (!usuario) return;
    setChat(c);
    setMensajes(null);
    setError("");
    fetch(`${API}?uid=${encodeURIComponent(usuario.uid)}&chat=${encodeURIComponent(c.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setMensajes(j.mensajes || []);
        // Abrirla la marcó como vista: se refrescan los contadores.
        if (c.alerta && !c.alerta.vista) {
          setChats((prev) => prev?.map((x) => (x.id === c.id && x.alerta ? { ...x, alerta: { ...x.alerta, vista: true } } : x)) ?? prev);
          cargarUsuarios();
        }
      })
      .catch(() => setError("No se pudo cargar la conversación."));
  };

  const cargando = (texto: string) => (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 size={14} className="animate-spin" /> {texto}
    </div>
  );
  const volver = (texto: string, accion: () => void) => (
    <button
      type="button"
      onClick={accion}
      className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700"
    >
      <ChevronLeft size={14} /> {texto}
    </button>
  );

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 3. Mensajes de una conversación */}
      {usuario && chat ? (
        <>
          {volver(`Conversaciones de ${usuario.nombre || usuario.email}`, () => setChat(null))}
          <h3 className="text-sm font-semibold text-slate-900">{chat.titulo || "Sin título"}</h3>
          {chat.alerta && <AvisoAlerta alerta={chat.alerta} />}
          {!mensajes && !error && cargando("Cargando mensajes…")}
          {mensajes?.length === 0 && <p className="py-4 text-sm text-slate-500">Esta conversación no tiene mensajes.</p>}
          <div className="space-y-2">
            {mensajes?.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-4 py-3 text-sm ${
                  m.role === "user" ? "bg-blue-50 border border-blue-100" : "bg-slate-50 border border-slate-100"
                }`}
              >
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {m.role === "user" ? usuario.nombre || usuario.email : "Agente IA"}
                </p>
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap break-words text-slate-800">{m.content}</p>
                ) : (
                  // Las respuestas del agente vienen en markdown (tablas, títulos).
                  <div className="agente-md overflow-x-auto text-[14px] leading-6 text-slate-800 break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{limpio(m.content)}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : usuario ? (
        /* 2. Conversaciones de un usuario */
        <>
          {volver("Usuarios", () => setUsuario(null))}
          <h3 className="text-sm font-semibold text-slate-900">
            {usuario.nombre || usuario.email}
            {usuario.nombre && <span className="ml-2 font-normal text-slate-500">{usuario.email}</span>}
          </h3>
          {!chats && !error && cargando("Cargando conversaciones…")}
          {chats?.length === 0 && <p className="py-4 text-sm text-slate-500">No tiene conversaciones guardadas.</p>}
          <div className="divide-y divide-slate-100">
            {chats?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrirChat(c)}
                className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-slate-50 rounded-md px-1"
              >
                <MessageSquare size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{c.titulo || "Sin título"}</span>
                  <span className="block text-[11px] text-slate-500">{fecha(c.actualizado)}</span>
                </span>
                {c.alerta && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      c.alerta.vista ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {ETIQUETA[c.alerta.categoria] || "Alerta"}
                  </span>
                )}
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </>
      ) : (
        /* 1. Usuarios */
        <>
          <p className="text-[13px] text-slate-600">
            Conversaciones de los usuarios que usan el agente. Las de un SuperAdmin no aparecen. Una revisión automática
            marca las que parecen ajenas a la empresa o sospechosas; es una ayuda, conviene leerlas antes de concluir.
          </p>
          {!usuarios && !error && cargando("Cargando usuarios…")}
          {usuarios?.length === 0 && <p className="py-4 text-sm text-slate-500">Ningún otro usuario tiene conversaciones todavía.</p>}
          <div className="divide-y divide-slate-100">
            {usuarios?.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => abrirUsuario(u)}
                className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-slate-50 rounded-md px-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{u.nombre || u.email}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {u.nombre ? `${u.email} · ` : ""}
                    {u.chats} {u.chats === 1 ? "conversación" : "conversaciones"} · {fecha(u.ultimo)}
                  </span>
                </span>
                {u.pendientes > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle size={11} /> {u.pendientes} {u.pendientes === 1 ? "alerta" : "alertas"}
                  </span>
                ) : u.alertas > 0 ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {u.alertas} vista{u.alertas === 1 ? "" : "s"}
                  </span>
                ) : null}
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
