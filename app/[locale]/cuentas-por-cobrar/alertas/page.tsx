"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatDDMMYYYY(dateStr: string | null) {
  if (!dateStr) return "—";
  const [d] = dateStr.split(" ");
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function AlertCard({
  title,
  icon,
  data,
  desc,
  gradient,
  severity = 0,
  onRenderSub,
}: {
  title: string;
  icon: React.ReactNode;
  data: any[];
  desc: string;
  gradient: string;
  severity?: number;
  onRenderSub?: (item: any) => React.ReactNode;
}) {
  const list = Array.isArray(data) ? data : [];
  const [searchQuery, setSearchQuery] = useState("");
  const severityLevel =
    severity > 10 ? "high" : severity > 3 ? "medium" : severity > 0 ? "low" : "none";
  const borderColor =
    severityLevel === "high"
      ? "border-l-red-500 border-t-red-200 border-r-red-200 border-b-red-200"
      : severityLevel === "medium"
        ? "border-l-amber-500 border-t-amber-200 border-r-amber-200 border-b-amber-200"
        : severityLevel === "low"
          ? "border-l-blue-500 border-t-blue-100 border-r-blue-100 border-b-blue-100"
          : "border-l-slate-300";

  const q = searchQuery.toLowerCase();
  const filteredList = q
    ? list.filter(
        (item: any) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.partnerName || "").toLowerCase().includes(q) ||
          (item.companyName || "").toLowerCase().includes(q) ||
          (item.invoiceUserName || "").toLowerCase().includes(q),
      )
    : list;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className={`group relative p-6 rounded-2xl border-2 ${borderColor} bg-gradient-to-br ${gradient} shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <div className="scale-150">{icon}</div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
              {icon}
            </div>
            <span
              className={`text-4xl font-extrabold tracking-tighter text-slate-900 ${
                severity > 0 ? "animate-pulse" : ""
              }`}
            >
              {list.length}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide uppercase">
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{desc}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center text-xs font-semibold text-slate-600 group-hover:translate-x-1 transition-transform">
              Ver detalle <ChevronRight size={14} className="ml-1" />
            </span>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Detalle de {title.toLowerCase()} que requieren atención.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 mt-4">
          {list.length > 3 && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por factura, cliente, empresa..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {filteredList.length > 0 ? (
            filteredList.map((item: any, i: number) => (
              <Dialog key={i}>
                <DialogTrigger asChild>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:border-blue-400 transition-all">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">
                        {item.name || item.partnerName || "—"}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{item.partnerName}</span>
                        <span>•</span>
                        <span>{item.companyName}</span>
                        {item.invoiceUserName &&
                          item.invoiceUserName !== "Sin asignar" && (
                            <>
                              <span>•</span>
                              <span>{item.invoiceUserName}</span>
                            </>
                          )}
                      </div>
                      {onRenderSub && onRenderSub(item)}
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="text-sm font-bold text-slate-900">
                        {formatCurrency(Math.abs(item.amountResidual))}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.invoiceDateDue
                          ? formatDDMMYYYY(item.invoiceDateDue)
                          : ""}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-slate-400 shrink-0 ml-2"
                    />
                  </div>
                </DialogTrigger>

                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {item.name || item.partnerName || "—"}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Detalle de factura
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-4 space-y-4 max-h-[65vh] overflow-y-auto pr-2">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
                        Detalles de Factura
                      </h4>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-slate-500">Cliente:</span>
                        <span className="font-medium text-right sm:text-left">
                          {item.partnerName}
                        </span>

                        <span className="text-slate-500">Empresa:</span>
                        <span className="font-medium text-right sm:text-left">
                          {item.companyName}
                        </span>

                        <span className="text-slate-500">Vendedor:</span>
                        <span className="font-medium text-slate-700 text-right sm:text-left">
                          {item.invoiceUserName || "No asignado"}
                        </span>

                        <span className="text-slate-500">Fecha factura:</span>
                        <span className="font-mono text-right sm:text-left">
                          {formatDDMMYYYY(item.invoiceDate)}
                        </span>

                        <span className="text-slate-500">Vencimiento:</span>
                        <span className="font-mono text-right sm:text-left">
                          {formatDDMMYYYY(item.invoiceDateDue)}
                        </span>

                        <span className="text-slate-500">Total facturado:</span>
                        <span className="font-bold text-slate-900 text-right sm:text-left">
                          {formatCurrency(Math.abs(item.amountTotal))}
                        </span>

                        <span className="text-slate-500 font-semibold">
                          Saldo pendiente:
                        </span>
                        <span className="font-bold text-red-600 text-right sm:text-left">
                          {formatCurrency(Math.abs(item.amountResidual))}
                        </span>

                        {item.agingDays > 0 && (
                          <>
                            <span className="text-slate-500">
                              Días vencido:
                            </span>
                            <span className="font-bold text-red-600 text-right sm:text-left">
                              {item.agingDays} días
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ))
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-full mb-4">{icon}</div>
              <p className="text-sm font-semibold">Todo en orden</p>
              <p className="text-xs mt-1">
                No hay {title.toLowerCase()} para mostrar.
              </p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-semibold">Sin resultados</p>
              <p className="text-xs mt-1">No se encontraron facturas para "{searchQuery}"</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CxcAlertas() {
  const [empresa, setEmpresa] = useState("");

  const { data, error, isLoading, mutate } = useSWR(
    `/api/superadmin/cuentas-por-cobrar/alerts?empresa=${empresa}`,
    fetcher,
    { refreshInterval: 300000 },
  );

  const empresas = [
    { id: "", label: "Todas" },
    { id: "valencia", label: "Valencia" },
    { id: "caracas", label: "Caracas" },
    { id: "panama", label: "Panamá" },
  ];

  return (
    <div className="space-y-6 p-8 bg-slate-50/50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Alertas CxC
          </h2>
          <p className="text-slate-500">
            Facturas que requieren atención inmediata
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all font-medium text-sm self-stretch sm:self-auto justify-center"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />{" "}
          Actualizar
        </button>
      </div>

      <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md shadow-inner">
        {empresas.map((emp) => (
          <button
            key={emp.id}
            onClick={() => setEmpresa(emp.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 text-sm font-semibold rounded-lg transition-all ${
              empresa === emp.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building2 size={15} />
            {emp.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-20 text-center font-bold text-slate-400 uppercase animate-pulse tracking-wider">
          Cargando alertas...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AlertCard
            title="Facturas por Vencer"
            icon={<Clock className="text-amber-500" />}
            data={data?.data?.facturasPorVencer}
            desc="Vencen en los próximos 3 días"
            gradient="from-amber-50 to-white"
            severity={data?.data?.facturasPorVencer?.length}
            onRenderSub={(item) => (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-amber-500 font-semibold">
                  Vence en {item.daysUntilDue} día
                  {item.daysUntilDue !== 1 ? "s" : ""}
                </span>
                <span>•</span>
                <span>{formatCurrency(Math.abs(item.amountResidual))}</span>
              </div>
            )}
          />
          <AlertCard
            title="Facturas Vencidas"
            icon={<AlertTriangle className="text-red-500" />}
            data={data?.data?.facturasVencidas}
            desc="Saldo vencido pendiente de cobro"
            gradient="from-red-50 to-white"
            severity={data?.data?.facturasVencidas?.length}
            onRenderSub={(item) => (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-red-500 font-semibold">
                  {item.agingDays} días vencido
                </span>
                <span>•</span>
                <span>{formatCurrency(Math.abs(item.amountResidual))}</span>
              </div>
            )}
          />
        </div>
      )}

      {data?.data && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500 uppercase font-semibold">
              Por Vencer
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {data.data.summary.totalPorVencer}
            </p>
            <p className="text-xs text-slate-400">
              {formatCurrency(data.data.summary.totalPorVencerMonto)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500 uppercase font-semibold">
              Vencidas
            </p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {data.data.summary.totalVencidas}
            </p>
            <p className="text-xs text-slate-400">
              {formatCurrency(data.data.summary.totalVencidasMonto)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
