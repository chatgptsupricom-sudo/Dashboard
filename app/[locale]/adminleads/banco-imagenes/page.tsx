"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Camera,
  Download,
  GripVertical,
} from "lucide-react";

interface OdooProduct {
  id: number;
  default_code: string;
  name: string;
  hardware: string;
  brand: string;
  model: string;
  list_price: number;
  type: string;
  invoice_number: string;
  image: string;
}

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

export default function BancoImagenesPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<OdooProduct[]>([]);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Form
  const [form, setForm] = useState({
    odoo_product_id: null as number | null,
    product_code: "",
    model: "",
    brand: "",
    category: "",
    price: "",
    price_adjust: "",
  });

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [odooImage, setOdooImage] = useState("");
  const [saving, setSaving] = useState(false);

  // Gallery
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [gallerySearch, setGallerySearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Preview modal
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const [priceMode, setPriceMode] = useState<"odoo" | "custom">("odoo");
  const [customPrice, setCustomPrice] = useState("");
  const [badgePos, setBadgePos] = useState({ x: 82, y: 88 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // Drag handlers for price badge — coordinates relative to the img element
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100;
      const y = ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100;
      setBadgePos({
        x: Math.max(3, Math.min(97, x)),
        y: Math.max(3, Math.min(97, y)),
      });
    };
    const handleMouseUp = () => { isDragging.current = false; };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch images
  useEffect(() => {
    fetchImages();
  }, [page, gallerySearch]);

  const fetchImages = async () => {
    try {
      setLoadingImages(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: "24",
      });
      if (gallerySearch) params.set("search", gallerySearch);
      const res = await fetch(`/api/adminleads/banco-imagenes?${params}`);
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

  // Search Odoo products
  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) {
      setProductResults([]);
      setShowDropdown(false);
      return;
    }
    try {
      setSearchingProduct(true);
      const res = await fetch(`/api/rma/products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setProductResults(data);
      setShowDropdown(data.length > 0);
    } catch {
      setProductResults([]);
    } finally {
      setSearchingProduct(false);
    }
  }, []);

  const handleProductSearchChange = (value: string) => {
    setProductSearch(value);
    setForm((prev) => ({ ...prev, product_code: value }));
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchProducts(value), 300);
  };

  const handleSelectProduct = (product: OdooProduct) => {
    setForm({
      odoo_product_id: product.id,
      product_code: product.default_code,
      model: product.name,
      brand: product.brand,
      category: product.hardware,
      price: String(product.list_price),
      price_adjust: "",
    });
    setProductSearch(product.default_code);
    setShowDropdown(false);
    setProductResults([]);
    setOdooImage(product.image || "");
  };

  const handleClearProduct = () => {
    setForm({ odoo_product_id: null, product_code: "", model: "", brand: "", category: "", price: "", price_adjust: "" });
    setProductSearch("");
    setImageFile(null);
    setImagePreview("");
    setOdooImage("");
  };

  const applyPriceAdjust = () => {
    if (!form.price_adjust || !form.price) return;
    const pct = parseFloat(form.price_adjust);
    const base = parseFloat(form.price);
    if (isNaN(pct) || isNaN(base)) return;
    const newPrice = base * (1 + pct / 100);
    setForm((prev) => ({
      ...prev,
      price: newPrice.toFixed(2),
      price_adjust: "",
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) return;
    if (!user?.name) return;

    try {
      setSaving(true);
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("created_by", user.name);
      if (form.odoo_product_id) fd.append("odoo_product_id", String(form.odoo_product_id));
      if (form.product_code) fd.append("product_code", form.product_code);
      if (form.model) fd.append("model", form.model);
      if (form.brand) fd.append("brand", form.brand);
      if (form.category) fd.append("category", form.category);
      if (form.price) fd.append("price", form.price);

      const res = await fetch("/api/adminleads/banco-imagenes", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        handleClearProduct();
        fetchImages();
      }
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/adminleads/banco-imagenes?id=${deleteId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteId(null);
        fetchImages();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (withPrice: boolean) => {
    if (!previewImage) return;
    const price = priceMode === "odoo" ? Number(previewImage.price || 0) : parseFloat(customPrice) || 0;
    const priceText = `$${price.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = previewImage.image_path;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
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

      // Use badge position (percentage of canvas)
      const centerX = (badgePos.x / 100) * canvas.width;
      const centerY = (badgePos.y / 100) * canvas.height;
      const labelX = Math.max(10, Math.min(canvas.width - labelW - 10, centerX - labelW / 2));
      const labelY = Math.max(10, Math.min(canvas.height - labelH - 10, centerY - labelH / 2));

      // Gradient background
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

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = fontSize * 0.5;
      ctx.shadowOffsetY = fontSize * 0.1;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowColor = "transparent";

      // White ring
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
      link.download = `${previewImage.product_code || "flyer"}${suffix}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const resetPreview = () => {
    setPreviewImage(null);
    setPriceMode("odoo");
    setCustomPrice("");
    setBadgePos({ x: 82, y: 88 });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-purple-100 rounded-xl">
          <Camera className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banco de Flyers</h1>
          <p className="text-sm text-slate-500">Administra flyers de productos</p>
        </div>
      </div>

      {/* Form Card */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">Agregar Flyer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Product Search */}
            <div className="relative" ref={dropdownRef}>
              <Label className="text-sm font-medium text-slate-700">Buscar Producto</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={productSearch}
                  onChange={(e) => handleProductSearchChange(e.target.value)}
                  placeholder="Buscar por código de referencia..."
                  className="pl-10 pr-8"
                  onFocus={() => { if (productResults.length > 0) setShowDropdown(true); }}
                />
                {productSearch && (
                  <button type="button" onClick={handleClearProduct} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
                {searchingProduct && (
                  <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                )}
              </div>
              {showDropdown && productResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {productResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{product.default_code}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[300px]">{product.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs text-slate-400">{product.brand}</span>
                          {product.hardware && <p className="text-[10px] text-blue-500">{product.hardware}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">Modelo</Label>
                <Input
                  value={form.model}
                  onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="Nombre del producto"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Marca</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                  placeholder="Ej: HP, Epson"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Categoría</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Ej: Impresora, Laptop"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Precio</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.price}
                    onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      value={form.price_adjust}
                      onChange={(e) => setForm((prev) => ({ ...prev, price_adjust: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyPriceAdjust();
                        }
                      }}
                      placeholder="± %"
                      type="number"
                      step="1"
                      className="w-24"
                      title="Ajustar precio por porcentaje (+ o -)"
                    />
                    {form.price_adjust && (
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, price_adjust: "" }))}
                        className="text-xs text-slate-400 hover:text-slate-600 px-1"
                        title="Limpiar ajuste"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Image Upload */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Flyer del Producto</Label>
              <div className="mt-1 flex items-center gap-4">
                {odooImage && !imagePreview && (
                  <div className="w-40 h-40 rounded-2xl overflow-hidden border-2 border-purple-300 bg-slate-50 flex-shrink-0">
                    <img src={odooImage} alt="Imagen de Odoo" className="w-full h-full object-contain" />
                    <div className="text-[10px] text-center text-purple-600 bg-purple-50 py-0.5">Odoo</div>
                  </div>
                )}
                <label className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto text-slate-400 mb-1" />
                      <span className="text-xs text-slate-400">Subir flyer</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(""); }}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Quitar flyer
                  </button>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!imageFile || saving}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Guardar Flyer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Gallery */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Galería <span className="text-sm font-normal text-slate-400">({total} imágenes)</span>
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar..."
              value={gallerySearch}
              onChange={(e) => { setGallerySearch(e.target.value); setPage(1); }}
              className="pl-10"
            />
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
              <p>No hay flyers registrados</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative rounded-2xl overflow-hidden border border-slate-200 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setPreviewImage(img);
                    setPriceMode("odoo");
                    setCustomPrice(String(img.price || ""));
                    setBadgePos({ x: 82, y: 88 });
                  }}
                >
                  <div className="aspect-square bg-slate-100">
                    <img
                      src={img.image_path}
                      alt={img.model || "Producto"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-slate-900 truncate">{img.product_code || "—"}</p>
                    <p className="text-[10px] text-slate-500 truncate">{img.brand || "—"}</p>
                    {img.price ? (
                      <p className="text-[10px] text-green-600 font-medium">${Number(img.price).toFixed(2)}</p>
                    ) : null}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(img.id); }}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Flyer</DialogTitle>
            <DialogDescription>¿Estás seguro de eliminar este flyer? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewImage !== null} onOpenChange={(open) => { if (!open) resetPreview(); }}>
        <DialogContent className="!max-w-[98vw] !w-[98vw] !h-[96vh] !max-h-[96vh] p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogTitle className="sr-only">{previewImage?.model || "Vista Previa del Flyer"}</DialogTitle>
          <div className="flex h-full">
            {/* Image panel — takes all remaining space */}
            <div className="flex-1 min-w-0 bg-slate-950 relative overflow-hidden select-none">
              {previewImage?.image_path && (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  {/* Wrapper sized exactly to the image — badge is relative to this */}
                  <div className="relative" style={{ lineHeight: 0 }}>
                    <img
                      ref={imgRef}
                      src={previewImage.image_path}
                      alt={previewImage.model || "Flyer"}
                      className="block max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                      draggable={false}
                      style={{ maxHeight: "calc(96vh - 4rem)" }}
                    />

                    {/* Draggable price badge — % coordinates match canvas exactly */}
                    {(() => {
                      const price =
                        priceMode === "odoo"
                          ? Number(previewImage?.price || 0)
                          : parseFloat(customPrice) || 0;
                      if (!price) return null;
                      const priceText = `$${price.toLocaleString("es-VE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`;
                      return (
                        <div
                          className="absolute z-10 cursor-grab active:cursor-grabbing"
                          style={{
                            left: `${badgePos.x}%`,
                            top: `${badgePos.y}%`,
                            transform: "translate(-50%, -50%)",
                          }}
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
                          <p className="text-center text-white/40 text-[10px] mt-1 pointer-events-none">
                            arrastra para mover
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Info badges bottom-left */}
              <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap pointer-events-none">
                {previewImage?.brand && (
                  <span className="bg-white/10 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full font-medium border border-white/20">
                    {previewImage.brand}
                  </span>
                )}
                {previewImage?.category && (
                  <span className="bg-purple-500/80 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full font-medium">
                    {previewImage.category}
                  </span>
                )}
              </div>
            </div>

            {/* Sidebar — fixed narrow panel */}
            <div className="w-[290px] shrink-0 bg-white border-l flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b bg-slate-50 shrink-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  {previewImage?.product_code || "—"}
                </p>
                <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-3">
                  {previewImage?.model || "Flyer"}
                </h2>
              </div>

              {/* Price selection — scrollable middle */}
              <div className="px-5 py-4 flex-1 overflow-y-auto space-y-3 min-h-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Precio para el flyer</p>

                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${priceMode === "odoo" ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="priceMode"
                    checked={priceMode === "odoo"}
                    onChange={() => setPriceMode("odoo")}
                    className="accent-purple-600"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-500">Precio Odoo</span>
                    <p className="text-2xl font-bold text-purple-600 leading-tight">
                      ${Number(previewImage?.price || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${priceMode === "custom" ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="priceMode"
                    checked={priceMode === "custom"}
                    onChange={() => setPriceMode("custom")}
                    className="accent-purple-600 mt-1"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-slate-500">Personalizado</span>
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

              {/* Download buttons — always visible at bottom */}
              <div className="px-5 py-4 border-t space-y-2 bg-slate-50 shrink-0">
                <Button
                  onClick={() => handleDownload(true)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11 text-sm font-semibold"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar con Precio
                </Button>
                <Button
                  onClick={() => handleDownload(false)}
                  variant="outline"
                  className="w-full h-11 text-sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar sin Precio
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
