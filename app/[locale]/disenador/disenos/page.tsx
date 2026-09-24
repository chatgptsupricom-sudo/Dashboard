"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import KpiDisenos from "@/components/disenador/KpiDisenos";
import { CATEGORIAS_DISENO, etiquetaCategoria } from "@/lib/disenos/categorias";
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
  RotateCcw,
} from "lucide-react";

interface Design {
  id: number;
  title: string;
  folder: string | null;
  category: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by: string;
  created_at: string;
  /** Día del diseño (el que cuenta para el KPI); puede diferir del de subida. */
  design_date?: string | null;
  image_path: string;
}

interface StagedFile {
  file: File;
  preview: string;
  title: string;
  folder: string;
  /** Categoría de diseño: obligatoria para poder guardar (ver lib/disenos/categorias.ts). */
  category: string;
  /** Día del diseño (YYYY-MM-DD): es el que cuenta para los KPIs, no el de la
   *  subida. Un lote puede traer flyers de varios días. */
  date: string;
}

/** Hoy en formato YYYY-MM-DD, en la zona horaria del navegador. */
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
  const [categoryFilter, setCategoryFilter] = useState("");
  const [conteoPorCategoria, setConteoPorCategoria] = useState<Record<string, number>>({});
  // Categoría que se aplica a todo lo que se está subiendo (se puede cambiar
  // archivo por archivo después).
  const [categoriaLote, setCategoriaLote] = useState("");
  const [fechaLote, setFechaLote] = useState(hoyISO);
  const [kpiRefresh, setKpiRefresh] = useState(0);
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
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Design | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState("");
  // Papelera: borrar manda acá, no elimina. Desde acá se restaura o se
  // elimina definitivamente.
  const [verPapelera, setVerPapelera] = useState(false);
  const [enPapelera, setEnPapelera] = useState(0);
  const [purgarOpen, setPurgarOpen] = useState(false);

  // ── Fetch catálogo ────────────────────────────────────────────────────────
  const fetchDesigns = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) p.set("search", search);
      if (folderFilter) p.set("folder", folderFilter);
      if (categoryFilter) p.set("category", categoryFilter);
      if (verPapelera) p.set("papelera", "1");
      const res = await fetch(`/api/disenador/disenos?${p}`);
      const data = await res.json();
      if (data.success) {
        setDesigns(data.designs || []);
        setFolders(data.folders || []);
        setConteoPorCategoria(data.conteoPorCategoria || {});
        setEnPapelera(data.enPapelera || 0);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
        setErrorCatalogo("");
      } else {
        // Antes un error se tragaba en silencio y la pantalla mostraba "Aún no
        // hay diseños": parecía que el catálogo se había borrado.
        setErrorCatalogo(data.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.error("fetchDesigns:", e);
      setErrorCatalogo(e.message || "No se pudo cargar el catálogo");
    } finally {
      setLoading(false);
    }
  }, [page, search, folderFilter, categoryFilter, verPapelera]);

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
          category: categoriaLote,
          date: fechaLote || hoyISO(),
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
    const sinCategoria = staged.filter((s) => !s.category);
    if (sinCategoria.length > 0) {
      alert(
        `Falta elegir la categoría de ${sinCategoria.length} diseño${sinCategoria.length > 1 ? "s" : ""}. ` +
        "Podés aplicar una a todo el lote con el selector de arriba."
      );
      return;
    }
    setUploading(true);
    setUploadProgress({ done: 0, total: staged.length });
    try {
      for (let i = 0; i < staged.length; i += UPLOAD_BATCH) {
        const chunk = staged.slice(i, i + UPLOAD_BATCH);
        const fd = new FormData();
        fd.append("created_by", user.name);
        fd.append("titles", JSON.stringify(chunk.map((s) => s.title || s.file.name)));
        fd.append("folders", JSON.stringify(chunk.map((s) => s.folder || "")));
        fd.append("categories", JSON.stringify(chunk.map((s) => s.category)));
        fd.append("dates", JSON.stringify(chunk.map((s) => s.date || hoyISO())));
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
      setKpiRefresh((n) => n + 1);
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
    setEditCategory(d.category || "");
    setEditDate((d.design_date || d.created_at || "").slice(0, 10));
  };
  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/disenador/disenos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          title: editTitle,
          folder: editFolder,
          ...(editCategory ? { category: editCategory } : {}),
          ...(editDate ? { design_date: editDate } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(null);
      setKpiRefresh((n) => n + 1);
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
      const por = encodeURIComponent(user?.name || "");
      const res = await fetch(`/api/disenador/disenos?id=${deleteTarget.id}&por=${por}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      setKpiRefresh((n) => n + 1);
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
      const por = encodeURIComponent(user?.name || "");
      const res = await fetch(`/api/disenador/disenos?ids=${ids}&por=${por}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearSelection();
      setBulkDeleteOpen(false);
      setPage(1);
      setKpiRefresh((n) => n + 1);
      await fetchDesigns();
    } catch (e: any) {
      alert("No se pudieron eliminar: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Papelera ──────────────────────────────────────────────────────────────
  const restaurar = async (d: Design) => {
    try {
      const res = await fetch("/api/disenador/disenos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, restaurar: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKpiRefresh((n) => n + 1);
      await fetchDesigns();
    } catch (e: any) {
      alert("No se pudo restaurar: " + e.message);
    }
  };

  const purgarSeleccion = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected.keys()).join(",");
      const res = await fetch(`/api/disenador/disenos?ids=${ids}&definitivo=1`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearSelection();
      setPurgarOpen(false);
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
          <h1 className="text-2xl font-bold text-slate-900">KPI de Diseños</h1>
          <p className="text-sm text-slate-500">
            Sube tus diseños por categoría y mirá cuántos subiste por día, semana y mes
          </p>
        </div>
      </div>

      <KpiDisenos refreshKey={kpiRefresh} onCambio={() => fetchDesigns()} />

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
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm font-medium text-slate-700">Categoría</Label>
            <select
              value={categoriaLote}
              onChange={(e) => {
                const v = e.target.value;
                setCategoriaLote(v);
                // Se aplica a lo que ya está en cola: es lo que se espera al
                // elegir "la categoría de esta carga".
                if (v) setStaged((prev) => prev.map((s) => ({ ...s, category: v })));
              }}
              disabled={uploading}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            >
              <option value="">Elegí una categoría…</option>
              {CATEGORIAS_DISENO.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Obligatoria. Se aplica a toda la carga y se puede cambiar diseño por diseño.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm font-medium text-slate-700">Fecha del diseño</Label>
            <input
              type="date"
              value={fechaLote}
              max={hoyISO()}
              onChange={(e) => {
                const v = e.target.value;
                setFechaLote(v);
                // Igual que la categoría: se aplica a lo que ya está en cola.
                if (v) setStaged((prev) => prev.map((s) => ({ ...s, date: v })));
              }}
              disabled={uploading}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
            <span className="text-xs text-slate-400">
              Es el día que cuenta para el KPI, no el de la subida. Se puede cambiar diseño por diseño.
            </span>
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
                      <input
                        type="date"
                        value={s.date}
                        max={hoyISO()}
                        onChange={(e) => updateStaged(idx, { date: e.target.value })}
                        disabled={uploading}
                        title="Fecha del diseño"
                        className="w-full text-[11px] px-1.5 py-1 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                      />
                      <select
                        value={s.category}
                        onChange={(e) => updateStaged(idx, { category: e.target.value })}
                        disabled={uploading}
                        className={`w-full text-[11px] px-1.5 py-1 rounded border bg-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500 ${
                          s.category ? "border-slate-200 text-slate-700" : "border-red-300 text-red-600"
                        }`}
                      >
                        <option value="">Sin categoría</option>
                        {CATEGORIAS_DISENO.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setVerPapelera(false); setPage(1); clearSelection(); }}
              className={`text-lg font-semibold rounded-xl px-3 py-1 ${verPapelera ? "text-slate-400 hover:text-slate-600" : "bg-slate-100 text-slate-900"}`}
            >
              Catálogo <span className="text-sm font-normal text-slate-400">({verPapelera ? "" : total})</span>
            </button>
            <button
              type="button"
              onClick={() => { setVerPapelera(true); setPage(1); clearSelection(); }}
              className={`text-lg font-semibold rounded-xl px-3 py-1 ${verPapelera ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            >
              Papelera <span className="text-sm font-normal text-slate-400">({enPapelera})</span>
            </button>
          </div>
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
                {verPapelera ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPurgarOpen(true)}
                    className="h-7 text-xs px-3 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3 mr-1.5" />
                    Eliminar definitivamente
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkDeleteOpen(true)}
                    className="h-7 text-xs px-3 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3 mr-1.5" />
                    Mover a la papelera
                  </Button>
                )}
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
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 max-w-[16rem]"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIAS_DISENO.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}{conteoPorCategoria[c.id] ? ` (${conteoPorCategoria[c.id]})` : ""}
                </option>
              ))}
              {conteoPorCategoria.sin_categoria ? (
                <option value="sin_categoria">Sin categoría ({conteoPorCategoria.sin_categoria})</option>
              ) : null}
            </select>
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
          ) : errorCatalogo ? (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm p-4 space-y-2">
              <p>No se pudo cargar el catálogo: {errorCatalogo}</p>
              <p className="text-rose-600/80 text-xs">
                Los diseños no se borraron: esto es un error al leerlos. Volvé a intentar.
              </p>
              <Button size="sm" variant="outline" onClick={fetchDesigns} className="h-8">
                Reintentar
              </Button>
            </div>
          ) : designs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{verPapelera ? "La papelera está vacía" : "Aún no hay diseños en el catálogo"}</p>
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
                      <p className="text-[10px] text-slate-500 truncate" title={etiquetaCategoria(d.category)}>
                        {etiquetaCategoria(d.category)}
                      </p>
                      {d.folder && <p className="text-[10px] text-slate-400 truncate">{d.folder}</p>}
                      {(d.design_date || d.created_at) && !verPapelera && (
                        <p className="text-[10px] text-slate-400" title="Fecha del diseño">
                          {(() => {
                            const f = (d.design_date || d.created_at).slice(0, 10).split("-");
                            return `${f[2]}/${f[1]}/${f[0]}`;
                          })()}
                        </p>
                      )}
                      {verPapelera && d.deleted_at && (
                        <p className="text-[10px] text-red-500 truncate" title={`Borrado por ${d.deleted_by || "—"}`}>
                          En papelera · {new Date(d.deleted_at).toLocaleDateString("es-VE")}
                          {d.deleted_by ? ` · ${d.deleted_by}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadOne(d); }}
                        className="p-1.5 bg-slate-900/80 text-white rounded-full hover:bg-slate-900"
                        title="Descargar"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      {verPapelera ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); restaurar(d); }}
                          className="p-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-700"
                          title="Restaurar al catálogo"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      ) : (
                        <>
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
                            title="Mover a la papelera"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
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
                  {etiquetaCategoria(preview?.category)}
                  {preview?.folder ? ` · ${preview.folder}` : ""} · {preview?.created_by}
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
              <Label className="text-sm font-medium text-slate-700">Categoría</Label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              >
                <option value="">Sin categoría</option>
                {CATEGORIAS_DISENO.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Colección</Label>
              <Input value={editFolder} onChange={(e) => setEditFolder(e.target.value)} className="mt-1" placeholder="Opcional" />
            </div>
            <div>
              <Label className="text-sm">Fecha del diseño</Label>
              <Input
                type="date"
                value={editDate}
                max={hoyISO()}
                onChange={(e) => setEditDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Es el día que cuenta para el KPI, no el de la subida.
              </p>
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
            <DialogTitle>Mover a la papelera</DialogTitle>
            <DialogDescription>
              «{deleteTarget?.title}» sale del catálogo y queda en la papelera. Se puede restaurar desde ahí.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteOne} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mover a la papelera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar (varios) */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover {selected.size} diseño{selected.size > 1 ? "s" : ""} a la papelera</DialogTitle>
            <DialogDescription>
              Salen del catálogo y quedan en la papelera, desde donde se pueden restaurar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mover a la papelera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar definitivamente (desde la papelera) */}
      <Dialog open={purgarOpen} onOpenChange={setPurgarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar {selected.size} diseño{selected.size > 1 ? "s" : ""} definitivamente</DialogTitle>
            <DialogDescription>
              Esto borra la imagen de la base de datos y no se puede deshacer: no hay forma de recuperarla después.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={purgarSeleccion} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
