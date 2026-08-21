import { Archive } from "lucide-react";
import React from "react";

interface ClosuresTabProps {
  closedLeads: any[];
  userRole: "ADMIN" | "VENDEDOR";
}

export const ClosuresTab: React.FC<ClosuresTabProps> = ({
  closedLeads,
  userRole,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 space-y-4 shadow-xs">
      <h2 className="text-lg font-bold text-zinc-950 flex items-center gap-2">
        <Archive className="w-5 h-5 text-zinc-500" /> Historial de Cierres
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b text-zinc-450 uppercase font-bold tracking-wider text-[10px] bg-zinc-50">
              <th className="p-3">Empresa</th>
              <th className="p-3">Contacto</th>
              <th className="p-3">Teléfono</th>
              {userRole === "ADMIN" && <th className="p-3">Vendedor</th>}
              <th className="p-3">Motivo</th>
              <th className="p-3 text-right">Monto USD</th>
              <th className="p-3">Fecha Cierre</th>
              <th className="p-3">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {closedLeads.length === 0 ? (
              <tr>
                <td
                  colSpan={userRole === "ADMIN" ? 8 : 7}
                  className="p-6 text-center text-zinc-400"
                >
                  Sin cierres registrados.
                </td>
              </tr>
            ) : (
              closedLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-zinc-50/45 transition-colors text-zinc-700"
                >
                  <td className="p-3 font-bold text-zinc-900">
                    {lead.empresa}
                    <div className="text-[10px] font-mono text-zinc-400">
                      #{lead.id}
                    </div>
                  </td>
                  <td className="p-3">{lead.nombre}</td>
                  <td className="p-3 font-mono text-xs">{lead.telefono}</td>
                  {userRole === "ADMIN" && (
                    <td className="p-3 font-semibold">
                      {lead.vendedor || "Sin asignar"}
                    </td>
                  )}
                  <td className="p-3">
                    {(() => {
                      const isGanado =
                        lead.motivoCierre === "GANADO" ||
                        lead.motivoCierre === "VENTA";
                      return (
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${isGanado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}
                          >
                            {isGanado ? "✓ Ganado" : "✗ Perdido"}
                          </span>
                          {!isGanado && lead.motivoPerdido && (
                            <div className="text-[10px] text-zinc-500 mt-0.5 italic">
                              {lead.motivoPerdido}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-3 text-right font-bold text-zinc-800">
                    {lead.valorEstimado > 0
                      ? `$${lead.valorEstimado.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="p-3 text-zinc-500">
                    {lead.fechaVenta
                      ? new Date(lead.fechaVenta).toLocaleDateString("es-VE", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="p-3 text-zinc-500 max-w-[180px] truncate">
                    {lead.observaciones_cierres ||
                      lead.observacionesCierres ||
                      "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
