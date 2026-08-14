"use client";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import React, { useEffect, useState } from "react";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";

export const LeadsBoard: React.FC<any> = ({ userRole, selectedVendedor }) => {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const [leads, setLeads] = useState<any[]>([]);
  const [updatingLeadIds, setUpdatingLeadIds] = useState<string[]>([]);
  const [activeLead, setActiveLead] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const columns = [
    {
      id: "NUEVO",
      title: "NUEVO",
      color: "bg-blue-500",
      bgClass: "bg-blue-50/30",
      borderClass: "border-blue-100",
      accentClass: "bg-blue-100",
      textClass: "text-blue-700",
    },
    {
      id: "CONTACTADO",
      title: "CONTACTADO",
      color: "bg-amber-500",
      bgClass: "bg-amber-50/30",
      borderClass: "border-amber-100",
      accentClass: "bg-amber-100",
      textClass: "text-amber-700",
    },
    {
      id: "NEGOCIANDO",
      title: "NEGOCIANDO",
      color: "bg-pink-500",
      bgClass: "bg-pink-50/30",
      borderClass: "border-pink-100",
      accentClass: "bg-pink-100",
      textClass: "text-pink-700",
    },
    {
      id: "CERRADO",
      title: "CERRADO",
      color: "bg-zinc-500",
      bgClass: "bg-zinc-50/30",
      borderClass: "border-zinc-200",
      accentClass: "bg-zinc-100",
      textClass: "text-zinc-600",
    },
  ];

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/vendedores/leads");
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error("Error API:", err);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // FILTRO INTELIGENTE
  const filteredLeads = leads.filter((l) => {
    // 1. Filtro por búsqueda
    const matchesSearch =
      l.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.empresa?.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Filtro por Vendedor (seguro)
    if (userRole === "VENDEDOR") {
      const matchVendedor =
        l.seller_id?.toString() === selectedVendedor?.toString();
      return matchesSearch && matchVendedor;
    }
    return matchesSearch;
  });

  return (
    <DndContext sensors={sensors}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 p-6">
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            leads={filteredLeads.filter((l) => {
              const status = (l.estatus || "").toUpperCase();

              // LÓGICA DE AGRUPACIÓN:
              if (col.id === "CERRADO") {
                // Aquí capturamos cualquier estatus de cierre que envíe tu API
                return [
                  "CERRADO",
                  "CERRADO_VENTA",
                  "CERRADO_ABANDONADO",
                ].includes(status);
              }
              // Para los otros, buscamos coincidencia exacta
              return status === col.id.toUpperCase();
            })}
            updatingLeadIds={updatingLeadIds || []}
            onEditLead={() => {}}
            onDeleteLead={() => {}}
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
  );
};

export default LeadsBoard;
