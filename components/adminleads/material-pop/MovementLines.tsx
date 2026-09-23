"use client";

import { Plus, Trash2 } from "lucide-react";
import { ProductSelect } from "./ProductSelect";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MovementLine = { productId: number | null; quantity: string };

export const lineaVacia = (): MovementLine => ({ productId: null, quantity: "" });

/**
 * Productos de un movimiento, uno por fila.
 *
 * Antes cada entrada, salida, traslado o ajuste llevaba un solo producto, así
 * que cargar una compra de diez artículos eran diez movimientos a mano. Lo que
 * es del movimiento —ubicación, motivo, cliente, fecha, notas— sigue siendo
 * uno solo y vive fuera de este bloque.
 */
export function MovementLines({
  products,
  lines,
  onChange,
  quantityLabel = "Cantidad",
}: {
  products: PopProduct[];
  lines: MovementLine[];
  onChange: (lines: MovementLine[]) => void;
  quantityLabel?: string;
}) {
  const yaElegidos = new Set(lines.map((l) => l.productId).filter(Boolean) as number[]);

  const actualizar = (i: number, cambio: Partial<MovementLine>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...cambio } : l)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Productos</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => onChange([...lines, lineaVacia()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar producto
        </Button>
      </div>

      {lines.map((line, i) => {
        const producto = products.find((p) => p.id === line.productId) || null;
        const decimales = Boolean(producto?.uom_allows_decimal);
        // Un producto repetido deja el stock final ambiguo, y el servidor lo
        // rechaza; se saca de las opciones de las demás filas.
        const disponibles = products.filter(
          (p) => p.id === line.productId || !yaElegidos.has(p.id),
        );

        return (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ProductSelect
                  products={disponibles}
                  value={line.productId}
                  onChange={(id) => actualizar(i, { productId: id })}
                />
              </div>
              <div className="w-28 shrink-0">
                <Label className="text-[11px] text-slate-500">{quantityLabel}</Label>
                <Input
                  type="number"
                  min="0"
                  step={decimales ? "0.01" : "1"}
                  value={line.quantity}
                  onChange={(e) => actualizar(i, { quantity: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 shrink-0 text-slate-400 hover:text-red-600"
                  onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                  aria-label="Quitar producto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {producto && (
              <p className="mt-2 text-xs text-slate-500">
                Stock — Oficina: <strong>{producto.stock_office}</strong> · Almacén:{" "}
                <strong>{producto.stock_warehouse}</strong>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
