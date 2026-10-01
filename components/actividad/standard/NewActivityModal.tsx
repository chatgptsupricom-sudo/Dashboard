// "use client";

// import { Button } from "@/components/ui/button";
// import {
//   Dialog,
//   DialogContent,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import { useAuthStore } from "@/lib/stores/auth.store"; // Importamos el store
// import { useState } from "react";

// export default function NewActivityModal({ isOpen, onClose, onSave }) {
//   const user = useAuthStore((state) => state.user); // Obtenemos el usuario del token
//   const [formData, setFormData] = useState({
//     user_id: user?.id || "", // Ya lo dejamos pre-cargado
//     title: "",
//     due_date: "",
//     description: "",
//   });

//   // Dentro de NewActivityModal.tsx
//   const handleSubmit = async () => {
//     // Eliminamos cualquier campo undefined antes de enviar
//     const cleanData = {
//       user_id: formData.user_id || null,
//       title: formData.title || null,
//       due_date: formData.due_date || null,
//       description: formData.description || null,
//       assigned_by: null, // El backend lo manejará
//     };

//     await onSave(cleanData);
//     onClose();
//   };

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose}>
//       <DialogContent className="sm:max-w-[450px] p-6">
//         <DialogHeader className="mb-4">
//           <DialogTitle className="text-xl font-semibold">
//             Nueva Actividad
//           </DialogTitle>
//           <p className="text-sm text-slate-500">
//             Registra una tarea para tu flujo personal.
//           </p>
//         </DialogHeader>

//         <div className="grid gap-5">
//           <div className="grid gap-2">
//             <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
//               Título
//             </Label>
//             <Input
//               className="bg-slate-50 border-slate-200"
//               placeholder="¿Qué necesitas hacer?"
//               onChange={(e) =>
//                 setFormData({ ...formData, title: e.target.value })
//               }
//             />
//           </div>

//           <div className="grid gap-2">
//             <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
//               Fecha límite
//             </Label>
//             <Input
//               type="date"
//               className="bg-slate-50 border-slate-200"
//               onChange={(e) =>
//                 setFormData({ ...formData, due_date: e.target.value })
//               }
//             />
//           </div>

//           <div className="grid gap-2">
//             <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
//               Descripción
//             </Label>
//             <Textarea
//               className="bg-slate-50 border-slate-200 min-h-[100px]"
//               placeholder="Detalles de la tarea..."
//               onChange={(e) =>
//                 setFormData({ ...formData, description: e.target.value })
//               }
//             />
//           </div>
//         </div>

//         <DialogFooter className="mt-6 gap-2">
//           <Button variant="ghost" onClick={onClose} className="text-slate-600">
//             Cancelar
//           </Button>
//           <Button
//             onClick={handleSubmit}
//             className="bg-slate-900 hover:bg-slate-800 text-white px-6"
//           >
//             Guardar tarea
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// }
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useState } from "react";

export default function NewActivityModal({ isOpen, onClose, onSave }) {
  const user = useAuthStore((state) => state.user);
  const [formData, setFormData] = useState({
    user_id: user?.id || "",
    title: "",
    due_date: "",
    description: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    // 1. Validación de campos requeridos
    if (!formData.title.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    // Nueva validación para descripción
    if (!formData.description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }

    if (!formData.due_date) {
      setError("La fecha de culminación es obligatoria.");
      return;
    }

    // 2. Validación de fecha
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(formData.due_date);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      setError("La fecha no puede ser del pasado.");
      return;
    }

    setError("");
    const cleanData = {
      user_id: formData.user_id || null,
      title: formData.title,
      due_date: formData.due_date,
      description: formData.description, // Ya no necesita el || null porque validamos antes
      assigned_by: null,
    };

    await onSave(cleanData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[450px] p-6"
        aria-describedby="new-activity-desc"
      >
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">
            Nueva Actividad
          </DialogTitle>
          <p id="new-activity-desc" className="text-sm text-slate-500">
            Registra una tarea para tu flujo personal.
          </p>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Título *
            </Label>
            <Input
              className="bg-slate-50 border-slate-200"
              placeholder="¿Qué necesitas hacer?"
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Fecha límite *
            </Label>
            <Input
              type="date"
              className="bg-slate-50 border-slate-200"
              // Usamos min attribute nativo para que el usuario no pueda seleccionar el pasado fácilmente
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
            />
          </div>

          {/* Mostrar mensaje de error */}
          {error && <p className="text-xs font-bold text-red-500">{error}</p>}

          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Descripción
            </Label>
            <Textarea
              className="bg-slate-50 border-slate-200 min-h-[100px]"
              placeholder="Detalles de la tarea..."
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" onClick={onClose} className="text-slate-600">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-slate-900 hover:bg-slate-800 text-white px-6"
          >
            Guardar tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
