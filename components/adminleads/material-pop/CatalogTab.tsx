"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, PackagePlus, Search } from "lucide-react";
import { ProductCard } from "./ProductCard";
import { ProductFormDialog } from "./ProductFormDialog";
import { ExcelImportDialog } from "./ExcelImportDialog";
import type {
  PopCategory,
  PopLocation,
  PopProduct,
  PopUom,
} from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CatalogTab({
  products,
  categories,
  uoms,
  loading,
  onRefresh,
}: {
  products: PopProduct[];
  categories: PopCategory[];
  uoms: PopUom[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<PopLocation | "">("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PopProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
      if (onlyAlerts && !p.has_alert) return false;
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

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: PopProduct) {
    setEditing(product);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, SKU o marca..."
              className="pl-9"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="">Todas las marcas</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value as PopLocation | "")}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="">Todas las ubicaciones</option>
            <option value="office">Con stock en Oficina</option>
            <option value="warehouse">Con stock en Almacén</option>
          </select>

          <Button
            type="button"
            variant={onlyAlerts ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyAlerts((v) => !v)}
            className="h-9"
          >
            Solo alertas
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Importar Excel
          </Button>
          <Button type="button" size="sm" className="h-9" onClick={openNew}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
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
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Download className="mr-2 h-4 w-4" />
                Importar Excel
              </Button>
              <Button size="sm" onClick={openNew}>
                <PackagePlus className="mr-2 h-4 w-4" />
                Nuevo producto
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => openEdit(product)}
              onDeleted={onRefresh}
            />
          ))}
        </div>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        categories={categories}
        uoms={uoms}
        onSaved={onRefresh}
      />

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onRefresh}
      />
    </div>
  );
}
