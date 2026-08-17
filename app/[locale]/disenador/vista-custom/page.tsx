"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Globe, RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileMeta {
  exists: boolean;
  filename?: string;
  updatedAt?: string;
  size?: number;
}

export default function VistaCustomDisenadorPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [meta, setMeta] = useState<FileMeta>({ exists: false });
  const [iframeKey, setIframeKey] = useState(0);

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

  // Socket.IO: receive real-time check updates
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

  // Listen for save messages from iframe — diseñador can also mark checks
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
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-slate-200 shadow-sm min-h-0">
        {!meta.exists ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-4">
            <Globe className="w-16 h-16 opacity-20" />
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-600">Sin contenido disponible</p>
              <p className="text-sm mt-1">El administrador aún no ha subido ningún plan</p>
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
