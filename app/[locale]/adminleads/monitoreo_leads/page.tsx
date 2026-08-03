// "use client";

// import {
//   DndContext,
//   DragEndEvent,
//   DragOverlay,
//   DragStartEvent,
// } from "@dnd-kit/core";
// import { AlertTriangle, LayoutGrid, Pencil, Search, Table2, Trash2, X } from "lucide-react";
// import { useEffect, useMemo, useState } from "react";
// import confetti from "canvas-confetti";
// import { KanbanColumn } from "@/components/leads/KanbanColumn";
// import { LeadCard } from "@/components/leads/LeadCard";
// import { Column, Lead } from "@/lib/leads/leadTypes";

// type ViewMode = "tabla" | "columnas";

// const DEFAULT_COLUMNS: Record<string, Column> = {
//   NUEVO: { id: "NUEVO", title: "NUEVO", color: "bg-blue-500", bgClass: "bg-slate-50", borderClass: "border-slate-200", accentClass: "bg-blue-100", textClass: "text-blue-700" },
//   CONTACTADO: { id: "CONTACTADO", title: "CONTACTADO", color: "bg-amber-500", bgClass: "bg-amber-50", borderClass: "border-amber-200", accentClass: "bg-amber-100", textClass: "text-amber-700" },
//   CERRADO: { id: "CERRADO", title: "CERRADO", color: "bg-zinc-600", bgClass: "bg-zinc-50", borderClass: "border-zinc-200", accentClass: "bg-zinc-100", textClass: "text-zinc-700" },
// };

// function buildColumnFromStatus(s: { name: string; color: string }): Column {
//   if (DEFAULT_COLUMNS[s.name]) return DEFAULT_COLUMNS[s.name];
//   return {
//     id: s.name,
//     title: s.name,
//     color: "",
//     bgClass: "bg-white",
//     borderClass: "border-zinc-200",
//     accentClass: "",
//     textClass: "",
//     hexColor: s.color,
//   };
// }

// const STATUS_BADGE_DEFAULT: Record<string, string> = {
//   NUEVO: "bg-blue-50 text-blue-600",
//   CONTACTADO: "bg-amber-50 text-amber-600",
//   CERRADO: "bg-emerald-50 text-emerald-600",
// };

// export default function MonitoringPage() {
//   const [columns, setColumns] = useState<Column[]>(Object.values(DEFAULT_COLUMNS));
//   const [statusColors, setStatusColors] = useState<Record<string, string>>({});
//   const [rawLeads, setRawLeads] = useState<any[]>([]);
//   const [sellers, setSellers] = useState<any[]>([]);
//   const [filters, setFilters] = useState({ search: "", seller: "" });
//   const [viewMode, setViewMode] = useState<ViewMode>("tabla");
//   const [reassigningId, setReassigningId] = useState<string | null>(null);

//   // Kanban state
//   const [leads, setLeads] = useState<Lead[]>([]);
//   const [activeLead, setActiveLead] = useState<Lead | null>(null);
//   const [updatingLeadIds, setUpdatingLeadIds] = useState<string[]>([]);

//   // Edit modal
//   const [showEditModal, setShowEditModal] = useState(false);
//   const [leadToEdit, setLeadToEdit] = useState<any | null>(null);
//   const [editForm, setEditForm] = useState({ nombre_contacto: "", name: "", telefono: "", rif: "", ubicacion_estado: "" });

//   // Delete confirm modal
//   const [showDeleteModal, setShowDeleteModal] = useState(false);
//   const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

//   // Alert modal
//   const [alertMessage, setAlertMessage] = useState<string | null>(null);

//   // Closure modal
//   const [showClosureModal, setShowClosureModal] = useState(false);
//   const [leadToClose, setLeadToClose] = useState<Lead | null>(null);
//   const [formData, setFormData] = useState({
//     motivo: "VENTA",
//     monto: "",
//     factura: "",
//     fecha: new Date().toISOString().split("T")[0],
//     observaciones: "",
//   });

//   // Create lead modal
// const [showCreateModal, setShowCreateModal] = useState(false);
// const [createForm, setCreateForm] = useState({
//   nombre: "",
//   empresa: "",
//   telefono: "",
//   rif: "",
//   ubicacionEstado: "",
//   ubicacionDetalle: "",
//   canalOrigen: "",
//   campana: "",
//   categoriaInteres: "",
//   seller_id: "",
//   status: "NUEVO",
// });

//   const fetchData = async () => {
//     const [leadsRes, sellersRes, statusesRes] = await Promise.all([
//       fetch("/api/adminleads/leads").then((r) => r.json()),
//       fetch("/api/vendedores/sellers").then((r) => r.json()),
//       fetch("/api/adminleads/statuses").then((r) => r.json()),
//     ]);
//     setRawLeads(leadsRes);
//     setSellers(sellersRes);
//     if (Array.isArray(statusesRes)) {
//       setColumns(statusesRes.map(buildColumnFromStatus));
//       const colorMap: Record<string, string> = {};
//       statusesRes.forEach((s: any) => { colorMap[s.name] = s.color; });
//       setStatusColors(colorMap);
//     }

//     // Map to Lead type for kanban
//     const mapped: Lead[] = leadsRes.map((item: any) => ({
//       id: item.id.toString(),
//       nombre: item.nombre_contacto || "Sin nombre",
//       empresa: item.name || "Sin empresa",
//       estatus: item.status || "NUEVO",
//       vendedor: item.vendedor_nombre || item.seller_id?.toString(),
//       sellerId: item.seller_id?.toString(),
//       valorEstimado: Number(item.monto_cerrado_usd) || 0,
//       fechaIngreso: item.fecha_ingreso,
//       telefono: item.telefono || "",
//       rif: item.rif || "",
//       ubicacionEstado: item.ubicacion_estado || "",
//       ubicacionDetalle: item.ubicacion_detalle || "",
//       canalOrigen: item.canal_origen || "",
//       campana: item.campana || "",
//       notas: item.notas || "",
//       numFactura: item.num_factura || "",
//       fechaVenta: item.fecha_venta || "",
//       categoriaInteres: item.categoria_interes || "",
//       hasPassedContactado: item.has_passed_contactado || false,
//       motivoCierre: item.motivo_cierre || "",
//       observacionesVendedor: item.observaciones_vendedor || "",
//       hasSecondPurchase: item.has_segunda_compra === 1 || item.has_segunda_compra === true,
//     }));
//     setLeads(mapped);
//   };

//   useEffect(() => { fetchData(); }, []);

//   // ── Filtered table leads ──
//   const filteredRaw = useMemo(() =>
//     rawLeads.filter((lead) =>
//       lead.name?.toLowerCase().includes(filters.search.toLowerCase()) &&
//       (!filters.seller || String(lead.seller_id) === filters.seller),
//     ),
//     [rawLeads, filters],
//   );

//   // ── Filtered kanban leads ──
//   const filteredLeads = useMemo(() =>
//     leads.filter((lead) =>
//       lead.empresa?.toLowerCase().includes(filters.search.toLowerCase()) &&
//       (!filters.seller || lead.sellerId === filters.seller),
//     ),
//     [leads, filters],
//   );

//   // ── Seller reassign ──
//   const handleReassign = async (leadId: string, newSellerId: string) => {
//     setReassigningId(leadId);
//     try {
//       await fetch("/api/adminleads/reasignar", {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ leadId: parseInt(leadId), newSellerId: parseInt(newSellerId) }),
//       });
//       await fetchData();
//     } catch (err) {
//       console.error("Error al reasignar:", err);
//     } finally {
//       setReassigningId(null);
//     }
//   };

//   // ── Kanban drag ──
//   const handleDragEnd = async (event: DragEndEvent) => {
//     const { active, over } = event;
//     if (!over || active.id === over.id) return;
//     const lead = leads.find((l) => l.id === active.id);
//     const newStatus = over.id as string;

//     if (lead?.estatus === "CERRADO" && lead?.motivoCierre !== "ABANDONO") {
//       setAlertMessage("Un lead cerrado por venta no puede cambiar de estado.");
//       return;
//     }

