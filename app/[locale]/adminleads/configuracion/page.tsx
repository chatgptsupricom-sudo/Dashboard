"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Users,
  CreditCard,
  CheckCircle,
  Circle,
} from "lucide-react";
import { useEffect, useState } from "react";

const SEDE_NAMES: Record<number, string> = { 7: "Panama", 9: "Valencia", 10: "Caracas" };

const PRESET_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#6b7280",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#f97316",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

export default function ConfiguracionPage() {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#8b5cf6");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const [sellers, setSellers] = useState<any[]>([]);
  const [toggling, setToggling] = useState<number | null>(null);

  const [services, setServices] = useState<any[]>([]);
  const [editingService, setEditingService] = useState<number | null>(null);
  const [editServiceCost, setEditServiceCost] = useState("");
  const [editServiceDate, setEditServiceDate] = useState("");
  const [savingService, setSavingService] = useState(false);

  const [showAddSvc, setShowAddSvc] = useState(false);
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcType, setNewSvcType] = useState<"subscription" | "topup">("subscription");
  const [newSvcCost, setNewSvcCost] = useState("");
  const [creatingSvc, setCreatingSvc] = useState(false);

  const fetchSellers = () => {
    fetch("/api/adminleads/sellers")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setSellers(data));
  };

  const handleToggleActivo = async (seller: any) => {
    setToggling(seller.id);
    const newActivo = seller.activo ? 0 : 1;
    setSellers((prev) =>
      prev.map((s) => (s.id === seller.id ? { ...s, activo: newActivo } : s))
    );
    await fetch("/api/adminleads/sellers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: seller.id, activo: newActivo }),
    });
    setToggling(null);
  };

  const fetchStatuses = () => {
    fetch("/api/adminleads/statuses")
      .then((r) => r.json())
      .then(setStatuses);
  };

  useEffect(() => {
    fetchStatuses();
    fetchSellers();
    fetchServices();
  }, []);

  const fetchServices = () => {
    fetch("/api/adminleads/service-costs")
      .then((r) => r.json())
      .then((data) => Array.isArray(data.services) && setServices(data.services));
  };

  const handleUpdateService = async (svc: any) => {
    setSavingService(true);
    await fetch("/api/adminleads/service-costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: svc.id,
        monthly_cost: parseFloat(editServiceCost) || 0,
        payment_date: editServiceDate || null,
      }),
    });
    setEditingService(null);
    fetchServices();
    setSavingService(false);
  };

  const handleTogglePaidService = async (svc: any) => {
    await fetch("/api/adminleads/service-costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: svc.id, is_paid: !svc.is_paid }),
    });
    fetchServices();
  };

  const handleAddService = async () => {
    if (!newSvcName.trim()) return;
    setCreatingSvc(true);
    await fetch("/api/adminleads/service-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_name: newSvcName.trim(),
        cost_type: newSvcType,
        monthly_cost: parseFloat(newSvcCost) || 0,
      }),
    });
    setNewSvcName("");
    setNewSvcType("subscription");
    setNewSvcCost("");
    setShowAddSvc(false);
    fetchServices();
    setCreatingSvc(false);
  };

  const handleDeleteService = async (id: number) => {
    if (!confirm("Eliminar este servicio?")) return;
    await fetch(`/api/adminleads/service-costs?id=${id}`, { method: "DELETE" });
    fetchServices();
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/adminleads/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, color: newColor }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al crear estado");
    } else {
      setNewName("");
      fetchStatuses();
    }
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    const res = await fetch("/api/adminleads/statuses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else fetchStatuses();
  };

  const handleColorChange = async (id: number, color: string) => {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
    await fetch("/api/adminleads/statuses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, color }),
    });
  };

  const handleRename = async (id: number) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    await fetch("/api/adminleads/statuses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: trimmed }),
    });
    setEditingId(null);
    fetchStatuses();
  };

  const handleMove = async (id: number, direction: "up" | "down") => {
    const customs = statuses.filter((s) => !s.is_default);
    const idx = customs.findIndex((s) => s.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= customs.length) return;
    const swapWith = customs[swapIdx].id;
    await fetch("/api/adminleads/statuses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, swap_with: swapWith }),
    });
    fetchStatuses();
  };

  const customStatuses = statuses.filter((s) => !s.is_default);
  const defaultStatuses = statuses.filter((s) => s.is_default);
  const previewLabel = newName.toUpperCase().replace(/\s+/g, "_");

  return (
    <div className="min-h-screen bg-zinc-50/40 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Settings2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900">Configuración</h1>
            <p className="text-sm text-zinc-500">
              Gestiona los estados del pipeline de leads
            </p>
          </div>
        </div>

        {/* Pipeline visual */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-800">
                Estados del Pipeline
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {statuses.length} estados en total
              </p>
            </div>
            {/* Mini pipeline preview */}
            <div className="hidden md:flex items-center gap-1.5">
              {statuses.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {i < statuses.length - 1 && (
                    <div className="h-px w-4 bg-zinc-200" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Default statuses */}
          {defaultStatuses.length > 0 && (
            <div className="px-6 pt-4 pb-2">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                Predeterminados
              </p>
              <div className="space-y-2">
                {defaultStatuses.map((status) => (
                  <div
                    key={status.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-100"
                  >
                    <Lock className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="text-sm font-bold text-zinc-600 tracking-wide">
                      {status.name}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
                      bloqueado
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider if both sections exist */}
          {defaultStatuses.length > 0 && customStatuses.length > 0 && (
            <div className="mx-6 my-3 border-t border-dashed border-zinc-100" />
          )}

          {/* Custom statuses */}
          <div className="px-6 pt-2 pb-5">
            {customStatuses.length > 0 && (
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                Personalizados
              </p>
            )}
            <AnimatePresence>
              {customStatuses.map((status, customIdx) => (
                <motion.div
                  key={status.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-sm transition-all mb-2"
                >
                  {/* Grip + order */}
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleMove(status.id, "up")}
                      disabled={customIdx === 0}
                      className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <GripVertical className="w-3 h-3 text-zinc-200" />
                    <button
                      onClick={() => handleMove(status.id, "down")}
                      disabled={customIdx === customStatuses.length - 1}
                      className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Color picker swatch */}
                  <label
                    className="relative h-8 w-8 rounded-xl cursor-pointer shrink-0 group/swatch"
                    title="Cambiar color"
                    style={{ backgroundColor: status.color }}
                  >
                    <input
                      type="color"
                      value={status.color}
                      onChange={(e) =>
                        handleColorChange(status.id, e.target.value)
                      }
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover/swatch:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white/60 opacity-0 group-hover/swatch:opacity-100 transition-opacity" />
                    </div>
                  </label>

                  {/* Badge / inline edit */}
                  {editingId === status.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRename(status.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(status.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide text-white bg-transparent border-2 border-white/60 focus:outline-none focus:border-white w-40"
                      style={{ backgroundColor: status.color }}
                    />
                  ) : (
                    <span
                      className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide text-white shadow-sm cursor-pointer"
                      style={{ backgroundColor: status.color }}
                      title="Doble clic para editar"
                      onDoubleClick={() => {
                        setEditingId(status.id);
                        setEditingName(status.name);
                      }}
                    >
                      {status.name}
                    </span>
                  )}

                  <span className="flex-1" />

                  {/* Rename btn */}
                  <button
                    onClick={() => {
                      setEditingId(status.id);
                      setEditingName(status.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title="Renombrar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(status.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {customStatuses.length === 0 && (
              <p className="text-sm text-zinc-300 text-center py-4">
                Aún no hay estados personalizados
              </p>
            )}
          </div>
        </div>

        {/* Crear nuevo estado */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-blue-50 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <h2 className="text-sm font-bold text-zinc-800">Nuevo Estado</h2>
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">
              Nombre del estado
            </label>
            <input
              type="text"
              placeholder="Ej: EN NEGOCIACIÓN"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full px-4 py-2.5 rounded-2xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-8 h-8 rounded-xl border-2 transition-all hover:scale-110 ${
                    newColor === c
                      ? "border-zinc-800 scale-110 shadow-md"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label
                className="w-8 h-8 rounded-xl border-2 border-dashed border-zinc-300 hover:border-zinc-400 cursor-pointer flex items-center justify-center transition-colors relative"
                title="Color personalizado"
              >
                <span className="text-[10px] font-bold text-zinc-400">#</span>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Preview */}
          <AnimatePresence>
            {newName && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-100"
              >
                <span className="text-xs text-zinc-400 font-medium">
                  Vista previa
                </span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide text-white shadow-sm"
                  style={{ backgroundColor: newColor }}
                >
                  {previewLabel}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <p className="text-xs text-red-500 font-medium bg-red-50 px-3 py-2 rounded-xl">
              {error}
            </p>
          )}

          <button
            onClick={handleAdd}
            disabled={!newName.trim() || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:shadow-blue-200"
          >
            <Plus className="w-4 h-4" />
            {loading ? "Creando..." : "Crear Estado"}
          </button>
        </div>

        {/* Sección Vendedores */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-50 flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-800">Vendedores</h2>
              <p className="text-xs text-zinc-400">
                Activa o desactiva el acceso de cada vendedor
              </p>
            </div>
            <span className="ml-auto text-xs font-semibold text-zinc-400">
              {sellers.filter((s) => s.activo).length} activos de {sellers.length}
            </span>
          </div>

          {sellers.length === 0 ? (
            <p className="text-sm text-zinc-300 text-center py-8">
              Cargando vendedores...
            </p>
          ) : (
            <div className="divide-y divide-zinc-50">
              {Object.entries(
                sellers.reduce((acc: Record<string, any[]>, s) => {
                  const sede = SEDE_NAMES[s.cids] ?? `Sede ${s.cids}`;
                  if (!acc[sede]) acc[sede] = [];
                  acc[sede].push(s);
                  return acc;
                }, {})
              ).map(([sede, sedeVendedores]) => (
                <div key={sede}>
                  <p className="px-6 pt-4 pb-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {sede}
                  </p>
                  {sedeVendedores.map((seller) => (
                    <div
                      key={seller.id}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center shrink-0">
                        <span className="text-xs font-black text-white">
                          {seller.name.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 truncate">
                          {seller.name}
                        </p>
                        {seller.whatsapp && (
                          <p className="text-xs text-zinc-400 truncate">
                            {seller.whatsapp}
                          </p>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          seller.activo
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-zinc-100 text-zinc-400"
                        }`}
                      >
                        {seller.activo ? "Activo" : "Inactivo"}
                      </span>

                      <button
                        onClick={() => handleToggleActivo(seller)}
                        disabled={toggling === seller.id}
                        className="relative shrink-0"
                        title={seller.activo ? "Desactivar vendedor" : "Activar vendedor"}
                      >
                        <div
                          className={`w-11 h-6 rounded-full transition-colors duration-200 ${
                            seller.activo ? "bg-emerald-500" : "bg-zinc-200"
                          } ${toggling === seller.id ? "opacity-50" : ""}`}
                        />
                        <div
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200 ${
                            seller.activo ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección Servicios */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-50 flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-800">Servicios</h2>
              <p className="text-xs text-zinc-400">
                Costos fijos mensuales y fechas de pago
              </p>
            </div>
            <button
              onClick={() => setShowAddSvc(!showAddSvc)}
              className="ml-auto flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              {showAddSvc ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {showAddSvc ? "Cancelar" : "Agregar Servicio"}
            </button>
          </div>

          {showAddSvc && (
            <div className="px-6 py-4 border-b border-zinc-50 bg-blue-50/30">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Nombre del servicio"
                  value={newSvcName}
                  onChange={(e) => setNewSvcName(e.target.value)}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <select
                  value={newSvcType}
                  onChange={(e) => setNewSvcType(e.target.value as "subscription" | "topup")}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="subscription">Mensual Fijo</option>
                  <option value="topup">Recarga / Prepago</option>
                </select>
                <input
                  type="number"
                  placeholder="Costo mensual $"
                  value={newSvcCost}
                  onChange={(e) => setNewSvcCost(e.target.value)}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleAddService}
                  disabled={creatingSvc || !newSvcName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creatingSvc ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}

          {services.length === 0 ? (
            <p className="text-sm text-zinc-300 text-center py-8">
              No hay servicios registrados
            </p>
          ) : (
            <div className="divide-y divide-zinc-50">
              {services.map((svc: any) => {
                const isEditing = editingService === svc.id;
                return (
                  <div
                    key={svc.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50 transition-colors group"
                  >
                    <button
                      onClick={() => handleTogglePaidService(svc)}
                      className="shrink-0"
                      title={svc.is_paid ? "Marcar como no pagado" : "Marcar como pagado"}
                    >
                      {svc.is_paid ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-zinc-300 hover:text-emerald-400" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-800">{svc.service_name}</p>
                      <p className="text-[10px] text-zinc-400">
                        {svc.cost_type === "subscription" ? "Mensual fijo" : "Recarga / Prepago"}
                      </p>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editServiceCost}
                          onChange={(e) => setEditServiceCost(e.target.value)}
                          className="w-24 px-2 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="Costo $"
                        />
                        <input
                          type="date"
                          value={editServiceDate}
                          onChange={(e) => setEditServiceDate(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => handleUpdateService(svc)}
                          disabled={savingService}
                          className="px-3 py-1.5 text-[10px] font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {savingService ? "..." : "Guardar"}
                        </button>
                        <button
                          onClick={() => setEditingService(null)}
                          className="px-2 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-zinc-600 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-zinc-800">
                          ${parseFloat(svc.monthly_cost || 0).toFixed(2)}
                        </span>
                        {svc.payment_date && (
                          <span className="text-[10px] text-zinc-400">
                            Vence: {new Date(svc.payment_date + "T00:00:00").toLocaleDateString("es-VE")}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingService(svc.id);
                            setEditServiceCost(String(svc.monthly_cost || 0));
                            setEditServiceDate(svc.payment_date || "");
                          }}
                          className="text-zinc-300 hover:text-blue-500 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteService(svc.id)}
                          className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Eliminar servicio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-400 text-center pb-4">
          Los estados predeterminados (NUEVO, CONTACTADO, CERRADO) no pueden
          eliminarse ni reordenarse. Los estados personalizados aparecerán en el
          kanban de monitoreo.
        </p>
      </div>
    </div>
  );
}
