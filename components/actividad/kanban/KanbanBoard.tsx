"use client";

import KanbanCard from "./KanbanCard";

export default function KanbanBoard({
  activities,
  userRole,
  onStatusChange,
  onUpdateObservation,
  onEdit,
}) {
  const columns = [
    { id: "pending", label: "PENDIENTES", color: "bg-amber-500" },
    { id: "in-progress", label: "EN CURSO", color: "bg-blue-600" },
    { id: "culminated", label: "CULMINADAS", color: "bg-emerald-600" },
  ];

  const safeActivities = Array.isArray(activities) ? activities : [];

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    const activityId = e.dataTransfer.getData("id");
    const activity = safeActivities.find((a) => a.id.toString() === activityId);

    if (!activity) return;

    // Validación de flujo de estados
    if (activity.status === "culminated" && targetStatus !== "culminated") {
      alert("Acción bloqueada: Esta actividad ya está culminada.");
      return;
    }

    if (activity.status === "pending" && targetStatus === "culminated") {
      alert("Acción bloqueada: Debes pasar por 'EN CURSO' primero.");
      return;
    }

    onStatusChange(activityId, targetStatus);
  };

  // Función para filtrar actividades con tolerancia a variaciones en la BD
  const filterByStatus = (act: any, colId: string) => {
    const s = act.status?.toLowerCase();
    if (colId === "pending") return s === "pending" || s === "pendiente";
    if (colId === "in-progress")
      return s === "in-progress" || s === "en curso" || s === "en-progreso";
    if (colId === "culminated")
      return s === "culminated" || s === "terminada" || s === "culminada";
    return false;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {columns.map((col) => (
        <div
          key={col.id}
          className="bg-slate-200/40 p-5 rounded-3xl min-h-[600px] flex flex-col border border-slate-200/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="flex items-center gap-3 text-[14px] font-black text-slate-800 uppercase tracking-widest">
              <span className={`w-3 h-3 rounded-full ${col.color}`} />
              {col.label}
            </h3>
            <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
              {safeActivities.filter((a) => filterByStatus(a, col.id)).length}
            </span>
          </div>

          <div className="flex-1 space-y-4 min-h-[100px]">
            {safeActivities
              .filter((a) => filterByStatus(a, col.id))
              .map((act) => (
                <KanbanCard
                  key={act.id}
                  act={act}
                  onUpdateObservation={onUpdateObservation}
                  onStatusChange={onStatusChange}
                  onEdit={onEdit}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