//     const currentIndex = columns.findIndex((c) => c.id === lead?.estatus);
//     const newIndex = columns.findIndex((c) => c.id === newStatus);
//     if (newIndex > currentIndex + 1) {
//       setAlertMessage("No puedes saltar etapas. Debes avanzar una etapa a la vez.");
//       return;
//     }

//     if (newStatus === "CERRADO" && lead?.estatus === "NUEVO") {
//       setAlertMessage("No puedes cerrar un lead que está en estado NUEVO.");
//       return;
//     }
//     if (newStatus === "CERRADO") {
//       setLeadToClose(lead || null);
//       setFormData({ motivo: "VENTA", monto: "", factura: "", fecha: new Date().toISOString().split("T")[0], observaciones: "" });
//       setShowClosureModal(true);
//       return;
//     }

//     setLeads((prev) =>
//       prev.map((l) =>
//         l.id === active.id
//           ? { ...l, estatus: newStatus, ...(l.motivoCierre === "ABANDONO" ? { motivoCierre: "" } : {}) }
//           : l,
//       ),
//     );
//     setUpdatingLeadIds((prev) => [...prev, active.id as string]);

//     let tiempoPrimerContacto: number | null = null;
//     if (newStatus === "CONTACTADO" && lead?.estatus === "NUEVO" && lead?.fechaIngreso) {
//       const ingreso = new Date(lead.fechaIngreso).getTime();
//       tiempoPrimerContacto = Math.round((Date.now() - ingreso) / 60000);
//     }
//     const esReactivacion = lead?.motivoCierre === "ABANDONO" && newStatus !== "CERRADO";

//     try {
//       await fetch("/api/vendedores/leads", {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(
//           Object.assign(
//             { id: active.id, status: newStatus, ...(tiempoPrimerContacto !== null ? { tiempoPrimerContacto } : {}) },
//             esReactivacion ? { reactivacion: 1, motivo: null } : {},
//           ),
//         ),
//       });
//     } catch {
//       fetchData();
//     } finally {
//       setUpdatingLeadIds((prev) => prev.filter((id) => id !== active.id));
//     }
//   };

//   const activeLeads = filteredLeads.filter((l) => l.estatus !== "CERRADO");
//   const recentClosedLeads = filteredLeads.filter((l) => {
//     if (l.estatus !== "CERRADO") return false;
//     if (l.hasSecondPurchase) return false;
//     const refDate = l.motivoCierre === "ABANDONO"
//       ? (l.fechaIngreso ? new Date(l.fechaIngreso).getTime() : null)
//       : (l.fechaVenta ? new Date(l.fechaVenta).getTime() : null);
//     if (!refDate || isNaN(refDate)) return false;
//     return (Date.now() - refDate) / 86400000 <= 30;
//   });

//   const handleSaveObservaciones = async (id: string, value: string) => {
//     try {
//       await fetch("/api/vendedores/leads", {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ id, observacionesVendedor: value }),
//       });
//     } catch (err) {
//       console.error("Error al guardar observaciones:", err);
//     }
//   };

//   const handleEditOpen = (lead: any) => {
//     setLeadToEdit(lead);
//     setEditForm({
//       nombre_contacto: lead.nombre || lead.nombre_contacto || "",
//       name: lead.empresa || lead.name || "",
//       telefono: lead.telefono || "",
//       rif: lead.rif || "",
//       ubicacion_estado: lead.ubicacionEstado || lead.ubicacion_estado || "",
//     });
//     setShowEditModal(true);
//   };

//   const handleSaveEdit = async () => {
//     if (!leadToEdit) return;
//     await fetch("/api/vendedores/leads", {
//       method: "PATCH",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         id: leadToEdit.id,
//         nombre: editForm.nombre_contacto,
//         empresa: editForm.name,
//         telefono: editForm.telefono,
//         rif: editForm.rif,
//         ubicacionEstado: editForm.ubicacion_estado,
//       }),
//     });
//     setShowEditModal(false);
//     fetchData();
//   };

//   const handleDelete = async (id: string) => {
//     setLeadToDelete(id);
//     setShowDeleteModal(true);
//   };

//   const confirmDelete = async () => {
//     if (!leadToDelete) return;
//     await fetch(`/api/vendedores/leads?id=${leadToDelete}`, { method: "DELETE" });
//     setShowDeleteModal(false);
//     setLeadToDelete(null);
//     fetchData();
//   };

//   const handleCreateLead = async (e: React.FormEvent) => {
//   e.preventDefault();
//   try {
//     const res = await fetch("/api/vendedores/leads", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         nombre: createForm.nombre,
//         empresa: createForm.empresa,
//         telefono: createForm.telefono,
//         rif: createForm.rif,
//         ubicacionEstado: createForm.ubicacionEstado,
//         ubicacionDetalle: createForm.ubicacionDetalle,
//         canalOrigen: createForm.canalOrigen,
//         campana: createForm.campana,
//         seller_id: createForm.seller_id ? parseInt(createForm.seller_id) : null,
//         status: createForm.status,
//         crearNuevo: true,
//       }),
//     });
//     if (!res.ok) throw new Error("Error al crear lead");
//     setShowCreateModal(false);
//     setCreateForm({
//       nombre: "", empresa: "", telefono: "", rif: "",
//       ubicacionEstado: "", ubicacionDetalle: "", canalOrigen: "",
//       campana: "", categoriaInteres: "", seller_id: "", status: "NUEVO",
//     });
//     await fetchData();
//   } catch (err) {
//     console.error("Error al crear lead:", err);
//   }
// };

//   const sellerDropdown = (lead: any, sellerId?: string) => {
//     const id = sellerId ?? lead.seller_id;
//     const locked = lead.status === "CERRADO" && lead.motivo_cierre !== "ABANDONO";
//     return (
//       <select
//         value={id ?? ""}
//         disabled={locked || reassigningId === String(lead.id)}
//         title={locked ? "No se puede cambiar el vendedor de un lead cerrado por venta" : undefined}
//         onChange={(e) => handleReassign(String(lead.id), e.target.value)}
//         className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
//       >
//         <option value="">Sin asignar</option>
//         {sellers.map((s) => (
//           <option key={s.id} value={s.id}>{s.name}</option>
//         ))}
//       </select>
//     );
//   };

//   return (
//     <div className="space-y-6">
//       {/* ── Filtros + Toggle ── */}
//       <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center">
//         <div className="relative">
//           <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
//           <input
//             type="text"
//             placeholder="Buscar empresa..."
//             className="w-full pl-10 pr-4 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
//             onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
//           />
//         </div>
//         {/* Filtro vendedor */}
//         <select
//           className="w-full py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600"
//           onChange={(e) => setFilters((f) => ({ ...f, seller: e.target.value }))}
//         >
//           <option value="">Todos los vendedores</option>
//           {sellers.map((s) => (
//             <option key={s.id} value={s.id}>{s.name}</option>
//           ))}
//         </select>

//         <button
//         onClick={() => setShowCreateModal(true)}
//         className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
//       >
//         + Nuevo Lead
//       </button>

//         {/* Vista toggle */}
//         <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
//           <button
//             onClick={() => setViewMode("tabla")}
//             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
//               viewMode === "tabla" ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
//             }`}
//           >
//             <Table2 className="w-3.5 h-3.5" />
//             Tabla
//           </button>
//           <button
//             onClick={() => setViewMode("columnas")}
//             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
//               viewMode === "columnas" ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
//             }`}
//           >
//             <LayoutGrid className="w-3.5 h-3.5" />
//             Columnas
//           </button>
//         </div>
//       </div>

