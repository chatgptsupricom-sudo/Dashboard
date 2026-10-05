"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, Title } from "@tremor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  Check,
  Copy,
  Download,
  FileIcon,
  FileSpreadsheet,
  Headphones,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Square,
  Trash2,
  User,
  Volume2,
  X,
} from "lucide-react";
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
    <div className="my-2">
      <div className="overflow-x-auto">
        <table ref={ref} {...props} />
      </div>
      <button
        type="button"
        onClick={exportar}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
      >
        <FileSpreadsheet size={12} /> Descargar en Excel
      </button>
    </div>
  );
}

// Tarjeta de un archivo creado por el agente. El HTML se puede ver ahí mismo,
// en un iframe aislado (sandbox sin allow-same-origin: no toca el panel).
function ArchivoAgente({ id, nombre }: { id: string; nombre: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const esHtml = /\.html?$/i.test(nombre);
  const ver = async () => {
    if (html !== null) return setHtml(null);
    const r = await fetch(urlArchivo(id));
    setHtml(r.ok ? await r.text() : "<p>No se pudo abrir el archivo.</p>");
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center gap-2">
        <FileIcon size={16} className="text-blue-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-700 truncate flex-1">{nombre}</span>
        {esHtml && (
          <button type="button" onClick={ver} className="text-[11px] font-bold text-slate-600 hover:text-blue-700">
            {html !== null ? "Ocultar" : "Ver"}
          </button>
        )}
        <a
          href={urlArchivo(id)}
          download={nombre}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold"
        >
          <Download size={12} /> Descargar
        </a>
      </div>
      {html !== null && (
        <iframe
          title={nombre}
          srcDoc={html}
          sandbox="allow-scripts"
          className="mt-2 w-full h-96 rounded-lg border border-slate-200 bg-white"
        />
      )}
    </div>
  );
}

// Mientras trabaja, el backend intercala [[avance:texto]] en la respuesta: no
// es parte del mensaje, es el estado que se muestra debajo ("Consultando…").
const MARCA_AVANCE = /\[\[avance:([^\]\n]*)\]\]/g;

