// "use client";

// import { Archive, Search } from "lucide-react";
// import { useEffect, useMemo, useState } from "react";

// export default function AdminCierresPage() {
//   const [leads, setLeads] = useState<any[]>([]);
//   const [sellers, setSellers] = useState<any[]>([]);
//   const [search, setSearch] = useState("");
//   const [sellerFilter, setSellerFilter] = useState("");
//   const [motivoFilter, setMotivoFilter] = useState("");

//   useEffect(() => {
//     Promise.all([
//       fetch("/api/adminleads/leads").then((r) => r.json()),
//       fetch("/api/vendedores/sellers").then((r) => r.json()),
//     ]).then(([l, s]) => {
//       setLeads(l);
//       setSellers(s);
//     });
//   }, []);

//   const closedLeads = useMemo(() =>
//     leads.filter((l) => {
//       if (l.status !== "CERRADO") return false;
//       if (search && !l.name?.toLowerCase().includes(search.toLowerCase())) return false;
//       if (sellerFilter && String(l.seller_id) !== sellerFilter) return false;
//       if (motivoFilter && l.motivo_cierre !== motivoFilter) return false;
//       return true;
//     }),
//     [leads, search, sellerFilter, motivoFilter],
//   );

//   const totalVentas = closedLeads
//     .filter((l) => l.motivo_cierre === "VENTA")
//     .reduce((s, l) => s + parseFloat(l.monto_cerrado_usd || 0), 0);

//   return (
//     <div className="space-y-6 max-w-[1600px] mx-auto">
//       <div className="flex items-center justify-between">
//         <h1 className="text-3xl font-black text-slate-900">Cierre de Leads</h1>
//         <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl">
//           Total facturado: ${totalVentas.toLocaleString()}
//         </span>
//       </div>

//       {/* Filtros */}
//       <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center">
//         <div className="relative flex-1">
//           <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
//           <input
//             type="text"
//             placeholder="Buscar empresa..."
//             className="w-full pl-10 pr-4 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
//             onChange={(e) => setSearch(e.target.value)}
//           />
//         </div>
//         <select
//           className="flex-1 py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600"
//           onChange={(e) => setSellerFilter(e.target.value)}
//         >
//           <option value="">Todos los vendedores</option>
//           {sellers.map((s) => (
//             <option key={s.id} value={s.id}>{s.name}</option>
//           ))}
//         </select>
//         {/* Filtro motivo */}
//         <div className="flex gap-2">
//           {[
//             { value: "", label: "Todos" },
//             { value: "VENTA", label: "✓ Venta" },
//             { value: "ABANDONO", label: "✗ Abandono" },
//           ].map((opt) => (
//             <button
//               key={opt.value}
//               onClick={() => setMotivoFilter(opt.value)}
//               className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
//                 motivoFilter === opt.value
//                   ? opt.value === "VENTA"
//                     ? "bg-emerald-600 text-white"
//                     : opt.value === "ABANDONO"
//                     ? "bg-red-500 text-white"
//                     : "bg-zinc-800 text-white"
//                   : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
//               }`}
//             >
//               {opt.label}
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* Tabla */}
//       <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full border-collapse min-w-[1100px]">
//             <thead>
//               <tr className="border-b border-zinc-100 text-zinc-400 text-[10px] uppercase tracking-widest font-bold bg-zinc-50/50">
//                 <th className="px-6 py-4 text-left">Empresa/RIF</th>
//                 <th className="px-6 py-4 text-left">Contacto/Tel</th>
//                 <th className="px-6 py-4 text-left">Vendedor</th>
//                 <th className="px-6 py-4 text-center">Motivo</th>
//                 <th className="px-6 py-4 text-right">Monto USD</th>
//                 <th className="px-6 py-4 text-left">Factura</th>
//                 <th className="px-6 py-4 text-left">Fecha Cierre</th>
//                 <th className="px-6 py-4 text-left">Observaciones</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-zinc-50">
//               {closedLeads.length === 0 ? (
//                 <tr>
//                   <td colSpan={8} className="py-16 text-center">
//                     <div className="flex flex-col items-center gap-2 text-zinc-400">
//                       <Archive className="w-10 h-10 opacity-20" />
//                       <p className="text-xs font-bold">Sin cierres registrados.</p>
//                     </div>
//                   </td>
//                 </tr>
//               ) : (
//                 closedLeads.map((lead) => (
//                   <tr key={lead.id} className="hover:bg-blue-50/30 transition-colors">
//                     <td className="px-6 py-4">
//                       <div className="font-bold text-sm text-zinc-900">{lead.name}</div>
//                       <div className="text-[10px] text-zinc-400 font-mono">{lead.rif}</div>
//                     </td>
//                     <td className="px-6 py-4 text-sm">
//                       <div className="text-zinc-700">{lead.nombre_contacto}</div>
//                       <div className="text-xs text-zinc-400">{lead.telefono}</div>
//                     </td>
//                     <td className="px-6 py-4 text-xs font-semibold text-zinc-700">
//                       {lead.vendedor_nombre || "—"}
//                     </td>
//                     <td className="px-6 py-4 text-center">
//                       <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
//                         lead.motivo_cierre === "VENTA"
//                           ? "bg-emerald-50 text-emerald-600"
//                           : "bg-red-50 text-red-500"
//                       }`}>
//                         {lead.motivo_cierre === "VENTA" ? "✓ Venta" : "✗ Abandono"}
//                       </span>
//                     </td>
//                     <td className="px-6 py-4 text-right font-black text-zinc-900 text-sm">
//                       {parseFloat(lead.monto_cerrado_usd || 0) > 0
//                         ? `$${parseFloat(lead.monto_cerrado_usd).toLocaleString()}`
//                         : "—"}
//                     </td>
//                     <td className="px-6 py-4 text-xs text-zinc-500 font-mono">
//                       {lead.num_factura || "—"}
//                     </td>
//                     <td className="px-6 py-4 text-xs text-zinc-500">
//                       {lead.fecha_venta
//                         ? new Date(lead.fecha_venta).toLocaleDateString("es-VE", { year: "numeric", month: "short", day: "numeric" })
//                         : "—"}
//                     </td>
//                     <td className="px-6 py-4 text-xs text-zinc-500 max-w-[200px] truncate">
//                       {lead.observaciones_cierres || "—"}
//                     </td>
//                   </tr>
//                 ))
//               )}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }
"use client";

