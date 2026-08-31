"use client";

import { motion } from "framer-motion";
import { Boxes, Package, PackageX, Search, Download, X, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const SEDES = [
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
];

const COLUMNAS_DISPONIBLES = [
  { key: "referencia", label: "Referencia" },
  { key: "nombre", label: "Nombre en pantalla" },
  { key: "marca", label: "Marca" },
  { key: "stock", label: "Cantidad Disponible" },
  { key: "precio", label: "Precio" },
  { key: "imagen", label: "Imagen" },
];

const safeStr = (v: any) => (typeof v === "string" ? v : "");

export default function AdminLeadsCatalogoPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sede, setSede] = useState("9");
  const [exportando, setExportando] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [columnasSeleccionadas, setColumnasSeleccionadas] = useState<Record<string, boolean>>(
    Object.fromEntries(COLUMNAS_DISPONIBLES.map((c) => [c.key, true]))
  );
  const [unaHoja, setUnaHoja] = useState(false);

  useEffect(() => {
    setCargando(true);
    setError(null);
    fetch(`/api/adminleads/catalogo?sede=${sede}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProductos(data);
        } else if (data?.error) {
          setError(data.error);
        }
      })
      .catch(() => setError("Error al cargar el catálogo"))
      .finally(() => setCargando(false));
  }, [sede]);

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
        safeStr(p.name).toLowerCase().includes(texto) ||
        safeStr(p.default_code).toLowerCase().includes(texto) ||
        safeStr(p.barcode).toLowerCase().includes(texto);
      const catNombre = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
      const coincideCategoria = categoria === "todas" || catNombre === categoria;
      return coincideTexto && coincideCategoria;
    });
  }, [productos, busqueda, categoria]);

  const exportarExcel = async () => {
    setModalExport(false);
    setExportando(true);
    try {
      const params = new URLSearchParams({
        sede,
        categoria,
        unaHoja: unaHoja ? "1" : "0",
      });
      Object.entries(columnasSeleccionadas).forEach(([k, v]) => params.set(k, v ? "1" : "0"));
      const res = await fetch(`/api/adminleads/catalogo/export?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
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
    } catch (e: any) {
      alert("Error al exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  const sedeLabel = SEDES.find((s) => s.id === sede)?.label || "Valencia";

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900">Catálogo de Productos</h1>
            <p className="text-sm text-zinc-500">
              {cargando ? "Cargando..." : `${productosFiltrados.length} de ${productos.length} productos - ${sedeLabel}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={sede}
            onChange={(e) => setSede(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {SEDES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-3.5 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, código o código de barras..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          <button
            onClick={() => setModalExport(true)}
            disabled={cargando || exportando || productos.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exportando ? "Exportando..." : "Exportar"}
          </button>
        </div>
      </div>

      {categorias.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoria("todas")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              categoria === "todas" ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300"
            }`}
          >
            Todas
          </button>
          {categorias.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoria(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                categoria === cat ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {cargando && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 animate-pulse">
              <div className="aspect-square rounded-2xl bg-zinc-100 mb-4" />
              <div className="h-3 bg-zinc-100 rounded-full w-3/4 mb-2" />
              <div className="h-3 bg-zinc-100 rounded-full w-1/2" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm">{error}</div>
      )}

      {!cargando && !error && productosFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
          <PackageX className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No se encontraron productos</p>
        </div>
      )}

      {!cargando && !error && productosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {productosFiltrados.map((p, i) => (
            <ProductoCard key={p.id} producto={p} index={i} />
          ))}
        </div>
      )}

      {modalExport && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h2 className="text-base font-bold text-zinc-900">Columnas a exportar</h2>
              <button onClick={() => setModalExport(false)} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {COLUMNAS_DISPONIBLES.map((col) => (
                <label key={col.key} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={columnasSeleccionadas[col.key]}
                    onChange={(e) => setColumnasSeleccionadas((prev) => ({ ...prev, [col.key]: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900 font-medium">{col.label}</span>
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
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900 font-medium">Exportar todo en una sola hoja</span>
                </label>
              </div>
            )}
            <div className="px-6 py-4 border-t border-zinc-100 flex gap-3 justify-end">
              <button onClick={() => setModalExport(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors">
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
  const imagen = producto.image_128 ? `data:image/png;base64,${producto.image_128}` : null;
  const categoria = Array.isArray(producto.categ_id) ? producto.categ_id[1] : null;
  const stock = producto.qty_available ?? 0;
  const precio = producto.company_sale_price ?? 0;
  const displayRaw = typeof producto.display_name === "string" ? producto.display_name : "";
  const nombreLimpio = displayRaw.replace(/\[.*?\]/g, "").trim() || safeStr(producto.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className="rounded-3xl border border-zinc-100 bg-white p-4 hover:shadow-lg hover:border-zinc-200 transition-all duration-200"
    >
      <div className="aspect-square rounded-2xl bg-zinc-50 mb-4 flex items-center justify-center overflow-hidden">
        {imagen ? (
          <img src={imagen} alt={producto.name} className="w-full h-full object-contain p-2" />
        ) : (
          <Package className="w-12 h-12 text-zinc-300" />
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-bold text-sm text-zinc-900 line-clamp-2 leading-snug min-h-[2.5rem]">{nombreLimpio}</h3>
        {producto.default_code && <p className="text-xs text-zinc-400 font-mono">{producto.default_code}</p>}
        <div className="flex items-center justify-between pt-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stock > 10 ? "bg-emerald-50 text-emerald-600" : stock > 0 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
            {stock} uds
          </span>
          <span className="text-sm font-bold text-zinc-800">
            ${(precio || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {categoria && <p className="text-xs text-zinc-400 truncate">{categoria}</p>}
      </div>
    </motion.div>
  );
}
