import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export default function EditActivityModal({
  isOpen,
  activity,
  onClose,
  onSave, // Mantenemos el callback por si tu vista padre necesita refrescar la UI localmente
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    observacion: "",
    due_date: "",
  });

  // 🔄 Sincroniza el estado interno cada vez que se selecciona una actividad o se abre el modal
  useEffect(() => {
    if (activity) {
      setFormData({
        title: activity.title || "",
        description: activity.description || "",
        observacion: activity.observacion || "",
        due_date: activity.due_date
          ? new Date(activity.due_date).toISOString().split("T")[0]
          : "",
      });
    }
  }, [activity, isOpen]);

  if (!isOpen) return null;

  // 🚀 Manejo del envío directo a la API Dedicada
  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert("El título es obligatorio.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/activities/edit", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: activity.id, // Pasamos el ID que la API requiere obligatoriamente
          ...formData, // Enviamos el título, descripción, observación y due_date
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al actualizar");
      }

      const data = await response.json();
      if (data.success) {
        // Ejecutamos el callback opcional del padre para refrescar listas y cerramos modal
        if (onSave) onSave();
        onClose();
      }
    } catch (error: any) {
      console.error("Error al guardar actividad:", error);
      alert(error.message || "No se pudieron guardar los cambios.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-base font-semibold text-slate-900">
            Editar Actividad
          </h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Título
            </label>
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
              value={formData.title}
              disabled={isSaving}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          {/* Campo Descripción */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Descripción
            </label>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[80px] disabled:opacity-60"
              value={formData.description}
              disabled={isSaving}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Fecha Límite
            </label>
            <input
              type="date"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
              value={formData.due_date}
              disabled={isSaving}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
            />
          </div>

          {/* Campo Observación */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Observación
            </label>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[80px] disabled:opacity-60"
              value={formData.observacion}
              disabled={isSaving}
              onChange={(e) =>
                setFormData({ ...formData, observacion: e.target.value })
              }
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-600 hover:text-slate-900"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6 disabled:bg-slate-400"
          >
            {isSaving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
