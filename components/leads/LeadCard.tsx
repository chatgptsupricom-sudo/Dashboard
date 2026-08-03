/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead } from "@/lib/leads/leadTypes";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  BadgeInfo,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  FileText,
  GripVertical,
  Loader2,
  MapPin,
  Phone,
  Trash2,
  Users2,
  X,
} from "lucide-react";
import React from "react";

interface LeadCardProps {
  lead: Lead;
  isUpdating: boolean;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onCloseLead?: (lead: Lead) => void;
  userRole?: "ADMIN" | "VENDEDOR";
  onSecondPurchase?: (lead: Lead) => void;
  onChangeClosureType?: (lead: Lead) => void;
  onTransfer?: (lead: Lead, newVendedor: string) => void;
  vendorList?: string[];
  onSaveObservaciones?: (id: string, value: string) => void;
}

export const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  isUpdating,
  onEdit,
  onDelete,
  onCloseLead,
  userRole = "ADMIN",
  onSecondPurchase,
  onChangeClosureType,
  onTransfer,
  vendorList = [],
  onSaveObservaciones,
}) => {
  const [obsValue, setObsValue] = React.useState(
    lead.observacionesVendedor ?? "",
  );
  const [isTransferOpen, setIsTransferOpen] = React.useState(false);
  const transferMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        transferMenuRef.current &&
        !transferMenuRef.current.contains(event.target as Node)
      ) {
        setIsTransferOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: lead.id,
      disabled: isUpdating, // Prevent dragging while updating status
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : isUpdating ? 0.8 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const formattedValue = lead.valorEstimado
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(lead.valorEstimado)
    : null;

  const [showDetailModal, setShowDetailModal] = React.useState(false);

  const creationDate = lead.fechaIngreso
    ? new Date(lead.fechaIngreso).toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "S/F";

  return (
    <>
      {showDetailModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between p-5 border-b border-zinc-100">
              <div>
                <h2 className="text-base font-bold text-zinc-800">
                  {lead.nombre}
                </h2>
                {lead.identidad && (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 rounded-full">
                    <BadgeInfo className="w-3 h-3" />
                    {lead.identidad}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-sm text-zinc-700">
              {/* Empresa & RIF */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                    Empresa
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span>{lead.empresa || "—"}</span>
                  </div>
                </div>
                {lead.rif && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                      RIF
                    </p>
                    <span className="font-mono text-zinc-700">{lead.rif}</span>
                  </div>
                )}
              </div>

              {/* Teléfono */}
              <div>
                <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                  Teléfono
                </p>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <a
                    href={
                      lead.estatus !== "CERRADO" && lead.whatsapp_link
                        ? lead.whatsapp_link
                        : `tel:${lead.telefono}`
                    }
                    target={
                      lead.estatus !== "CERRADO" && lead.whatsapp_link
                        ? "_blank"
                        : undefined
                    }
                    rel={
                      lead.estatus !== "CERRADO" && lead.whatsapp_link
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className={
                      lead.estatus !== "CERRADO" && lead.whatsapp_link
                        ? "text-green-600 hover:underline"
                        : "text-blue-600 hover:underline"
                    }
                  >
                    {lead.telefono || "—"}
                    {lead.estatus !== "CERRADO" && lead.whatsapp_link && (
                      <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                        WhatsApp
                      </span>
                    )}
                  </a>
                </div>
              </div>

              {/* Ubicación */}
              {(lead.ubicacionEstado || lead.ubicacionDetalle) && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                    Ubicación
                  </p>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span>
                      {lead.ubicacionEstado}
                      {lead.ubicacionDetalle
                        ? ` (${lead.ubicacionDetalle})`
                        : ""}
                    </span>
                  </div>
                </div>
              )}

              {/* Intereses */}
              {lead.categoriaInteres && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-1">
                    Interés
                  </p>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-sm font-semibold">
                    🎯 {lead.categoriaInteres}
                  </span>
                </div>
              )}

              {/* Canal & Campaña */}
              {(lead.canalOrigen || lead.campana) && (
                <div className="grid grid-cols-2 gap-3">
                  {lead.canalOrigen && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                        Canal
                      </p>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs border border-slate-200">
                        {lead.canalOrigen}
                      </span>
                    </div>
                  )}
                  {lead.campana && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                        Campaña
                      </p>
                      <span className="text-zinc-600">{lead.campana}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Vendedor */}
              {lead.vendedor && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                    Vendedor
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{lead.vendedor}</span>
                  </div>
                </div>
              )}

              {/* Estado */}
              <div>
                <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                  Estado
                </p>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    lead.estatus === "NUEVO"
                      ? "bg-blue-100 text-blue-700"
                      : lead.estatus === "CONTACTADO"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {lead.estatus}
                </span>
              </div>

              {/* Cierre info */}
              {lead.estatus === "CERRADO" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                      Resultado
                    </p>
                    {(() => {
                      const isGanado =
                        lead.motivoCierre === "GANADO" ||
                        lead.motivoCierre === "VENTA";
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${isGanado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}
                        >
                          {isGanado ? "✓ Ganado" : "✗ Perdido"}
                        </span>
                      );
                    })()}
                    {(lead.motivoCierre === "PERDIDO" ||
                      lead.motivoCierre === "ABANDONO") &&
                      lead.motivoPerdido && (
                        <p className="text-[10px] text-zinc-500 mt-1 italic">
                          {lead.motivoPerdido}
                        </p>
                      )}
                  </div>
                  {lead.numFactura && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                        Factura
                      </p>
                      <span className="font-mono">{lead.numFactura}</span>
                    </div>
                  )}
                  {lead.valorEstimado > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                        Monto
                      </p>
                      <span className="font-semibold text-emerald-700">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 0,
                        }).format(lead.valorEstimado)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Notas */}
              {lead.notas && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-1">
                    Notas
                  </p>
                  <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100 text-xs text-zinc-600 leading-relaxed">
                    {lead.notas}
                  </div>
                </div>
              )}

              {/* Observaciones vendedor */}
              {lead.observacionesVendedor && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-1">
                    Observaciones Vendedor
                  </p>
                  <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-800 leading-relaxed">
                    {lead.observacionesVendedor}
                  </div>
                </div>
              )}

              {/* Fecha ingreso */}
              <div>
                <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5">
                  Fecha de Ingreso
                </p>
                <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{creationDate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        id={`lead-card-${lead.id}`}
        ref={setNodeRef}
        style={style}
        onClick={() => setShowDetailModal(true)}
        className={`
        relative group bg-white border rounded-xl shadow-xs transition-shadow duration-200 hover:shadow-md cursor-pointer
        ${isUpdating ? "border-amber-300 ring-1 ring-amber-300 bg-amber-50/20" : "border-zinc-200/80 hover:border-zinc-300"}
        ${isDragging ? "scale-[1.02] cursor-grabbing border-blue-400 ring-2 ring-blue-500/10 shadow-lg" : ""}
      `}
      >
        {/* Loading overlay when status is updating to webhook */}
        {isUpdating && (
          <div className="absolute inset-x-0 top-0 h-1 bg-amber-500 rounded-t-xl overflow-hidden">
            <div className="w-full h-full bg-amber-400 animate-pulse" />
          </div>
        )}

        <div className="p-2.5 md:p-4 overflow-hidden">
          {/* Top Header Row of Card */}
          <div className="flex items-start justify-between gap-1 mb-2 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden">
              <h4 className="text-xs md:text-sm font-semibold text-zinc-800 tracking-tight leading-tight truncate group-hover:text-blue-600 transition-colors">
                {lead.nombre}
              </h4>
              {lead.identidad && (
                <span className="inline-flex items-center mt-0.5 px-2 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                  {lead.identidad}
                </span>
              )}
              <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500 font-medium min-w-0">
                <Building2 className="w-3 h-3 flex-shrink-0 text-zinc-400" />
                <span className="truncate text-[11px]">{lead.empresa}</span>
              </div>
            </div>

            {/* Drag Handle & Context Menu Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                {...attributes}
                {...listeners}
                style={{ touchAction: "none" }}
                onClick={(e) => e.stopPropagation()}
                className={`p-2 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100 transition-colors touch-none ${
                  isUpdating || lead.estatus === "CERRADO_VENTA"
                    ? "opacity-30 cursor-not-allowed"
                    : "cursor-grab active:cursor-grabbing"
                }`}
                title="Arrastrar lead"
                aria-label="Arrastrar lead"
              >
                <GripVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lead Specific details */}
          <div className="space-y-1 my-2 text-xs text-zinc-600 overflow-hidden">
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              <a
                href={
                  lead.estatus !== "CERRADO" && lead.whatsapp_link
                    ? lead.whatsapp_link
                    : `tel:${lead.telefono}`
                }
                target={
                  lead.estatus !== "CERRADO" && lead.whatsapp_link
                    ? "_blank"
                    : undefined
                }
                rel={
                  lead.estatus !== "CERRADO" && lead.whatsapp_link
                    ? "noopener noreferrer"
                    : undefined
                }
                onClick={(e) => e.stopPropagation()}
                className="hover:text-green-600 hover:underline truncate"
              >
                {lead.telefono || "Sin teléfono"}
              </a>
            </div>
            {lead.rif && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-450 text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded leading-none">
                  RIF
                </span>
                <span className="truncate text-zinc-500">{lead.rif}</span>
              </div>
            )}
            {(lead.ubicacionEstado || lead.ubicacionDetalle) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span className="truncate">
                  {lead.ubicacionEstado}
                  {lead.ubicacionDetalle ? ` (${lead.ubicacionDetalle})` : ""}
                </span>
              </div>
            )}
            {lead.categoriaInteres && (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-xs font-semibold truncate">
                  🎯 {lead.categoriaInteres}
                </span>
              </div>
            )}
            {lead.canalOrigen && (
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200">
                  {lead.canalOrigen}
                </span>
                {lead.campana && (
                  <span className="truncate italic text-zinc-400">
                    {lead.campana}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Notes Preview if available */}
          {lead.notas && (
            <div className="mt-2.5 p-2 bg-zinc-50 rounded-lg text-xs text-zinc-500 line-clamp-2 border border-zinc-100">
              <div className="flex items-start gap-1">
                <FileText className="w-3.5 h-3.5 text-zinc-400 mt-0.5 flex-shrink-0" />
                <p className="leading-relaxed italic">"{lead.notas}"</p>
              </div>
            </div>
          )}

          {/* Closed Leads Prominent Actions */}
          {lead.estatus === "CERRADO" &&
            (() => {
              let closedDaysPercentage = 0;
              let daysLeftStr = "";
              if (lead.fechaVenta) {
                const saleDate = new Date(lead.fechaVenta).getTime();
                if (!isNaN(saleDate)) {
                  const elapsedMs = new Date().getTime() - saleDate;
                  const elapsedDays = Math.max(
                    0,
                    elapsedMs / (1000 * 60 * 60 * 24),
                  );
                  closedDaysPercentage = Math.min(
                    100,
                    Math.max(0, (elapsedDays / 30) * 100),
                  );
                  const remainingDays = Math.max(0, 30 - elapsedDays);
                  daysLeftStr =
                    remainingDays > 0
                      ? `${Math.ceil(remainingDays)}d restantes`
                      : "Expiró (30 días)";
                }
              }
              return (
                <div className="mt-2.5 flex flex-col gap-1.5 p-2 bg-zinc-50 border border-zinc-200/60 rounded-lg">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-zinc-500">Estado Cierre:</span>
                    <span
                      className={
                        lead.motivoCierre === "GANADO" ||
                        lead.motivoCierre === "VENTA"
                          ? "text-emerald-700 font-extrabold uppercase bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[9px]"
                          : "text-red-600 font-extrabold uppercase bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-[9px]"
                      }
                    >
                      {lead.motivoCierre === "GANADO" ||
                      lead.motivoCierre === "VENTA"
                        ? "GANADO"
                        : "PERDIDO"}
                    </span>
                  </div>
                  {lead.numFactura && (
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Factura:{" "}
                      <span className="font-semibold text-zinc-700">
                        {lead.numFactura}
                      </span>
                    </div>
                  )}

                  {/* Progress bar */}
                  {lead.fechaVenta && (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center justify-between text-[9px] text-zinc-400 font-medium font-mono">
                        <span>Vida en Cerrado:</span>
                        <span>
                          {daysLeftStr} ({Math.round(closedDaysPercentage)}%)
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            closedDaysPercentage > 85
                              ? "bg-red-500"
                              : closedDaysPercentage > 50
                                ? "bg-amber-500"
                                : "bg-blue-600"
                          }`}
                          style={{ width: `${closedDaysPercentage}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-1 border-t border-zinc-200/40 pt-1.5">
                    {lead.estatus === "CERRADO" &&
                      (lead.motivoCierre === "GANADO" ||
                        lead.motivoCierre === "VENTA") &&
                      onSecondPurchase && (
                        <button
                          type="button"
                          onClick={() => onSecondPurchase(lead)}
                          disabled={isUpdating}
                          className="flex-1 py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] rounded shadow-xs focus:outline-none transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                        >
                          <span>🛍️ Segunda Compra</span>
                        </button>
                      )}
                  </div>
                </div>
              );
            })()}

          {/* Observaciones vendedor */}
          <div className="mt-2.5">
            <textarea
              value={obsValue}
              onChange={(e) => setObsValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => onSaveObservaciones?.(lead.id, obsValue)}
              placeholder="Observaciones..."
              rows={2}
              className="w-full text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-zinc-300"
            />
          </div>

          {/* Divider */}
          <div className="h-px bg-zinc-100 my-2.5" />

          {/* Bottom Row - Badges & Local Actions */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              {formattedValue && (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100">
                  <DollarSign className="w-3 h-3 -ml-0.5" />
                  {formattedValue}
                </span>
              )}
              {lead.vendedor && (
                <span
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-zinc-650 bg-zinc-100 border border-zinc-200/60"
                  title={`Vendedor: ${lead.vendedor}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  {lead.vendedor}
                </span>
              )}
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                <Clock className="w-3 h-3" />
                {creationDate}
              </span>
            </div>

            <div
              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {onCloseLead &&
                lead.estatus !== "CERRADO" &&
                userRole === "ADMIN" &&
                (() => {
                  const isCloseAllowed = lead.estatus !== "NUEVO";
                  return (
                    <button
                      onClick={() => {
                        if (isCloseAllowed) onCloseLead(lead);
                      }}
                      disabled={isUpdating || !isCloseAllowed}
                      className={`p-1 rounded-md transition-colors ${
                        isCloseAllowed
                          ? "text-zinc-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                          : "text-zinc-300 bg-zinc-50 opacity-50 cursor-not-allowed"
                      }`}
                      title={
                        isCloseAllowed
                          ? "Cerrar Lead (Venta / No Responde)"
                          : "No puedes cerrar un lead en estado NUEVO"
                      }
                      aria-label="Cerrar Lead"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  );
                })()}
              {userRole === "ADMIN" && (
                <button
                  onClick={() => onEdit(lead)}
                  disabled={isUpdating}
                  className="p-1 text-zinc-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                  title="Editar Lead"
                  aria-label="Editar"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {onTransfer &&
                !(
                  lead.estatus === "CERRADO" && lead.motivoCierre !== "ABANDONO"
                ) && (
                  <div className="relative" ref={transferMenuRef}>
                    <button
                      onClick={() => setIsTransferOpen(!isTransferOpen)}
                      className={`p-1 rounded-md transition-colors ${
                        isTransferOpen
                          ? "text-blue-700 bg-blue-50"
                          : "text-zinc-500 hover:text-blue-700 hover:bg-blue-50"
                      }`}
                      title="Transferir Lead"
                    >
                      <Users2 className="w-3.5 h-3.5" />
                    </button>
                    {isTransferOpen && (
                      <div className="absolute right-0 bottom-full mb-2 bg-white border border-zinc-200 rounded-lg shadow-lg p-2 w-48 z-50 max-h-48 overflow-y-auto">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">
                          Transferir a:
                        </p>
                        {vendorList
                          .filter((v) => v !== lead.vendedor)
                          .map((v) => (
                            <button
                              key={v}
                              onClick={() => {
                                onTransfer!(lead, v);
                                setIsTransferOpen(false);
                              }}
                              className="block w-full text-left px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 rounded-md"
                            >
                              {v}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              {userRole === "ADMIN" && (
                <button
                  onClick={() => onDelete(lead.id)}
                  disabled={isUpdating}
                  className="p-1 text-zinc-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                  title="Eliminar Lead"
                  aria-label="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sync Status Banner */}
        {isUpdating && (
          <div className="flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-550 text-white rounded-b-xl text-[11px] font-medium leading-none animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Sincronizando con n8n...</span>
          </div>
        )}
      </div>
    </>
  );
};
