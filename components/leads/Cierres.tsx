"use client";

import { Archive } from "lucide-react";
import { useMemo, useState } from "react";

export const ClosuresTab = ({ closedLeads, userRole }: any) => {
  const [motivoFilter, setMotivoFilter] = useState("");

  const filtered = useMemo(() =>
    closedLeads.filter((lead: any) => {
      if (!motivoFilter) return true;
      const motivo = lead.motivo_cierre;
      const isGanado = motivo === "GANADO" || motivo === "VENTA";
      const isCliente = motivo === "YA_ES_CLIENTE";
      if (motivoFilter === "GANADO" && !isGanado) return false;
      if (motivoFilter === "YA_ES_CLIENTE" && !isCliente) return false;
      if (motivoFilter === "PERDIDO" && (isGanado || isCliente)) return false;
      return true;
    }),
    [closedLeads, motivoFilter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-slate-900">Cierre de Leads</h1>

        {/* Filtro motivo */}
        <div className="flex gap-2">
          {[
            { value: "", label: "Todos" },
            { value: "GANADO", label: "✓ Ganado" },
            { value: "YA_ES_CLIENTE", label: "★ Ya es cliente" },
            { value: "PERDIDO", label: "✗ Perdido" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMotivoFilter(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                motivoFilter === opt.value
                  ? opt.value === "GANADO"
                    ? "bg-emerald-600 text-white"
                    : opt.value === "YA_ES_CLIENTE"
                    ? "bg-blue-600 text-white"
                    : opt.value === "PERDIDO"
                    ? "bg-red-500 text-white"
                    : "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 text-zinc-400 text-[10px] uppercase tracking-widest font-bold bg-zinc-50/50">
                <th className="px-6 py-4">Empresa/RIF</th>
                <th className="px-6 py-4">Contacto/Tel</th>
                {userRole === "ADMIN" && <th className="px-6 py-4">Vendedor</th>}
                <th className="px-6 py-4 text-center">Motivo</th>
                <th className="px-6 py-4 text-right">Monto USD</th>
                <th className="px-6 py-4">Factura</th>
                <th className="px-6 py-4">Fecha Cierre</th>
                <th className="px-6 py-4">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={userRole === "ADMIN" ? 8 : 7} className="py-16 text-center text-zinc-400">
                    <div className="flex flex-col items-center">
                      <Archive className="w-10 h-10 mb-2 opacity-20" />
                      <p className="text-xs font-bold">Sin cierres registrados.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((lead: any) => {
                  const mc = lead.motivo_cierre;
                  const isGanado = mc === "GANADO" || mc === "VENTA";
                  const isCliente = mc === "YA_ES_CLIENTE";
                  const isPerdido = mc === "PERDIDO" || mc === "ABANDONO";
                  return (
                    <tr key={lead.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-sm text-zinc-900">{lead.empresa}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{lead.rif || lead.rif}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="text-zinc-700">{lead.nombre}</div>
                        <div className="text-xs text-zinc-400 font-mono">{lead.telefono}</div>
                      </td>
                      {userRole === "ADMIN" && (
                        <td className="px-6 py-4 text-xs font-semibold text-zinc-700">{lead.vendedor || "—"}</td>
                      )}
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            isGanado ? "bg-emerald-50 text-emerald-600" : isCliente ? "bg-blue-50 text-blue-600" : isPerdido ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-500"
                          }`}>
                            {isGanado ? "✓ Ganado" : isCliente ? "★ Ya es cliente" : isPerdido ? "✗ Perdido" : mc || "Sin motivo"}
                          </span>
                          {isPerdido && lead.motivo_perdido && (
                            <span className="text-[9px] text-zinc-400 font-medium max-w-[120px] truncate" title={lead.motivo_perdido}>
                              {lead.motivo_perdido}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-zinc-900 text-sm">
                        {lead.valorEstimado > 0 ? `$${lead.valorEstimado.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500 font-mono">
                        {lead.num_factura || lead.numFactura || "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500 font-medium">
                        {lead.fechaVenta ? new Date(lead.fechaVenta).toLocaleDateString("es-VE", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500 max-w-[150px] truncate">
                        {lead.observaciones_cierres || lead.observacionesCierres || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
