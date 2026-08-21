"use client";

import { DateRangePicker } from "@tremor/react";
import { Calendar, ChevronLeft, ChevronRight, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx"; // Importa al principio

export default function ComisionesPage() {
  const t = useTranslations("superadmin.integracion_pago");
  const [data, setData] = useState<any>({ results: [], total_count: 0 });
  const [loading, setLoading] = useState(true);

  // Filtros y Paginación
  const [search, setSearch] = useState("");
  const [selectedCid, setSelectedCid] = useState("9");
  const [companies, setCompanies] = useState<{ cid: string; name: string }[]>(
    [],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  const [selectedVendedor, setSelectedVendedor] = useState("all");
  const [vendedores, setVendedores] = useState<{ id: string; name: string }[]>(
    [],
  );

  const formatDDMMYYYY = (dateStr: string) => {
    if (!dateStr || dateStr === "-") return "-";
    // Odoo suele enviar "YYYY-MM-DD" o "YYYY-MM-DD HH:MM:SS"
    const [datePart] = dateStr.split(" ");
    const [y, m, d] = datePart.split("-");
    return `${d}-${m}-${y}`;
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cid: selectedCid,
        limit: "10000",
        search: search,
        vendedor: selectedVendedor,
        fechaInicio: dateRange.from
          ? new Date(dateRange.from).toISOString()
          : "",
        fechaFin: dateRange.to ? new Date(dateRange.to).toISOString() : "",
      });

      const res = await fetch(`/api/superadmin/integraciondepago?${params}`);
      const json = await res.json();

      // Mapeo profesional: nombres claros y legibles
      const formattedData = json.results.map((r: any) => ({
        "F. CONTABLE": formatDDMMYYYY(r.fecha_contable),
        "DOC ABONO": r.doc_abono,
        STATUS: r.status,
        "VALOR ABONO ($)": r.valor_abono,
        RIF: r.nit_cif_ruc,
        CLIENTE: r.cliente,
        FACTURA: r.factura,
        "F. FACTURA": formatDDMMYYYY(r.fecha_factura),
        "VALOR PAGADO ($)": r.valor_pagado,
        VENDEDOR: r.vendedor,
        "F. ABONO": formatDDMMYYYY(r.fecha_abono),
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedData);

      // Ajuste de anchos para un look "Ultra Premium" y legible
      worksheet["!cols"] = [
        { wch: 18 }, // F. Contable
        { wch: 22 }, // Doc Abono
        { wch: 12 }, // Status
        { wch: 18 }, // Valor Abono
        { wch: 18 }, // RIF
        { wch: 35 }, // Cliente (Más ancho por ser nombre)
        { wch: 18 }, // Factura
        { wch: 18 }, // F. Factura
        { wch: 18 }, // Valor Pagado
        { wch: 22 }, // Vendedor
        { wch: 18 }, // F. Abono
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Comisiones");

      XLSX.writeFile(
        workbook,
        `Reporte_Comisiones_${new Date().toLocaleDateString("es-VE")}.xlsx`,
      );
    } catch (err) {
      console.error("Error al exportar:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cid: selectedCid,
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        search: search,
        vendedor: selectedVendedor,
        fechaInicio: dateRange.from
          ? new Date(dateRange.from).toISOString()
          : "",
        fechaFin: dateRange.to ? new Date(dateRange.to).toISOString() : "",
      });

      const res = await fetch(`/api/superadmin/integraciondepago?${params}`);
      const json = await res.json();

      setData(json);
      if (json.companies) setCompanies(json.companies);
      if (json.vendedores) setVendedores(json.vendedores);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCid, currentPage, search, selectedVendedor, dateRange]);

  const totalPages = Math.ceil((data?.total_count || 0) / itemsPerPage) || 1;
  const showingFrom =
    data?.total_count === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(
    currentPage * itemsPerPage,
    data?.total_count || 0,
  );

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50/50 min-h-screen flex flex-col font-sans text-slate-900">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
          Integracion<span className="text-blue-600">DePago</span>
        </h1>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 items-center">
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-3 outline-none"
          value={selectedCid}
          onChange={(e) => {
            setSelectedCid(e.target.value);
            setCurrentPage(1);
          }}
        >
          {companies.length > 0 ? (
            companies.map((c) => (
              <option key={c.cid} value={c.cid}>
                {c.name}
              </option>
            ))
          ) : (
            <option key="loading" value="9">
              {t("cargando")}
            </option>
          )}
        </select>

        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-3 outline-none"
          value={selectedVendedor}
          onChange={(e) => {
            setSelectedVendedor(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="all">{t("todos_vendedores")}</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>

        {/* Contenedor del DateRangePicker - Estilo Ultra Premium */}
        <div className="md:col-span-2">
          <div className="bg-[#f8fafc] rounded-[20px] p-[2px]">
            <DateRangePicker
              value={dateRange}
              onValueChange={setDateRange}
              icon={Calendar}
              className="w-full bg-[#f8fafc] border-none shadow-none ring-0 [&>button]:border-none [&>button]:!ring-0 [&>button]:bg-[#f8fafc] [&>button]:rounded-[20px] text-xs font-semibold"
            />
          </div>
        </div>

        {/* Botón de Exportar */}
        <button
          onClick={handleExportExcel}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-[20px] text-[10px] uppercase tracking-widest transition-all"
        >
          {t("exportar")}
        </button>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative flex flex-col w-full min-h-[350px]">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
            <RefreshCcw className="animate-spin text-blue-600 mb-4" size={40} />
          </div>
        )}

        <div className="overflow-x-auto flex-1 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-center">
                {[
                  t("f_contable"),
                  t("doc_abono"),
                  t("status"),
                  t("valor_abono"),
                  t("rif"),
                  t("cliente"),
                  t("factura"),
                  t("f_factura"),
                  t("valor_pagado"),
                  t("vendedor"),
                  t("f_abono"),
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-center">
              {data?.results?.map((row: any, i: number) => (
                <tr
                  key={`row-${i}`}
                  className="hover:bg-blue-50/30 transition-colors text-[10px]"
                >
                  <td className="px-3 py-3 font-semibold text-slate-600">
                    {formatDDMMYYYY(row.fecha_contable)}
                  </td>
                  <td className="px-3 py-3 font-bold text-slate-800">
                    {row.doc_abono}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${row.status === "Vigente" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-black text-slate-900">
                    ${row.valor_abono?.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {row.nit_cif_ruc}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-800">
                    {row.cliente}
                  </td>
                  <td className="px-3 py-3 font-bold text-blue-600">
                    {row.factura}
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {formatDDMMYYYY(row.fecha_factura)}
                  </td>
                  <td className="px-3 py-3 font-black text-slate-900">
                    ${row.valor_pagado?.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.vendedor}</td>
                  <td className="px-3 py-3 text-slate-500">
                    {formatDDMMYYYY(row.fecha_abono)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINACIÓN */}
        <div className="px-8 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase">
            {t("mostrando")} {showingFrom} - {showingTo} de {data?.total_count || 0}
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-xs font-bold text-slate-700">
              {currentPage} / {totalPages}
            </div>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