//       {/* ── VISTA TABLA ── */}
//       {viewMode === "tabla" && (
//         <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden w-full">
//           <div className="overflow-x-auto w-full">
//             <table className="w-full border-collapse min-w-[1100px]">
//               <thead>
//                 <tr className="border-b border-zinc-100 text-zinc-400 text-[10px] uppercase tracking-widest font-bold bg-zinc-50/50">
//                   <th className="px-6 py-4 text-left">Empresa/RIF</th>
//                   <th className="px-6 py-4 text-left">Vendedor</th>
//                   <th className="px-6 py-4 text-left">Contacto/Tel</th>
//                   <th className="px-6 py-4 text-left">Ubicación</th>
//                   <th className="px-6 py-4 text-left">Canal/Campaña</th>
//                   <th className="px-6 py-4 text-center">Status</th>
//                   <th className="px-6 py-4 text-left">Observaciones</th>
//                   <th className="px-6 py-4 text-right">Monto/Factura</th>
//                   <th className="px-6 py-4 text-center">Fechas</th>
//                   <th className="px-6 py-4 text-center">Acciones</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-zinc-50">
//                 {filteredRaw.map((lead) => (
//                   <tr key={lead.id} className="hover:bg-blue-50/30 transition-colors">
//                     <td className="px-6 py-4">
//                       <div className="font-bold text-sm text-zinc-900">{lead.name}</div>
//                       <div className="text-[10px] text-zinc-400 font-mono">{lead.rif}</div>
//                     </td>
//                     <td className="px-6 py-4">{sellerDropdown(lead)}</td>
//                     <td className="px-6 py-4 text-sm">
//                       <div className="text-zinc-700">{lead.nombre_contacto}</div>
//                       <div className="text-xs text-zinc-400">{lead.telefono}</div>
//                     </td>
//                     <td className="px-6 py-4 text-xs text-zinc-600">{lead.ubicacion_estado}</td>
//                     <td className="px-6 py-4 text-xs">
//                       <div className="text-zinc-700 font-medium">{lead.canal_origen}</div>
//                       <div className="text-[10px] text-zinc-400">{lead.campana || "N/A"}</div>
//                     </td>
//                     <td className="px-6 py-4 text-center">
//                       <div className="flex flex-col items-center gap-0.5">
//                         <span
//                           className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${STATUS_BADGE_DEFAULT[lead.status] ?? ""}`}
//                           style={!STATUS_BADGE_DEFAULT[lead.status] && statusColors[lead.status]
//                             ? { backgroundColor: statusColors[lead.status] + "22", color: statusColors[lead.status] }
//                             : undefined}
//                         >
//                           {lead.status}
//                         </span>
//                         {lead.motivo_cierre && (
//                           <span className="text-[9px] font-medium text-zinc-400 italic">{lead.motivo_cierre}</span>
//                         )}
//                       </div>
//                     </td>
//                     <td className="px-6 py-4 text-xs text-zinc-500 max-w-[150px] truncate">
//                       {lead.observaciones_vendedor || "—"}
//                     </td>
//                     <td className="px-6 py-4 text-right">
//                       <div className="text-sm font-black text-zinc-900">
//                         ${parseFloat(lead.monto_cerrado_usd || 0).toLocaleString()}
//                       </div>
//                       <div className="text-[10px] text-zinc-400">{lead.num_factura || "—"}</div>
//                     </td>
//                     <td className="px-6 py-4 text-center text-[10px] text-zinc-400">
//                       <div>Ingreso: {new Date(lead.fecha_ingreso).toLocaleDateString()}</div>
//                       {lead.fecha_venta && (
//                         <div>Venta: {new Date(lead.fecha_venta).toLocaleDateString()}</div>
//                       )}
//                     </td>
//                     <td className="px-6 py-4 text-center">
//                       <div className="flex items-center justify-center gap-2">
//                         <button onClick={() => handleEditOpen(lead)} className="p-1.5 rounded-lg hover:bg-blue-50 text-zinc-400 hover:text-blue-600 transition-colors">
//                           <Pencil className="w-3.5 h-3.5" />
//                         </button>
//                         <button onClick={() => handleDelete(String(lead.id))} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors">
//                           <Trash2 className="w-3.5 h-3.5" />
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}

//       {/* ── VISTA COLUMNAS (drag & drop) ── */}
//       {viewMode === "columnas" && (
//         <DndContext
//           onDragStart={(e: DragStartEvent) =>
//             setActiveLead(leads.find((l) => l.id === e.active.id) || null)
//           }
//           onDragEnd={handleDragEnd}
//         >
//           <div className="grid grid-cols-1 gap-6" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
//             {columns.map((column) => (
//               <KanbanColumn
//                 key={column.id}
//                 column={column}
//                 leads={
//                   column.id === "CERRADO"
//                     ? recentClosedLeads
//                     : activeLeads.filter((l) => l.estatus === column.id)
//                 }
//                 updatingLeadIds={updatingLeadIds}
//                 onEditLead={(lead) => handleEditOpen({ id: lead.id, nombre_contacto: lead.nombre, name: lead.empresa, telefono: lead.telefono })}
//                 onDeleteLead={(id) => handleDelete(id)}
//                 onCloseLead={(lead) => {
//                   setLeadToClose(lead);
//                   setFormData({ motivo: "VENTA", monto: "", factura: "", fecha: new Date().toISOString().split("T")[0], observaciones: "" });
//                   setShowClosureModal(true);
//                 }}
//                 onSecondPurchase={handleSecondPurchase}
//                 onTransfer={(lead, newVendedor) => {
//                   if (lead.estatus === "CERRADO" && lead.motivoCierre !== "ABANDONO") return;
//                   const seller = sellers.find((s) => s.name === newVendedor);
//                   if (seller) handleReassign(lead.id, String(seller.id));
//                 }}
//                 vendorList={sellers.map((s) => s.name)}
//                 userRole="ADMIN"
//                 onSaveObservaciones={handleSaveObservaciones}
//               />
//             ))}
//           </div>
//           <DragOverlay>
//             {activeLead ? (
//               <LeadCard
//                 lead={activeLead}
//                 isUpdating={false}
//                 onEdit={() => {}}
//                 onDelete={() => {}}
//               />
//             ) : null}
//           </DragOverlay>
//         </DndContext>
//       )}

//       {/* ── MODAL EDICIÓN ── */}
//       {showEditModal && leadToEdit && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowEditModal(false)}>
//           <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
//             <button type="button" onClick={() => setShowEditModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600">
//               <X className="w-5 h-5" />
//             </button>
//             <h2 className="font-bold text-lg text-zinc-800">Editar Lead</h2>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Contacto</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={editForm.nombre_contacto} onChange={(e) => setEditForm({ ...editForm, nombre_contacto: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Empresa</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Teléfono</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">RIF</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm font-mono" value={editForm.rif} onChange={(e) => setEditForm({ ...editForm, rif: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Ubicación (Estado)</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={editForm.ubicacion_estado} onChange={(e) => setEditForm({ ...editForm, ubicacion_estado: e.target.value })} />
//             </div>
//             <button onClick={handleSaveEdit} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
//               Guardar cambios
//             </button>
//           </div>
//         </div>
//       )}

//       {/* ── MODAL ELIMINAR ── */}
//       {showDeleteModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowDeleteModal(false)}>
//           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
//             <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
//               <Trash2 className="w-6 h-6 text-red-500" />
//             </div>
//             <div className="text-center">
//               <p className="font-bold text-zinc-800 text-base">¿Eliminar este lead?</p>
//               <p className="text-sm text-zinc-500 mt-1">Esta acción no se puede deshacer.</p>
//             </div>
//             <div className="flex gap-3 w-full">
//               <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-2.5 border border-zinc-200 text-zinc-600 text-sm font-bold rounded-xl hover:bg-zinc-50 transition-colors">
//                 Cancelar
//               </button>
//               <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors">
//                 Eliminar
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── MODAL ALERTA ── */}
//       {alertMessage && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAlertMessage(null)}>
//           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
//             <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
//               <AlertTriangle className="w-6 h-6 text-amber-500" />
//             </div>
//             <p className="text-sm font-semibold text-zinc-700 text-center">{alertMessage}</p>
//             <button onClick={() => setAlertMessage(null)} className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors">
//               Entendido
//             </button>
//           </div>
//         </div>
//       )}

