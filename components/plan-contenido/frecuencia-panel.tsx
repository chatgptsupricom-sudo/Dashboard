"use client";

// ============================================================
// FrecuenciaPanel — Sirve el HTML de Frecuencia CPM via iframe
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = "/api/plan-contenido/frecuencia";
const HTML_URL = "/frecuencia-cpm.html";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function FrecuenciaPanel({ userRole }: { userRole: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [iframeKey, setIframeKey] = useState(0);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // Listen for messages from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "SUPRICOM_FRECUENCIA_STATUS") return;
      if (e.data.status === "saved") {
        setStatus("saved");
        showToast("ok", "Plan guardado correctamente");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Socket for real-time updates
  useEffect(() => {
    const url = window.location.origin;
    const socket = io(url, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("frecuencia-updated", () => {
      setIframeKey((k) => k + 1);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Notify iframe to save
  const handleSave = () => {
    setStatus("saving");
    iframeRef.current?.contentWindow?.postMessage(
      { type: "SUPRICOM_FRECUENCIA_SAVE_NOW" },
      "*",
    );
    // The iframe will call the API and post back the status
  };

  // Reload iframe
  const handleReload = () => {
    setIframeKey((k) => k + 1);
  };

  const statusPill = () => {
    const base = "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium";
    if (status === "saving")
      return <span className={`${base} bg-blue-50 text-blue-600`}><Loader2 className="w-3 h-3 animate-spin" />Guardando</span>;
    if (status === "saved")
      return <span className={`${base} bg-emerald-50 text-emerald-600`}><CheckCircle2 className="w-3 h-3" />Guardado</span>;
    if (status === "error")
      return <span className={`${base} bg-red-50 text-red-600`}><AlertCircle className="w-3 h-3" />Error</span>;
    return null;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] p-4">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Frecuencia CPM</h1>
          <p className="text-xs text-gray-500">
            Planificación mensual de contenido B2B — Rol: {userRole}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusPill()}
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1" />
            Guardar
          </Button>
          <Button variant="outline" size="sm" onClick={handleReload}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Recargar
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-2 px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 inline mr-1" />
          ) : (
            <AlertCircle className="w-4 h-4 inline mr-1" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Iframe */}
      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white">
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={HTML_URL}
          className="w-full h-full"
          title="Frecuencia CPM"
        />
      </div>
    </div>
  );
}
