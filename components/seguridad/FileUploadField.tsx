"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Upload, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic";
const DEFAULT_MAX_MB = 10;
const CAMERA_ACCEPT = "image/*";

function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseAccept(accept: string) {
  const types = new Set<string>();
  const extensions = new Set<string>();
  accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((token) => {
      if (token.startsWith(".")) {
        extensions.add(token);
      } else if (token.includes("/*")) {
        types.add(token);
      } else if (token.includes("/")) {
        types.add(token);
      }
    });
  return { types, extensions };
}

function validateFile(
  file: File,
  accept: string,
  maxSizeMB: number,
): string | null {
  const { types, extensions } = parseAccept(accept);
  const type = (file.type || "").toLowerCase();
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";

  const wildcardOk = types.has("image/*") && type.startsWith("image/");
  const mimeOk = type && types.has(type);
  const extOk = ext && extensions.has(ext);
  const typeOk = wildcardOk || mimeOk || extOk;

  if (!typeOk) return "Tipo de archivo no permitido";

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `El archivo supera el máximo de ${maxSizeMB} MB`;
  }
  return null;
}

function pickFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  const list = Array.from(files);
  return (
    list.find((f) => (f.type || "").startsWith("image/")) || list[0] || null
  );
}

export type FileUploadFieldProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  label: string;
  hint?: string;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
  error?: string | null;
};

export function FileUploadField({
  value,
  onChange,
  label,
  hint,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = DEFAULT_MAX_MB,
  disabled = false,
  error: externalError = null,
}: FileUploadFieldProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragCount, setDragCount] = useState(0);
  const [internalError, setInternalError] = useState<string | null>(null);

  const isDragging = !disabled && !value && dragCount > 0;
  const hasFile = !!value;
  const error = internalError || externalError;

  useEffect(() => {
    if (value === null) setInternalError(null);
  }, [value]);

  const setFile = (file: File | null) => {
    if (!file) {
      setInternalError(null);
      return;
    }
    const err = validateFile(file, accept, maxSizeMB);
    if (err) {
      setInternalError(err);
      return;
    }
    setInternalError(null);
    onChange(file);
  };

  const clearFile = () => {
    setInternalError(null);
    onChange(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const resetInput = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) ref.current.value = "";
  };

  const onCameraInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = pickFile(e.target.files);
    setFile(file);
    resetInput(cameraRef);
  };

  const onUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = pickFile(e.target.files);
    setFile(file);
    resetInput(uploadRef);
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (disabled || hasFile) return;
    e.preventDefault();
    setDragCount((c) => c + 1);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (disabled || hasFile) return;
    e.preventDefault();
    setDragCount((c) => Math.max(0, c - 1));
  };
  const onDragOver = (e: React.DragEvent) => {
    if (disabled || hasFile) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: React.DragEvent) => {
    if (disabled || hasFile) return;
    e.preventDefault();
    setDragCount(0);
    const file = pickFile(e.dataTransfer?.files);
    if (file) setFile(file);
  };

  const containerClass = cn(
    "rounded-[10px] p-4 transition-colors",
    "border-2",
    error
      ? "border-red-300 bg-red-50/40"
      : hasFile
        ? "border-solid border-violet-200 bg-violet-50/30"
        : isDragging
          ? "border-solid border-violet-500 bg-violet-50"
          : cn(
              "border-dashed border-slate-200 bg-slate-50/30",
              !disabled && "hover:border-violet-300 hover:bg-violet-50/20",
            ),
  );

  return (
    <div className="w-full">
      <div
        className={containerClass}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        aria-disabled={disabled || undefined}
      >
        {!hasFile ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "shrink-0 p-2 rounded-[10px] transition-colors",
                  isDragging ? "bg-violet-100" : "bg-slate-100",
                )}
              >
                <Camera
                  className={cn(
                    "w-5 h-5 transition-colors",
                    isDragging ? "text-violet-600" : "text-slate-500",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                {hint && (
                  <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={disabled}
                className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
              >
                <Camera className="w-4 h-4" />
                Tomar foto
              </button>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                disabled={disabled}
                className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                Elegir archivo
              </button>
            </div>
          </div>
        ) : (
          <ImagePreview
            file={value}
            onRemove={clearFile}
            disabled={disabled}
          />
        )}

        <input
          ref={cameraRef}
          type="file"
          accept={CAMERA_ACCEPT}
          capture="environment"
          onChange={onCameraInput}
          className="hidden"
          tabIndex={-1}
          aria-hidden
        />
        <input
          ref={uploadRef}
          type="file"
          accept={accept}
          onChange={onUploadInput}
          className="hidden"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function ImagePreview({
  file,
  onRemove,
  disabled = false,
}: {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const url = useMemo(() => {
    if (typeof URL === "undefined" || !URL.createObjectURL) return null;
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-violet-200 bg-white flex items-center justify-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="w-6 h-6 text-violet-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {file.name}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {fmtSize(file.size)}
          {file.type ? ` · ${file.type}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-[10px] text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Quitar archivo"
      >
        <XCircle className="w-3.5 h-3.5" />
        Quitar
      </button>
    </div>
  );
}

export default FileUploadField;
