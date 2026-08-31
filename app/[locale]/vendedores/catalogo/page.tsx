// "use client";

// import { Card, CardContent } from "@/components/ui/card";
// import { motion } from "framer-motion";
// import { Boxes, Package, PackageX, Search, Tag } from "lucide-react";
// import { useEffect, useMemo, useState } from "react";

// export default function CatalogoPage() {
//   const [productos, setProductos] = useState<any[]>([]);
//   const [busqueda, setBusqueda] = useState("");
//   const [categoria, setCategoria] = useState("todas");
//   const [cargando, setCargando] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     fetch("/api/vendedores/catalogo")
//       .then((res) => res.json())
//       .then((data) => {
//         if (Array.isArray(data)) {
//           // Debug — productos con display_name distinto a name
//           const conDisplay = data.filter((p) => p.display_name !== p.name);
//           console.log("Productos con display_name distinto:", conDisplay);
//           console.log(
//             "Muestra del producto 111368:",
//             data.find((p) => p.id === 111368),
//           );

//           setProductos(data);
//         } else if (data?.error) {
//           setError(data.error);
//         }
//       })
//       .catch(() => setError("Error al cargar el catálogo"))
//       .finally(() => setCargando(false));
//   }, []);

//   // Categorías únicas para el filtro
//   const categorias = useMemo(() => {
//     const set = new Set<string>();
//     productos.forEach((p) => {
//       const cat = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
//       if (cat) set.add(cat);
//     });
//     return Array.from(set).sort();
//   }, [productos]);

//   const productosFiltrados = useMemo(() => {
//     return productos.filter((p) => {
//       const texto = busqueda.toLowerCase();
//       const coincideTexto =
//         p.name?.toLowerCase().includes(texto) ||
//         p.default_code?.toLowerCase().includes(texto) ||
//         p.barcode?.toLowerCase().includes(texto);
//       const catNombre = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
//       const coincideCategoria =
//         categoria === "todas" || catNombre === categoria;
//       return coincideTexto && coincideCategoria;
//     });
//   }, [productos, busqueda, categoria]);

//   return (
//     <div className="space-y-8">
//       {/* Header */}
//       <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
//         <div className="flex items-center gap-4">
//           <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
//             <Boxes className="w-5 h-5 text-white" />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black text-zinc-900">
//               Catálogo de Productos
//             </h1>
//             <p className="text-sm text-zinc-500">
//               {cargando
//                 ? "Cargando..."
//                 : `${productosFiltrados.length} de ${productos.length} productos`}
//             </p>
//           </div>
//         </div>

//         {/* Buscador */}
//         <div className="relative w-full lg:w-96">
//           <Search className="absolute left-3 top-3.5 text-zinc-400" size={18} />
//           <input
//             type="text"
//             placeholder="Buscar por nombre, código o código de barras..."
//             value={busqueda}
//             onChange={(e) => setBusqueda(e.target.value)}
//             className="w-full pl-10 pr-4 py-3 rounded-2xl border border-zinc-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
//           />
//         </div>
//       </div>

//       {/* Filtro de categorías */}
//       {categorias.length > 0 && (
//         <div className="flex gap-2 flex-wrap">
//           <button
//             onClick={() => setCategoria("todas")}
//             className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
//               categoria === "todas"
//                 ? "bg-zinc-900 text-white"
//                 : "bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300"
//             }`}
//           >
//             Todas
//           </button>
//           {categorias.map((cat) => (
//             <button
//               key={cat}
//               onClick={() => setCategoria(cat)}
//               className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
//                 categoria === cat
//                   ? "bg-zinc-900 text-white"
//                   : "bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300"
//               }`}
//             >
//               {cat}
//             </button>
//           ))}
//         </div>
//       )}

//       {/* Estados */}
//       {cargando && (
//         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
//           {Array.from({ length: 8 }).map((_, i) => (
//             <div
//               key={i}
//               className="rounded-3xl border border-zinc-100 bg-white p-4 animate-pulse"
//             >
//               <div className="aspect-square rounded-2xl bg-zinc-100 mb-4" />
//               <div className="h-3 bg-zinc-100 rounded-full w-3/4 mb-2" />
//               <div className="h-3 bg-zinc-100 rounded-full w-1/2" />
//             </div>
//           ))}
//         </div>
//       )}

//       {error && (
//         <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm">
//           {error}
//         </div>
//       )}

//       {!cargando && !error && productosFiltrados.length === 0 && (
//         <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
//           <PackageX className="w-12 h-12 mb-3" />
//           <p className="text-sm font-medium">No se encontraron productos</p>
//         </div>
//       )}

