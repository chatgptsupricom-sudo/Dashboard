"use client";

import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  Boxes,
  Package,
  PackageX,
  Search,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

export default function CatalogoPage() {
  const t = useTranslations("superadmin.catalogo");
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vendedores/catalogo")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Debug — productos con display_name distinto a name
          const conDisplay = data.filter(p => p.display_name !== p.name);
          console.log("Productos con display_name distinto:", conDisplay);
          console.log("Muestra del producto 111368:", data.find(p => p.id === 111368));
          
          setProductos(data);
        } else if (data?.error) {
          setError(data.error);
        }
      })
      .catch(() => setError(t("error_cargar")))
      .finally(() => setCargando(false));
  }, []);

  // Categorías únicas para el filtro
  const categorias = useMemo(() => {
    const set = new Set<string>();
    productos.forEach((p) => {
      const cat = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
      if (cat) set.add(cat);
    });
    return Array.from(set).sort();
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const texto = busqueda.toLowerCase();
      const coincideTexto =
        p.name?.toLowerCase().includes(texto) ||
        p.default_code?.toLowerCase().includes(texto) ||
        p.barcode?.toLowerCase().includes(texto);
      const catNombre = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
      const coincideCategoria =
        categoria === "todas" || catNombre === categoria;
      return coincideTexto && coincideCategoria;
    });
  }, [productos, busqueda, categoria]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900">{t("title")}</h1>
            <p className="text-sm text-zinc-500">
              {cargando
                ? t("cargando")
                : `${productosFiltrados.length} de ${productos.length} ${t("productos")}`}
            </p>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-3 top-3.5 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder={t("buscar")}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-zinc-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>
      </div>

      {/* Filtro de categorías */}
      {categorias.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoria("todas")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              categoria === "todas"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300"
            }`}
          >
            {t("todas")}
          </button>
          {categorias.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoria(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                categoria === cat
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Estados */}
      {cargando && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-3xl border border-zinc-100 bg-white p-4 animate-pulse"
            >
              <div className="aspect-square rounded-2xl bg-zinc-100 mb-4" />
              <div className="h-3 bg-zinc-100 rounded-full w-3/4 mb-2" />
              <div className="h-3 bg-zinc-100 rounded-full w-1/2" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm">
          {error}
        </div>
      )}

      {!cargando && !error && productosFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
          <PackageX className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">{t("no_resultados")}</p>
        </div>
      )}

      {/* Grid de productos */}
      {!cargando && !error && productosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {productosFiltrados.map((p, i) => (
            <ProductoCard key={p.id} producto={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductoCard({ producto, index }: { producto: any; index: number }) {
  const imagen = producto.image_128
    ? `data:image/png;base64,${producto.image_128}`
    : null;
  const categoria = Array.isArray(producto.categ_id)
    ? producto.categ_id[1]
    : null;
  const stock = producto.qty_available ?? 0;
  const precio = producto.company_sale_price ?? 0;
  const nombreLimpio = producto.display_name?.replace(/\[.*?\]/g, "").trim() || producto.name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4) }}
    >
      <Card className="rounded-3xl border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden h-full">
        <CardContent className="p-4 space-y-4">
          {/* Imagen */}
          <div className="relative aspect-square rounded-2xl bg-zinc-50 flex items-center justify-center overflow-hidden">
            {imagen ? (
              <img
                src={imagen}
                alt={nombreLimpio}
                className="w-full h-full object-contain p-2"
              />
            ) : (
              <Package className="w-10 h-10 text-zinc-200" />
            )}
            {/* Badge de stock */}
            <span
              className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                stock > 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {stock > 0 ? `${stock} ${t("disp")}` : t("sin_stock")}
            </span>
          </div>

          {/* Info */}
          <div className="space-y-2">
            {producto.default_code && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                <Tag size={10} /> {producto.default_code}
              </span>
            )}
            <h3 className="font-bold text-zinc-900 text-sm leading-snug line-clamp-2 min-h-[2.5rem]">
              {nombreLimpio}
            </h3>
            {categoria && (
              <p className="text-[11px] text-zinc-400 truncate">{categoria}</p>
            )}
          </div>

          {/* Precio */}
          <div className="pt-2 border-t border-zinc-50 flex items-baseline justify-between">
            <span className="text-lg font-black text-zinc-900">
              ${precio.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
            </span>
            {Array.isArray(producto.uom_id) && (
              <span className="text-[10px] text-zinc-400 font-medium">
                / {producto.uom_id[1]}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
