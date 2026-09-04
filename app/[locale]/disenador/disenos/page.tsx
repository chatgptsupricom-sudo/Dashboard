"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Loader2,
  X,
  Upload,
  Trash2,
  Image as ImageIcon,
  Palette,
  Download,
  Check,
  FolderUp,
  Pencil,
  FileArchive,
} from "lucide-react";

interface Design {
  id: number;
  title: string;
  folder: string | null;
  created_by: string;
  created_at: string;
  image_path: string;
}

interface StagedFile {
  file: File;
  preview: string;
  title: string;
  folder: string;
}

const LIMIT = 24;
const UPLOAD_BATCH = 8;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

// Comprime imágenes rasterizadas grandes en el navegador antes de subirlas.
// SVG/GIF se dejan intactos.
function compressImage(file: File): Promise<{ file: File; preview: string }> {
  const MAX_DIM = 1600;
  const SKIP_BYTES = 900 * 1024;

  const fallback = (): Promise<{ file: File; preview: string }> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ file, preview: (ev.target?.result as string) || "" });
      reader.onerror = () => resolve({ file, preview: "" });
      reader.readAsDataURL(file);
    });

  if (file.size < SKIP_BYTES || file.type === "image/gif" || file.type === "image/svg+xml") {
    return fallback();
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); resolve(fallback()); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(fallback()); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const isPng = file.type === "image/png";
      const mime = isPng ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(fallback()); return; }
          const ext = isPng ? "png" : "jpg";
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, "") + "." + ext,
            { type: mime }
          );
          const reader = new FileReader();
          reader.onload = (ev) => resolve({ file: compressed, preview: (ev.target?.result as string) || "" });
          reader.onerror = () => resolve({ file: compressed, preview: "" });
          reader.readAsDataURL(compressed);
        },
        mime,
        isPng ? undefined : 0.85
      );
    };
    img.src = url;
  });
}

function folderFromPath(relPath: string): string {
  if (!relPath) return "";
  const parts = relPath.split("/").filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return "";
}

