"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, MoreVertical, Package, Pencil, Trash2 } from "lucide-react";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leerJson } from "@/lib/adminleads/material-pop/respuesta";
import { cn } from "@/lib/utils";

/** Total igual o menor a esto cuenta como stock bajo. */
export const STOCK_BAJO = 8;

export type NivelStock = "agotado" | "bajo" | "ok";

export function nivelStock(p: PopProduct): NivelStock {
  if (p.stock_total <= 0) return "agotado";
  if (p.stock_office <= 0 || p.stock_total <= STOCK_BAJO) return "bajo";
  return "ok";
}

// Tinte suave por marca: fondo de la foto y color del acento de la tarjeta.
const TINTES = [
  { fondo: "bg-blue-50", acento: "text-blue-600", hover: "hover:bg-blue-600" },
  { fondo: "bg-violet-50", acento: "text-violet-600", hover: "hover:bg-violet-600" },
  { fondo: "bg-sky-50", acento: "text-sky-500", hover: "hover:bg-sky-500" },
];
const TINTE_SUPRICOM = { fondo: "bg-slate-100", acento: "text-slate-900", hover: "hover:bg-slate-900" };

export function tinteDeMarca(brand: string | null | undefined) {
  const b = String(brand || "").trim().toUpperCase();
  if (b === "SUPRICOM") return TINTE_SUPRICOM;
  let h = 0;
  for (const c of b) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTES[h % TINTES.length];
}

export function ProductCard({
  product,
  onEdit,
  onDeleted,
  onEntrada,
  onSalida,
}: {
  product: PopProduct;
  onEdit: () => void;
  onDeleted: () => void;
  onEntrada: () => void;
  onSalida: () => void;
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
        const json = await leerJson(res).catch((e) => ({ error: e.message }));
        alert(json?.error || "No se pudo desactivar el producto");
        return;
      }
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const nivel = nivelStock(product);
  const agotado = nivel === "agotado";
  const tinte = agotado
    ? { fondo: "bg-red-50", acento: "text-red-600", hover: "hover:bg-red-600" }
    : tinteDeMarca(product.brand);
  const total = product.stock_total;
  const pctOficina = total > 0 ? (product.stock_office / total) * 100 : 0;
  const pctAlmacen = total > 0 ? (product.stock_warehouse / total) * 100 : 0;

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[22px] border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_rgba(15,23,42,.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(15,23,42,.05),0_20px_40px_rgba(15,23,42,.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        agotado ? "border-red-200" : "border-slate-200/80",
      )}
    >
      {/* Foto: `object-contain` porque vienen en proporciones muy distintas
          (un paraguas vertical, un mouse pad apaisado) y recortarlas se comía
          el producto. */}
      <div className={cn("relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl", tinte.fondo, tinte.acento)}>
        {product.image_url ? (
          // Absoluta: en flujo, el tamaño propio de la foto estiraba la tarjeta y se montaba sobre las vecinas.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="absolute inset-0 h-full w-full object-contain p-3"
          />
        ) : (
          <Package className="h-14 w-14 opacity-80" strokeWidth={1.6} />
        )}

        <span
          className={cn(
            "absolute left-2.5 top-2.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            nivel === "agotado" && "bg-red-600 text-white",
            nivel === "bajo" && "bg-amber-50 text-amber-700",
            nivel === "ok" && "bg-white text-emerald-700",
          )}
        >
          {nivel === "agotado" ? "Agotado" : nivel === "bajo" ? "Stock bajo" : "Disponible"}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Más acciones de ${product.name}`}
              className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
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

      <div>
        <span className="inline-block rounded-md bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-700">
          {product.code}
        </span>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">
          {product.name}
        </h3>
        <p className="text-xs text-slate-500">
          {[product.brand, product.category_name || "Sin categoría", product.uom_name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="mt-auto flex items-baseline justify-between">
        <b
          className={cn(
            "text-[26px] font-bold tabular-nums tracking-tight",
            agotado ? "text-red-600" : "text-slate-900",
          )}
        >
          {total}
        </b>
        <span className="text-xs text-slate-400">unidades totales</span>
      </div>

      <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <i className="block h-full bg-violet-600 transition-[width] duration-500" style={{ width: `${pctOficina}%` }} />
        <i className="block h-full bg-sky-500 transition-[width] duration-500" style={{ width: `${pctAlmacen}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span className={product.stock_office <= 0 ? "text-red-600" : ""}>
          Oficina <b className={product.stock_office <= 0 ? "text-red-600" : "text-slate-900"}>{product.stock_office}</b>
        </span>
        <span>
          Almacén <b className="text-slate-900">{product.stock_warehouse}</b>
        </span>
      </div>
      {product.stock_reserved > 0 && (
        <p className="-mt-1.5 text-[11px] text-slate-400">
          Reservado {product.stock_reserved} · disponible {product.stock_available}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ["Entrada", ArrowDown, onEntrada],
            ["Salida", ArrowUp, onSalida],
          ] as const
        ).map(([etiqueta, Icono, accion]) => (
          <button
            key={etiqueta}
            type="button"
            onClick={accion}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 transition-colors hover:border-transparent hover:text-white",
              tinte.hover,
            )}
          >
            <Icono className="h-3.5 w-3.5" />
            {etiqueta}
          </button>
        ))}
      </div>
    </article>
  );
}