//       {/* Grid de productos */}
//       {!cargando && !error && productosFiltrados.length > 0 && (
//         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
//           {productosFiltrados.map((p, i) => (
//             <ProductoCard key={p.id} producto={p} index={i} />
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function ProductoCard({ producto, index }: { producto: any; index: number }) {
//   const imagen = producto.image_128
//     ? `data:image/png;base64,${producto.image_128}`
//     : null;
//   const categoria = Array.isArray(producto.categ_id)
//     ? producto.categ_id[1]
//     : null;
//   const stock = producto.qty_available ?? 0;
//   const precio = producto.company_sale_price ?? 0;
//   const nombreLimpio =
//     producto.display_name?.replace(/\[.*?\]/g, "").trim() || producto.name;

//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 10 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ delay: Math.min(index * 0.02, 0.4) }}
//     >
//       <Card className="rounded-3xl border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden h-full">
//         <CardContent className="p-4 space-y-4">
//           {/* Imagen */}
//           <div className="relative aspect-square rounded-2xl bg-zinc-50 flex items-center justify-center overflow-hidden">
//             {imagen ? (
//               <img
//                 src={imagen}
//                 alt={nombreLimpio}
//                 className="w-full h-full object-contain p-2"
//               />
//             ) : (
//               <Package className="w-10 h-10 text-zinc-200" />
//             )}
//             {/* Badge de stock */}
//             <span
//               className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
//                 stock > 0
//                   ? "bg-emerald-100 text-emerald-700"
//                   : "bg-red-100 text-red-600"
//               }`}
//             >
//               {stock > 0 ? `${stock} disp.` : "Sin stock"}
//             </span>
//           </div>

//           {/* Info */}
//           <div className="space-y-2">
//             {producto.default_code && (
//               <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
//                 <Tag size={10} /> {producto.default_code}
//               </span>
//             )}
//             <h3 className="font-bold text-zinc-900 text-sm leading-snug line-clamp-2 min-h-[2.5rem]">
//               {nombreLimpio}
//             </h3>
//             {categoria && (
//               <p className="text-[11px] text-zinc-400 truncate">{categoria}</p>
//             )}
//           </div>

//           {/* Precio */}
//           <div className="pt-2 border-t border-zinc-50 flex items-baseline justify-between">
//             <span className="text-lg font-black text-zinc-900">
//               ${precio.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
//             </span>
//             {Array.isArray(producto.uom_id) && (
//               <span className="text-[10px] text-zinc-400 font-medium">
//                 / {producto.uom_id[1]}
//               </span>
//             )}
//           </div>
//         </CardContent>
//       </Card>
//     </motion.div>
//   );
// }
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  Boxes,
  Download,
  Loader2,
  Package,
  PackageX,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const CATEGORIAS_OCULTAS_LOWER = ["juguetes"];

const COLUMNAS_DISPONIBLES = [
  { key: "referencia", label: "Referencia" },
  { key: "nombre", label: "Nombre en pantalla" },
  { key: "marca", label: "Marca" },
  { key: "stock", label: "Cantidad Disponible" },
  { key: "precio", label: "Precio" },
  { key: "imagen", label: "Imagen" },
];

export default function CatalogoPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 60;
  const [columnasSeleccionadas, setColumnasSeleccionadas] = useState<
    Record<string, boolean>
  >(Object.fromEntries(COLUMNAS_DISPONIBLES.map((c) => [c.key, true])));
  const [unaHoja, setUnaHoja] = useState(false);

  useEffect(() => {
    fetch("/api/vendedores/catalogo")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Debug — productos con display_name distinto a name
          const conDisplay = data.filter((p) => p.display_name !== p.name);
          console.log("Productos con display_name distinto:", conDisplay);
          console.log(
            "Muestra del producto 111368:",
            data.find((p) => p.id === 111368),
          );

          setProductos(data);
        } else if (data?.error) {
          setError(data.error);
        }
      })
      .catch(() => setError("Error al cargar el catálogo"))
      .finally(() => setCargando(false));
  }, []);

  // Categorías únicas para el filtro (se excluyen las categorías ocultas)
  const categorias = useMemo(() => {
    const set = new Set<string>();
    productos.forEach((p) => {
      const cat = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
      if (cat && !CATEGORIAS_OCULTAS_LOWER.includes(cat.toLowerCase()))
        set.add(cat);
    });
    return Array.from(set).sort();
  }, [productos]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, categoria]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const cat = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
      if (cat && CATEGORIAS_OCULTAS_LOWER.includes(cat.toLowerCase()))
        return false;
      if (!busqueda) return categoria === "todas" || cat === categoria;
      const texto = busqueda.toLowerCase();
      const nombreReal = (
        p.translated_name ||
        p.display_name?.replace(/\[.*?\]/g, "").trim() ||
        p.name ||
        ""
      ).toLowerCase();
      const codigo =
        typeof p.default_code === "string" ? p.default_code.toLowerCase() : "";
      const barcode =
        typeof p.barcode === "string" ? p.barcode.toLowerCase() : "";
      const coincideTexto =
        nombreReal.includes(texto) ||
        codigo.includes(texto) ||
        barcode.includes(texto) ||
        String(p.id).includes(texto);
      const coincideCategoria = categoria === "todas" || cat === categoria;
      return coincideTexto && coincideCategoria;
    });
  }, [productos, busqueda, categoria]);

  const getMarca = (p: any) => p.marca || "";

  const getNombre = (p: any) => {
    const tmplName = Array.isArray(p.product_tmpl_id)
      ? p.product_tmpl_id[1]?.replace(/\[.*?\]/g, "").trim()
      : null;
    return (
      p.translated_name ||
      p.display_name?.replace(/\[.*?\]/g, "").trim() ||
      tmplName ||
      p.name
    );
  };

  const exportarExcel = async () => {
    setModalExport(false);
    setExportando(true);
    try {
      const params = new URLSearchParams({
        categoria,
        unaHoja: unaHoja ? "1" : "0",
      });
      Object.entries(columnasSeleccionadas).forEach(([k, v]) =>
        params.set(k, v ? "1" : "0"),
      );
      const res = await fetch(`/api/vendedores/catalogo/export?${params}`);
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match?.[1] || "catalogo.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error al exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900">
              Catálogo de Productos
            </h1>
            <p className="text-sm text-zinc-500">
              {cargando
                ? "Cargando..."
                : `${productosFiltrados.length} de ${productos.length} productos`}
            </p>
          </div>
        </div>

        {/* Buscador + Exportar */}
        <div className="flex gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-96">
            <Search
              className="absolute left-3 top-3.5 text-zinc-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Buscar por nombre, código o código de barras..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-zinc-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setModalExport(true)}
            disabled={cargando || exportando || productos.length === 0}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
          >
            {exportando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {exportando ? "Exportando..." : "Exportar Excel"}
          </button>
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
            Todas
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
          <p className="text-sm font-medium">No se encontraron productos</p>
        </div>
      )}

      {/* Grid de productos */}
      {!cargando &&
        !error &&
        productosFiltrados.length > 0 &&
        (() => {
          const totalPaginas = Math.ceil(
            productosFiltrados.length / POR_PAGINA,
          );
          const visibles = productosFiltrados.slice(
            (pagina - 1) * POR_PAGINA,
            pagina * POR_PAGINA,
          );
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {visibles.map((p, i) => (
                  <ProductoCard key={p.id} producto={p} index={i} />
                ))}
              </div>
              {totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    onClick={() => setPagina((v) => Math.max(1, v - 1))}
                    disabled={pagina === 1}
                    className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium disabled:opacity-40 hover:bg-zinc-50 transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-sm text-zinc-500">
                    Página {pagina} de {totalPaginas}
                  </span>
                  <button
                    onClick={() =>
                      setPagina((v) => Math.min(totalPaginas, v + 1))
                    }
                    disabled={pagina === totalPaginas}
                    className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium disabled:opacity-40 hover:bg-zinc-50 transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </>
          );
        })()}

      {/* Modal de columnas para exportar */}
      {modalExport && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h2 className="text-base font-bold text-zinc-900">
                Columnas a exportar
              </h2>
              <button
                onClick={() => setModalExport(false)}
                className="text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {COLUMNAS_DISPONIBLES.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={columnasSeleccionadas[col.key]}
                    onChange={(e) =>
                      setColumnasSeleccionadas((prev) => ({
                        ...prev,
                        [col.key]: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900 font-medium">
                    {col.label}
                  </span>
                </label>
              ))}
            </div>
            {categoria === "todas" && (
              <div className="px-6 pb-5">
                <label className="flex items-center gap-3 cursor-pointer group border-t border-zinc-100 pt-4">
                  <input
                    type="checkbox"
                    checked={unaHoja}
                    onChange={(e) => setUnaHoja(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900 font-medium">
                    Exportar todo en una sola hoja
                  </span>
                </label>
              </div>
            )}
            <div className="px-6 py-4 border-t border-zinc-100 flex gap-3 justify-end">
              <button
                onClick={() => setModalExport(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={exportarExcel}
                disabled={!Object.values(columnasSeleccionadas).some(Boolean)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
              >
                <Download size={15} /> Exportar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ProductoCard({ producto, index }: { producto: any; index: number }) {
  const imagen = producto.image_1024
    ? `data:image/png;base64,${producto.image_1024}`
    : null;
  const categoria = Array.isArray(producto.categ_id)
    ? producto.categ_id[1]
    : null;
  const stock = producto.qty_available ?? 0;
  const precio = producto.company_sale_price ?? 0;
  const templateName = Array.isArray(producto.product_tmpl_id)
    ? producto.product_tmpl_id[1]?.replace(/\[.*?\]/g, "").trim()
    : null;
  const nombreLimpio =
    producto.translated_name ||
    producto.display_name?.replace(/\[.*?\]/g, "").trim() ||
    templateName ||
    producto.name;

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
                loading="lazy"
                style={{ imageRendering: "high-quality" }}
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
              {stock > 0 ? `${stock} disp.` : "Sin stock"}
            </span>
          </div>

          {/* Info */}
          <div className="space-y-2">
            {producto.default_code && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                <Tag size={10} /> {producto.default_code}
              </span>
            )}
            <h3 title={nombreLimpio} className="font-bold text-zinc-900 text-sm leading-snug line-clamp-2 min-h-[2.5rem] cursor-default">
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
