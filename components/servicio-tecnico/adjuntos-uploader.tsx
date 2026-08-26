"use client";

import { useEffect, useRef, useState } from "react";

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime";
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_DIMENSION = 1600;

export type AdjuntoEstado = {
  id: string; // local id
  file: File;
  preview: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number; // 0-100
  error?: string;
  serverId?: number;
  serverUrl?: string;
};

type Props = {
  trackingToken: string;
  endpoint?: string; // default: /api/servicio-tecnico/ticket/adjuntos
  onChange?: (files: AdjuntoEstado[]) => void;
  lang?: "es" | "en";
};

// Comprime una imagen en canvas y devuelve un Blob JPEG. Si ya es menor
// a MAX_BYTES, devuelve el archivo original sin recomprimir para no perder
// calidad en imagenes pequenas.
async function compressImage(file: File): Promise<File> {
  // HEIC no se decodifica en el navegador sin una lib externa; lo mandamos crudo.
  // Si el cliente quiere evitar HEIC, la alternativa es convertir en iOS antes.
  if (file.type === "image/heic") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 800 * 1024) return file; // <= 800 KB ya esta bien

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      URL.revokeObjectURL(url);
      resolve(i);
    };
    i.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    i.src = url;
  });

  const ratio = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82)
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

export default function AttachmentUploader({
  trackingToken,
  endpoint = "/api/servicio-tecnico/ticket/adjuntos",
  onChange,
}: Props) {
  const [files, setFiles] = useState<AdjuntoEstado[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrs = useRef<Map<string, XMLHttpRequest>>(new Map());

  // Todo cambio de estado pasa por la forma funcional de setFiles.
  //
  // La version anterior hacia `setFiles(files.map(...))` leyendo `files` del
  // closure del render, y ahi estaba el fallo: addFiles metia los archivos al
  // estado y acto seguido llamaba a upload(), que los buscaba en el `files`
  // viejo — el que todavia no los tenia —, no encontraba nada y salia sin
  // enviar. Los adjuntos se quedaban en "pending" para siempre: sin barra de
  // progreso, sin error, sin peticion en la red. Solo el contador decia
  // "0 de N adjuntos subidos" y el formulario rechazaba el envio.
  const alCambiar = useRef(onChange);
  alCambiar.current = onChange;

  const primerRender = useRef(true);
  useEffect(() => {
    // El primer efecto notificaria un array vacio sin que haya pasado nada.
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    alCambiar.current?.(files);
  }, [files]);

  function parchear(localFileId: string, cambios: Partial<AdjuntoEstado>) {
    setFiles((prev) =>
      prev.map((f) => (f.id === localFileId ? { ...f, ...cambios } : f))
    );
  }

  function localId() {
    return Math.random().toString(36).slice(2, 10);
  }

  async function addFiles(incoming: File[]) {
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) return;

    const accepted: AdjuntoEstado[] = [];
    for (const raw of incoming.slice(0, remaining)) {
      // Validacion basica en cliente (la real la hace el servidor).
      if (!ACCEPT.split(",").includes(raw.type)) {
        accepted.push({
          id: localId(),
          file: raw,
          preview: "",
          status: "error",
          progress: 0,
          error: "Tipo no permitido",
        });
        continue;
      }
      if (raw.size > MAX_BYTES) {
        accepted.push({
          id: localId(),
          file: raw,
          preview: "",
          status: "error",
          progress: 0,
          error: "Supera 20 MB",
        });
        continue;
      }

      const preview = raw.type.startsWith("image/")
        ? URL.createObjectURL(raw)
        : "";

      // Comprimir imagenes para reducir banda (especialmente mobile).
      let toUpload = raw;
      try {
        if (raw.type.startsWith("image/") && raw.type !== "image/heic") {
          toUpload = await compressImage(raw);
        }
      } catch {
        // Si falla la compresion, mandamos el original.
      }

      accepted.push({
        id: localId(),
        file: toUpload,
        preview: preview || "",
        status: "pending",
        progress: 0,
      });
    }

    setFiles((prev) => [...prev, ...accepted]);
    // Disparar upload de los que quedaron pending. Se les pasa el objeto
    // entero, no el id: el estado todavia no se ha aplicado.
    accepted.forEach((a) => {
      if (a.status === "pending") upload(a);
    });
  }

  function upload(item: AdjuntoEstado) {
    if (item.status === "uploading" || item.status === "done") return;

    parchear(item.id, { status: "uploading", progress: 0, error: undefined });

    const formData = new FormData();
    formData.append("tracking_token", trackingToken);
    formData.append("files", item.file);

    const xhr = new XMLHttpRequest();
    xhrs.current.set(item.id, xhr);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      parchear(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
    };

    xhr.onload = () => {
      xhrs.current.delete(item.id);

      if (xhr.status < 200 || xhr.status >= 300) {
        let reason = "Error al subir";
        try {
          reason = JSON.parse(xhr.responseText).error || reason;
        } catch {}
        parchear(item.id, { status: "error", progress: 0, error: reason });
        return;
      }

      let data: any;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        parchear(item.id, {
          status: "error",
          progress: 0,
          error: "Respuesta invalida",
        });
        return;
      }

      // El endpoint devuelve 201 con success:true aunque el archivo haya sido
      // rechazado (tipo no permitido, error al guardar): lo que decide es que
      // venga en `saved`. Sin este chequeo el adjunto se marcaba como subido
      // y el ticket se enviaba sin foto.
      const saved =
        (data.saved || []).find((s: any) => s.filename === item.file.name) ||
        data.saved?.[0];

      if (!saved?.id) {
        const motivo =
          (data.errors || []).find(
            (e: any) => e.filename === item.file.name
          )?.reason ||
          data.errors?.[0]?.reason ||
          "El servidor no guardo el archivo";
        parchear(item.id, { status: "error", progress: 0, error: motivo });
        return;
      }

      parchear(item.id, {
        status: "done",
        progress: 100,
        error: undefined,
        serverId: saved.id,
        serverUrl: `/api/servicio-tecnico/ticket/adjuntos/${trackingToken}/${saved.id}`,
      });
    };

    xhr.onerror = () => {
      xhrs.current.delete(item.id);
      parchear(item.id, {
        status: "error",
        progress: 0,
        error: "Error de red",
      });
    };

    xhr.open("POST", endpoint);
    xhr.send(formData);
  }

  function remove(localFileId: string) {
    const xhr = xhrs.current.get(localFileId);
    if (xhr) xhr.abort();
    xhrs.current.delete(localFileId);
    const target = files.find((f) => f.id === localFileId);
    if (target?.preview) URL.revokeObjectURL(target.preview);
    setFiles((prev) => prev.filter((f) => f.id !== localFileId));
  }

  function retry(localFileId: string) {
    const target = files.find((f) => f.id === localFileId);
    if (!target) return;
    upload({ ...target, status: "pending", progress: 0, error: undefined });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    addFiles(Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer) return;
    addFiles(Array.from(e.dataTransfer.files));
  }

  const canAdd = files.length < MAX_FILES;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors"
      >
        <p className="text-sm text-slate-600 mb-2">
          Arrastra fotos o video aqui, o
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canAdd}
          className="text-sm font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          selecciona archivos
        </button>
        <p className="text-xs text-slate-400 mt-2">
          JPG, PNG, WebP, HEIC, MP4, MOV. Max 20 MB por archivo, {MAX_FILES}{" "}
          archivos.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onInputChange}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((f) => (
            <div
              key={f.id}
              className="relative border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm"
            >
              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                {f.file.type.startsWith("image/") && f.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.preview}
                    alt={f.file.name}
                    className="w-full h-full object-cover"
                  />
                ) : f.file.type.startsWith("video/") ? (
                  <video
                    src={f.preview}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="text-slate-400 text-xs text-center px-2">
                    {f.file.name}
                  </div>
                )}
              </div>

              {f.status === "uploading" && (
                <div className="absolute inset-x-0 bottom-0 bg-white/90 px-2 py-1">
                  <div className="h-1 bg-slate-200 rounded overflow-hidden">
                    <div
                      className="h-full bg-violet-600 transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 text-center mt-1">
                    {f.progress}%
                  </p>
                </div>
              )}

              {f.status === "done" && (
                <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  ✓
                </div>
              )}

              {f.status === "error" && (
                <div className="absolute inset-0 bg-red-50/90 flex items-center justify-center text-center px-2">
                  <div>
                    <p className="text-xs text-red-700 font-semibold">
                      {f.error || "Error"}
                    </p>
                    <button
                      type="button"
                      onClick={() => retry(f.id)}
                      className="text-[10px] text-red-700 underline mt-1"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => remove(f.id)}
                className="absolute top-1 left-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black/80"
                aria-label="Quitar"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        {files.filter((f) => f.status === "done").length} de {files.length}{" "}
        adjuntos subidos
      </p>
    </div>
  );
}