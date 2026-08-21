"use client";

import { ChevronLeft, ChevronRight, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as XLSX from "xlsx";

export default function ComisionesPage() {
  const [data, setData] = useState<any>({ results: [], total_count: 0 });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [selectedCid, setSelectedCid] = useState("9");
  const [companies, setCompanies] = useState<{ cid: string; name: string }[]>(
    [],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Estado de fecha estilo PremiumReports
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [startDate, endDate] = dateRange;

  const [selectedVendedor, setSelectedVendedor] = useState("all");
  const [vendedores, setVendedores] = useState<{ id: string; name: string }[]>(
    [],
  );

  // Lógica de carga automática inteligente
  useEffect(() => {
    const isDateRangeComplete = !startDate || (startDate && endDate);

    if (isDateRangeComplete) {
      fetchData();
    }
  }, [selectedCid, currentPage, search, selectedVendedor, startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        search: search,
        vendedor: selectedVendedor,
        fechaInicio: startDate ? startDate.toISOString() : "",
        fechaFin: endDate ? endDate.toISOString() : "",
      });

      const res = await fetch(
        `/api/gerente_operaciones/integraciondepago?${params}`,
      );
      const json = await res.json();

      setData(json);
      if (json.companies && json.companies.length > 0) {
        setCompanies(json.companies);
        setSelectedCid(json.companies[0].cid);
      }
      if (json.vendedores) setVendedores(json.vendedores);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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

      const res = await fetch(
        `/api/gerente_operaciones/integraciondepago?${params}`,
      );
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

  const totalPages = Math.ceil((data?.total_count || 0) / itemsPerPage) || 1;
  const showingFrom =
    data?.total_count === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(
    currentPage * itemsPerPage,
    data?.total_count || 0,
  );

  const handleDateChange = (range: any) => {
    // Si el usuario seleccionó un rango (from y to)
    if (range.from && range.to) {
      // Comparamos si son el mismo día
      if (range.from.toDateString() === range.to.toDateString()) {
        // Opción A: Solo mantenemos el 'from' y limpiamos el 'to'
        setDateRange({ from: range.from, to: null });
        return;
      }
    }

    // Si no son iguales, o es un rango válido, actualizamos normalmente
    setDateRange(range);
  };

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50/50 min-h-screen flex flex-col font-sans text-slate-900">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
          Integracion<span className="text-blue-600">DePago</span>
        </h1>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-3xl shadow-sm border border-slate-100">
        {/* IZQUIERDA: Nombre de la Empresa (Fijo y Profesional) */}
        <div className="bg-slate-50 text-slate-700 font-black text-[10px] uppercase tracking-[0.15em] px-5 py-3 rounded-xl border border-slate-100">
          {companies.length > 0 ? companies[0].name : "Cargando..."}
        </div>

        {/* DERECHA: Filtros y Botón (Agrupados) */}
        <div className="flex items-center gap-3">
          {/* Vendedor */}
          <select
            className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-3 outline-none cursor-pointer text-slate-600 hover:bg-slate-100 transition-colors"
            value={selectedVendedor}
            onChange={(e) => {
              setSelectedVendedor(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Todos los vendedores</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>

          {/* DatePicker */}
          <div className="bg-slate-50 rounded-xl border border-slate-100">
            <DatePicker
              selectsRange={true}
              startDate={startDate}
              endDate={endDate}
              onChange={(update: [Date | null, Date | null]) => {
                let [start, end] = update;

                // LÓGICA DE AUTOCORRECCIÓN:
                // Si ambas fechas existen y son iguales, expandimos el 'end' al día siguiente
                if (start && end && start.getTime() === end.getTime()) {
                  const nextDay = new Date(start);
                  nextDay.setDate(start.getDate() + 1);
                  end = nextDay;
                }

                setDateRange([start, end]);
              }}
              placeholderText="Seleccionar periodo..."
              className="py-3 px-6 bg-slate-50 rounded-xl text-xs font-bold w-64 cursor-pointer outline-none hover:bg-slate-100"
              dateFormat="dd MMM yyyy"
            />
          </div>

          {/* Botón Exportar */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-lg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Exportar
          </button>
        </div>
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
                  "F. Contable",
                  "Doc Abono",
                  "Status",
                  "Valor Abono",
                  "RIF",
                  "Cliente",
                  "Factura",
                  "F. Factura",
                  "Valor Pagado",
                  "Vendedor",
                  "F. Abono",
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
            Mostrando {showingFrom} - {showingTo} de {data?.total_count || 0}
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
