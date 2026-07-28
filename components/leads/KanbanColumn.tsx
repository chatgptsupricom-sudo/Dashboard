/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDroppable } from "@dnd-kit/core";
import { FolderOpen, TrendingUp } from "lucide-react";
import React from "react";
import { Column, Lead } from "@/lib/leads/leadTypes";
import { LeadCard } from "./LeadCard";

interface KanbanColumnProps {
  column: Column;
  leads: Lead[];
  updatingLeadIds: string[];
  onEditLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
  onCloseLead?: (lead: Lead) => void;
  userRole?: "ADMIN" | "VENDEDOR";
  onSecondPurchase?: (lead: Lead) => void;
  onChangeClosureType?: (lead: Lead) => void;
  onTransfer?: (lead: Lead, newVendedor: string) => void;
  vendorList?: string[];
  onSaveObservaciones?: (id: string, value: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  leads,
  updatingLeadIds,
  onEditLead,
  onDeleteLead,
  onCloseLead,
  userRole,
  onSecondPurchase,
  onChangeClosureType,
  onTransfer,
  vendorList,
  onSaveObservaciones,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
  });

  // Calculate total value of leads in this column
  const totalValue = leads.reduce(
    (sum, lead) => sum + (lead.valorEstimado || 0),
    0,
  );

  const formattedTotal = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(totalValue);

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col h-full rounded-2xl border transition-all duration-200 min-h-[300px] md:min-h-[600px]
        ${column.bgClass}
        ${column.borderClass}
        ${isOver ? "ring-2 ring-zinc-400 border-zinc-500 shadow-sm scale-[1.005]" : ""}
      `}
    >
      {/* Column Header */}
      <div className="p-3 md:p-4 rounded-t-2xl border-b border-zinc-100 flex items-center justify-between gap-1 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2.5 h-2.5 flex-shrink-0 rounded-full ${column.color}`} />
          <h3 className={`text-xs md:text-sm font-bold tracking-wider truncate ${column.textClass}`}>
            {column.title}
          </h3>
          <span className={`flex-shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold leading-none ${column.accentClass} ${column.textClass}`}>
            {leads.length}
          </span>
        </div>

        {totalValue > 0 && (
          <div className="hidden md:flex items-center gap-1 text-[11px] font-semibold text-zinc-500 bg-white px-2 py-1 rounded-md border border-zinc-200 flex-shrink-0">
            <TrendingUp className="w-3 h-3 text-zinc-400" />
            <span>Value: {formattedTotal}</span>
          </div>
        )}
      </div>

      {/* Column Leads Listing / Droppable Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 min-h-[400px]">
        {leads.length > 0 ? (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              // FIX: Se agregó || [] para evitar el error de 'undefined'
              isUpdating={(updatingLeadIds || []).includes(lead.id)}
              onEdit={onEditLead}
              onDelete={onDeleteLead}
              onCloseLead={onCloseLead}
              userRole={userRole}
              onSecondPurchase={onSecondPurchase}
              onChangeClosureType={onChangeClosureType}
              onTransfer={onTransfer}
              vendorList={vendorList}
              onSaveObservaciones={onSaveObservaciones}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50 p-4">
            <FolderOpen className="w-8 h-8 text-zinc-300 mb-2" />
            <p className="text-xs text-zinc-400 font-medium">No hay leads</p>
          </div>
        )}
      </div>
    </div>
  );
};
