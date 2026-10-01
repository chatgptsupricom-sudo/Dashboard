// "use client";
// import { motion } from "framer-motion";
// import { Calendar, Clock, MessageSquare, User } from "lucide-react";
// import { useState } from "react";

// export default function KanbanCard({
//   act,
//   onUpdateObservation,
//   onStatusChange,
// }) {
//   const [isNoteOpen, setIsNoteOpen] = useState(false);

//   // Función para formatear fechas a algo limpio (ej: 19 Jun, 2026)
//   const formatDate = (dateString: string) => {
//     if (!dateString) return "N/A";
//     return new Date(dateString).toLocaleDateString("es-ES", {
//       day: "numeric",
//       month: "short",
//       year: "numeric",
//     });
//   };

//   return (
//     <motion.div
//       layoutId={act.id} // Para animaciones suaves
//       draggable
//       onDragStart={(e: any) => e.dataTransfer.setData("id", act.id)}
//       className={`p-4 bg-white rounded-2xl shadow-sm border border-slate-200 transition-all group
//         ${act.status === "culminated" ? "cursor-not-allowed opacity-90" : "cursor-grab active:cursor-grabbing hover:border-blue-400"}`}
//     >
//       <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 transition-all group">
//         <div className="flex justify-between items-start mb-3">
//           <p className="text-sm font-bold text-slate-800 leading-snug">
//             {act.title}
//           </p>
//           <button
//             onClick={() => setIsNoteOpen(!isNoteOpen)}
//             className={`p-1.5 rounded-lg hover:bg-slate-100 ${act.observacion ? "text-blue-500 bg-blue-50" : "text-slate-300"}`}
//           >
//             <MessageSquare size={16} />
//           </button>
//         </div>

//         {/* Etiquetas de Trazabilidad Detalladas */}
//         <div className="space-y-2">
//           <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
//             <User size={12} className="text-slate-400" />
//             <div className="flex flex-col">
//               <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
//                 Actividad de:
//               </span>
//               {/* Cambiamos act.user_email por el nuevo campo user_name_display */}
//               <span className="text-[10px] font-bold text-slate-700">
//                 {act.user_name_display || "Usuario no asignado"}
//               </span>
//             </div>
//           </div>

//           <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
//             <User size={12} className="text-blue-400" />
//             <div className="flex flex-col">
//               <span className="text-[8px] font-black text-blue-400 uppercase tracking-wider">
//                 Asignado por:
//               </span>
//               <span className="text-[10px] font-bold text-slate-700">
//                 {act.assigned_by || "No especificado"}
//               </span>
//             </div>
//           </div>
//           <div className="grid grid-cols-2 gap-2 mt-2">
//             <div className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
//               <Calendar size={10} className="text-slate-400" />
//               <div className="flex flex-col">
//                 <span className="text-[8px] font-black text-slate-400 uppercase">
//                   Creada:
//                 </span>
//                 <span className="text-[10px] font-bold text-slate-700">
//                   {formatDate(act.created_at)}
//                 </span>
//               </div>
//             </div>

//             <div className="flex items-center gap-1 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-100">
//               <Clock size={10} className="text-amber-600" />
//               <div className="flex flex-col">
//                 <span className="text-[8px] font-black text-amber-600 uppercase">
//                   Culminación:
//                 </span>
//                 <span className="text-[10px] font-bold text-amber-700">
//                   {formatDate(act.due_date)}
//                 </span>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Campo de observación */}
//         {isNoteOpen && (
//           <textarea
//             autoFocus
//             defaultValue={act.observacion || ""}
//             onBlur={(e) => onUpdateObservation(act.id, e.target.value)}
//             placeholder="Escribir observación..."
//             className="w-full mt-3 p-2 text-xs text-slate-600 bg-slate-50 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
//             rows={3}
//           />
//         )}
//       </div>
//     </motion.div>
//   );
// }
"use client";
import { motion } from "framer-motion";
import { Calendar, Clock, Edit2, MessageSquare, User } from "lucide-react";
import { useState } from "react";

export default function KanbanCard({
  act,
  onUpdateObservation, // <--- AÑADIDO AQUÍ
  onStatusChange,
  onEdit,
}) {
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const isUrgent =
    act.status !== "culminated" &&
    act.days_left !== null &&
    act.days_left <= 3 &&
    act.days_left >= 0;

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <motion.div
      // 1. ELIMINA O COMENTA ESTA LÍNEA:
      // layoutId={act.id}

      // 2. Si quieres mantener animaciones al aparecer/desaparecer,
      // pero no al moverse de columna, usa 'layout' solo si es necesario,
      // o simplemente quita la propiedad de animación de layout:
      layout={false}
      draggable
      onDragStart={(e: any) => e.dataTransfer.setData("id", act.id)}
      className={`...`}
    >
      <div
        className={`p-4 bg-white rounded-2xl shadow-sm border-2 transition-all
        ${isUrgent ? "border-red-500 ring-2 ring-red-100" : "border-slate-200 hover:border-blue-400"}`}
      >
        {/* Alerta de urgencia */}
        {isUrgent && (
          <div className="flex items-center gap-1 text-red-600 text-[10px] font-black uppercase mb-3 bg-red-50 p-2 rounded-lg animate-pulse">
            <span role="img" aria-label="warning">
              ⚠️
            </span>
            Vence en {act.days_left === 0 ? "hoy" : `${act.days_left} días`}
          </div>
        )}
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-col">
            {/* Título */}
            <p className="text-sm font-bold text-slate-800 leading-snug">
              {act.title || "Sin título"}
            </p>

            {/* Descripción */}
            {act.description && (
              <p className="text-xs text-slate-500 mt-1 italic">
                {act.description}
              </p>
            )}
          </div>

          <div className="flex gap-1">
            {/* 3. Conectado a la prop onEdit */}
            <button
              onClick={() => onEdit(act)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Edit2 size={16} />
            </button>

            <button
              onClick={() => setIsNoteOpen(!isNoteOpen)}
              className={`p-1.5 rounded-lg hover:bg-slate-100 ${act.observacion ? "text-blue-500 bg-blue-50" : "text-slate-300"}`}
            >
              <MessageSquare size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {/* Actividad de */}
          <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
            <User size={12} className="text-slate-400" />
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                Actividad de:
              </span>
              <span className="text-[10px] font-bold text-slate-700">
                {act.user_name_display || "Usuario no asignado"}
              </span>
            </div>
          </div>

          {/* ASIGNADO POR - VALIDACIÓN CONDICIONAL */}
          {act.assigned_by && (
            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
              <User size={12} className="text-blue-400" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-blue-400 uppercase tracking-wider">
                  Asignado por:
                </span>
                <span className="text-[10px] font-bold text-slate-700">
                  {act.assigned_by}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
              <Calendar size={10} className="text-slate-400" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-400 uppercase">
                  Creada:
                </span>
                <span className="text-[10px] font-bold text-slate-700">
                  {formatDate(act.created_at)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-100">
              <Clock size={10} className="text-amber-600" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-amber-600 uppercase">
                  Culminación:
                </span>
                <span className="text-[10px] font-bold text-amber-700">
                  {formatDate(act.due_date)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isNoteOpen && (
          <textarea
            autoFocus
            defaultValue={act.observacion || ""}
            onBlur={(e) => onUpdateObservation(act.id, e.target.value)}
            placeholder="Escribir observación..."
            className="w-full mt-3 p-2 text-xs text-slate-600 bg-slate-50 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
            rows={3}
          />
        )}
      </div>
    </motion.div>
  );
}
