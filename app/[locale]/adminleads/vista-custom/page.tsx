"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@/lib/types";
import { Globe, Upload, RefreshCw, CheckCircle2, AlertCircle, Loader2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileMeta {
  exists: boolean;
  filename?: string;
  updatedAt?: string;
  size?: number;
}

export default function VistaCustomPage() {
  const { user } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [meta, setMeta] = useState<FileMeta>({ exists: false });
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const canUpload =
    user?.role === UserRole.SUPER_ADMIN ||
    (user?.role === UserRole.ADMIN_LEADS && Number((user as any).cids) === 9);

  // Fetch server checks and push them into the iframe
  const pushChecksToIframe = useCallback(async () => {
    try {
      const res = await fetch("/api/adminleads/custom-view/checks");
      const data = await res.json();
      const checks = data.checks || {};
      iframeRef.current?.contentWindow?.postMessage(
        { type: "SUPRICOM_CHECK_RESTORE", checks },
        "*"
      );
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch("/api/adminleads/custom-view/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({ exists: false }));
  }, []);

  // Socket.IO: receive real-time check updates from other users
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    const socket = io(url, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("vista-checks-updated", (payload: { checks: Record<string, number> }) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "SUPRICOM_CHECK_RESTORE", checks: payload.checks || {} },
        "*"
      );
    });

    socket.on("vista-html-updated", (payload: { meta: FileMeta }) => {
      if (payload?.meta) {
        setMeta({ exists: true, ...payload.meta });
        setIframeKey((k) => k + 1);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Listen for check-save messages from the iframe, then POST to API
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (!e.data || e.data.type !== "SUPRICOM_CHECK_SAVE") return;
      const checks = e.data.checks || {};
      try {
        await fetch("/api/adminleads/custom-view/checks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checks),
        });
        // No need to re-push: the server emits WebSocket which we handle above
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html")) {
      showToast("err", "Solo se aceptan archivos .html");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("html", file);
      const res = await fetch("/api/adminleads/custom-view", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        setMeta({ exists: true, ...data.meta });
        setIframeKey((k) => k + 1);
        showToast("ok", "Vista actualizada correctamente");
      } else {
        showToast("err", data.error || "Error al subir el archivo");
      }
    } catch {
      showToast("err", "Error de conexión");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100dvh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Plan de Contenido</h1>
            {meta.exists && (
              <p className="text-xs text-slate-400">
                {meta.filename && <span className="font-medium text-slate-500">{meta.filename}</span>}
                {meta.size && <span> · {formatSize(meta.size)}</span>}
                {meta.updatedAt && <span> · Actualizado {formatDate(meta.updatedAt)}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meta.exists && (
            <Button
              variant="outline" size="sm"
              onClick={() => window.open("/api/adminleads/custom-view", "_blank")}
              className="gap-1.5 text-slate-600"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Pantalla completa
            </Button>
          )}

          <Button
            variant="outline" size="sm"
            onClick={() => setIframeKey((k) => k + 1)}
            className="gap-1.5 text-slate-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recargar
          </Button>

          {canUpload && (
            <>
              <input ref={fileRef} type="file" accept=".html" className="hidden" onChange={handleUpload} />
              <Button
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? "Subiendo..." : "Actualizar HTML"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium flex-shrink-0 ${
          toast.type === "ok"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {toast.type === "ok"
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* iframe */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-slate-200 shadow-sm min-h-0">
        {!meta.exists ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-4">
            <Globe className="w-16 h-16 opacity-20" />
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-600">Sin vista personalizada</p>
              <p className="text-sm mt-1">
                {canUpload
                  ? 'Sube un archivo HTML con el botón "Actualizar HTML"'
                  : "El administrador aún no ha subido ninguna vista"}
              </p>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={`/api/adminleads/custom-view?t=${iframeKey}`}
            className="w-full h-full border-0"
            title="Plan de Contenido"
            onLoad={pushChecksToIframe}
          />
        )}
      </div>
    </div>
  );
}