export default function DisenosCatalogoPage() {
  const { user } = useAuthStore();

  // Catálogo
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const [searchInput, setSearchInput] = useState("");

  // Carga
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Selección múltiple
  const [selected, setSelected] = useState<Map<number, Design>>(new Map());
  const [zipping, setZipping] = useState(false);

  // Modales
  const [preview, setPreview] = useState<Design | null>(null);
  const [editing, setEditing] = useState<Design | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Design | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch catálogo ────────────────────────────────────────────────────────
  const fetchDesigns = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) p.set("search", search);
      if (folderFilter) p.set("folder", folderFilter);
      const res = await fetch(`/api/disenador/disenos?${p}`);
      const data = await res.json();
      if (data.success) {
        setDesigns(data.designs || []);
        setFolders(data.folders || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error("fetchDesigns:", e);
    } finally {
      setLoading(false);
    }
  }, [page, search, folderFilter]);

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);

  // Debounce del buscador
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchInput]);

  // ── Preparar archivos (comprimir + preview) ───────────────────────────────
  const prepareFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList).filter((f) => IMAGE_RE.test(f.name));
    if (arr.length === 0) {
      alert("No se encontraron imágenes (png, jpg, webp, gif, svg) en la selección.");
      return;
    }
    setPreparing(true);
    try {
      const prepared: StagedFile[] = [];
      for (const f of arr) {
        const { file, preview } = await compressImage(f);
        const rel = (f as any).webkitRelativePath || "";
        prepared.push({
          file,
          preview,
          title: f.name.replace(/\.[^.]+$/, ""),
          folder: folderFromPath(rel),
        });
      }
      setStaged((prev) => [...prev, ...prepared]);
    } finally {
      setPreparing(false);
    }
  };

  const handleFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    prepareFiles(e.target.files);
    e.target.value = "";
  };
  const handleFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    prepareFiles(e.target.files);
    e.target.value = "";
  };

  const updateStaged = (idx: number, patch: Partial<StagedFile>) => {
    setStaged((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeStaged = (idx: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== idx));
  };
  const clearStaged = () => setStaged([]);

  // ── Subir (en lotes) ──────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (staged.length === 0 || !user?.name) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: staged.length });
    try {
      for (let i = 0; i < staged.length; i += UPLOAD_BATCH) {
        const chunk = staged.slice(i, i + UPLOAD_BATCH);
        const fd = new FormData();
        fd.append("created_by", user.name);
        fd.append("titles", JSON.stringify(chunk.map((s) => s.title || s.file.name)));
        fd.append("folders", JSON.stringify(chunk.map((s) => s.folder || "")));
        chunk.forEach((s) => fd.append("images", s.file));
        const res = await fetch("/api/disenador/disenos", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        setUploadProgress({ done: Math.min(i + chunk.length, staged.length), total: staged.length });
      }
      setStaged([]);
      setPage(1);
      await fetchDesigns();
    } catch (e: any) {
      alert("Error al subir: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Selección ─────────────────────────────────────────────────────────────
  const toggleSelect = (d: Design) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(d.id)) next.delete(d.id);
      else next.set(d.id, d);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Map());
  const selectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      designs.forEach((d) => next.set(d.id, d));
      return next;
    });
  };

  // ── Descargas ─────────────────────────────────────────────────────────────
  const downloadOne = async (d: Design) => {
    try {
      const res = await fetch(d.image_path);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${d.title || "diseno"}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("No se pudo descargar: " + e.message);
    }
  };

  const downloadZip = async () => {
    if (selected.size === 0) return;
    setZipping(true);
    try {
      const res = await fetch("/api/disenador/disenos/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected.keys()) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `disenos-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Error al generar el ZIP: " + e.message);
    } finally {
      setZipping(false);
    }
  };

  // ── Editar ────────────────────────────────────────────────────────────────
  const openEdit = (d: Design) => {
    setEditing(d);
    setEditTitle(d.title);
    setEditFolder(d.folder || "");
  };
  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/disenador/disenos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, title: editTitle, folder: editFolder }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(null);
      await fetchDesigns();
    } catch (e: any) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Borrar ────────────────────────────────────────────────────────────────
  const confirmDeleteOne = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/disenador/disenos?id=${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      await fetchDesigns();
    } catch (e: any) {
      alert("No se pudo eliminar: " + e.message);
    } finally {
      setDeleting(false);
    }
  };
  const confirmBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected.keys()).join(",");
      const res = await fetch(`/api/disenador/disenos?ids=${ids}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearSelection();
      setBulkDeleteOpen(false);
      setPage(1);
      await fetchDesigns();
    } catch (e: any) {
      alert("No se pudieron eliminar: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const stagedByFolder = staged.reduce<Record<string, number>>((acc, s) => {
    const k = s.folder || "(sin carpeta)";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-fuchsia-100 rounded-xl">
          <Palette className="w-6 h-6 text-fuchsia-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de Diseños</h1>
          <p className="text-sm text-slate-500">Sube tus diseños y consúltalos como catálogo</p>
        </div>
      </div>

      {/* Carga */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">Subir diseños</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => filesInputRef.current?.click()}
              disabled={preparing || uploading}
              className="h-11"
            >
              <Upload className="w-4 h-4 mr-2" />
              Subir archivos
            </Button>
            <Button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={preparing || uploading}
              className="h-11 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
            >
              <FolderUp className="w-4 h-4 mr-2" />
              Subir carpeta completa
            </Button>
            {preparing && (
              <span className="flex items-center text-sm text-slate-500">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparando imágenes…
              </span>
            )}
            <input
              ref={filesInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFilesPick}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFolderPick}
              // Atributos no estándar para selección de carpeta
              {...({ webkitdirectory: "", directory: "", mozdirectory: "" } as any)}
            />
          </div>
          <p className="text-xs text-slate-400">
            La carga por carpeta toma el nombre de cada subcarpeta como colección. Formatos: PNG, JPG, WEBP, GIF, SVG.
          </p>

          {/* Staging */}
          {staged.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{staged.length}</span> archivo{staged.length > 1 ? "s" : ""} listo{staged.length > 1 ? "s" : ""}
                  {Object.keys(stagedByFolder).length > 0 && (
                    <span className="text-slate-400">
                      {" "}· {Object.entries(stagedByFolder).map(([k, v]) => `${k} (${v})`).join(", ")}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={clearStaged} disabled={uploading}>
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Subiendo {uploadProgress.done}/{uploadProgress.total}
                      </>
                    ) : (
                      <>Guardar {staged.length} diseño{staged.length > 1 ? "s" : ""}</>
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {staged.map((s, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                    <div className="aspect-square bg-slate-100 relative">
                      {s.preview ? (
                        <img src={s.preview} alt={s.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeStaged(idx)}
                        disabled={uploading}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-1.5 space-y-1">
                      <input
                        value={s.title}
                        onChange={(e) => updateStaged(idx, { title: e.target.value })}
                        disabled={uploading}
                        className="w-full text-[11px] px-1.5 py-1 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                        placeholder="Título"
                      />
                      <input
                        value={s.folder}
                        onChange={(e) => updateStaged(idx, { folder: e.target.value })}
                        disabled={uploading}
                        className="w-full text-[11px] px-1.5 py-1 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                        placeholder="Colección"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catálogo */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Catálogo <span className="text-sm font-normal text-slate-400">({total})</span>
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            {selected.size > 0 && (
              <div className="flex items-center gap-2 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3 py-1.5">
                <span className="text-sm font-medium text-fuchsia-700">
                  {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
                </span>
                <button onClick={clearSelection} className="text-fuchsia-400 hover:text-fuchsia-600">
                  <X className="w-3.5 h-3.5" />
                </button>
                <Button
                  size="sm"
                  onClick={downloadZip}
                  disabled={zipping}
                  className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white h-7 text-xs px-3"
                >
                  {zipping ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <FileArchive className="w-3 h-3 mr-1.5" />}
                  Descargar ZIP
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkDeleteOpen(true)}
                  className="h-7 text-xs px-3 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3 mr-1.5" />
                  Eliminar
                </Button>
              </div>
            )}
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={folderFilter}
              onChange={(e) => { setFolderFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            >
              <option value="">Todas las colecciones</option>
              {folders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {designs.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAllOnPage} className="h-10 gap-1.5 text-slate-600">
                <Check className="w-3.5 h-3.5" />
                Seleccionar página
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : designs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aún no hay diseños en el catálogo</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {designs.map((d) => {
                const isSelected = selected.has(d.id);
                return (
                  <div
                    key={d.id}
                    className={`group relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer
                      ${isSelected
                        ? "border-fuchsia-500 shadow-lg shadow-fuchsia-200 scale-[1.02]"
                        : "border-slate-200 hover:shadow-md hover:border-slate-300"}`}
                    onClick={() => setPreview(d)}
                  >
                    <div
                      className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      onClick={(e) => { e.stopPropagation(); toggleSelect(d); }}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-sm transition-colors
                        ${isSelected ? "bg-fuchsia-500 border-fuchsia-500" : "bg-white/90 border-slate-300 hover:border-fuchsia-400"}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    <div className="aspect-square bg-slate-100">
                      <img src={d.image_path} alt={d.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium text-slate-900 truncate">{d.title || "—"}</p>
                      <p className="text-[10px] text-slate-500 truncate">{d.folder || "Sin colección"}</p>
                    </div>

                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadOne(d); }}
                        className="p-1.5 bg-slate-900/80 text-white rounded-full hover:bg-slate-900"
                        title="Descargar"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                        className="p-1.5 bg-slate-900/80 text-white rounded-full hover:bg-slate-900"
                        title="Editar"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}
                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview modal */}
      <Dialog open={preview !== null} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="!max-w-[92vw] !w-[92vw] !h-[92vh] !max-h-[92vh] p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogTitle className="sr-only">{preview?.title || "Diseño"}</DialogTitle>
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 bg-slate-950 flex items-center justify-center p-6">
              {preview && (
                <img src={preview.image_path} alt={preview.title} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
              )}
            </div>
            <div className="shrink-0 bg-white border-t px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{preview?.title}</p>
                <p className="text-xs text-slate-500 truncate">
                  {preview?.folder || "Sin colección"} · {preview?.created_by}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => preview && openEdit(preview)}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar
                </Button>
                <Button className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" onClick={() => preview && downloadOne(preview)}>
                  <Download className="w-4 h-4 mr-2" /> Descargar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar modal */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar diseño</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Título</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Colección</Label>
              <Input value={editFolder} onChange={(e) => setEditFolder(e.target.value)} className="mt-1" placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
              {savingEdit && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar (uno) */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar diseño</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar «{deleteTarget?.title}»? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteOne} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar (varios) */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar {selected.size} diseño{selected.size > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Se eliminarán los diseños seleccionados. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
