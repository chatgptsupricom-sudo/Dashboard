"use client";

import { Card, Title } from "@tremor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  FileIcon,
  Headphones,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Trash2,
  User,
  Volume2,
  X,
} from "lucide-react";
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

export default function AgenteIAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textRef = useRef("");
  const isConversationModeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const processMessageRef = useRef<any>(null);

  // Ref para controlar el elemento video
  const videoRef = useRef<HTMLVideoElement>(null);

  // Asegúrate de que este es el ÚNICO useEffect que controla el video
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (isSpeaking) {
        video.play().catch((e) => console.warn("Video play failed:", e));
      } else {
        video.pause();
        video.currentTime = 0; // Reinicia al terminar de hablar
      }
    }
  }, [isSpeaking]);

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
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
              const finalToSubmit = textRef.current.trim();
              if (
                finalToSubmit &&
                !isGeneratingRef.current &&
                processMessageRef.current
              ) {
                processMessageRef.current(finalToSubmit);
              }
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
            } catch (e) {}
          }
        };

        rec.onerror = (event: any) => {
          console.warn("⚠️ Error en reconocimiento de voz:", event.error);
          if (event.error === "not-allowed") {
            alert("Permiso denegado para usar el micrófono.");
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

  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(
      (v) =>
        v.lang.startsWith("es") &&
        (v.name.includes("Google") || v.name.includes("Female")),
    );
    if (spanishVoice) utterance.voice = spanishVoice;

    utterance.onstart = () => setIsSpeaking(true);

    utterance.onend = () => {
      setIsSpeaking(false);
      if (isConversationModeRef.current) {
        setTimeout(() => {
          startListening();
        }, 500);
      }
    };

    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isSpeakingRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {}
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Tu navegador no soporta entrada de voz directa.");
      return;
    }
    setIsConversationMode(false);
    if (isListening) stopListening();
    else startListening();
  };

  const toggleConversationMode = () => {
    const nextState = !isConversationMode;
    setIsConversationMode(nextState);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    if (nextState) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      startListening();
    } else {
      stopListening();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const processMessage = async (messageText: string) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setInput("");
    textRef.current = "";

    stopListening();

    const userMessage: Message = {
      role: "user",
      content: messageText,
      files: attachedFiles.length > 0 ? attachedFiles : undefined,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setAttachedFiles([]);
    setIsGenerating(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/gerente_operaciones/agenteia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) throw new Error("Error en comunicación.");
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        accumulatedText += chunkValue;

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex]?.role === "assistant") {
            newMessages[lastIndex].content = accumulatedText;
          }
          return newMessages;
        });
      }

      if (isConversationModeRef.current) {
        const textToRead = accumulatedText.replace(/\*/g, "");
        speakText(textToRead);
      }
    } catch (err) {
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (newMessages[lastIndex]?.role === "assistant") {
          newMessages[lastIndex].content =
            "⚠️ Ocurrió una interrupción al generar la respuesta.";
        }
        return newMessages;
      });
      if (isConversationModeRef.current) speakText("Ocurrió un error.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    processMessageRef.current = processMessage;
  }, [messages, attachedFiles]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isGenerating) return;

    setIsConversationMode(false);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    await processMessage(input.trim());
  };

  const clearChat = () => {
    if (
      window.confirm("¿Deseas vaciar el historial de conversación con Supri?")
    ) {
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
    const filesArray = Array.from(e.target.files);
    const newAttachedFiles: AttachedFile[] = [];

    for (const f of filesArray) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      });
      newAttachedFiles.push({
        name: f.name,
        size: `${(f.size / 1024).toFixed(1)} KB`,
        type: f.type,
        base64,
      });
    }
    setAttachedFiles((prev) => [...prev, ...newAttachedFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    // CONTENEDOR FLUIDO: Ocupa todo el espacio que el layout global le deje libre
    <div className="p-2 md:p-6 w-full max-w-6xl mx-auto h-[calc(100vh-80px)] flex flex-col font-sans">
      {/* HEADER DE CONTROL */}
      <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 rounded-full overflow-hidden shadow-inner flex items-center justify-center p-0.5">
            <img
              src="/supricom.png"
              alt="Supri"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div>
            <Title className="text-lg md:text-xl font-black text-slate-900 tracking-tighter uppercase italic">
              Supri <span className="text-blue-600">AI</span>
            </Title>
            <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 hidden sm:block">
              Inteligencia Corporativa Supricom
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* BOTÓN MODO CONVERSACIÓN CONTINUA */}
          <button
            onClick={toggleConversationMode}
            className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all ${
              isConversationMode
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 animate-pulse"
                : "bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
            }`}
            title="Activar Chat por Voz Continuo"
          >
            <Headphones size={14} className="md:w-4 md:h-4" />
            <span className="hidden sm:inline">
              {isConversationMode ? "Modo Voz Activo" : "Activar Voz"}
            </span>
          </button>

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 md:p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* INDICADOR DE ESTADO VISUAL */}
      <AnimatePresence>
        {(isListening || isSpeaking || isGenerating) && isConversationMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex justify-center mt-4"
          >
            <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 md:px-6 py-1.5 md:py-2 rounded-full flex items-center gap-2 md:gap-3 shadow-sm">
              {isSpeaking ? (
                <>
                  <Volume2 size={14} className="animate-pulse md:w-4 md:h-4" />
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">
                    Supri Hablando...
                  </span>
                </>
              ) : isGenerating ? (
                <>
                  <BrainCircuit
                    size={14}
                    className="animate-spin md:w-4 md:h-4"
                  />
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">
                    Pensando...
                  </span>
                </>
              ) : (
                <>
                  <Mic size={14} className="animate-bounce md:w-4 md:h-4" />
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">
                    Te escucho...
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ÁREA CENTRAL DE CONVERSACIÓN */}
      <Card className="flex-1 mt-4 bg-white rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden p-0 flex flex-col relative">
        {/* VIDEO DE FONDO: Ahora con mejor manejo de opacidad y posición */}
        {/* CONTENEDOR DEL VIDEO: Centrado y con fondo blanco */}
        <div
          className={`absolute inset-0 z-0 bg-[#f1f1f1] transition-opacity duration-700 ease-in-out ${
            isSpeaking ? "opacity-100" : "opacity-0"
          }`}
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

        {/* CONTENEDOR DE MENSAJES (Se oculta cuando habla la IA) */}
        {/* CONTENEDOR DE MENSAJES */}
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
                className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 p-4 md:p-8"
              >
                {/* SUPRI GIGANTE AL INICIO */}
                <div className="relative w-28 h-28 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-2xl shadow-blue-500/20">
                  <img
                    src="/supri2.png"
                    alt="Supri"
                    className={`w-full h-full object-cover ${isSpeaking ? "hidden" : "block"}`}
                  />
                  <video
                    ref={isSpeaking ? videoRef : null}
                    src="/supri-speak.mp4"
                    className={`w-full h-full object-cover ${isSpeaking ? "block" : "hidden"}`}
                    muted
                    loop
                    playsInline
                  />
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                    Estoy listo para ayudarte
                  </h3>
                  <p className="text-[10px] md:text-xs text-slate-400 leading-relaxed font-medium">
                    Haz clic en <strong>"Activar Voz"</strong> arriba para
                    interactuar conmigo a manos libres.
                  </p>
                </div>
              </motion.div>
            ) : (
              messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 md:gap-4 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* BURBUJA DE SUPRI */}
                  {msg.role === "assistant" && (
                    <div className="shrink-0 flex items-end">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
                        <img
                          src="/supri2.png" // Siempre imagen estática
                          alt="Supri"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  <div className="max-w-[85%] md:max-w-[75%] flex flex-col space-y-1 md:space-y-1.5">
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
                          <span className="text-[10px] md:text-[11px] font-black uppercase tracking-wider">
                            Pensando...
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="whitespace-pre-line">{msg.content}</p>
                          {msg.files && (
                            <div className="flex flex-wrap gap-1 md:gap-2 mt-2 pt-2 border-t border-slate-100/20">
                              {msg.files.map((file, fIdx) => (
                                <div
                                  key={fIdx}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/40 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-bold text-slate-300"
                                >
                                  <FileIcon
                                    size={10}
                                    className="text-blue-400"
                                  />
                                  <span className="truncate max-w-[80px] md:max-w-[120px]">
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
                      className={`text-[8px] md:text-[9px] font-black uppercase tracking-wider text-slate-400 px-1 md:px-2 ${
                        msg.role === "user" ? "text-right" : "text-left"
                      }`}
                    >
                      {msg.role === "user" ? "Tú" : "Supri"}
                    </span>
                  </div>
                  {msg.role === "user" && (
                    <div className="shrink-0 flex items-end">
                      <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shadow-inner">
                        <User size={16} className="md:w-[18px] md:h-[18px]" />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT INFERIOR */}
        <div className="p-3 md:p-4 bg-white border-t border-slate-50 shrink-0 space-y-2 md:space-y-3">
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100 max-h-[80px] overflow-y-auto">
              {attachedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1.5 bg-white px-2 py-1 md:px-3 md:py-1.5 rounded-lg border text-[10px] md:text-xs font-bold text-slate-700"
                >
                  <FileIcon size={12} className="text-blue-500" />
                  <span className="truncate max-w-[100px] md:max-w-[150px]">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachedFile(index)}
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
              <Paperclip size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button
              type="button"
              onClick={toggleListening}
              disabled={isGenerating || isConversationMode}
              className={`p-1.5 md:p-2 rounded-lg disabled:opacity-50 ${
                isListening && !isConversationMode
                  ? "bg-red-50 text-red-500 animate-pulse"
                  : "text-slate-400 hover:text-blue-600 hover:bg-slate-100"
              }`}
            >
              {isListening && !isConversationMode ? (
                <MicOff size={16} className="md:w-[18px] md:h-[18px]" />
              ) : (
                <Mic size={16} className="md:w-[18px] md:h-[18px]" />
              )}
            </button>
            <input
              type="text"
              placeholder={
                isConversationMode
                  ? "Habla y espera 5s..."
                  : isListening
                    ? "Dictando..."
                    : "Mensaje..."
              }
              className="w-full bg-transparent border-none outline-none py-3 md:py-4 px-1 md:px-2 text-[11px] md:text-xs font-semibold text-slate-700"
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
                <Loader2
                  className="animate-spin md:w-[15px] md:h-[15px]"
                  size={14}
                />
              ) : (
                <Send size={14} className="md:w-[15px] md:h-[15px]" />
              )}
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
