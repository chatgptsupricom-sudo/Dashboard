"use client";

import { useMemo, useState } from "react";
import { Download, PackagePlus, Search } from "lucide-react";
import { ProductCard, nivelStock } from "./ProductCard";
import type { PopCategory, PopLocation, PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function CatalogTab({
  products,
  categories,
  loading,
  onRefresh,
  onNew,
  onImport,
  onEdit,
  onEntrada,
  onSalida,
}: {
  products: PopProduct[];
  categories: PopCategory[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onNew: () => void;
  onImport: () => void;
  onEdit: (p: PopProduct) => void;
  onEntrada: (p: PopProduct) => void;
  onSalida: (p: PopProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<PopLocation | "">("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  // Las marcas salen del propio catalogo y no del endpoint de Odoo: aqui solo
  // interesa filtrar lo que ya esta en pantalla.
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const b = (p.brand || "").trim();
      if (b) set.add(b);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (onlyAlerts && nivelStock(p) === "ok") return false;
      if (categoryFilter && String(p.category_id) !== categoryFilter) return false;
      if (brandFilter && (p.brand || "").trim() !== brandFilter) return false;
      // Ubicacion = donde hay existencia, no un campo del producto: un producto
      // vive en las dos y lo que cambia es la cantidad de cada lado.
      if (locationFilter === "office" && p.stock_office <= 0) return false;
      if (locationFilter === "warehouse" && p.stock_warehouse <= 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q)
      );
    });
  }, [products, query, categoryFilter, brandFilter, locationFilter, onlyAlerts]);

  const pill =
    "h-[34px] rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-600";

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-[1_1_240px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, SKU o marca"
            aria-label="Buscar"
            className="h-[42px] rounded-full border-slate-200 bg-white pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Marca">
          {["", ...brands].map((b) => (
            <button
              key={b || "todas"}
              type="button"
              aria-pressed={brandFilter === b}
              onClick={() => setBrandFilter(b)}
              className={cn(
                pill,
                brandFilter === b && "border-transparent bg-blue-600 text-white",
              )}
            >
              {b || "Todas"}
            </button>
          ))}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Categoría"
          className={pill}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value as PopLocation | "")}
          aria-label="Ubicación"
          className={pill}
        >
          <option value="">Todas las ubicaciones</option>
          <option value="office">Con stock en Oficina</option>
          <option value="warehouse">Con stock en Almacén</option>
        </select>

        <button
          type="button"
          aria-pressed={onlyAlerts}
          onClick={() => setOnlyAlerts((v) => !v)}
          className={cn(pill, onlyAlerts && "border-transparent bg-red-600 text-white")}
        >
          Solo alertas
        </button>

        <span className="w-full text-[13px] text-slate-400 sm:ml-auto sm:w-auto">
          {filtered.length} {filtered.length === 1 ? "producto" : "productos"}
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-80 animate-pulse rounded-[22px] border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-300">
            <PackagePlus className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-600">
              {products.length === 0
                ? "Todavía no hay productos POP"
                : "Sin resultados para el filtro"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {products.length === 0
                ? "Crea el primer producto o importa un Excel."
                : "Prueba con otro nombre, SKU, marca, categoría o ubicación."}
            </p>
          </div>
          {products.length === 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onImport()}>
                <Download className="mr-2 h-4 w-4" />
                Importar Excel
              </Button>
              <Button size="sm" onClick={onNew}>
                <PackagePlus className="mr-2 h-4 w-4" />
                Nuevo producto
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] sm:gap-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => onEdit(product)}
              onDeleted={onRefresh}
              onEntrada={() => onEntrada(product)}
              onSalida={() => onSalida(product)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
