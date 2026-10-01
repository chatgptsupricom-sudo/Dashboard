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
// import { useState } from "react";

// export default function AssignActivityModal({
//   isOpen,
//   onClose,
//   onSave,
//   users,
//   adminName,
// }) {
//   const [formData, setFormData] = useState({
//     user_id: "",
//     title: "",
//     due_date: "",
//     description: "",
//   });

//   // Lógica para agrupar usuarios exactamente igual al filtro principal
//   const groupedUsers = users?.reduce((acc: any, user: any) => {
//     const cidsName =
//       user.cids_name ||
//       (user.role_name === "Super Admin" ? "🛡️ SuperAdmin" : "Sin Empresa");
//     const roleName = user.role_name || "Sin Rol";

//     if (!acc[cidsName]) acc[cidsName] = {};
//     if (!acc[cidsName][roleName]) acc[cidsName][roleName] = [];

//     acc[cidsName][roleName].push(user);
//     return acc;
//   }, {});

//   const handleSubmit = async () => {
//     // Enviamos el nombre del administrador para que quede registrado en assigned_by
//     await onSave({ ...formData, assigned_by: adminName });
//     onClose();
//   };

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose}>
//       <DialogContent className="sm:max-w-[450px] p-6">
//         <DialogHeader className="mb-4">
//           <DialogTitle className="text-xl font-semibold">
//             Asignar Actividad
//           </DialogTitle>
//           <p className="text-sm text-slate-500">
//             Selecciona un usuario y define la tarea.
//           </p>
//         </DialogHeader>

//         <div className="grid gap-5">
//           {/* Campo Usuario Agrupado */}
//           <div className="grid gap-2">
//             <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
//               Asignar a
//             </Label>
//             <select
//               className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-900 transition-all"
//               onChange={(e) =>
//                 setFormData({ ...formData, user_id: e.target.value })
//               }
//             >
//               <option value="">Seleccionar vendedor...</option>
//               {groupedUsers &&
//                 Object.entries(groupedUsers).map(([empresa, roles]: any) => (
//                   <optgroup key={empresa} label={`🏢 ${empresa}`}>
//                     {Object.entries(roles).map(([rol, usersList]: any) =>
//                       usersList.map((u: any) => (
//                         <option key={u.id} value={u.id}>
//                           {` └─ [${rol}] ${u.name}`}
//                         </option>
//                       )),
//                     )}
//                   </optgroup>
//                 ))}
//             </select>
//           </div>

//           {/* Resto de campos (Título, Fecha, Descripción igual que antes) */}
//           <div className="grid gap-2">
//             <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
//               Título
//             </Label>
//             <Input
//               className="bg-slate-50 border-slate-200"
//               placeholder="Ej: Seguimiento cliente X"
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
//               placeholder="Detalles..."
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
//             className="bg-blue-600 hover:bg-blue-700 text-white px-6"
//           >
//             Asignar tarea
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
import { useAuthStore } from "@/lib/stores/auth.store"; // Importamos tu store
import { useState } from "react";

export default function AssignActivityModal({
  isOpen,
  onClose,
  onSave,
  users, // Lista completa desde la props
  adminName,
}: any) {
  const { user: currentUser } = useAuthStore();
  const today = new Date().toISOString().split("T")[0];
  const [formData, setFormData] = useState({
    user_id: "",
    title: "",
    due_date: "",
    description: "",
  });

  const filteredUsers = users?.filter((u: any) => {
    if (currentUser?.role === "superAdmin") return true;
    return Number(u.cids) === Number(currentUser?.cids);
  });

  // Lógica de agrupación idéntica a ContextSelector
  const groupedUsers = filteredUsers?.reduce((acc: any, u: any) => {
    const cidsName = u.cids_name || "Sin Empresa";
    const roleName = u.role_name || "Sin Rol";

    if (!acc[cidsName]) acc[cidsName] = {};
    if (!acc[cidsName][roleName]) acc[cidsName][roleName] = [];

    acc[cidsName][roleName].push(u);
    return acc;
  }, {});

  const handleSubmit = async () => {
    if (formData.due_date && formData.due_date < today) {
      alert("La fecha límite no puede ser anterior a hoy.");
      return;
    }

    if (!formData.user_id || !formData.title) {
      alert("Por favor completa los campos obligatorios.");
      return;
    }

    await onSave({ ...formData, assigned_by: adminName });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">
            Asignar Actividad
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Selecciona un usuario y define la tarea.
          </p>
        </DialogHeader>

        <div className="grid gap-5">
          {/* Selector con la misma lógica de renderizado que ContextSelector */}
          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Asignar a
            </Label>
            <select
              className="p-2 border rounded-xl text-sm w-full outline-none bg-slate-50"
              value={formData.user_id}
              onChange={(e) =>
                setFormData({ ...formData, user_id: e.target.value })
              }
            >
              <option value="">Seleccionar vendedor...</option>
              {groupedUsers &&
                Object.entries(groupedUsers).map(([empresa, roles]: any) => (
                  <optgroup key={empresa} label={`🏢 ${empresa}`}>
                    {Object.entries(roles).map(([rol, usersList]: any) =>
                      usersList.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {`└─ [${rol}] ${u.name}`}
                        </option>
                      )),
                    )}
                  </optgroup>
                ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Título
            </Label>
            <Input
              className="bg-slate-50 border-slate-200"
              placeholder="Ej: Seguimiento cliente X"
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Fecha límite
            </Label>
            <Input
              type="date"
              min={today} // <--- ESTO DESHABILITA LAS FECHAS ANTERIORES
              value={formData.due_date}
              className="bg-slate-50 border-slate-200"
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Descripción
            </Label>
            <Textarea
              className="bg-slate-50 border-slate-200 min-h-[100px]"
              placeholder="Detalles..."
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
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            Asignar tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