const duracion = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`);

const genId = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
const STORAGE_KEY = "agenteia-chats-v1";

function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistChats(chats: Chat[]) {
  try {
    // Strip base64 files before persisting to avoid bloating localStorage
    const slim = chats.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({ ...m, files: undefined })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
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

  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<{
    text: string;
    type: "text" | "voice" | "file" | "image";
  } | null>(null);
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
    setLastFailedMessage(null);
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
  useEffect(() => {
    const stored = loadChats();
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
  }, []);

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
  const createChat = () => {
    setActiveChatId(null);
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
      chats.find((c) => c.id === chatId)?.messages ?? messages;
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
        setLastFailedMessage({ text: messageText, type: messageType });
        throw new Error(errBody?.error ?? t("error_respuesta"));
      }
      setLastFailedMessage(null);
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let crudo = "";

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        // El servidor manda espacios de ancho cero como latido: no son texto.
        crudo += decoder.decode(value, { stream: !d }).replace(/\u200B/g, "");
        // La respuesta es lo que viene después de la última consulta. Lo que
        // el agente escribió antes (entre consulta y consulta) es su proceso:
        // se guarda aparte y se muestra plegado, no como respuesta.
        const marcas = [...crudo.matchAll(MARCA_AVANCE)];
        const ultima = marcas[marcas.length - 1];
        const corte = ultima ? ultima.index! + ultima[0].length : 0;
        const proceso = crudo.slice(0, corte).replace(MARCA_AVANCE, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
        accumulated = crudo.slice(corte).trimStart();
        // Una marca que llegó cortada entre dos trozos no se muestra a medias.
        if (!d) accumulated = accumulated.replace(/\[\[[^\]]*$/, "");
        setAvance(ultima && accumulated.trim() === "" ? ultima[1] : "");
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.role === "assistant")
            next[last] = { ...next[last], content: accumulated, proceso: proceso || undefined };
          return next;
        }, chatId);
      }

      // Primer intercambio del chat: el título provisional (el inicio del
      // mensaje) se cambia por uno escrito por la IA.
      if (updatedMessages.length === 1) titularChat(chatId, messageText);

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
      const errorMsg =
        err?.message && err.message !== t("error_respuesta")
          ? `⚠️ ${err.message}`
          : t("error_respuesta");
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
    }
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
  return (
    // 8rem = barra superior (4rem) + el p-8 del layout: así la página no se desplaza.
    <div className="w-full h-[calc(100dvh-8rem)] flex font-sans overflow-hidden">
      {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full bg-white border-r border-slate-100 flex flex-col overflow-hidden shrink-0 z-10"
          >
            {/* Sidebar header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <img
                  src="/supricom.png"
                  alt="Supri"
                  className="w-7 h-7 rounded-full object-cover"
                />
                <span className="text-xs font-black uppercase tracking-tight text-slate-700">
                  Supri AI
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            {/* New chat button */}
            <div className="p-3 shrink-0">
              <button
                onClick={createChat}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                <MessageSquarePlus size={14} />
                {t("nuevo_chat")}
              </button>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
              {chats.length === 0 ? (
                <p className="text-[10px] text-slate-400 text-center py-4 px-3">
                  {t("sin_conversaciones")}
                </p>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => selectChat(chat.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start justify-between gap-2 group transition-colors cursor-pointer ${
                      chat.id === activeChatId
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {editingChatId === chat.id ? (
                      <div
                        className="flex items-center gap-1 flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={saveEditTitle}
                          onKeyDown={handleEditTitleKeyDown}
                          className="flex-1 min-w-0 text-[11px] font-semibold bg-white border border-blue-300 rounded-md px-1.5 py-0.5 outline-none text-slate-800"
                        />
                        <button
                          onClick={saveEditTitle}
                          className="shrink-0 p-0.5 rounded-md text-blue-500 hover:bg-blue-100"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] font-semibold leading-snug line-clamp-2 flex-1">
                        {chat.title}
                      </span>
                    )}
                    {editingChatId !== chat.id && (
                      <div className="shrink-0 flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100">
                        <span
                          onClick={(e) => startEditTitle(chat, e)}
                          className={`p-0.5 rounded-md transition-colors hover:bg-blue-100 hover:text-blue-500 ${
                            chat.id === activeChatId
                              ? "text-blue-400"
                              : "text-slate-300"
                          }`}
                          role="button"
                          title={t("renombrar")}
                        >
                          <Pencil size={11} />
                        </span>
                        <span
                          onClick={(e) => deleteChat(chat.id, e)}
                          className={`p-0.5 rounded-md transition-colors hover:bg-red-100 hover:text-red-500 ${
                            chat.id === activeChatId
                              ? "text-blue-400"
                              : "text-slate-300"
                          }`}
                          role="button"
                          title={t("eliminar_chat")}
                        >
                          <Trash2 size={11} />
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {faltaMcp && (
              <a
                href="/api/superadmin/agenteia/oauth"
                className="m-3 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors shrink-0"
              >
                {t("conectar_odoo")}
              </a>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── MAIN CHAT AREA ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-2 md:p-4 overflow-hidden min-w-0">
        {/* Header */}
        <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <div className="w-9 h-9 bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <img
                src="/supricom.png"
                alt="Supri"
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div>
              <Title className="text-base md:text-lg font-black text-slate-900 tracking-tighter uppercase italic">
                Supri <span className="text-blue-600">AI</span>
              </Title>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest hidden sm:block">
                {activeChat?.title ?? t("titulo")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={modelo}
              onChange={(e) => elegirModelo(e.target.value)}
              disabled={isGenerating}
              title={t("modelo")}
              aria-label={t("modelo")}
              className="max-w-[9rem] sm:max-w-none px-2 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-[10px] md:text-xs font-bold outline-none hover:bg-slate-200 disabled:opacity-50"
            >
              <option value="">{t("modelo_auto")}</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <button
              onClick={toggleConversationMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-bold transition-all ${
                isConversationMode
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 animate-pulse"
                  : "bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
              }`}
            >
              <Headphones size={13} />
              <span className="hidden sm:inline">
                {isConversationMode ? t("voz_activa") : t("activar_voz")}
              </span>
            </button>
          </div>
        </div>

        {/* Status indicator */}
        <AnimatePresence>
          {(isListening || isSpeaking || isGenerating) &&
            isConversationMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex justify-center mt-3"
              >
                <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-5 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                  {isSpeaking ? (
                    <>
                      <Volume2 size={13} className="animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {t("supri_hablando")}
                      </span>
                    </>
                  ) : isGenerating ? (
                    <>
                      <BrainCircuit size={13} className="animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {t("pensando")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic size={13} className="animate-bounce" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {t("escuchando")}
                      </span>
                    </>
                  )}
                </div>
              </motion.div>
            )}
        </AnimatePresence>

        {/* Chat card */}
        <Card className="flex-1 mt-3 bg-white rounded-2xl border-0 ring-1 ring-slate-200 shadow-sm overflow-hidden p-0 flex flex-col relative">
          {/* Speaking video background */}
          <div
            className={`absolute inset-0 z-0 bg-[#f1f1f1] transition-opacity duration-700 ${isSpeaking ? "opacity-100" : "opacity-0"}`}
          >
            <video
              ref={videoRef}
              src="/supri-speak.mp4"
              className="w-full h-full object-contain"
              muted
              loop
              playsInline
            />
          </div>

          {/* Messages + input always visible */}
          <>
            {/* Messages */}
            <div
              ref={chatContainerRef}
              className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 custom-scrollbar relative z-10 transition-all duration-500 ${
                isSpeaking
                  ? "opacity-0 pointer-events-none scale-95"
                  : "opacity-100 scale-100"
              }`}
            >
              <AnimatePresence initial={false}>
                {messages.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 p-8"
                  >
                    <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-2xl shadow-blue-500/20">
                      <img
                        src="/supri2.png"
                        alt="Supri"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                        {t("listo_ayudar")}
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        {t("escribe_mensaje")}
                      </p>
                    </div>
                    <div className="w-full grid gap-2 pt-2">
                      {(["sugerencia_1", "sugerencia_2", "sugerencia_3", "sugerencia_4"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => enviar(t(k))}
                          className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          {t(k)}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 w-full max-w-4xl mx-auto ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="shrink-0 flex items-start">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
                            <img
                              src="/supri2.png"
                              alt="Supri"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                      <div className={`flex flex-col space-y-1 min-w-0 ${msg.role === "user" ? "max-w-[85%] md:max-w-[75%]" : "flex-1"}`}>
                        <div
                          className={`text-[13px] md:text-sm font-medium leading-relaxed ${
                            msg.role === "user"
                              ? "p-3 md:p-4 rounded-2xl md:rounded-3xl shadow-sm border bg-slate-900 border-slate-950 text-white rounded-br-sm"
                              : "px-1 text-slate-800"
                          }`}
                        >
                          {msg.proceso && (
                            <details className="mb-2 text-xs text-slate-500">
                              <summary className="cursor-pointer select-none font-semibold hover:text-slate-700">
                                {t("ver_proceso")}
                              </summary>
                              <p className="mt-1 pl-3 border-l-2 border-slate-200 whitespace-pre-line font-normal leading-relaxed">
                                {msg.proceso}
                              </p>
                            </details>
                          )}
                          {msg.content === "" &&
                          isGenerating &&
                          index === messages.length - 1 ? null : (
                            <div className="space-y-2">
                              {msg.role === "user" ? (
                                <p className="whitespace-pre-line">{msg.content}</p>
                              ) : (
                                <div data-msg={index} className="agente-md break-words [&_td]:tabular-nums">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: TablaConExcel }}>
                                    {sinMarcas(msg.content)}
                                  </ReactMarkdown>
                                </div>
                              )}
                              {msg.role === "assistant" &&
                                archivosDe(msg.content).map((a) => <ArchivoAgente key={a.id} {...a} />)}
                              {msg.role === "assistant" &&
                                cambiosDe(msg.content).map(({ token, detalle }) => (
                                  <div key={token} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                                    <div className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                                      Cambio en Odoo pendiente
                                    </div>
                                    <div className="text-slate-800">{detalle?.resumen || "Cambio preparado por el agente"}</div>
                                    {detalle && (
                                      <pre className="text-[10px] bg-white/70 rounded p-2 overflow-x-auto text-slate-600">
                                        {JSON.stringify(
                                          { operacion: detalle.operacion, model: detalle.model, ids: detalle.ids, method: detalle.method, values: detalle.values, args: detalle.args, kwargs: detalle.kwargs },
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    )}
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        disabled={isGenerating}
                                        onClick={() => resolverCambio(index, token, true)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isGenerating}
                                        onClick={() => resolverCambio(index, token, false)}
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              {msg.files && (
                                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100/20">
                                  {msg.files.map((file, fIdx) => (
                                    <div
                                      key={fIdx}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/40 rounded-lg text-[10px] font-bold text-slate-300"
                                    >
                                      <FileIcon
                                        size={10}
                                        className="text-blue-400"
                                      />
                                      <span className="truncate max-w-[120px]">
                                        {file.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {msg.role === "assistant" && isGenerating && index === messages.length - 1 && (
                          <div className="flex items-center gap-2 px-1 py-1 text-slate-500" role="status">
                            <Loader2 className="animate-spin text-blue-600 shrink-0" size={14} />
                            <span className="text-xs font-semibold">{avance ? `${avance}…` : t("pensando")}</span>
                            <span className="text-[11px] text-slate-400 tabular-nums">{duracion(segundos)}</span>
                          </div>
                        )}
                        <div
                          className={`flex items-center gap-1 px-2 text-slate-400 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          {msg.content !== "" && (
                            <button
                              type="button"
                              onClick={() => copiar(index, msg.content)}
                              title={t("copiar")}
                              aria-label={t("copiar")}
                              className="p-1 rounded-md hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              {copiado === index ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            </button>
                          )}
                          {msg.role === "user" && (
                            <button
                              type="button"
                              disabled={isGenerating}
                              onClick={() => rebobinar(index, msg.content)}
                              title={t("rebobinar")}
                              aria-label={t("rebobinar")}
                              className="p-1 rounded-md hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      {msg.role === "user" && (
                        <div className="shrink-0 flex items-end">
                          <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shadow-inner">
                            <User size={16} />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Retry banner */}
            {lastFailedMessage && !isGenerating && (
              <div className="mx-3 md:mx-4 mt-2 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <p className="text-[11px] font-semibold text-amber-700">
                  El agente no respondió. ¿Deseas reintentar?
                </p>
                <button
                  onClick={() => {
                    const { text, type } = lastFailedMessage;
                    setLastFailedMessage(null);
                    // Remove the failed assistant message before retrying
                    setMessages((prev) => {
                      const next = [...prev];
                      if (next[next.length - 1]?.role === "assistant")
                        next.pop();
                      if (next[next.length - 1]?.role === "user") next.pop();
                      return next;
                    });
                    processMessage(text, type);
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition-colors"
                >
                  <Loader2 size={11} />
                  {t("reintentar")}
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="p-3 md:p-4 bg-white border-t border-slate-50 shrink-0 space-y-2">
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100 max-h-[80px] overflow-y-auto">
                  {attachedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border text-[11px] font-bold text-slate-700"
                    >
                      <FileIcon size={12} className="text-blue-500" />
                      <span className="truncate max-w-[140px]">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachedFiles((p) =>
                            p.filter((_, i) => i !== index),
                          )
                        }
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={handleSend}
                className={`relative flex items-center w-full max-w-4xl mx-auto bg-slate-50 rounded-xl md:rounded-2xl border px-2 md:px-3 gap-1 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/10 transition-shadow ${
                  isConversationMode
                    ? "border-indigo-200 ring-2 ring-indigo-500/10"
                    : "border-slate-200/60"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating || isConversationMode}
                  className="p-1.5 md:p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  <Paperclip size={16} />
                </button>
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={isGenerating || isConversationMode}
                  className={`p-1.5 md:p-2 rounded-lg disabled:opacity-50 ${isListening && !isConversationMode ? "bg-red-50 text-red-500 animate-pulse" : "text-slate-400 hover:text-blue-600 hover:bg-slate-100"}`}
                >
                  {isListening && !isConversationMode ? (
                    <MicOff size={16} />
                  ) : (
                    <Mic size={16} />
                  )}
                </button>
                {/* Enter envía; Shift+Enter hace salto de línea. Crece hasta ~6 líneas. */}
                <textarea
                  ref={inputRef}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    isConversationMode
                      ? t("habla_espera")
                      : isListening
                        ? t("dictando")
                        : t("mensaje_placeholder")
                  }
                  className="w-full bg-transparent border-none outline-none resize-none [field-sizing:content] max-h-36 py-3 md:py-4 px-1 md:px-2 text-xs font-semibold text-slate-700"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isGenerating || isConversationMode}
                />
                {isGenerating && abortRef.current && !isConversationMode ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    title="Detener"
                    aria-label="Detener"
                    className="p-2 md:p-2.5 bg-slate-900 hover:bg-red-600 text-white rounded-lg md:rounded-xl shadow-md"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={
                      (!input.trim() && attachedFiles.length === 0) ||
                      isGenerating ||
                      isConversationMode
                    }
                    className="p-2 md:p-2.5 bg-blue-600 hover:bg-slate-950 disabled:bg-slate-200 text-white rounded-lg md:rounded-xl shadow-md disabled:shadow-none"
                  >
                    {isGenerating && !isConversationMode ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                )}
              </form>
            </div>
          </>
        </Card>
      </div>
    </div>
  );
}
