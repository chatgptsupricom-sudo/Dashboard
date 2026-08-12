"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";

interface Product {
  id: number;
  default_code: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image: string;
}

const LIMIT = 24;

export default function CatalogoProductosPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const fetchProducts = useCallback(async (opts: {
    page: number;
    q: string;
    brand: string;
    category: string;
    withFilters?: boolean;
  }) => {
    try {
      setLoading(true);
      const qs = new URLSearchParams({
        page: String(opts.page),
        limit: String(LIMIT),
      });
      if (opts.q) qs.set("q", opts.q);
      if (opts.brand && opts.brand !== "all") qs.set("brand", opts.brand);
      if (opts.category && opts.category !== "all") qs.set("category", opts.category);
      if (opts.withFilters) qs.set("filters", "1");

      const res = await fetch(`/api/disenador/productos?${qs}`);
      const data = await res.json();

      if (data.success) {
        setProducts(data.products);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (opts.withFilters && data.brands?.length) {
          setBrands(data.brands);
          setCategories(data.categories || []);
          setFiltersLoaded(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load with filters
  useEffect(() => {
    fetchProducts({ page: 1, q: "", brand: "all", category: "all", withFilters: true });
  }, [fetchProducts]);

  // On filter/search/page change
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchProducts({ page: 1, q: val, brand: brandFilter, category: categoryFilter });
    }, 400);
  };

  const handleBrandChange = (val: string) => {
    setBrandFilter(val);
    setPage(1);
    fetchProducts({ page: 1, q: search, brand: val, category: categoryFilter });
  };

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val);
    setPage(1);
    fetchProducts({ page: 1, q: search, brand: brandFilter, category: val });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchProducts({ page: newPage, q: search, brand: brandFilter, category: categoryFilter });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setSearch("");
    setBrandFilter("all");
    setCategoryFilter("all");
    setPage(1);
    fetchProducts({ page: 1, q: "", brand: "all", category: "all" });
  };

  const hasActiveFilters = search || brandFilter !== "all" || categoryFilter !== "all";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 rounded-xl">
          <Package className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de Productos</h1>
          <p className="text-sm text-slate-500">
            {loading ? "Cargando..." : `${total.toLocaleString()} productos disponibles`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-none shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar por código o nombre..."
                className="pl-10 pr-8"
              />
              {search && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Select value={brandFilter} onValueChange={handleBrandChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las marcas</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-500 gap-1.5">
                <X className="w-3.5 h-3.5" />
                Limpiar
              </Button>
            )}

            <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {filtersLoaded ? `${brands.length} marcas · ${categories.length} categorías` : "Cargando filtros..."}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <Package className="w-14 h-14 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No se encontraron productos</p>
          <p className="text-sm mt-1">Intenta con otros filtros</p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleReset} className="mt-4">
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
            {" · "}{total.toLocaleString()} productos
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) {
                p = i + 1;
              } else if (page <= 3) {
                p = i + 1;
              } else if (page >= totalPages - 2) {
                p = totalPages - 4 + i;
              } else {
                p = page - 2 + i;
              }
              return (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8 text-xs"
                  onClick={() => handlePageChange(p)}
                >
                  {p}
                </Button>
              );
            })}

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const [imgError, setImgError] = useState(false);

  return (
    <Card className="rounded-2xl border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all duration-200 overflow-hidden group">
      {/* Image */}
      <div className="aspect-square bg-slate-50 overflow-hidden relative">
        {product.image && !imgError ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-slate-200" />
          </div>
        )}
        {/* Price badge */}
        {product.price > 0 && (
          <div className="absolute bottom-1.5 right-1.5">
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
              ${product.price.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <CardContent className="p-2.5 space-y-1">
        {product.default_code && (
          <p className="text-[10px] font-mono text-slate-400 truncate">{product.default_code}</p>
        )}
        <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2rem]">
          {product.name}
        </p>
        <div className="flex flex-wrap gap-1">
          {product.brand && (
            <span className="text-[10px] bg-indigo-50 text-indigo-600 font-medium px-1.5 py-0.5 rounded-md">
              {product.brand}
            </span>
          )}
          {product.category && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md truncate max-w-full">
              {product.category}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
