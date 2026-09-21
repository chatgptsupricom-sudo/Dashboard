"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  MoreVertical,
  Pencil,
  Trash2,
  Warehouse,
} from "lucide-react";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function StockBadge({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  const zero = value <= 0;
  return (
    <div
      className={`flex flex-col rounded-lg border px-2.5 py-1.5 ${
        zero
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <span
        className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${
          zero ? "text-red-600" : "text-slate-500"
        }`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span
        className={`text-sm font-semibold ${zero ? "text-red-700" : "text-slate-800"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function ProductCard({
  product,
  onEdit,
  onDeleted,
}: {
  product: PopProduct;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Desactivar "${product.name}"? No se borra el historial.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/adminleads/material-pop/products?id=${product.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json?.error || "No se pudo desactivar el producto");
        return;
      }
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Foto: marco 1:1 igual en todas las tarjetas. `object-contain` en vez
          de `cover` porque las fotos vienen en proporciones muy distintas
          (un paraguas vertical, un mouse pad apaisado) y recortarlas al
          cuadrado se comía el producto. */}
      <div className="relative aspect-square w-full bg-slate-50">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-contain p-3"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Sin foto
            </span>
          </div>
        )}

        {product.has_alert && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
            <AlertTriangle className="h-3 w-3" />
            Agotado
          </span>
        )}

        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-white/90 backdrop-blur hover:bg-white"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Desactivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <span className="inline-block rounded-md bg-violet-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-violet-700">
            {product.code}
          </span>
          <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold text-slate-900">
            {product.name}
          </h3>
          {product.brand && (
            <p className="mt-0.5 text-xs font-medium text-slate-600">{product.brand}</p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {product.category_name || "Sin categoría"}
            {product.uom_name ? ` · ${product.uom_name}` : ""}
          </p>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2">
          <StockBadge label="Total" value={product.stock_total} icon={PackageIcon} />
          <StockBadge label="Oficina" value={product.stock_office} icon={Building2} />
          <StockBadge label="Almacén" value={product.stock_warehouse} icon={Warehouse} />
        </div>
      </div>
    </div>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