import { Archive, Pencil, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function AdminCierresPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [motivoFilter, setMotivoFilter] = useState("");

  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    monto: "",
    factura: "",
    fecha: "",
  });
  const [saving, setSaving] = useState(false);

  const [revertLead, setRevertLead] = useState<any | null>(null);
  const [revertStatus, setRevertStatus] = useState("NUEVO");
  const [reverting, setReverting] = useState(false);

  const fetchLeads = () =>
    Promise.all([
      fetch("/api/adminleads/leads").then((r) => r.json()),
      fetch("/api/vendedores/sellers").then((r) => r.json()),
    ]).then(([l, s]) => {
      setLeads(l);
      setSellers(s);
    });

  const handleEditOpen = (lead: any) => {
    setEditingLead(lead);
    setEditForm({
      monto: lead.monto_cerrado_usd ?? "",
      factura: lead.num_factura ?? "",
      fecha: lead.fecha_venta
        ? lead.fecha_venta.split("T")[0].split(" ")[0]
        : "",
    });
  };

  const handleEditSave = async () => {
    if (!editingLead) return;
    setSaving(true);
    await fetch("/api/vendedores/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingLead.id,
        status: editingLead.status,
        motivo: editingLead.motivo_cierre,
        monto: parseFloat(editForm.monto),
        factura: editForm.factura,
        fecha: editForm.fecha,
      }),
    });
    setSaving(false);
    setEditingLead(null);
    fetchLeads();
  };

  const handleRevertOpen = (lead: any) => {
    setRevertLead(lead);
    setRevertStatus("NUEVO");
  };

  const handleRevertConfirm = async () => {
    if (!revertLead) return;
    setReverting(true);
    await fetch("/api/adminleads/reactivar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: revertLead.id, status: revertStatus }),
    });
    setReverting(false);
    setRevertLead(null);
    fetchLeads();
  };

  useEffect(() => {
    fetchLeads();
    fetch("/api/adminleads/statuses")
      .then((r) => r.json())
      .then((s) =>
        setStatuses(
          Array.isArray(s) ? s.filter((x: any) => x.name !== "CERRADO") : [],
        ),
      );
  }, []);

  const closedLeads = useMemo(
    () =>
      leads.filter((l) => {
        if (l.status !== "CERRADO") return false;
        if (search && !l.name?.toLowerCase().includes(search.toLowerCase()))
          return false;
        if (sellerFilter && String(l.seller_id) !== sellerFilter) return false;
        if (motivoFilter) {
          const mc = l.motivo_cierre;
          const isGanado = mc === "GANADO" || mc === "VENTA";
          const isCliente = mc === "YA_ES_CLIENTE";
          const isPerdido = !isGanado && !isCliente;
          if (motivoFilter === "GANADO" && !isGanado) return false;
          if (motivoFilter === "YA_ES_CLIENTE" && !isCliente) return false;
          if (motivoFilter === "PERDIDO" && !isPerdido) return false;
        }
        return true;
      }),
    [leads, search, sellerFilter, motivoFilter],
  );

  const totalVentas = closedLeads
    .filter(
      (l) =>
        l.motivo_cierre === "GANADO" ||
        l.motivo_cierre === "VENTA" ||
        l.motivo_cierre === "YA_ES_CLIENTE",
    )
    .reduce((s, l) => s + parseFloat(l.monto_cerrado_usd || 0), 0);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-slate-900">Cierre de Leads</h1>
        <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl">
          Total facturado: ${totalVentas.toLocaleString()}
        </span>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="flex-1 py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600"
          onChange={(e) => setSellerFilter(e.target.value)}
        >
          <option value="">Todos los vendedores</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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
          <table className="w-full border-collapse min-w-[1100px]">
            <thead>
              <tr className="border-b border-zinc-100 text-zinc-400 text-[10px] uppercase tracking-widest font-bold bg-zinc-50/50">
                <th className="px-6 py-4 text-left">Empresa/RIF</th>
                <th className="px-6 py-4 text-left">Contacto/Tel</th>
                <th className="px-6 py-4 text-left">Vendedor</th>
                <th className="px-6 py-4 text-center">Motivo</th>
                <th className="px-6 py-4 text-right">Monto USD</th>
                <th className="px-6 py-4 text-left">Factura</th>
                <th className="px-6 py-4 text-left">Fecha Cierre</th>
                <th className="px-6 py-4 text-left">Observaciones</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {closedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-zinc-400">
                      <Archive className="w-10 h-10 opacity-20" />
                      <p className="text-xs font-bold">
                        Sin cierres registrados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                closedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-blue-50/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-sm text-zinc-900">
                        {lead.name}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        {lead.rif}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="text-zinc-700">
                        {lead.nombre_contacto}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {lead.telefono}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-zinc-700">
                      {lead.vendedor_nombre || "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(() => {
                        const mc = lead.motivo_cierre;
                        const isGanado = mc === "GANADO" || mc === "VENTA";
                        const isCliente = mc === "YA_ES_CLIENTE";
                        return (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              isGanado
                                ? "bg-emerald-50 text-emerald-600"
                                : isCliente
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-red-50 text-red-500"
                            }`}
                          >
                            {isGanado
                              ? "✓ Ganado"
                              : isCliente
                                ? "★ Ya es cliente"
                                : "✗ Perdido"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-zinc-900 text-sm">
                      {parseFloat(lead.monto_cerrado_usd || 0) > 0
                        ? `$${parseFloat(lead.monto_cerrado_usd).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 font-mono">
                      {lead.num_factura || "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {lead.fecha_venta
                        ? new Date(lead.fecha_venta).toLocaleDateString(
                            "es-VE",
                            { year: "numeric", month: "short", day: "numeric" },
                          )
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 max-w-[200px] truncate">
                      {lead.observaciones_cierres || "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {(lead.motivo_cierre === "GANADO" ||
                          lead.motivo_cierre === "VENTA" ||
                          lead.motivo_cierre === "YA_ES_CLIENTE") && (
                          <button
                            onClick={() => handleEditOpen(lead)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-zinc-400 hover:text-blue-600 transition-colors"
                            title="Editar cierre"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRevertOpen(lead)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-zinc-400 hover:text-amber-600 transition-colors"
                          title="Reabrir lead"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL REABRIR LEAD ── */}
      {revertLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setRevertLead(null)}
        >
          <div
            className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl relative space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setRevertLead(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-base text-zinc-800">
                  Reabrir lead
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {revertLead.name}
                </p>
              </div>
            </div>
            <p className="text-sm text-zinc-600">
              El lead volverá al pipeline del vendedor y se borrará el cierre
              registrado.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Devolver al estado
              </label>
              <select
                value={revertStatus}
                onChange={(e) => setRevertStatus(e.target.value)}
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm bg-white"
              >
                {statuses.length > 0 ? (
                  statuses.map((s: any) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option value="NUEVO">NUEVO</option>
                )}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setRevertLead(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRevertConfirm}
                disabled={reverting}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-60"
              >
                {reverting ? "Reabriendo..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR CIERRE ── */}
      {editingLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setEditingLead(null)}
        >
          <div
            className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl relative space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEditingLead(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-lg text-zinc-800">Editar cierre</h2>
            <p className="text-xs text-zinc-500">{editingLead.name}</p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Monto (USD)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={editForm.monto}
                onChange={(e) =>
                  setEditForm({ ...editForm, monto: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Número de factura
              </label>
              <input
                type="text"
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm font-mono"
                value={editForm.factura}
                onChange={(e) =>
                  setEditForm({ ...editForm, factura: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Fecha de cierre
              </label>
              <input
                type="date"
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={editForm.fecha}
                onChange={(e) =>
                  setEditForm({ ...editForm, fecha: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleEditSave}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
