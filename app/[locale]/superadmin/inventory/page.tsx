"use client";

import {
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCcw,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function InventoryPageClient() {
  const t = useTranslations("superadmin.inventory");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [selCompany, setSelCompany] = useState("all");
  const [selWarehouse, setSelWarehouse] = useState("all");
  const [selBrand, setSelBrand] = useState("all");
  const [selCategory, setSelCategory] = useState("all");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Lógica de detección de pantalla para itemsPerPage
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1280) setItemsPerPage(10);
      else if (width >= 1024) setItemsPerPage(8);
      else if (width >= 768) setItemsPerPage(6);
      else setItemsPerPage(4);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Recargar cuando cambie CUALQUIER filtro
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadInventory();
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [
    search,
    selCompany,
    selWarehouse,
    selBrand,
    selCategory,
    onlyLowStock,
    currentPage,
    itemsPerPage,
  ]);

  async function loadInventory() {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        company_id: selCompany,
        warehouse_id: selWarehouse,
        brand: selBrand,
        category: selCategory,
        low_stock: onlyLowStock ? "true" : "false",
        search: search,
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });
      const res = await fetch(`/api/superadmin/inventory?${query}`);
      const json = await res.json();

      // VALIDACIÓN DE SEGURIDAD PARA FILTROS DINÁMICOS
      // Si la marca o categoría seleccionada ya no existen en la nueva disponibilidad, regresamos a "all"
      // Si el almacén seleccionado ya no está en la lista de almacenes válidos, resetear a 'all'
      if (
        selWarehouse !== "all" &&
        !json.filters.warehouses.some((w) => w.id.toString() === selWarehouse)
      ) {
        setSelWarehouse("all");
      }
      if (
        selBrand !== "all" &&
        !json.filters.brands.includes(selBrand.toUpperCase())
      ) {
        setSelBrand("all");
      }
      if (
        selCategory !== "all" &&
        !json.filters.categories.includes(selCategory)
      ) {
        setSelCategory("all");
      }

      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalItems = data?.total_count || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const showingFrom =
    totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50/50 min-h-screen flex flex-col font-sans text-slate-900">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
          Inven<span className="text-blue-600">tario</span>
        </h1>
      </div>

      {/* BARRA DE FILTROS AVANZADA */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 items-center">
        {/* Búsqueda */}
        <div className="relative md:col-span-2">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder={t("buscar")}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Filtro Empresa - El "Master" que resetea el resto */}
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2.5 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          value={selCompany}
          onChange={(e) => {
            setSelCompany(e.target.value);
            setSelWarehouse("all");
            setSelBrand("all");
            setSelCategory("all");
            setCurrentPage(1);
          }}
        >
          <option value="all">{t("todas_empresas")}</option>
          {data?.filters?.companies?.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Filtro Marca */}
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2.5 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          value={selBrand}
          onChange={(e) => {
            setSelBrand(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="all">{t("marcas")}</option>
          {data?.filters?.brands?.map((b: string) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {/* Filtro Categoría */}
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2.5 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          value={selCategory}
          onChange={(e) => {
            setSelCategory(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="all">{t("categorias")}</option>
          {data?.filters?.categories?.map((c: string) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Filtro Almacén */}
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2.5 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          value={selWarehouse}
          onChange={(e) => {
            setSelWarehouse(e.target.value);
            setCurrentPage(1); // Importante
          }}
        >
          <option value="all">{t("almacenes")}</option>
          {data?.filters?.warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        {/* Botón Bajo Stock */}
        <button
          onClick={() => {
            setOnlyLowStock(!onlyLowStock);
            setCurrentPage(1);
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase transition-all border ${
            onlyLowStock
              ? "bg-red-50 border-red-200 text-red-600 shadow-sm"
              : "bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100"
          }`}
        >
          <Filter size={14} />
          {onlyLowStock ? t("bajo_stock") : t("stock")}
        </button>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative flex flex-col self-start w-full min-h-[350px]">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
            <RefreshCcw className="animate-spin text-blue-600 mb-4" size={40} />
            <h2 className="text-slate-400 font-black tracking-widest uppercase text-xs animate-pulse">
              {t("sincronizando")}
            </h2>
          </div>
        )}

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  {t("nombre")}
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  Marca
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  Categoría
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  Almacén
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">
                  {t("stock")}
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">
                  {t("estado")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.inventory?.map((item: any) => (
                <tr
                  key={item.id}
                  className="group hover:bg-slate-50/30 transition-all cursor-default"
                >
                  <td className="px-8 py-4">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">
                      {item.name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black text-blue-500/80 bg-blue-50 px-2.5 py-1 rounded-lg uppercase italic">
                      {item.brand || "N/A"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-[10px] text-slate-500 uppercase">
                    {item.category}
                  </td>
                  <td className="px-6 py-4 font-bold text-[10px] text-slate-400 uppercase">
                    {item.warehouse}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-xs text-slate-800">
                    {item.quantity}
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${item.status === "Bajo" ? "bg-red-500" : "bg-green-500"}`}
                      />
                      <span
                        className={`text-[10px] font-bold ${item.status === "Bajo" ? "text-red-500" : "text-green-500"}`}
                      >
                        {item.status === "Bajo" ? t("bajo_stock") : t("activo")}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="px-8 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {t("mostrando")} {showingFrom} - {showingTo} de {totalItems} Productos
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={currentPage === 1 || loading}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all shadow-sm active:scale-90"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-xs font-bold text-slate-700">
              <span className="text-blue-600">{currentPage}</span>
              <span className="text-slate-300 mx-1">/</span>
              {totalPages}
            </div>

            <button
              disabled={currentPage === totalPages || loading}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all shadow-sm active:scale-90"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
