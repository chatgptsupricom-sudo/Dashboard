import { DndContext, DragOverlay } from "@dnd-kit/core";
import { CheckCircle2, TrendingUp, Users2 } from "lucide-react";
import React from "react";
import { Column } from "../../types";
import { KanbanColumn } from "../KanbanColumn";
import { LeadCard } from "../LeadCard";

interface BoardTabProps {
  userRole: "ADMIN" | "VENDEDOR";
  boardLayout: "columns" | "table";
  setBoardLayout: (layout: "columns" | "table") => void;
  activeLeads: any[];
  recentClosedLeads: any[];
  columns: Column[];
  activeLeadsCount: number;
  activePipelineValue: number;
  conversionPercentage: number;
  updatingLeadIds: string[];
  activeLead: any;
  sensors: any;
  handleDragStart: (event: any) => void;
  handleDragEnd: (event: any) => void;
  handleStatusChange: (id: string, status: string, data?: any) => void;
  handleOpenEditForm: (lead: any) => void;
  handleDeleteLead: (id: string) => void;
  handleOpenClosureModal: (lead: any) => void;
  handleSecondPurchase: (lead: any) => void;
  handleChangeClosureType: (lead: any) => void;
  handleTransferLead: (lead: any, vendedor: string) => void;
  vendorList: string[];
}

export const BoardTab: React.FC<BoardTabProps> = ({
  userRole,
  boardLayout,
  activeLeads,
  recentClosedLeads,
  columns,
  activeLeadsCount,
  activePipelineValue,
  conversionPercentage,
  updatingLeadIds,
  activeLead,
  sensors,
  handleDragStart,
  handleDragEnd,
  handleStatusChange,
  handleOpenEditForm,
  handleDeleteLead,
  handleOpenClosureModal,
  handleSecondPurchase,
  handleChangeClosureType,
  handleTransferLead,
  vendorList,
}) => {
  // Función para agrupar estados dinámicamente
  const getLeadsForColumn = (columnId: string) => {
    if (columnId === "CERRADO") {
      return recentClosedLeads;
    }
    return activeLeads.filter((l) => l.estatus === columnId);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase">
              Oportunidades
            </span>
            <span className="text-xl font-black block">{activeLeadsCount}</span>
          </div>
          <Users2 className="text-blue-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase">
              Pipeline
            </span>
            <span className="text-xl font-black block">
              ${activePipelineValue.toLocaleString()}
            </span>
          </div>
          <TrendingUp className="text-emerald-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase">
              Efectividad
            </span>
            <span className="text-xl font-black block">
              {conversionPercentage}%
            </span>
          </div>
          <CheckCircle2 className="text-purple-500" />
        </div>
      </div>

      {/* Tablero Kanban */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              leads={getLeadsForColumn(column.id)}
              updatingLeadIds={updatingLeadIds}
              onEditLead={handleOpenEditForm}
              onDeleteLead={handleDeleteLead}
              onCloseLead={handleOpenClosureModal}
              userRole={userRole}
              onSecondPurchase={handleSecondPurchase}
              onChangeClosureType={handleChangeClosureType}
              onTransfer={userRole !== "VENDEDOR" ? handleTransferLead : undefined}
              vendorList={vendorList}
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
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
