"use client";

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
  CheckCircle2,
  MapPin,
  Search,
  Users2,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io, Socket } from "socket.io-client";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";

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

const colorMap: any = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  purple: "bg-purple-50 text-purple-600",
};

export const BoardTab: React.FC<{ userRole?: "ADMIN" | "VENDEDOR" }> = ({
  userRole = "ADMIN",
}) => {
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [updatingLeadIds, setUpdatingLeadIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [vendorList, setVendorList] = useState<string[]>([]);

  // Toast de alerta
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const showAlert = (msg: string) => setAlertMessage(msg);

  // Modal de cierre
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [leadToClose, setLeadToClose] = useState<Lead | null>(null);
  const [formData, setFormData] = useState({
    motivo: "",
    motivoPerdido: "",
    monto: "",
    factura: "",
    fecha: new Date().toISOString().split("T")[0],
    observaciones: "",
  });

  // Modal de edición
  const [showEditModal, setShowEditModal] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({
    nombre: "",
    empresa: "",
    telefono: "",
  });

  // Modal de segunda compra
  const [showSecondPurchaseModal, setShowSecondPurchaseModal] = useState(false);
  const [leadForSecondPurchase, setLeadForSecondPurchase] =
    useState<Lead | null>(null);
  const [secondPurchaseForm, setSecondPurchaseForm] = useState({
    monto: "",
    factura: "",
    fecha: new Date().toISOString().split("T")[0],
  });

  const fetchStatuses = async () => {
    try {
      const res = await fetch("/api/adminleads/statuses");
      const data = await res.json();
      if (Array.isArray(data)) {
        setColumns(data.map(buildColumnFromStatus));
      }
    } catch {}
  };

  const fetchLeadsRef = useRef<() => void>(() => {});

  const fetchLeads = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const res = await fetch("/api/vendedores/leads");
      const data = await res.json();
      const mappedLeads: Lead[] = data.map((item: any) => ({
        id: item.id.toString(),
        nombre: item.nombre_contacto || "Sin nombre",
        empresa: item.name || "Sin empresa",
        estatus: item.status || "NUEVO",
        vendedor: item.seller_name || item.seller_id?.toString(),
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
      }));
      setLeads(mappedLeads);
    } catch (err) {
      console.error("Error al cargar leads:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch("/api/vendedores/sellers");
      const data = await res.json();
      const names = data
        .map((s: any) => s.name || s.nombre || s.seller_name)
        .filter(Boolean);
      setVendorList(names);
    } catch (err) {
      console.error("Error al cargar vendedores:", err);
    }
  };

  useEffect(() => {
    fetchLeadsRef.current = fetchLeads;
  });

  useEffect(() => {
    fetchStatuses();
    fetchLeads();
    fetchVendors();
  }, []);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL as string;
    console.log("[Leads Socket] Conectando a:", socketUrl);
    const socket: Socket = io(socketUrl);

    socket.on("connect", () => {
      console.log("[Leads Socket] Conectado, id:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("[Leads Socket] Error de conexión:", err.message);
    });

    socket.on("leads-updated", (data) => {
      console.log("[Leads Socket] leads-updated recibido:", data);
      (fetchLeadsRef.current as any)(true);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStatus = over.id as string;

    if (lead?.estatus === "CERRADO" && lead?.motivoCierre !== "ABANDONO") {
      showAlert("Un lead cerrado no puede cambiar de estado.");
      return;
    }

    const currentIndex = columns.findIndex((c) => c.id === lead?.estatus);
    const newIndex = columns.findIndex((c) => c.id === newStatus);
    if (newIndex > currentIndex + 1) {
      showAlert("No puedes saltar etapas. Debes avanzar una etapa a la vez.");
      return;
    }

    if (newStatus === "CERRADO" && lead?.estatus === "NUEVO") {
      showAlert("No puedes cerrar un lead que está en estado NUEVO.");
      return;
    }
    if (newStatus === "CERRADO") {
      setLeadToClose(lead || null);
      setShowClosureModal(true);
      return;
    }
    setLeads((prev) =>
      prev.map((l) =>
        l.id === active.id
          ? {
              ...l,
              estatus: newStatus,
              ...(l.motivoCierre === "ABANDONO" ? { motivoCierre: "" } : {}),
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
      const ingreso = new Date(lead.fechaIngreso).getTime();
      const ahora = new Date().getTime();
      tiempoPrimerContacto = Math.round((ahora - ingreso) / 60000);
    }

    const esReactivacion =
      lead?.motivoCierre === "ABANDONO" && newStatus !== "CERRADO";

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
    } catch (err) {
      console.error("Error al persistir estado:", err);
      fetchLeads();
    } finally {
      setUpdatingLeadIds((prev) => prev.filter((id) => id !== active.id));
    }
  };

  const handleEditLead = (lead: Lead) => {
    setLeadToEdit(lead);
    setEditForm({
      nombre: lead.nombre,
      empresa: lead.empresa,
      telefono: lead.telefono,
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!leadToEdit) return;
    try {
      await fetch("/api/vendedores/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadToEdit.id, ...editForm }),
      });
      setShowEditModal(false);
      fetchLeads();
    } catch (err) {
      console.error("Error al editar lead:", err);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este lead?")) return;
    setUpdatingLeadIds((prev) => [...prev, id]);
    try {
      await fetch(`/api/vendedores/leads?id=${id}`, { method: "DELETE" });
      setLeads((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Error al eliminar lead:", err);
    } finally {
      setUpdatingLeadIds((prev) => prev.filter((lid) => lid !== id));
    }
  };

  const handleCloseLead = (lead: Lead) => {
    setLeadToClose(lead);
    setFormData({
      motivo: "",
      motivoPerdido: "",
      monto: "",
      factura: "",
      fecha: new Date().toISOString().split("T")[0],
      observaciones: "",
    });
    setShowClosureModal(true);
  };

  const handleSecondPurchase = (lead: Lead) => {
    setLeadForSecondPurchase(lead);
    setSecondPurchaseForm({
      monto: "",
      factura: "",
      fecha: new Date().toISOString().split("T")[0],
    });
    setShowSecondPurchaseModal(true);
  };

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

  const handleTransfer = async (lead: Lead, newVendedor: string) => {
    setUpdatingLeadIds((prev) => [...prev, lead.id]);
    try {
      await fetch("/api/vendedores/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, vendedor: newVendedor }),
      });
      fetchLeads();
    } catch (err) {
      console.error("Error al transferir lead:", err);
    } finally {
      setUpdatingLeadIds((prev) => prev.filter((id) => id !== lead.id));
    }
  };

  const [search, setSearch] = useState("");
  const [filterUbicacion, setFilterUbicacion] = useState("");

  const ubicacionOptions = Array.from(
    new Set(leads.map((l) => l.ubicacionEstado).filter(Boolean)),
  ).sort();

  const activeLeads = leads.filter((l) => l.estatus !== "CERRADO");

  const recentClosedLeads = leads.filter((l) => {
    if (l.estatus !== "CERRADO") return false;
    if (l.hasSecondPurchase) return false;
    // ABANDONO: usar created_at/fechaIngreso como referencia de 30 días
    const refDate =
      l.motivoCierre === "ABANDONO"
        ? l.fechaIngreso
          ? new Date(l.fechaIngreso).getTime()
          : null
        : l.fechaVenta
          ? new Date(l.fechaVenta).getTime()
          : null;
    if (!refDate || isNaN(refDate)) return false;
    const diffDays = (new Date().getTime() - refDate) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 30;
  });
  const totalLeads = leads.length;
  const closedVenta = leads.filter(
    (l) => l.estatus === "CERRADO" && (l.motivoCierre === "VENTA" || l.motivoCierre === "GANADO" || l.motivoCierre === "YA_ES_CLIENTE"),
  ).length;
  const efectividad =
    totalLeads > 0 ? Math.round((closedVenta / totalLeads) * 100) : 0;

  const q = search.toLowerCase();
  const matchSearch = (l: Lead) =>
    (!q ||
      l.empresa.toLowerCase().includes(q) ||
      l.nombre.toLowerCase().includes(q)) &&
    (!filterUbicacion || l.ubicacionEstado === filterUbicacion);

  if (isLoading)
    return <div className="p-10 text-center">Cargando tablero...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-slate-900">Leads</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar empresa o contacto..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative w-full md:w-48">
            <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <select
              className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              value={filterUbicacion}
              onChange={(e) => setFilterUbicacion(e.target.value)}
            >
              <option value="">Todas las ubicaciones</option>
              {ubicacionOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          title="Oportunidades Activas"
          value={activeLeads.length}
          icon={Users2}
          color="blue"
        />
        <KPICard
          title="% Efectividad"
          value={`${efectividad}%`}
          icon={CheckCircle2}
          color="purple"
        />
      </div>

      {/* Ranking de estados */}
      {(() => {
        const counts: Record<string, number> = {};
        leads.forEach((l) => {
          if (l.ubicacionEstado)
            counts[l.ubicacionEstado] = (counts[l.ubicacionEstado] || 0) + 1;
        });
        const ranking = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        if (ranking.length === 0) return null;
        const max = ranking[0][1];
        return (
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Leads por Estado
              </span>
            </div>
            <div className="space-y-2">
              {ranking.map(([estado, total], i) => (
                <div key={estado} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-400 w-4 flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs text-zinc-700 font-medium w-28 truncate flex-shrink-0">
                    {estado}
                  </span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(total / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-zinc-600 w-6 text-right flex-shrink-0">
                    {total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
                  ? recentClosedLeads.filter(matchSearch)
                  : activeLeads.filter(
                      (l) => l.estatus === column.id && matchSearch(l),
                    )
              }
              updatingLeadIds={updatingLeadIds}
              onEditLead={handleEditLead}
              onDeleteLead={handleDeleteLead}
              onCloseLead={handleCloseLead}
              onSecondPurchase={handleSecondPurchase}
              onTransfer={userRole !== "VENDEDOR" ? handleTransfer : undefined}
              vendorList={vendorList}
              userRole={userRole}
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
                  ? recentClosedLeads.filter(matchSearch)
                  : activeLeads.filter(
                      (l) => l.estatus === column.id && matchSearch(l),
                    )
              }
              updatingLeadIds={updatingLeadIds}
              onEditLead={handleEditLead}
              onDeleteLead={handleDeleteLead}
              onCloseLead={handleCloseLead}
              onSecondPurchase={handleSecondPurchase}
              onTransfer={userRole !== "VENDEDOR" ? handleTransfer : undefined}
              vendorList={vendorList}
              userRole={userRole}
              onSaveObservaciones={handleSaveObservaciones}
            />
          ))}
        </div>
        {/* end desktop grid */}
        <DragOverlay>
          {activeLead ? (
            <LeadCard
              lead={activeLead}
              isUpdating={false}
              onEdit={handleEditLead}
              onDelete={handleDeleteLead}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── MODAL DE ALERTA ── */}
      {alertMessage && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
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
        </div>,
        document.body
      )}

      {/* ── MODAL DE CIERRE ── */}
      {showClosureModal && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowClosureModal(false)}
        >
          <form
            className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (formData.motivo === "GANADO") confetti();
              await fetch("/api/vendedores/leads", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: leadToClose?.id,
                  status: "CERRADO",
                  motivo: formData.motivo,
                  fecha: formData.fecha,
                  observacionesCierres: formData.observaciones || undefined,
                  ...(formData.motivo === "GANADO" || formData.motivo === "YA_ES_CLIENTE"
                    ? {
                        monto: parseFloat(formData.monto),
                        factura: formData.factura,
                      }
                    : {}),
                  ...(formData.motivo === "PERDIDO" && formData.motivoPerdido
                    ? { motivoPerdido: formData.motivoPerdido }
                    : {}),
                }),
              });
              setShowClosureModal(false);
              fetchLeads();
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
                setFormData({ ...formData, motivo: e.target.value, motivoPerdido: "" })
              }
            >
              <option value="" disabled>
                Selecciona un motivo...
              </option>
              <option value="GANADO">Cierre ganado</option>
              <option value="YA_ES_CLIENTE">Ya es cliente</option>
              <option value="PERDIDO">Cierre perdido</option>
            </select>
            {formData.motivo === "GANADO" && (
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
            {formData.motivo === "YA_ES_CLIENTE" && (
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
            )}
            {formData.motivo === "PERDIDO" && (
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
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase">
                    Motivo de pérdida
                  </label>
                  <select
                    required
                    className="w-full border border-zinc-300 p-2.5 rounded-lg text-sm"
                    value={formData.motivoPerdido}
                    onChange={(e) =>
                      setFormData({ ...formData, motivoPerdido: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      Selecciona motivo de pérdida...
                    </option>
                    <option value="Sin inventario">Sin inventario</option>
                    <option value="Cliente final">Cliente final</option>
                    <option value="Sin respuesta del cliente">Sin respuesta del cliente</option>
                  </select>
                </div>
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
        </div>,
        document.body
      )}

      {/* ── MODAL DE EDICIÓN ── */}
      {showEditModal && leadToEdit && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
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
                Nombre
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg"
                value={editForm.nombre}
                onChange={(e) =>
                  setEditForm({ ...editForm, nombre: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Empresa
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg"
                value={editForm.empresa}
                onChange={(e) =>
                  setEditForm({ ...editForm, empresa: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">
                Teléfono
              </label>
              <input
                className="w-full border border-zinc-300 p-2.5 rounded-lg"
                value={editForm.telefono}
                onChange={(e) =>
                  setEditForm({ ...editForm, telefono: e.target.value })
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
        </div>,
        document.body
      )}

      {/* ── MODAL DE SEGUNDA COMPRA ── */}
      {showSecondPurchaseModal && leadForSecondPurchase && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowSecondPurchaseModal(false)}
        >
          <form
            className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setUpdatingLeadIds((prev) => [...prev, leadForSecondPurchase.id]);
              try {
                const postRes = await fetch("/api/vendedores/leads", {
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
                    motivo: "VENTA",
                    monto: parseFloat(secondPurchaseForm.monto),
                    factura: secondPurchaseForm.factura,
                    fecha: secondPurchaseForm.fecha,
                  }),
                });
                const postData = await postRes.json();
                console.log("POST segunda compra:", postRes.status, postData);

                await fetch("/api/vendedores/leads", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: leadForSecondPurchase.id,
                    segundaCompraRealizada: true,
                  }),
                });

                // Remove original lead from UI immediately
                setLeads((prev) =>
                  prev.filter((l) => l.id !== leadForSecondPurchase.id),
                );
                confetti();
                setShowSecondPurchaseModal(false);
                await fetchLeads();
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
        </div>,
        document.body
      )}
    </div>
  );
};

const KPICard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-xs flex items-center justify-between">
    <div>
      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
        {title}
      </span>
      <span className="text-xl font-bold text-zinc-850 mt-1 block">
        {value}
      </span>
    </div>
    <span className={`p-2.5 rounded-lg ${colorMap[color]}`}>
      <Icon className="w-5 h-5" />
    </span>
  </div>
);
