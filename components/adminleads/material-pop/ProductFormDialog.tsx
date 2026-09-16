"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import type { PopCategory, PopProduct, PopUom } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Misma lógica que generateAbbreviation() en el servidor. */
function previewAbbreviation(name: string): string {
  const ignored = new Set([
    "de", "del", "la", "las", "el", "los", "en", "con", "por", "para",
    "un", "una", "unos", "unas", "y", "o", "a", "al",
  ]);
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);

  let abbr = "";
  for (const word of words) {
    if (ignored.has(word.toLowerCase())) continue;
    abbr += word[0].toUpperCase();
    if (abbr.length >= 6) break;
  }
  if (abbr.length < 3 && words.length > 0) abbr = words[0].toUpperCase().slice(0, 6);
  return abbr.slice(0, 6);
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  uoms,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PopProduct | null;
  categories: PopCategory[];
  uoms: PopUom[];
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = Boolean(product);

  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [abbreviationEdited, setAbbreviationEdited] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategory, setNewCategory] = useState("");
  const [uomId, setUomId] = useState<string>("");
  const [newUom, setNewUom] = useState("");
  const [newUomAllowsDecimal, setNewUomAllowsDecimal] = useState(false);
  const [description, setDescription] = useState("");
  const [stockOffice, setStockOffice] = useState("0");
  const [stockWarehouse, setStockWarehouse] = useState("0");

  const [imageId, setImageId] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setName(product.name);
      setAbbreviation("");
      setAbbreviationEdited(false);
      setCategoryId(product.category_id ? String(product.category_id) : "");
      setUomId(product.uom_id ? String(product.uom_id) : "");
      setDescription(product.description || "");
      setImageId(product.image_id);
      setImagePreview(product.image_url);
      setNewCategory("");
      setNewUom("");
      setNewUomAllowsDecimal(false);
    } else {
      setName("");
      setAbbreviation("");
      setAbbreviationEdited(false);
      setCategoryId("");
      setUomId("");
      setDescription("");
      setImageId(null);
      setImagePreview(null);
      setNewCategory("");
      setNewUom("");
      setNewUomAllowsDecimal(false);
      setStockOffice("0");
      setStockWarehouse("0");
    }
  }, [open, product]);

  const skuPreview = useMemo(() => {
    if (isEdit) return product?.code || "";
    const abbr = abbreviation || previewAbbreviation(name);
    return abbr ? `POP-${abbr}` : "POP-";
  }, [name, abbreviation, isEdit, product]);

  const allowsDecimal = newUom.trim()
    ? newUomAllowsDecimal
    : Boolean(uoms.find((u) => String(u.id) === uomId)?.allows_decimal);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/adminleads/material-pop/upload-image", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo subir la imagen");
      setImageId(json.imageId);
      setImagePreview(json.imageUrl);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: name.trim(),
        abbreviation: abbreviation.trim() || undefined,
        description: description.trim() || null,
        imageId,
      };

      if (newCategory.trim()) {
        payload.categoryName = newCategory.trim();
      } else if (categoryId) {
        payload.categoryId = Number(categoryId);
      }

      if (newUom.trim()) {
        payload.uomName = newUom.trim();
        payload.uomAllowsDecimal = newUomAllowsDecimal;
      } else if (uomId) {
        payload.uomId = Number(uomId);
      }

      if (isEdit) {
        payload.id = product!.id;
      } else {
        payload.initialStockOffice = Number(stockOffice) || 0;
        payload.initialStockWarehouse = Number(stockWarehouse) || 0;
      }

      const res = await fetch("/api/adminleads/material-pop/products", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar");

      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar producto" : "Nuevo producto POP"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualiza los datos del producto. El SKU no cambia."
              : "El SKU se genera automáticamente a partir del nombre."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* SKU preview */}
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600">
                SKU {isEdit ? "" : "sugerido"}
              </p>
              <p className="truncate font-mono text-sm font-semibold text-violet-900">
                {skuPreview}
                {!isEdit && !name.trim() && (
                  <span className="ml-1 font-sans text-xs font-normal text-violet-500">
                    (escribe el nombre)
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Foto */}
          <div>
            <Label>Foto del producto</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt="Foto"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {imagePreview ? "Cambiar foto" : "Subir foto"}
                </Button>
                {imagePreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      setImageId(null);
                      setImagePreview(null);
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <Label htmlFor="pop-name">Nombre *</Label>
            <Input
              id="pop-name"
              value={name}
               onChange={(e) => {
                 const nextName = e.target.value;
                 setName(nextName);
                 if (!abbreviationEdited) setAbbreviation(previewAbbreviation(nextName));
               }}
              placeholder="Ej: Agenda corporativa, Banner publicitario..."
              className="mt-1.5"
            />
          </div>

          {!isEdit && (
            <div>
              <Label htmlFor="pop-abbreviation">Abreviación del SKU</Label>
              <Input
                id="pop-abbreviation"
                value={abbreviation}
                maxLength={6}
                onChange={(e) => {
                  setAbbreviation(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase());
                  setAbbreviationEdited(true);
                }}
                placeholder="Ej: AGND"
                className="mt-1.5 font-mono uppercase"
              />
              <p className="mt-1 text-xs text-slate-400">Máximo 6 caracteres alfanuméricos.</p>
            </div>
          )}

          {/* Categoría y unidad */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pop-category">Categoría</Label>
              <select
                id="pop-category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  if (e.target.value) setNewCategory("");
                }}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Input
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value);
                  if (e.target.value) setCategoryId("");
                }}
                placeholder="…o escribe una nueva"
                className="mt-2 h-9 text-sm"
              />
            </div>

            <div>
              <Label htmlFor="pop-uom">Unidad de medida</Label>
              <select
                id="pop-uom"
                value={uomId}
                onChange={(e) => {
                  setUomId(e.target.value);
                  if (e.target.value) setNewUom("");
                }}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="">Sin unidad</option>
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <Input
                value={newUom}
                onChange={(e) => {
                  setNewUom(e.target.value);
                  if (e.target.value) setUomId("");
                }}
                placeholder="…o escribe una nueva"
                className="mt-2 h-9 text-sm"
              />
              {newUom.trim() && (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={newUomAllowsDecimal}
                    onChange={(e) => setNewUomAllowsDecimal(e.target.checked)}
                  />
                  Permite decimales (máximo 2)
                </label>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <Label htmlFor="pop-desc">Descripción</Label>
            <Textarea
              id="pop-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles, medidas, material..."
              className="mt-1.5"
              rows={3}
            />
          </div>

          {/* Stock inicial (solo creación) */}
          {!isEdit && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Stock inicial (opcional)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pop-office" className="text-xs">
                    Oficina
                  </Label>
                  <Input
                    id="pop-office"
                    type="number"
                    min="0"
                    step={allowsDecimal ? "0.01" : "1"}
                    value={stockOffice}
                    onChange={(e) => setStockOffice(e.target.value)}
                    className="mt-1.5 h-9 bg-white"
                  />
                </div>
                <div>
                  <Label htmlFor="pop-warehouse" className="text-xs">
                    Almacén
                  </Label>
                  <Input
                    id="pop-warehouse"
                    type="number"
                    min="0"
                    step={allowsDecimal ? "0.01" : "1"}
                    value={stockWarehouse}
                    onChange={(e) => setStockWarehouse(e.target.value)}
                    className="mt-1.5 h-9 bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || uploading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
