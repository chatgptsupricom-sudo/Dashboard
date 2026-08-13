"use client";

import { useEffect, useState } from "react";
import { Globe, RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileMeta {
  exists: boolean;
  filename?: string;
  updatedAt?: string;
  size?: number;
}

export default function VistaCustomDisenadorPage() {
  const [meta, setMeta] = useState<FileMeta>({ exists: false });
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    fetch("/api/adminleads/custom-view/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({ exists: false }));
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
            key={iframeKey}
            src={`/api/adminleads/custom-view?t=${iframeKey}`}
            className="w-full h-full border-0"
            title="Plan de Contenido"
          />
        )}
      </div>
    </div>
  );
}
