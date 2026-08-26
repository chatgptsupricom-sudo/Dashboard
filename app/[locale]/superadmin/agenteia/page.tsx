"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, Title } from "@tremor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  Check,
  FileIcon,
  Headphones,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  User,
  Volume2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface AttachedFile {
  name: string;
  size: string;
  type: string;
  base64: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  files?: AttachedFile[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

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
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textRef = useRef("");
  const isConversationModeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const processMessageRef = useRef<any>(null);

  // ── Load persisted chats on mount ──────────────────────────────────────────
  useEffect(() => {
    const stored = loadChats();
    if (stored.length > 0) {
      setChats(stored);
      setActiveChatId(stored[0].id);
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
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
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persistChats(updated);
      if (activeChatId === id) {
        setActiveChatId(updated[0]?.id ?? null);
      }
      return updated;
    });
    // Best-effort: delete chat memory from n8n/PostgreSQL in the background
    console.log("[agenteia] Eliminando historial del chat:", id);
    fetch("/api/superadmin/agenteia", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: id }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        console.log("[agenteia] Respuesta DELETE:", res.status, body);
      })
      .catch((err) => {
        console.error("[agenteia] Error en fetch DELETE:", err);
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

    const fetchAgenteia = () =>
      fetch("/api/superadmin/agenteia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          messageType,
          chatId,
          userId: (user as any)?.uid ?? null,
          userName: user?.name ?? null,
          userEmail: user?.email ?? null,
          userRole: user?.role ?? null,
        }),
      });

    try {
      const response = await fetchAgenteia();

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
      let accumulated = "";

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        accumulated += decoder.decode(value);
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.role === "assistant")
            next[last] = { ...next[last], content: accumulated };
          return next;
        }, chatId);
      }

      if (isConversationModeRef.current)
        speakText(accumulated.replace(/\*/g, ""));
    } catch (err: any) {
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
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    processMessageRef.current = processMessage;
  }, [messages, attachedFiles, activeChatId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isGenerating) return;
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
    await processMessage(input.trim(), type, targetChatId);
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
    <div className="w-full h-[calc(100vh-80px)] flex font-sans overflow-hidden">
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
        <Card className="flex-1 mt-3 bg-white rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden p-0 flex flex-col relative">
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
                  </motion.div>
                ) : (
                  messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="shrink-0 flex items-end">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
                            <img
                              src="/supri2.png"
                              alt="Supri"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                      <div className="max-w-[85%] md:max-w-[75%] flex flex-col space-y-1">
                        <div
                          className={`p-3 md:p-4 rounded-2xl md:rounded-3xl text-[13px] md:text-sm font-medium leading-relaxed shadow-sm border ${
                            msg.role === "user"
                              ? "bg-slate-900 border-slate-950 text-white rounded-br-sm"
                              : "bg-white border-slate-100 text-slate-800 rounded-bl-sm"
                          }`}
                        >
                          {msg.content === "" &&
                          isGenerating &&
                          index === messages.length - 1 ? (
                            <div className="flex items-center gap-2 text-slate-400 py-1">
                              <Loader2
                                className="animate-spin text-blue-600"
                                size={14}
                              />
                              <span className="text-[10px] font-black uppercase tracking-wider">
                                {t("pensando")}
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="whitespace-pre-line">
                                {msg.content}
                              </p>
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
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider text-slate-400 px-2 ${msg.role === "user" ? "text-right" : "text-left"}`}
                        >
                          {msg.role === "user" ? t("tu") : t("supri")}
                        </span>
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
                className={`relative flex items-center bg-slate-50 rounded-xl md:rounded-2xl border px-2 md:px-3 gap-1 ${
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
                <input
                  type="text"
                  placeholder={
                    isConversationMode
                      ? t("habla_espera")
                      : isListening
                        ? t("dictando")
                        : t("mensaje_placeholder")
                  }
                  className="w-full bg-transparent border-none outline-none py-3 md:py-4 px-1 md:px-2 text-xs font-semibold text-slate-700"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isGenerating || isConversationMode}
                />
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
              </form>
            </div>
          </>
        </Card>
      </div>
    </div>
  );
}
