"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  Globe,
  History,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = "/api/adminleads/custom-view";

interface FileMeta {
  exists: boolean;
  filename?: string;
  updatedAt?: string;
  size?: number;
  baseRevision?: number;
  revision?: number;
  savedAt?: string | null;
  savedBy?: string | null;
}

interface Version {
  id: number;
  kind: "upload" | "state" | "restore";
  label: string | null;
  baseRevision: number;
  revision: number;
  createdBy: string | null;
  createdAt: string;
  hasSnapshot: boolean;
  hasState: boolean;
}

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-VE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const formatSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function PlanContenidoPanel({
  canUpload,
  emptyHint,
}: {
  canUpload: boolean;
  emptyHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const [meta, setMeta] = useState<FileMeta>({ exists: false });
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadMeta = useCallback(() => {
    fetch(`${API}/meta`)
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({ exists: false }));
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // El guardado real ocurre dentro del iframe (mismo origen, con la cookie de
  // sesion). Aqui solo se refleja el estado para el usuario.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "SUPRICOM_PLAN_STATUS") return;
      setStatus(e.data.status as SaveStatus);
      if (e.data.status === "saved") {
        setMeta((m) => ({ ...m, revision: e.data.revision, savedAt: new Date().toISOString() }));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    const socket = io(url, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("vista-html-updated", (payload: { meta?: FileMeta }) => {
      if (payload?.meta) setMeta((m) => ({ ...m, exists: true, ...payload.meta }));
      else loadMeta();
      setIframeKey((k) => k + 1);
    });

    socket.on("vista-state-updated", (payload: { revision?: number; by?: string }) => {
      setMeta((m) => ({
        ...m,
        revision: payload?.revision ?? m.revision,
        savedBy: payload?.by ?? m.savedBy,
        savedAt: new Date().toISOString(),
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [loadMeta]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html") && !file.name.toLowerCase().endsWith(".htm")) {
      showToast("err", "Solo se aceptan archivos .html");
      return;
    }
    setUploading(true);
    try {
      // Se fuerza un guardado del panel actual antes de cambiar la base, para
      // que ningun cambio reciente se quede sin registrar.
      iframeRef.current?.contentWindow?.postMessage({ type: "SUPRICOM_PLAN_SAVE_NOW" }, "*");
      await new Promise((r) => setTimeout(r, 600));

      const form = new FormData();
      form.append("html", file);
      const res = await fetch(API, { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        setMeta((m) => ({ ...m, exists: true, ...data.meta }));
        setIframeKey((k) => k + 1);
        setVersions(null);
        showToast("ok", "HTML actualizado. Los cambios del panel se reaplicaron encima.");
      } else {
        showToast("err", data.error || "Error al subir el archivo");
      }
    } catch {
      showToast("err", "Error de conexion");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openHistory = async () => {
    setShowHistory(true);
    try {
      const r = await fetch(`${API}/history`);
      const d = await r.json();
      setVersions(d.versions || []);
    } catch {
      setVersions([]);
    }
  };

  const restore = async (id: number) => {
    setRestoring(id);
    try {
      const r = await fetch(`${API}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (d.success) {
        setShowHistory(false);
        setIframeKey((k) => k + 1);
        showToast("ok", `Panel restaurado a la version #${id}`);
      } else {
        showToast("err", d.error || "No se pudo restaurar");
      }
    } catch {
      showToast("err", "Error de conexion");
    } finally {
      setRestoring(null);
    }
  };

  const statusPill = () => {
    const base = "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium";
    if (status === "saving")
      return <span className={`${base} bg-blue-50 text-blue-600`}><Loader2 className="w-3 h-3 animate-spin" />Guardando</span>;
    if (status === "pending")
      return <span className={`${base} bg-amber-50 text-amber-600`}><Cloud className="w-3 h-3" />Sin guardar</span>;
    if (status === "error")
      return <span className={`${base} bg-red-50 text-red-600`}><CloudOff className="w-3 h-3" />Error al guardar</span>;
    if (status === "saved")
      return <span className={`${base} bg-emerald-50 text-emerald-600`}><CheckCircle2 className="w-3 h-3" />Guardado</span>;
    return null;
  };

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100dvh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Plan de Contenido</h1>
              {statusPill()}
            </div>
            {meta.exists && (
              <p className="text-xs text-slate-400">
                {meta.filename && <span className="font-medium text-slate-500">{meta.filename}</span>}
                {!!meta.size && <span> · {formatSize(meta.size)}</span>}
                {meta.updatedAt && <span> · HTML {formatDate(meta.updatedAt)}</span>}
                {!!meta.revision && <span> · {meta.revision} cambios guardados</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meta.exists && (
            <>
              <Button
                variant="outline" size="sm"
                onClick={() => window.open(API, "_blank")}
                className="gap-1.5 text-slate-600"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Pantalla completa
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => window.open(`${API}?mode=snapshot&download=1`, "_blank")}
                className="gap-1.5 text-slate-600"
                title="Descarga el HTML completo con todos los cambios del panel"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar
              </Button>
            </>
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
              <Button variant="outline" size="sm" onClick={openHistory} className="gap-1.5 text-slate-600">
                <History className="w-3.5 h-3.5" />
                Historial
              </Button>
              <input ref={fileRef} type="file" accept=".html,.htm" className="hidden" onChange={handleUpload} />
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
              <p className="text-lg font-semibold text-slate-600">Sin plan de contenido</p>
              <p className="text-sm mt-1">
                {canUpload
                  ? 'Sube un archivo HTML con el boton "Actualizar HTML"'
                  : emptyHint || "El administrador aun no ha subido ningun plan"}
              </p>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={`${API}?t=${iframeKey}`}
            className="w-full h-full border-0"
            title="Plan de Contenido"
          />
        )}
      </div>

      {/* Historial */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
             onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-slate-900">Historial del plan</h2>
                <p className="text-xs text-slate-400">Cada cambio guardado queda registrado aqui</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-3">
              {versions === null && (
                <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                </div>
              )}
              {versions?.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-10">Todavia no hay versiones guardadas</p>
              )}
              {versions?.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-2 ${
                        v.kind === "upload"
                          ? "bg-blue-100 text-blue-700"
                          : v.kind === "restore"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        {v.kind === "upload" ? "HTML" : v.kind === "restore" ? "RESTAURADA" : "CAMBIO"}
                      </span>
                      {v.label || `Revision ${v.revision}`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(v.createdAt)}
                      {v.createdBy && ` · ${v.createdBy}`}
                      {` · #${v.id}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {v.hasSnapshot && (
                      <Button
                        variant="outline" size="sm"
                        className="gap-1 text-slate-600 h-8"
                        onClick={() => window.open(`${API}/history?id=${v.id}`, "_blank")}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="outline" size="sm"
                      className="gap-1 text-slate-600 h-8"
                      disabled={!v.hasState || restoring === v.id}
                      onClick={() => restore(v.id)}
                    >
                      {restoring === v.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />}
                      Restaurar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
