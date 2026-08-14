"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Loader2,
  Image as ImageIcon,
  Camera,
  Download,
  GripVertical,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  X,
} from "lucide-react";

interface ProductImage {
  id: number;
  odoo_product_id: number | null;
  product_code: string | null;
  model: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  image_path: string;
  created_by: string;
  created_at: string;
}

interface FlyerSettings {
  priceMode: "odoo" | "custom";
  customPrice: string;
  badgePos: { x: number; y: number };
}

export default function VendedoresBancoImagenesPage() {
  // Gallery
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryCategory, setGalleryCategory] = useState("");
  const [galleryCategories, setGalleryCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Single preview
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);

  // Shared price / badge state
  const [priceMode, setPriceMode] = useState<"odoo" | "custom">("odoo");
  const [customPrice, setCustomPrice] = useState("");
  const [badgePos, setBadgePos] = useState({ x: 82, y: 88 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // Multi-select
  const [selectedImages, setSelectedImages] = useState<Map<number, ProductImage>>(new Map());

  // Multi-editor
  const [multiImages, setMultiImages] = useState<ProductImage[]>([]);
  const [multiIndex, setMultiIndex] = useState(0);
  const [flyerSettings, setFlyerSettings] = useState<Record<number, FlyerSettings>>({});
  const thumbnailStripRef = useRef<HTMLDivElement>(null);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100;
      const y = ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100;
      setBadgePos({ x: Math.max(3, Math.min(97, x)), y: Math.max(3, Math.min(97, y)) });
    };
    const handleMouseUp = () => { isDragging.current = false; };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // ── Scroll active thumbnail into view ─────────────────────────────────────
  useEffect(() => {
    if (!thumbnailStripRef.current || multiImages.length === 0) return;
    const thumbs = thumbnailStripRef.current.querySelectorAll<HTMLElement>("[data-thumb]");
    const active = thumbs[multiIndex];
    if (active) active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [multiIndex, multiImages]);

  // ── Gallery fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchImages();
  }, [page, gallerySearch, galleryCategory]);

  // Fetch gallery categories on mount
  useEffect(() => {
    fetch("/api/adminleads/banco-imagenes/categories")
      .then(r => r.json())
      .then(d => { if (d.success) setGalleryCategories(d.categories || []); })
      .catch(() => {});
  }, []);

  const fetchImages = async () => {
    try {
      setLoadingImages(true);
      const p = new URLSearchParams({ page: String(page), limit: "24" });
      if (gallerySearch) p.set("search", gallerySearch);
      if (galleryCategory) p.set("category", galleryCategory);
      const res = await fetch(`/api/adminleads/banco-imagenes?${p}`);
      const data = await res.json();
      if (data.success) {
        setImages(data.images);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoadingImages(false);
    }
  };

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleSelect = (img: ProductImage) => {
    setSelectedImages((prev) => {
      const next = new Map(prev);
      if (next.has(img.id)) next.delete(img.id);
      else next.set(img.id, img);
      return next;
    });
  };

  const clearSelection = () => setSelectedImages(new Map());

  // ── Open multi-editor ──────────────────────────────────────────────────────
  const handleOpenMultiEditor = () => {
    const selected = Array.from(selectedImages.values());
    if (selected.length === 0) return;

    if (selected.length === 1) {
      const img = selected[0];
      setPreviewImage(img);
      setPriceMode("odoo");
      setCustomPrice(String(img.price || ""));
      setBadgePos({ x: 82, y: 88 });
      return;
    }

    const settings: Record<number, FlyerSettings> = {};
    selected.forEach((img) => {
      settings[img.id] = { priceMode: "odoo", customPrice: String(img.price || ""), badgePos: { x: 82, y: 88 } };
    });
    setFlyerSettings(settings);
    setMultiImages(selected);
    setMultiIndex(0);
    const first = settings[selected[0].id];
    setPriceMode(first.priceMode);
    setCustomPrice(first.customPrice);
    setBadgePos(first.badgePos);
  };

  // ── Switch flyer ───────────────────────────────────────────────────────────
  const handleSwitchFlyer = (newIndex: number) => {
    if (newIndex === multiIndex || !multiImages[newIndex]) return;
    const currentId = multiImages[multiIndex].id;
    const updated = { ...flyerSettings, [currentId]: { priceMode, customPrice, badgePos } };
    setFlyerSettings(updated);
    const s = updated[multiImages[newIndex].id];
    setPriceMode(s.priceMode);
    setCustomPrice(s.customPrice);
    setBadgePos(s.badgePos);
    setMultiIndex(newIndex);
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async (withPrice: boolean) => {
    const targetImage = multiImages.length > 0 ? multiImages[multiIndex] : previewImage;
    if (!targetImage) return;

    const price = priceMode === "odoo" ? Number(targetImage.price || 0) : parseFloat(customPrice) || 0;
    const priceText = `$${price.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = targetImage.image_path;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    if (withPrice) {
      const fontSize = Math.max(canvas.width * 0.055, 28);
      ctx.font = `bold ${fontSize}px Arial`;
      const textWidth = ctx.measureText(priceText).width;
      const padX = fontSize * 0.65;
      const padY = fontSize * 0.4;
      const labelW = textWidth + padX * 2;
      const labelH = fontSize + padY * 2;
      const centerX = (badgePos.x / 100) * canvas.width;
      const centerY = (badgePos.y / 100) * canvas.height;
      const labelX = Math.max(10, Math.min(canvas.width - labelW - 10, centerX - labelW / 2));
      const labelY = Math.max(10, Math.min(canvas.height - labelH - 10, centerY - labelH / 2));

      const grad = ctx.createLinearGradient(labelX, labelY, labelX + labelW, labelY);
      grad.addColorStop(0, "rgba(239, 68, 68, 0.95)");
      grad.addColorStop(1, "rgba(220, 38, 38, 0.95)");

      const radius = labelH / 2;
      ctx.beginPath();
      ctx.moveTo(labelX + radius, labelY);
      ctx.lineTo(labelX + labelW - radius, labelY);
      ctx.arcTo(labelX + labelW, labelY, labelX + labelW, labelY + radius, radius);
      ctx.arcTo(labelX + labelW, labelY + labelH, labelX + labelW - radius, labelY + labelH, radius);
      ctx.lineTo(labelX + radius, labelY + labelH);
      ctx.arcTo(labelX, labelY + labelH, labelX, labelY + labelH - radius, radius);
      ctx.arcTo(labelX, labelY, labelX + radius, labelY, radius);
      ctx.closePath();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = fontSize * 0.5;
      ctx.shadowOffsetY = fontSize * 0.1;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = fontSize * 0.05;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(priceText, labelX + padX, labelY + labelH / 2);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const suffix = withPrice ? `_${price}` : "";
      link.download = `${targetImage.product_code || "flyer"}${suffix}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const resetPreview = () => {
    setPreviewImage(null);
    setMultiImages([]);
    setMultiIndex(0);
    setFlyerSettings({});
    setPriceMode("odoo");
    setCustomPrice("");
    setBadgePos({ x: 82, y: 88 });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeImage = multiImages.length > 0 ? multiImages[multiIndex] : previewImage;
  const isModalOpen = previewImage !== null || multiImages.length > 0;
  const isMultiMode = multiImages.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-red-100 rounded-xl">
          <Camera className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banco de Flyers</h1>
          <p className="text-sm text-slate-500">Selecciona y descarga flyers con precio</p>
        </div>
      </div>

      {/* Gallery */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Galería <span className="text-sm font-normal text-slate-400">({total} flyers)</span>
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            {selectedImages.size > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                <span className="text-sm font-medium text-red-700">
                  {selectedImages.size} seleccionado{selectedImages.size > 1 ? "s" : ""}
                </span>
                <button onClick={clearSelection} className="text-red-400 hover:text-red-600 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
                <Button size="sm" onClick={handleOpenMultiEditor} className="bg-red-500 hover:bg-red-600 text-white h-7 text-xs px-3">
                  <Layers className="w-3 h-3 mr-1.5" />
                  Editar seleccionados
                </Button>
              </div>
            )}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar flyer..."
                value={gallerySearch}
                onChange={(e) => { setGallerySearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <select
              value={galleryCategory}
              onChange={(e) => { setGalleryCategory(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las categorías</option>
              {galleryCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {galleryCategory && images.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedImages(prev => {
                    const next = new Map(prev);
                    images.forEach(img => next.set(img.id, img));
                    return next;
                  });
                }}
                className="h-10 gap-1.5 text-slate-600"
              >
                <Check className="w-3.5 h-3.5" />
                Seleccionar todos ({images.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingImages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No hay flyers disponibles</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {images.map((img) => {
                const isSelected = selectedImages.has(img.id);
                return (
                  <div
                    key={img.id}
                    className={`group relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer
                      ${isSelected
                        ? "border-red-500 shadow-lg shadow-red-100 scale-[1.02]"
                        : "border-slate-200 hover:shadow-md hover:border-slate-300"
                      }`}
                    onClick={() => {
                      setPreviewImage(img);
                      setPriceMode("odoo");
                      setCustomPrice(String(img.price || ""));
                      setBadgePos({ x: 82, y: 88 });
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      onClick={(e) => { e.stopPropagation(); toggleSelect(img); }}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-sm transition-colors
                        ${isSelected ? "bg-red-500 border-red-500" : "bg-white/90 border-slate-300 hover:border-red-400"}`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    <div className="aspect-square bg-slate-100">
                      <img src={img.image_path} alt={img.model || "Flyer"} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium text-slate-900 truncate">{img.product_code || "—"}</p>
                      <p className="text-[10px] text-slate-500 truncate">{img.brand || "—"}</p>
                      {img.price ? <p className="text-[10px] text-green-600 font-medium">${Number(img.price).toFixed(2)}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview / Multi-editor Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) resetPreview(); }}>
        <DialogContent className="!max-w-[98vw] !w-[98vw] !h-[96vh] !max-h-[96vh] p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogTitle className="sr-only">{activeImage?.model || "Vista Previa"}</DialogTitle>

          <div className="flex h-full">
            {/* ── Image panel ───────────────────────────────────── */}
            <div className="flex-1 min-w-0 bg-slate-950 relative overflow-hidden select-none">
              {activeImage?.image_path && (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="relative" style={{ lineHeight: 0 }}>
                    <img
                      ref={imgRef}
                      src={activeImage.image_path}
                      alt={activeImage.model || "Flyer"}
                      className="block max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                      draggable={false}
                      style={{ maxHeight: "calc(96vh - 4rem)" }}
                    />

                    {/* Draggable price badge */}
                    {(() => {
                      const price = priceMode === "odoo" ? Number(activeImage?.price || 0) : parseFloat(customPrice) || 0;
                      if (!price) return null;
                      const priceText = `$${price.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      return (
                        <div
                          className="absolute z-10 cursor-grab active:cursor-grabbing"
                          style={{ left: `${badgePos.x}%`, top: `${badgePos.y}%`, transform: "translate(-50%, -50%)" }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            isDragging.current = true;
                            if (!imgRef.current) return;
                            const rect = imgRef.current.getBoundingClientRect();
                            dragOffset.current = {
                              x: e.clientX - rect.left - (badgePos.x / 100) * rect.width,
                              y: e.clientY - rect.top - (badgePos.y / 100) * rect.height,
                            };
                          }}
                        >
                          <div className="flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-lg px-4 py-2 rounded-full shadow-[0_4px_20px_rgba(239,68,68,0.6)] ring-2 ring-white/30 transition-transform active:scale-95 whitespace-nowrap">
                            <GripVertical className="w-3.5 h-3.5 opacity-60 shrink-0" />
                            <span className="tracking-wide">{priceText}</span>
                          </div>
                          <p className="text-center text-white/40 text-[10px] mt-1 pointer-events-none">arrastra para mover</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Prev / Next arrows */}
              {isMultiMode && (
                <>
                  <button
                    onClick={() => handleSwitchFlyer(multiIndex - 1)}
                    disabled={multiIndex === 0}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all disabled:opacity-20 z-10 backdrop-blur-sm"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => handleSwitchFlyer(multiIndex + 1)}
                    disabled={multiIndex === multiImages.length - 1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all disabled:opacity-20 z-10 backdrop-blur-sm"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/10">
                    {multiIndex + 1} / {multiImages.length}
                  </div>
                </>
              )}

              {/* Info badges */}
              <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap pointer-events-none">
                {activeImage?.brand && (
                  <span className="bg-white/10 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full font-medium border border-white/20">
                    {activeImage.brand}
                  </span>
                )}
                {activeImage?.category && (
                  <span className="bg-red-500/80 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full font-medium">
                    {activeImage.category}
                  </span>
                )}
              </div>
            </div>

            {/* ── Right sidebar ─────────────────────────────────── */}
            <div className="w-[300px] shrink-0 bg-white border-l flex flex-col overflow-hidden">

              {/* Thumbnail strip */}
              {isMultiMode && (
                <div className="shrink-0 bg-slate-900 border-b border-slate-700">
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      {multiImages.length} flyers seleccionados
                    </span>
                  </div>
                  <div
                    ref={thumbnailStripRef}
                    className="flex gap-2 px-3 pb-3 overflow-x-auto"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {multiImages.map((img, idx) => (
                      <button
                        key={img.id}
                        data-thumb=""
                        onClick={() => handleSwitchFlyer(idx)}
                        className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all duration-200
                          ${idx === multiIndex
                            ? "ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900 scale-105 shadow-lg"
                            : "opacity-50 hover:opacity-80 hover:scale-105"
                          }`}
                      >
                        <img src={img.image_path} alt="" className="w-full h-full object-cover" />
                        <span className={`absolute bottom-0 right-0 text-[8px] font-bold px-1 py-0.5 rounded-tl
                          ${idx === multiIndex ? "bg-red-500 text-white" : "bg-black/60 text-white/80"}`}>
                          {idx + 1}
                        </span>
                        {idx === multiIndex && (
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Product info */}
              <div className="px-5 py-4 border-b bg-slate-50 shrink-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  {activeImage?.product_code || "—"}
                </p>
                <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-3">
                  {activeImage?.model || "Flyer"}
                </h2>
              </div>

              {/* Price selector */}
              <div className="px-5 py-4 flex-1 overflow-y-auto space-y-3 min-h-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Precio para el flyer</p>

                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${priceMode === "odoo" ? "border-red-500 bg-red-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="priceMode" checked={priceMode === "odoo"} onChange={() => setPriceMode("odoo")} className="accent-red-500" />
                  <div>
                    <span className="text-xs font-medium text-slate-500">Precio base</span>
                    <p className="text-2xl font-bold text-red-500 leading-tight">
                      ${Number(activeImage?.price || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${priceMode === "custom" ? "border-red-500 bg-red-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="priceMode" checked={priceMode === "custom"} onChange={() => setPriceMode("custom")} className="accent-red-500 mt-1" />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-slate-500">Precio personalizado</span>
                    {priceMode === "custom" && (
                      <Input
                        type="number"
                        step="0.01"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        placeholder="0.00"
                        className="mt-2 text-xl font-bold"
                        autoFocus
                      />
                    )}
                  </div>
                </label>
              </div>

              {/* Download */}
              <div className="px-5 py-4 border-t space-y-2 bg-slate-50 shrink-0">
                {isMultiMode && (
                  <p className="text-[10px] text-slate-400 text-center mb-1">
                    Descargando flyer {multiIndex + 1} de {multiImages.length}
                  </p>
                )}
                <Button onClick={() => handleDownload(true)} className="w-full bg-red-500 hover:bg-red-600 text-white h-11 text-sm font-semibold">
                  <Download className="w-4 h-4 mr-2" />
                  Descargar con Precio
                </Button>
                <Button onClick={() => handleDownload(false)} variant="outline" className="w-full h-11 text-sm">
                  <Download className="w-4 h-4 mr-2" />
                  Descargar sin Precio
                </Button>
                {isMultiMode && multiIndex < multiImages.length - 1 && (
                  <Button
                    onClick={() => handleSwitchFlyer(multiIndex + 1)}
                    variant="outline"
                    className="w-full h-9 text-xs text-slate-500 border-dashed"
                  >
                    <ChevronRight className="w-3.5 h-3.5 mr-1" />
                    Siguiente flyer
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