//       {/* ── MODAL CIERRE ── */}
//       {showClosureModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowClosureModal(false)}>
//           <form
//             className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl relative"
//             onClick={(e) => e.stopPropagation()}
//             onSubmit={async (e) => {
//               e.preventDefault();
//               if (formData.motivo === "VENTA") confetti();
//               await fetch("/api/vendedores/leads", {
//                 method: "PATCH",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify(
//                   Object.assign(
//                     { id: leadToClose?.id, status: "CERRADO", motivo: formData.motivo, observacionesCierres: formData.observaciones || undefined },
//                     formData.motivo === "VENTA"
//                       ? { monto: formData.monto, factura: formData.factura, fecha: formData.fecha }
//                       : {},
//                   ),
//                 ),
//               });
//               setShowClosureModal(false);
//               fetchData();
//             }}
//           >
//             <button type="button" onClick={() => setShowClosureModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600">
//               <X className="w-5 h-5" />
//             </button>
//             <h2 className="font-bold text-lg text-zinc-800">Cerrar: {leadToClose?.empresa}</h2>
//             <select required className="w-full border border-zinc-300 p-2.5 rounded-lg" value={formData.motivo} onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}>
//               <option value="" disabled>Selecciona un motivo...</option>
//               <option value="VENTA">Cierre por venta</option>
//               <option value="ABANDONO">Cierre por abandono</option>
//             </select>
//             {formData.motivo === "VENTA" && (
//               <>
//                 <div className="space-y-1">
//                   <label className="text-xs font-bold text-zinc-500 uppercase">Fecha de cierre</label>
//                   <input type="date" required className="w-full border border-zinc-300 p-2.5 rounded-lg" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} />
//                 </div>
//                 <input className="w-full border border-zinc-300 p-2.5 rounded-lg" placeholder="Monto (USD)" type="number" required onChange={(e) => setFormData({ ...formData, monto: e.target.value })} />
//                 <input className="w-full border border-zinc-300 p-2.5 rounded-lg" placeholder="Número de factura" required onChange={(e) => setFormData({ ...formData, factura: e.target.value })} />
//               </>
//             )}
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Observaciones de cierre</label>
//               <textarea rows={3} className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm resize-none" placeholder="Escribe observaciones..." value={formData.observaciones} onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })} />
//             </div>
//             <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors" type="submit">
//               Confirmar cierre
//             </button>
//           </form>
//         </div>
//       )}

//             {/* ── MODAL CREAR LEAD ── */}
//       {showCreateModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
//           <form
//             className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto"
//             onClick={(e) => e.stopPropagation()}
//             onSubmit={handleCreateLead}
//           >
//             <button type="button" onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600">
//               <X className="w-5 h-5" />
//             </button>
//             <h2 className="font-bold text-lg text-zinc-800">Nuevo Lead</h2>

//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Nombre Contacto *</label>
//               <input required className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Empresa *</label>
//               <input required className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.empresa} onChange={(e) => setCreateForm({ ...createForm, empresa: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Teléfono</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.telefono} onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">RIF</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm font-mono" value={createForm.rif} onChange={(e) => setCreateForm({ ...createForm, rif: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Ubicación (Estado)</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.ubicacionEstado} onChange={(e) => setCreateForm({ ...createForm, ubicacionEstado: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Ubicación (Detalle)</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.ubicacionDetalle} onChange={(e) => setCreateForm({ ...createForm, ubicacionDetalle: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Canal de Origen</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.canalOrigen} onChange={(e) => setCreateForm({ ...createForm, canalOrigen: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Campaña</label>
//               <input className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.campana} onChange={(e) => setCreateForm({ ...createForm, campana: e.target.value })} />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Asignar a Vendedor</label>
//               <select className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.seller_id} onChange={(e) => setCreateForm({ ...createForm, seller_id: e.target.value })}>
//                 <option value="">Sin asignar</option>
//                 {sellers.map((s: any) => (
//                   <option key={s.id} value={s.id}>{s.name}</option>
//                 ))}
//               </select>
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-bold text-zinc-500 uppercase">Status Inicial</label>
//               <select className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm" value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}>
//                 {columns.map((col) => (
//                   <option key={col.id} value={col.id} disabled={col.id === "CERRADO"}>{col.title}</option>
//                 ))}
//               </select>
//             </div>

//             <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
//               Crear Lead
//             </button>
//           </form>
//         </div>
//       )}

//     </div>
//   );
// }
"use client";

