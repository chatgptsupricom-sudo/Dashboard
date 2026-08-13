"use client";
import { usePresentationMode } from "@/components/presentacion/presentation-mode-context";
import { Card, CardContent } from "@/components/ui/card";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  Building2,
  Calendar,
  FileSpreadsheet,
  Mail,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function MisClientesPage() {
  const { isPresentationMode } = usePresentationMode();
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "periodo">("todos");

  const now = new Date();
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(now.getFullYear(), now.getMonth(), 1),
    now,
  ]);
  const [startDate, endDate] = dateRange;

  const fetchData = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams();

    if (filtroTipo === "periodo") {
      if (startDate) params.append("fechaInicio", startDate.toISOString().split("T")[0]);
      if (endDate) params.append("fechaFin", endDate.toISOString().split("T")[0]);
    }

    fetch(`/api/vendedores/clientes?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClientes(data);
        } else if (data?.error) {
          setError(data.error);
        }
      })
      .catch(() => setError("Error al cargar los clientes"))
      .finally(() => setCargando(false));
  }, [startDate, endDate, filtroTipo]);

  useEffect(() => {
    if (filtroTipo === "todos") {
      fetchData();
    } else {
      const ok = !startDate || (startDate && endDate);
      if (ok) fetchData();
    }
  }, [fetchData, startDate, endDate, filtroTipo]);

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateRange([start, end]);
  };

  const handleMonthStart = () => {
    const now = new Date();
    setDateRange([new Date(now.getFullYear(), now.getMonth(), 1), now]);
  };

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(
      (c: any) =>
        c.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.vat?.toLowerCase().includes(busqueda.toLowerCase()),
    );
  }, [clientes, busqueda]);

  const exportarAExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Clientes");

    worksheet.columns = [
      { header: "Nombre Cliente", key: "name", width: 35 },
      { header: "RIF/Identificación", key: "vat", width: 20 },
      { header: "Teléfono", key: "phone", width: 20 },
      { header: "Correo Electrónico", key: "email", width: 30 },
      { header: "Dirección", key: "street", width: 40 },
      { header: "Términos de pago", key: "payment_terms", width: 20 },
      { header: "Límite de crédito", key: "credit_limit", width: 18 },
      { header: "Periodo medio / Saldo", key: "balance", width: 22 },
    ];

    clientesFiltrados.forEach((c: any) => {
      worksheet.addRow({
        name: isPresentationMode ? "Cliente de ejemplo" : c.name,
        vat: isPresentationMode ? "J-XXXXXXXX-X" : c.vat || "N/A",
        phone: isPresentationMode ? "XXX-XXXXXXX" : c.phone || "N/A",
        email: isPresentationMode ? "xxxxx@xxxxx.com" : c.email || "N/A",
        street: isPresentationMode ? "Dirección oculta" : c.street || "N/A",
        payment_terms: isPresentationMode
          ? "Pago inmediato"
          : c.payment_terms || "Pago inmediato",
        credit_limit: isPresentationMode ? 0 : Number(c.credit_limit) || 0,
        balance: isPresentationMode ? 0 : Number(c.balance) || 0,
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    headerRow.font = { color: { argb: "FFFFFFFF" }, bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 30;

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        if (rowNumber > 1) {
          if (colNumber === 7 || colNumber === 8) {
            cell.numFormat = "#,##0.00;(#,##0.00);0.00";
            cell.alignment = { horizontal: "right" };
          }
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(
      blob,
      `Cartera_Clientes${isPresentationMode ? "_Demo" : "_Supricom"}.xlsx`,
    );
  };

  return (
    <div className="p-8 space-y-8 bg-zinc-50/30 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900">Mis Clientes</h1>
          <p className="text-sm text-zinc-500">
            Gestión de cartera y contactos
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setFiltroTipo("todos")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                filtroTipo === "todos"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Todos mis clientes
            </button>
            <button
              onClick={() => setFiltroTipo("periodo")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                filtroTipo === "periodo"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Por periodo
            </button>
          </div>

          {filtroTipo === "periodo" && (
            <>
              <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-sm">
                <Calendar size={16} className="text-slate-400" />
                <DatePicker
                  selectsRange
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(update) => setDateRange(update)}
                  placeholderText="Seleccionar periodo..."
                  className="text-xs font-bold w-56 cursor-pointer outline-none bg-transparent"
                  dateFormat="dd MMM yyyy"
                />
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleQuickRange(0)} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">Hoy</button>
                <button onClick={handleMonthStart} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">Este Mes</button>
                <button onClick={() => handleQuickRange(30)} className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">30 días</button>
              </div>
            </>
          )}
          <div className="relative w-full md:w-60">
            <Search className="absolute left-3 top-3 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre o RIF..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-zinc-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <button
            onClick={exportarAExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all whitespace-nowrap"
          >
            <FileSpreadsheet size={16} />
            <span className="hidden md:inline">Exportar Excel</span>
          </button>
        </div>
      </div>

      {cargando && (
        <p className="text-center text-zinc-400 py-12">Cargando clientes...</p>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm">
          {error}
        </div>
      )}

      {!cargando && !error && clientesFiltrados.length === 0 && (
        <p className="text-center text-zinc-400 py-12">
          No se encontraron clientes.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientesFiltrados.map((c: any) => (
          <ClientCard
            key={c.id}
            cliente={c}
            isPresentationMode={isPresentationMode}
          />
        ))}
      </div>
    </div>
  );
}

function ClientCard({
  cliente,
  isPresentationMode,
}: {
  cliente: any;
  isPresentationMode: boolean;
}) {
  return (
    <Card className="rounded-3xl border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-500">
            <Building2 size={24} />
          </div>
          <div className="overflow-hidden">
            <h3 className="font-black text-zinc-900 truncate">
              {isPresentationMode ? "Cliente de ejemplo" : cliente.name}
            </h3>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-md inline-block">
              {isPresentationMode ? "J-XXXXXXXX-X" : cliente.vat || "Sin RIF"}
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-zinc-50">
          <InfoRow
            icon={Phone}
            text={isPresentationMode ? "XXX-XXXXXXX" : cliente.phone || "Sin teléfono"}
          />
          <InfoRow
            icon={Mail}
            text={isPresentationMode ? "xxxxx@xxxxx.com" : cliente.email || "Sin email"}
          />
          <InfoRow
            icon={MapPin}
            text={isPresentationMode ? "[Dirección oculta]" : cliente.street || "Sin dirección"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <a
            href={isPresentationMode ? "#" : `tel:${cliente.phone}`}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-700 transition-colors"
          >
            <Phone size={14} /> Llamar
          </a>
          <a
            href={isPresentationMode ? "#" : `mailto:${cliente.email}`}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors"
          >
            <Mail size={14} /> Correo
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon: Icon, text }: any) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <Icon size={14} className="text-zinc-400 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}
