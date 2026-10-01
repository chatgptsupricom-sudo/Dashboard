"use client";

export function AdminLeadsTab({ allLeads, allSellers, onReassign }: any) {
  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
      <table className="w-full">
        <thead className="bg-zinc-50 text-[10px] uppercase font-bold text-zinc-400">
          <tr>
            <th className="px-6 py-4 text-left">Empresa</th>
            <th className="px-6 py-4 text-left">Vendedor Actual</th>
            <th className="px-6 py-4 text-left">Reasignar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {allLeads.map((lead: any) => (
            <tr key={lead.id} className="hover:bg-zinc-50 transition-colors">
              <td className="px-6 py-4 font-semibold">{lead.name}</td>
              <td className="px-6 py-4 text-sm text-zinc-600">
                {lead.vendedor_nombre || "Sin asignar"}
              </td>
              <td className="px-6 py-4">
                <select
                  className="bg-zinc-100 p-2 rounded-lg text-xs"
                  onChange={(e) => onReassign(lead.id, e.target.value)}
                  defaultValue={lead.seller_id || ""}
                >
                  <option value="">Seleccionar vendedor</option>
                  {allSellers.map((seller: any) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