import { KanbanColumn } from "@/components/leads/KanbanColumn";
import { LeadCard } from "@/components/leads/LeadCard";
import { minutosLaborales } from "@/lib/leads/businessHours";
import { Column, Lead } from "@/lib/leads/leadTypes";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import confetti from "canvas-confetti";
import {
  AlertTriangle,
  LayoutGrid,
  Pencil,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

type ViewMode = "tabla" | "columnas";

const DEFAULT_COLUMNS: Record<string, Column> = {
  NUEVO: {
    id: "NUEVO",
    title: "NUEVO",
    color: "bg-blue-500",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
    accentClass: "bg-blue-100",
    textClass: "text-blue-700",
  },
  CONTACTADO: {
    id: "CONTACTADO",
    title: "CONTACTADO",
    color: "bg-amber-500",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
    accentClass: "bg-amber-100",
    textClass: "text-amber-700",
  },
  CERRADO: {
    id: "CERRADO",
    title: "CERRADO",
    color: "bg-zinc-600",
    bgClass: "bg-zinc-50",
    borderClass: "border-zinc-200",
    accentClass: "bg-zinc-100",
    textClass: "text-zinc-700",
  },
};

function buildColumnFromStatus(s: { name: string; color: string }): Column {
  if (DEFAULT_COLUMNS[s.name]) return DEFAULT_COLUMNS[s.name];
  return {
    id: s.name,
    title: s.name,
    color: "",
    bgClass: "bg-white",
    borderClass: "border-zinc-200",
    accentClass: "",
    textClass: "",
    hexColor: s.color,
  };
}

const STATUS_BADGE_DEFAULT: Record<string, string> = {
  NUEVO: "bg-blue-50 text-blue-600",
  CONTACTADO: "bg-amber-50 text-amber-600",
  CERRADO: "bg-emerald-50 text-emerald-600",
};

export default function MonitoringPage() {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [columns, setColumns] = useState<Column[]>(
    Object.values(DEFAULT_COLUMNS),
  );
  const [statusColors, setStatusColors] = useState<Record<string, string>>({});
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    seller: "",
    ubicacion: "",
    ciudad: "",
  });
  const [viewMode, setViewMode] = useState<ViewMode>("tabla");
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  // Kanban state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [updatingLeadIds, setUpdatingLeadIds] = useState<string[]>([]);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    nombre_contacto: "",
    name: "",
    telefono: "",
    rif: "",
    ubicacion_estado: "",
  });

  // Delete confirm modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  // Alert modal
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Closure modal
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [leadToClose, setLeadToClose] = useState<Lead | null>(null);
  const [formData, setFormData] = useState({
    motivo: "GANADO",
    monto: "",
    factura: "",
    fecha: new Date().toISOString().split("T")[0],
    observaciones: "",
    motivoPerdido: "",
    productoPerdido: "",
    productoOtro: "",
  });
  const [odooProducts, setOdooProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [categoriaProducto, setCategoriaProducto] = useState("todas");
  const CATEGORIAS_OCULTAS_CIERRE = ["Juguetes"];

  // Segunda compra modal
  const [showSecondPurchaseModal, setShowSecondPurchaseModal] = useState(false);
  const [leadForSecondPurchase, setLeadForSecondPurchase] =
    useState<Lead | null>(null);
  const [secondPurchaseForm, setSecondPurchaseForm] = useState({
    monto: "",
    factura: "",
    fecha: new Date().toISOString().split("T")[0],
  });

  const handleSecondPurchase = (lead: Lead) => {
    setLeadForSecondPurchase(lead);
    setSecondPurchaseForm({
      monto: "",
      factura: "",
      fecha: new Date().toISOString().split("T")[0],
    });
    setShowSecondPurchaseModal(true);
  };

  // Create lead modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    nombre: "",
    empresa: "",
    telefono: "",
    rif: "",
    ubicacionEstado: "",
    ubicacionDetalle: "",
    canalOrigen: "",
    campana: "",
    categoriaInteres: "",
    seller_id: "",
    status: "NUEVO",
  });

  const fetchData = async () => {
    const [leadsRes, sellersRes, statusesRes] = await Promise.all([
      fetch("/api/adminleads/leads").then((r) => r.json()),
      fetch("/api/vendedores/sellers").then((r) => r.json()),
      fetch("/api/adminleads/statuses").then((r) => r.json()),
    ]);
    setRawLeads(leadsRes);
    setSellers(sellersRes);
    if (Array.isArray(statusesRes)) {
      setColumns(statusesRes.map(buildColumnFromStatus));
      const colorMap: Record<string, string> = {};
      statusesRes.forEach((s: any) => {
        colorMap[s.name] = s.color;
      });
      setStatusColors(colorMap);
    }

    // Map to Lead type for kanban
    const mapped: Lead[] = leadsRes.map((item: any) => ({
      id: item.id.toString(),
      nombre: item.nombre_contacto || "Sin nombre",
      empresa: item.name || "Sin empresa",
      estatus: item.status || "NUEVO",
      vendedor: item.vendedor_nombre || item.seller_id?.toString(),
      sellerId: item.seller_id?.toString(),
      valorEstimado: Number(item.monto_cerrado_usd) || 0,
      fechaIngreso: item.fecha_ingreso,
      telefono: item.telefono || "",
      rif: item.rif || "",
      ubicacionEstado: item.ubicacion_estado || "",
      ubicacionDetalle: item.ubicacion_detalle || "",
      canalOrigen: item.canal_origen || "",
      campana: item.campana || "",
      notas: item.notas || "",
      numFactura: item.num_factura || "",
      fechaVenta: item.fecha_venta || "",
      categoriaInteres: item.interes || item.categoria_interes || "",
      hasPassedContactado: item.has_passed_contactado || false,
      motivoCierre: item.motivo_cierre || "",
      observacionesVendedor: item.observaciones_vendedor || "",
      hasSecondPurchase:
        item.has_segunda_compra === 1 || item.has_segunda_compra === true,
      identidad: item.identidad || "",
      whatsapp_link: item.whatsapp_link || "",
      motivoPerdido: item.motivo_perdido || "",
      productoPerdido: item.producto_perdido || "",
    }));
    setLeads(mapped);
  };

  const fetchDataRef = useRef<() => void>(() => {});
  useEffect(() => {
    fetchDataRef.current = fetchData;
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL as string;
    console.log("[Monitoreo Socket] Conectando a:", socketUrl);
    const socket = io(socketUrl);
    socket.on("connect", () => {
      console.log("[Monitoreo Socket] Conectado, id:", socket.id);
    });
    socket.on("connect_error", (err) => {
      console.error("[Monitoreo Socket] Error de conexión:", err.message);
    });
    socket.on("leads-updated", (data) => {
      console.log("[Monitoreo Socket] leads-updated recibido:", data);
      fetchDataRef.current();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (
      showClosureModal &&
      formData.motivo === "PERDIDO" &&
      formData.motivoPerdido === "Sin inventario"
    ) {
      setLoadingProducts(true);
      fetch("/api/vendedores/catalogo/todos")
        .then((r) => r.json())
        .then((data) => setOdooProducts(Array.isArray(data) ? data : []))
        .catch(() => setOdooProducts([]))
        .finally(() => setLoadingProducts(false));
    }
  }, [showClosureModal, formData.motivo, formData.motivoPerdido]);

  const ubicacionOptions = useMemo(
    () =>
      Array.from(
        new Set(leads.map((l) => l.ubicacionEstado).filter(Boolean)),
      ).sort(),
    [leads],
  );

  const CIUDAD_CIDS: Record<string, number> = {
    panama: 7,
    valencia: 9,
    caracas: 10,
  };

  const sellerIdsByCiudad = useMemo(() => {
    if (!filters.ciudad) return null;
    const cid = CIUDAD_CIDS[filters.ciudad];
    return new Set(
      sellers.filter((s) => s.cids === cid).map((s) => String(s.id)),
    );
  }, [sellers, filters.ciudad]);

  // ── Filtered table leads ──
  const filteredRaw = useMemo(
    () =>
      rawLeads.filter(
        (lead) =>
          lead.name?.toLowerCase().includes(filters.search.toLowerCase()) &&
          (!filters.seller || String(lead.seller_id) === filters.seller) &&
          (!filters.ubicacion || lead.ubicacion_estado === filters.ubicacion) &&
          (!sellerIdsByCiudad || sellerIdsByCiudad.has(String(lead.seller_id))),
      ),
    [rawLeads, filters, sellerIdsByCiudad],
  );

  // ── Filtered kanban leads ──
  const filteredLeads = useMemo(
    () =>
      leads.filter(
        (lead) =>
          lead.empresa?.toLowerCase().includes(filters.search.toLowerCase()) &&
          (!filters.seller || lead.sellerId === filters.seller) &&
          (!filters.ubicacion || lead.ubicacionEstado === filters.ubicacion) &&
          (!sellerIdsByCiudad || sellerIdsByCiudad.has(lead.sellerId ?? "")),
      ),
    [leads, filters, sellerIdsByCiudad],
  );

  // ── Seller reassign ──
  const handleReassign = async (leadId: string, newSellerId: string) => {
    setReassigningId(leadId);
    try {
      await fetch("/api/adminleads/reasignar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: parseInt(leadId),
          newSellerId: parseInt(newSellerId),
        }),
      });
      await fetchData();
    } catch (err) {
      console.error("Error al reasignar:", err);
    } finally {
      setReassigningId(null);
    }
  };

  // ── Kanban drag ──
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStatus = over.id as string;

    if (
      lead?.estatus === "CERRADO" &&
      lead?.motivoCierre !== "ABANDONO" &&
      lead?.motivoCierre !== "PERDIDO"
    ) {
      setAlertMessage("Un lead ganado no puede cambiar de estado.");
      return;
    }

    const currentIndex = columns.findIndex((c) => c.id === lead?.estatus);
    const newIndex = columns.findIndex((c) => c.id === newStatus);
    if (newIndex > currentIndex + 1) {
      setAlertMessage(
        "No puedes saltar etapas. Debes avanzar una etapa a la vez.",
      );
      return;
    }

    if (newStatus === "CERRADO" && lead?.estatus === "NUEVO") {
      setAlertMessage("No puedes cerrar un lead que está en estado NUEVO.");
      return;
    }
    if (newStatus === "CERRADO") {
      setLeadToClose(lead || null);
      setFormData({
        motivo: "GANADO",
        monto: "",
        factura: "",
        fecha: new Date().toISOString().split("T")[0],
        observaciones: "",
        motivoPerdido: "",
        productoPerdido: "",
        productoOtro: "",
      });
      setOdooProducts([]);
      setCategoriaProducto("todas");
      setShowClosureModal(true);
      return;
    }

    setLeads((prev) =>
      prev.map((l) =>
        l.id === active.id
          ? {
              ...l,
              estatus: newStatus,
              ...(l.motivoCierre === "ABANDONO" || l.motivoCierre === "PERDIDO"
                ? { motivoCierre: "" }
                : {}),
            }
          : l,
      ),
    );
    setUpdatingLeadIds((prev) => [...prev, active.id as string]);

    let tiempoPrimerContacto: number | null = null;
    if (
      newStatus === "CONTACTADO" &&
      lead?.estatus === "NUEVO" &&
      lead?.fechaIngreso
    ) {
      tiempoPrimerContacto = minutosLaborales(
        new Date(lead.fechaIngreso),
        new Date(),
      );
    }
    const esReactivacion =
      (lead?.motivoCierre === "ABANDONO" || lead?.motivoCierre === "PERDIDO") &&
      newStatus !== "CERRADO";

    try {
      await fetch("/api/vendedores/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.assign(
            {
              id: active.id,
              status: newStatus,
              ...(tiempoPrimerContacto !== null
                ? { tiempoPrimerContacto }
                : {}),
            },
            esReactivacion ? { reactivacion: 1, motivo: null } : {},
          ),
        ),
      });
    } catch {
      fetchData();
    } finally {
      setUpdatingLeadIds((prev) => prev.filter((id) => id !== active.id));
    }
  };

  const activeLeads = filteredLeads.filter((l) => l.estatus !== "CERRADO");
  const recentClosedLeads = filteredLeads.filter((l) => {
    if (l.estatus !== "CERRADO") return false;
    if (l.hasSecondPurchase) return false;
    const refDate =
      l.motivoCierre === "ABANDONO" || l.motivoCierre === "PERDIDO"
        ? l.fechaIngreso
          ? new Date(l.fechaIngreso).getTime()
          : null
        : l.fechaVenta
          ? new Date(l.fechaVenta).getTime()
          : null;
    if (!refDate || isNaN(refDate)) return false;
    return (Date.now() - refDate) / 86400000 <= 30;
  });

  const handleSaveObservaciones = async (id: string, value: string) => {
    try {
      await fetch("/api/vendedores/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, observacionesVendedor: value }),
      });
    } catch (err) {
      console.error("Error al guardar observaciones:", err);
    }
  };

  const handleEditOpen = (lead: any) => {
    setLeadToEdit(lead);
    setEditForm({
      nombre_contacto: lead.nombre || lead.nombre_contacto || "",
      name: lead.empresa || lead.name || "",
      telefono: lead.telefono || "",
      rif: lead.rif || "",
      ubicacion_estado: lead.ubicacionEstado || lead.ubicacion_estado || "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!leadToEdit) return;
    await fetch("/api/vendedores/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: leadToEdit.id,
        nombre: editForm.nombre_contacto,
        empresa: editForm.name,
        telefono: editForm.telefono,
        rif: editForm.rif,
        ubicacionEstado: editForm.ubicacion_estado,
      }),
    });
    setShowEditModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    setLeadToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    await fetch(`/api/vendedores/leads?id=${leadToDelete}`, {
      method: "DELETE",
    });
    setShowDeleteModal(false);
    setLeadToDelete(null);
    fetchData();
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/vendedores/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: createForm.nombre,
          empresa: createForm.empresa,
          telefono: createForm.telefono,
          rif: createForm.rif,
          ubicacionEstado: createForm.ubicacionEstado,
          ubicacionDetalle: createForm.ubicacionDetalle,
          canalOrigen: createForm.canalOrigen,
          campana: createForm.campana,
          seller_id: createForm.seller_id
            ? parseInt(createForm.seller_id)
            : null,
          status: createForm.status,
          crearNuevo: true,
        }),
      });
      if (!res.ok) throw new Error("Error al crear lead");
      setShowCreateModal(false);
      setCreateForm({
        nombre: "",
        empresa: "",
        telefono: "",
        rif: "",
        ubicacionEstado: "",
        ubicacionDetalle: "",
        canalOrigen: "",
        campana: "",
        categoriaInteres: "",
        seller_id: "",
        status: "NUEVO",
      });
      await fetchData();
    } catch (err) {
      console.error("Error al crear lead:", err);
    }
  };

  const sellerDropdown = (lead: any, sellerId?: string) => {
    const id = sellerId ?? lead.seller_id;
    const locked =
      lead.status === "CERRADO" && lead.motivo_cierre !== "ABANDONO";
    return (
      <select
        value={id ?? ""}
        disabled={locked || reassigningId === String(lead.id)}
        title={
          locked
            ? "No se puede cambiar el vendedor de un lead cerrado por venta"
            : undefined
        }
        onChange={(e) => handleReassign(String(lead.id), e.target.value)}
        className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <option value="">Sin asignar</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Filtros + Toggle ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto] gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
          />
        </div>
        {/* Filtro vendedor */}
        <select
          className="w-full py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600"
          value={filters.seller}
          onChange={(e) =>
            setFilters((f) => ({ ...f, seller: e.target.value }))
          }
        >
          <option value="">Todos los vendedores</option>
          {sellers
            .filter(
              (s) => !filters.ciudad || s.cids === CIUDAD_CIDS[filters.ciudad],
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        {/* Filtro ciudad (cids) */}
        <select
          className="w-full py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600"
          value={filters.ciudad}
          onChange={(e) =>
            setFilters((f) => ({ ...f, ciudad: e.target.value, seller: "" }))
          }
        >
          <option value="">Todas las Sedes</option>
          <option value="panama">🟠 Panama</option>
          <option value="valencia">🟢 Valencia</option>
          <option value="caracas">🔵 Caracas</option>
        </select>

        {/* Filtro ubicación */}
        <select
          className="w-full py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600"
          value={filters.ubicacion}
          onChange={(e) =>
            setFilters((f) => ({ ...f, ubicacion: e.target.value }))
          }
        >
          <option value="">Todos los estados</option>
          {ubicacionOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          + Nuevo Lead
        </button>

        {/* Vista toggle */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode("tabla")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "tabla"
                ? "bg-white shadow text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            Tabla
          </button>
          <button
            onClick={() => setViewMode("columnas")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "columnas"
                ? "bg-white shadow text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Columnas
          </button>
        </div>
      </div>

      {/* ── VISTA TABLA ── */}
      {viewMode === "tabla" && (
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 text-[10px] uppercase tracking-widest font-bold bg-zinc-50/50">
                  <th className="px-6 py-4 text-left">Empresa/RIF</th>
                  <th className="px-6 py-4 text-left">Vendedor</th>
                  <th className="px-6 py-4 text-left">Contacto/Tel</th>
                  <th className="px-6 py-4 text-left">Ubicación</th>
                  <th className="px-6 py-4 text-left">Canal/Campaña</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-left">Observaciones</th>
                  <th className="px-6 py-4 text-right">Monto/Factura</th>
                  <th className="px-6 py-4 text-center">Fechas</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredRaw.map((lead) => (
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
                    <td className="px-6 py-4">{sellerDropdown(lead)}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="text-zinc-700">
                        {lead.nombre_contacto}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {lead.telefono}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600">
                      {lead.ubicacion_estado}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="text-zinc-700 font-medium">
                        {lead.canal_origen}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {lead.campana || "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${STATUS_BADGE_DEFAULT[lead.status] ?? ""}`}
                          style={
                            !STATUS_BADGE_DEFAULT[lead.status] &&
                            statusColors[lead.status]
                              ? {
                                  backgroundColor:
                                    statusColors[lead.status] + "22",
                                  color: statusColors[lead.status],
                                }
                              : undefined
                          }
                        >
                          {lead.status}
                        </span>
                        {lead.motivo_cierre && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              lead.motivo_cierre === "GANADO" ||
                              lead.motivo_cierre === "VENTA"
                                ? "bg-emerald-50 text-emerald-600"
                                : lead.motivo_cierre === "YA_ES_CLIENTE"
                                  ? "bg-blue-50 text-blue-600"
                                  : lead.motivo_cierre === "PERDIDO" ||
                                      lead.motivo_cierre === "ABANDONO"
                                    ? "bg-red-50 text-red-500"
                                    : "bg-zinc-50 text-zinc-400"
                            }`}
                          >
                            {lead.motivo_cierre === "GANADO" ||
                            lead.motivo_cierre === "VENTA"
                              ? "✓ Ganado"
                              : lead.motivo_cierre === "YA_ES_CLIENTE"
                                ? "★ Ya es cliente"
                                : lead.motivo_cierre === "PERDIDO" ||
                                    lead.motivo_cierre === "ABANDONO"
                                  ? "✗ Perdido"
                                  : lead.motivo_cierre}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 max-w-[150px] truncate">
                      {lead.observaciones_vendedor || "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-black text-zinc-900">
                        $
                        {parseFloat(
                          lead.monto_cerrado_usd || 0,
                        ).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {lead.num_factura || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-[10px] text-zinc-400">
                      <div>
                        Ingreso:{" "}
                        {new Date(lead.fecha_ingreso).toLocaleDateString()}
                      </div>
                      {lead.fecha_venta && (
                        <div>
                          Venta:{" "}
                          {new Date(lead.fecha_venta).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditOpen(lead)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-zinc-400 hover:text-blue-600 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(String(lead.id))}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VISTA COLUMNAS (drag & drop) ── */}
      {viewMode === "columnas" && (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setActiveLead(leads.find((l) => l.id === e.active.id) || null)
          }
          onDragEnd={handleDragEnd}
        >
          {/* Mobile: 2 columnas */}
          <div className="grid grid-cols-2 gap-4 md:hidden">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                leads={
                  column.id === "CERRADO"
                    ? recentClosedLeads
                    : activeLeads.filter((l) => l.estatus === column.id)
                }
                updatingLeadIds={updatingLeadIds}
                onEditLead={(lead) =>
                  handleEditOpen({
                    id: lead.id,
                    nombre_contacto: lead.nombre,
                    name: lead.empresa,
                    telefono: lead.telefono,
                  })
                }
                onDeleteLead={(id) => handleDelete(id)}
                onCloseLead={(lead) => {
                  setLeadToClose(lead);
                  setFormData({
                    motivo: "GANADO",
                    monto: "",
                    factura: "",
                    fecha: new Date().toISOString().split("T")[0],
                    observaciones: "",
                    motivoPerdido: "",
                    productoPerdido: "",
                    productoOtro: "",
                  });
                  setOdooProducts([]);
                  setCategoriaProducto("todas");
                  setShowClosureModal(true);
                }}
                onSecondPurchase={handleSecondPurchase}
                onTransfer={(lead, newVendedor) => {
                  if (
                    lead.estatus === "CERRADO" &&
                    lead.motivoCierre !== "ABANDONO" &&
                    lead.motivoCierre !== "PERDIDO"
                  )
                    return;
                  const seller = sellers.find((s) => s.name === newVendedor);
                  if (seller) handleReassign(lead.id, String(seller.id));
                }}
                vendorList={sellers.map((s) => s.name)}
                userRole="ADMIN"
                onSaveObservaciones={handleSaveObservaciones}
              />
            ))}
          </div>
          {/* Desktop: N columnas dinámicas */}
          <div
            className="hidden md:grid gap-6"
            style={{
              gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
            }}
          >
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                leads={
                  column.id === "CERRADO"
                    ? recentClosedLeads
                    : activeLeads.filter((l) => l.estatus === column.id)
                }
                updatingLeadIds={updatingLeadIds}
                onEditLead={(lead) =>
                  handleEditOpen({
                    id: lead.id,
                    nombre_contacto: lead.nombre,
                    name: lead.empresa,
                    telefono: lead.telefono,
                  })
                }
                onDeleteLead={(id) => handleDelete(id)}
                onCloseLead={(lead) => {
                  setLeadToClose(lead);
                  setFormData({
                    motivo: "GANADO",
                    monto: "",
                    factura: "",
                    fecha: new Date().toISOString().split("T")[0],
                    observaciones: "",
                    motivoPerdido: "",
                    productoPerdido: "",
                    productoOtro: "",
                  });
                  setOdooProducts([]);
                  setCategoriaProducto("todas");
                  setShowClosureModal(true);
                }}
                onSecondPurchase={handleSecondPurchase}
                onTransfer={(lead, newVendedor) => {
                  if (
                    lead.estatus === "CERRADO" &&
                    lead.motivoCierre !== "ABANDONO" &&
                    lead.motivoCierre !== "PERDIDO"
                  )
                    return;
                  const seller = sellers.find((s) => s.name === newVendedor);
                  if (seller) handleReassign(lead.id, String(seller.id));
                }}
                vendorList={sellers.map((s) => s.name)}
                userRole="ADMIN"
                onSaveObservaciones={handleSaveObservaciones}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <LeadCard
                lead={activeLead}
                isUpdating={false}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── MODAL EDICIÓN ── */}
      {showEditModal && leadToEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-lg text-zinc-800">Editar Lead</h2>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Contacto
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={editForm.nombre_contacto}
                onChange={(e) =>
                  setEditForm({ ...editForm, nombre_contacto: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Empresa
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Teléfono
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={editForm.telefono}
                onChange={(e) =>
                  setEditForm({ ...editForm, telefono: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                RIF
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm font-mono"
                value={editForm.rif}
                onChange={(e) =>
                  setEditForm({ ...editForm, rif: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Ubicación (Estado)
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={editForm.ubicacion_estado}
                onChange={(e) =>
                  setEditForm({ ...editForm, ubicacion_estado: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleSaveEdit}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL ELIMINAR ── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center">
              <p className="font-bold text-zinc-800 text-base">
                ¿Eliminar este lead?
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 border border-zinc-200 text-zinc-600 text-sm font-bold rounded-xl hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ALERTA ── */}
      {alertMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setAlertMessage(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-sm font-semibold text-zinc-700 text-center">
              {alertMessage}
            </p>
            <button
              onClick={() => setAlertMessage(null)}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL CIERRE ── */}
      {showClosureModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowClosureModal(false)}
        >
          <form
            className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl relative overflow-y-auto max-h-[90vh] space-y-4"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (formData.motivo === "GANADO") confetti();
              const productoFinal =
                formData.productoPerdido === "OTRO"
                  ? formData.productoOtro
                  : formData.productoPerdido;
              await fetch("/api/vendedores/leads", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  Object.assign(
                    {
                      id: leadToClose?.id,
                      status: "CERRADO",
                      motivo: formData.motivo,
                      observacionesCierres: formData.observaciones || undefined,
                    },
                    formData.motivo === "GANADO"
                      ? {
                          monto: parseFloat(formData.monto),
                          factura: formData.factura,
                          fecha: formData.fecha,
                        }
                      : {},
                    formData.motivo === "PERDIDO"
                      ? {
                          motivoPerdido: formData.motivoPerdido,
                          productoPerdido: productoFinal || undefined,
                        }
                      : {},
                  ),
                ),
              });
              setShowClosureModal(false);
              fetchData();
            }}
          >
            <button
              type="button"
              onClick={() => setShowClosureModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-lg text-zinc-800">
              Cerrar: {leadToClose?.empresa}
            </h2>
            <select
              required
              className="w-full border border-zinc-300 p-2.5 rounded-lg"
              value={formData.motivo}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  motivo: e.target.value,
                  motivoPerdido: "",
                  productoPerdido: "",
                  productoOtro: "",
                })
              }
            >
              <option value="" disabled>
                Selecciona un motivo...
              </option>
              <option value="GANADO">Cierre ganado</option>
              <option value="YA_ES_CLIENTE">Ya es cliente</option>
              <option value="PERDIDO">Cierre perdido</option>
            </select>
            {(formData.motivo === "GANADO" ||
              formData.motivo === "YA_ES_CLIENTE") && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase">
                    Fecha de cierre
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full border border-zinc-300 p-2.5 rounded-lg"
                    value={formData.fecha}
                    onChange={(e) =>
                      setFormData({ ...formData, fecha: e.target.value })
                    }
                  />
                </div>
                <input
                  className="w-full border border-zinc-300 p-2.5 rounded-lg"
                  placeholder="Monto (USD)"
                  type="number"
                  step="any"
                  min="0"
                  value={formData.monto}
                  required
                  onChange={(e) =>
                    setFormData({ ...formData, monto: e.target.value })
                  }
                />
                <input
                  className="w-full border border-zinc-300 p-2.5 rounded-lg"
                  placeholder="Número de factura"
                  required
                  onChange={(e) =>
                    setFormData({ ...formData, factura: e.target.value })
                  }
                />
              </>
            )}
            {formData.motivo === "PERDIDO" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase">
                    Motivo de pérdida
                  </label>
                  <select
                    required
                    className="w-full border border-zinc-300 p-2.5 rounded-lg"
                    value={formData.motivoPerdido}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        motivoPerdido: e.target.value,
                        productoPerdido: "",
                        productoOtro: "",
                      })
                    }
                  >
                    <option value="" disabled>
                      Selecciona el motivo...
                    </option>
                    <option value="Sin inventario">Sin inventario</option>
                    <option value="Cliente final">Cliente final</option>
                  </select>
                </div>
                {formData.motivoPerdido === "Sin inventario" && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">
                      Producto no disponible
                    </label>
                    {loadingProducts ? (
                      <div className="text-xs text-zinc-400 text-center py-2">
                        Cargando productos...
                      </div>
                    ) : (
                      <>
                        <select
                          className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                          value={categoriaProducto}
                          onChange={(e) => {
                            setCategoriaProducto(e.target.value);
                            setFormData({
                              ...formData,
                              motivoPerdido: formData.motivoPerdido,
                              productoPerdido: "",
                              productoOtro: "",
                            });
                          }}
                        >
                          <option value="todas">Todas las categorías</option>
                          {Array.from(
                            new Set(
                              odooProducts
                                .map((p: any) =>
                                  Array.isArray(p.categ_id)
                                    ? p.categ_id[1]
                                    : null,
                                )
                                .filter(
                                  (c): c is string =>
                                    !!c &&
                                    !CATEGORIAS_OCULTAS_CIERRE.includes(c),
                                ),
                            ),
                          )
                            .sort()
                            .map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                        </select>
                        <select
                          required
                          className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                          value={formData.productoPerdido}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              productoPerdido: e.target.value,
                              productoOtro: "",
                            })
                          }
                        >
                          <option value="" disabled>
                            Selecciona un producto...
                          </option>
                          {odooProducts
                            .filter((p: any) => {
                              const cat = Array.isArray(p.categ_id)
                                ? p.categ_id[1]
                                : null;
                              if (
                                cat &&
                                CATEGORIAS_OCULTAS_CIERRE.includes(cat)
                              )
                                return false;
                              return (
                                categoriaProducto === "todas" ||
                                cat === categoriaProducto
                              );
                            })
                            .map((p: any) => {
                              const nombre =
                                p.translated_name ||
                                p.display_name
                                  ?.replace(/\[.*?\]/g, "")
                                  .trim() ||
                                p.name;
                              return (
                                <option key={p.id} value={nombre}>
                                  {nombre}
                                  {p.default_code ? ` [${p.default_code}]` : ""}
                                </option>
                              );
                            })}
                          <option value="OTRO">Otro (especificar)</option>
                        </select>
                      </>
                    )}
                    {formData.productoPerdido === "OTRO" && (
                      <input
                        type="text"
                        placeholder="Escribe el nombre del producto..."
                        value={formData.productoOtro}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            productoOtro: e.target.value,
                          })
                        }
                        className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                        required
                      />
                    )}
                  </div>
                )}
              </>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Observaciones de cierre
              </label>
              <textarea
                rows={3}
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm resize-none"
                placeholder="Escribe observaciones..."
                value={formData.observaciones}
                onChange={(e) =>
                  setFormData({ ...formData, observaciones: e.target.value })
                }
              />
            </div>
            <button
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
              type="submit"
            >
              Confirmar cierre
            </button>
          </form>
        </div>
      )}

      {/* ── MODAL CREAR LEAD ── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <form
            className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateLead}
          >
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-lg text-zinc-800">Nuevo Lead</h2>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Nombre Contacto *
              </label>
              <input
                required
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.nombre}
                onChange={(e) =>
                  setCreateForm({ ...createForm, nombre: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Empresa *
              </label>
              <input
                required
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.empresa}
                onChange={(e) =>
                  setCreateForm({ ...createForm, empresa: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Teléfono
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.telefono}
                onChange={(e) =>
                  setCreateForm({ ...createForm, telefono: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                RIF
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm font-mono"
                value={createForm.rif}
                onChange={(e) =>
                  setCreateForm({ ...createForm, rif: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Ubicación (Estado)
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.ubicacionEstado}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    ubicacionEstado: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Ubicación (Detalle)
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.ubicacionDetalle}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    ubicacionDetalle: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Canal de Origen
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.canalOrigen}
                onChange={(e) =>
                  setCreateForm({ ...createForm, canalOrigen: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Campaña
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.campana}
                onChange={(e) =>
                  setCreateForm({ ...createForm, campana: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Asignar a Vendedor
              </label>
              <select
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.seller_id}
                onChange={(e) =>
                  setCreateForm({ ...createForm, seller_id: e.target.value })
                }
              >
                <option value="">Sin asignar</option>
                {sellers.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Status Inicial
              </label>
              <select
                className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                value={createForm.status}
                onChange={(e) =>
                  setCreateForm({ ...createForm, status: e.target.value })
                }
              >
                {columns.map((col) => (
                  <option
                    key={col.id}
                    value={col.id}
                    disabled={col.id === "CERRADO"}
                  >
                    {col.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
            >
              Crear Lead
            </button>
          </form>
        </div>
      )}

      {/* ── MODAL DE SEGUNDA COMPRA ── */}
      {showSecondPurchaseModal && leadForSecondPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowSecondPurchaseModal(false)}
        >
          <form
            className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setUpdatingLeadIds((prev) => [...prev, leadForSecondPurchase.id]);
              try {
                await fetch("/api/vendedores/leads", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    nombre: leadForSecondPurchase.nombre,
                    empresa: leadForSecondPurchase.empresa,
                    telefono: leadForSecondPurchase.telefono,
                    rif: leadForSecondPurchase.rif,
                    ubicacionEstado: leadForSecondPurchase.ubicacionEstado,
                    ubicacionDetalle: leadForSecondPurchase.ubicacionDetalle,
                    canalOrigen: leadForSecondPurchase.canalOrigen,
                    campana: leadForSecondPurchase.campana,
                    seller_id: leadForSecondPurchase.sellerId,
                    status: "CERRADO",
                    motivo: "GANADO",
                    monto: parseFloat(secondPurchaseForm.monto),
                    factura: secondPurchaseForm.factura,
                    fecha: secondPurchaseForm.fecha,
                  }),
                });
                await fetch("/api/vendedores/leads", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: leadForSecondPurchase.id,
                    segundaCompraRealizada: true,
                  }),
                });
                confetti();
                setShowSecondPurchaseModal(false);
                await fetchData();
              } catch (err) {
                console.error("Error al registrar segunda compra:", err);
              } finally {
                setUpdatingLeadIds((prev) =>
                  prev.filter((id) => id !== leadForSecondPurchase.id),
                );
              }
            }}
          >
            <button
              type="button"
              onClick={() => setShowSecondPurchaseModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-lg text-zinc-800">
              🛍️ Segunda Compra: {leadForSecondPurchase.empresa}
            </h2>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Fecha de venta
              </label>
              <input
                type="date"
                required
                className="w-full border border-zinc-300 p-2.5 rounded-lg"
                value={secondPurchaseForm.fecha}
                onChange={(e) =>
                  setSecondPurchaseForm({
                    ...secondPurchaseForm,
                    fecha: e.target.value,
                  })
                }
              />
            </div>
            <input
              className="w-full border border-zinc-300 p-2.5 rounded-lg"
              placeholder="Monto (USD)"
              type="number"
              step="any"
              min="0"
              value={secondPurchaseForm.monto}
              required
              onChange={(e) =>
                setSecondPurchaseForm({
                  ...secondPurchaseForm,
                  monto: e.target.value,
                })
              }
            />
            <input
              className="w-full border border-zinc-300 p-2.5 rounded-lg"
              placeholder="Número de factura"
              required
              onChange={(e) =>
                setSecondPurchaseForm({
                  ...secondPurchaseForm,
                  factura: e.target.value,
                })
              }
            />
            <button
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
              type="submit"
            >
              Confirmar segunda compra
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
