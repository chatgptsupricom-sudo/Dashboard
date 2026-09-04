"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  UploadCloud,
  ImagePlus,
  Loader2,
  X,
  Wand2,
  Download,
  Save,
  RefreshCw,
  ImageOff,
  Search,
  AlertTriangle,
} from "lucide-react";

interface CatalogDesign {
  id: number;
  title: string;
  folder: string | null;
  image_path: string;
}

interface AiJob {
  id: number;
  prompt: string;
  status: "pending" | "processing" | "success" | "fail" | string;
  stage?: string;
  result_urls: string[];
  fail_msg: string | null;
  source_url?: string;
  created_at?: string;
}

const STAGE_LABEL: Record<string, string> = {
  waiting: "En espera…",
  queuing: "En cola…",
  generating: "Generando…",
  processing: "Procesando…",
  pending: "Preparando…",
};

export default function EditorIaPage() {
  const { user } = useAuthStore();

  // Fuente de la imagen
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [sourceDesignId, setSourceDesignId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selector de catálogo
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDesigns, setPickerDesigns] = useState<CatalogDesign[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Formulario
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<"1K" | "2K">("1K");
  const [variations, setVariations] = useState(1);

  // Job activo
  const [job, setJob] = useState<AiJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Guardar en catálogo
  const [saveTarget, setSaveTarget] = useState<{ jobId: number; url: string } | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveFolder, setSaveFolder] = useState("IA");
  const [saving, setSaving] = useState(false);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());

  // Recientes
  const [recent, setRecent] = useState<AiJob[]>([]);

  const fetchRecent = useCallback(async () => {
    if (!user?.name) return;
    try {
      const res = await fetch(`/api/disenador/ia-imagen?created_by=${encodeURIComponent(user.name)}&limit=12`);
      const data = await res.json();
      if (data.success) setRecent(data.jobs || []);
    } catch (e) {
      console.error("fetchRecent:", e);
    }
  }, [user?.name]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  // ── Selección de imagen ────────────────────────────────────────────────────
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;
    setSourceFile(file);
    setSourceDesignId(null);
    const reader = new FileReader();
    reader.onload = (ev) => setSourcePreview((ev.target?.result as string) || "");
    reader.readAsDataURL(file);
  };

  const clearSource = () => {
    setSourceFile(null);
    setSourceDesignId(null);
    setSourcePreview("");
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await fetch(`/api/disenador/disenos?limit=48${pickerSearch ? `&search=${encodeURIComponent(pickerSearch)}` : ""}`);
      const data = await res.json();
      if (data.success) setPickerDesigns(data.designs || []);
    } catch (e) {
      console.error("openPicker:", e);
    } finally {
      setPickerLoading(false);
    }
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(openPicker, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerSearch]);

  const pickFromCatalog = (d: CatalogDesign) => {
    setSourceFile(null);
    setSourceDesignId(d.id);
    setSourcePreview(d.image_path);
    setPickerOpen(false);
  };

  // ── Polling del job ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!job || job.status === "success" || job.status === "fail") {
      if (pollRef.current) clearTimeout(pollRef.current);
      return;
    }
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/disenador/ia-imagen/${job.id}`);
        const data = await res.json();
        if (data.success) {
          setJob(data.job);
          if (data.job.status === "success") fetchRecent();
        }
      } catch (e) {
        console.error("poll:", e);
      }
    }, 3000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [job, fetchRecent]);

  // ── Generar ────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!user?.name || (!sourceFile && !sourceDesignId) || prompt.trim().length < 3) return;
    setSubmitting(true);
    setJob(null);
    try {
      const fd = new FormData();
      fd.append("created_by", user.name);
      fd.append("prompt", prompt.trim());
      fd.append("resolution", resolution);
      fd.append("variations", String(variations));
      if (sourceFile) fd.append("image", sourceFile);
      if (sourceDesignId) fd.append("source_design_id", String(sourceDesignId));

      const res = await fetch("/api/disenador/ia-imagen", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setJob({ id: data.jobId, prompt: prompt.trim(), status: "processing", result_urls: [], fail_msg: null });
    } catch (e: any) {
      alert("No se pudo iniciar la generación: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Guardar en catálogo ────────────────────────────────────────────────────
  const openSaveDialog = (jobId: number, url: string) => {
    setSaveTarget({ jobId, url });
    setSaveTitle(job?.prompt?.slice(0, 60) || "Diseño IA");
    setSaveFolder("IA");
  };

  const confirmSave = async () => {
    if (!saveTarget || !user?.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/disenador/ia-imagen/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: saveTarget.jobId,
          resultUrl: saveTarget.url,
          title: saveTitle,
          folder: saveFolder,
          created_by: user.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSavedUrls((prev) => new Set(prev).add(saveTarget.url));
      setSaveTarget(null);
    } catch (e: any) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (url: string, idx: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `diseno-ia-${idx + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      // Algunos hosts de resultado no permiten fetch por CORS: fallback a abrir en pestaña nueva.
      window.open(url, "_blank");
    }
  };

  const canGenerate = (!!sourceFile || !!sourceDesignId) && prompt.trim().length >= 3 && !submitting;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-violet-100 rounded-xl">
          <Sparkles className="w-6 h-6 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editor con IA</h1>
          <p className="text-sm text-slate-500">Sube una imagen, describe el cambio y deja que la IA la edite (Seedream vía KIE)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Panel de creación ─────────────────────────────────────────── */}
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">Nueva edición</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Imagen a editar</Label>
              <div className="mt-1 flex items-center gap-4">
                <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-colors shrink-0 overflow-hidden">
                  {sourcePreview ? (
                    <img src={sourcePreview} alt="Fuente" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center px-2">
                      <UploadCloud className="w-7 h-7 mx-auto text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-400">Subir imagen</span>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
                </label>
                <div className="flex flex-col gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={openPicker}>
                    <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                    Elegir de Mis Diseños
                  </Button>
                  {sourcePreview && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearSource} className="text-red-500 hover:text-red-700">
                      <X className="w-3.5 h-3.5 mr-1.5" />
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: cambia el fondo a un estudio blanco, agrega reflejos suaves y mantén el logo intacto…"
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">Resolución</Label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as "1K" | "2K")}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="1K">1K (más económico)</option>
                  <option value="2K">2K</option>
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Variaciones</Label>
                <select
                  value={variations}
                  onChange={(e) => setVariations(Number(e.target.value))}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
              Generar con IA
            </Button>
          </CardContent>
        </Card>

        {/* ── Panel de resultado ────────────────────────────────────────── */}
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            {!job && (
              <div className="text-center py-16 text-slate-400">
                <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Genera una edición para verla aquí</p>
              </div>
            )}

            {job && (job.status === "processing" || job.status === "pending") && (
              <div className="text-center py-16 text-slate-500">
                <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-violet-500" />
                <p className="text-sm font-medium">{STAGE_LABEL[job.stage || job.status] || "Procesando…"}</p>
                <p className="text-xs text-slate-400 mt-1">Esto puede tardar hasta un minuto</p>
              </div>
            )}

            {job && job.status === "fail" && (
              <div className="text-center py-12 text-red-500">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3" />
                <p className="text-sm font-medium">No se pudo generar la imagen</p>
                <p className="text-xs text-slate-400 mt-1 break-words px-4">{job.fail_msg || "Error desconocido"}</p>
              </div>
            )}

            {job && job.status === "success" && (
              <div className={`grid gap-4 ${job.result_urls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {job.result_urls.map((url, idx) => (
                  <div key={idx} className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                    <div className="aspect-square bg-slate-100">
                      <img src={url} alt={`Resultado ${idx + 1}`} className="w-full h-full object-contain" />
                    </div>
                    <div className="p-2 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => handleDownload(url, idx)}>
                        <Download className="w-3.5 h-3.5 mr-1" /> Descargar
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 text-xs h-8 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
                        onClick={() => openSaveDialog(job.id, url)}
                        disabled={savedUrls.has(url)}
                      >
                        <Save className="w-3.5 h-3.5 mr-1" /> {savedUrls.has(url) ? "Guardado" : "Guardar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recientes */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">Generaciones recientes</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchRecent}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Aún no has generado ninguna edición
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setJob(r)}
                  className="text-left rounded-xl overflow-hidden border border-slate-200 hover:border-violet-300 hover:shadow-md transition-all"
                >
                  <div className="aspect-square bg-slate-100">
                    <img
                      src={r.status === "success" && r.result_urls[0] ? r.result_urls[0] : r.source_url}
                      alt={r.prompt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-1.5">
                    <p className="text-[10px] text-slate-600 line-clamp-2">{r.prompt}</p>
                    <span
                      className={`inline-block mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        r.status === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : r.status === "fail"
                          ? "bg-red-100 text-red-600"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.status === "success" ? "Listo" : r.status === "fail" ? "Error" : "En curso"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selector de catálogo */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Elegir de Mis Diseños</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} className="pl-10" />
          </div>
          {pickerLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : pickerDesigns.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-400">No hay diseños en el catálogo</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {pickerDesigns.map((d) => (
                <button
                  key={d.id}
                  onClick={() => pickFromCatalog(d)}
                  className="rounded-xl overflow-hidden border border-slate-200 hover:border-violet-400 hover:shadow-md transition-all"
                >
                  <div className="aspect-square bg-slate-100">
                    <img src={d.image_path} alt={d.title} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[10px] text-slate-600 truncate px-1 py-1">{d.title}</p>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Guardar resultado */}
      <Dialog open={saveTarget !== null} onOpenChange={(o) => { if (!o) setSaveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar en el catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Título</Label>
              <Input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Colección</Label>
              <Input value={saveFolder} onChange={(e) => setSaveFolder(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTarget(null)}>Cancelar</Button>
            <Button onClick={confirmSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
