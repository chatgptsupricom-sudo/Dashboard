// "use client";
// import { AnimatePresence, motion } from "framer-motion";
// import {
//   ChevronLeft,
//   ChevronRight,
//   Code2,
//   FileSearch,
//   Megaphone,
//   Palette,
//   Shield,
//   Target,
// } from "lucide-react";
// import { useState } from "react";
// import useSWR from "swr";

// const fetcher = (url: string) => fetch(url).then((res) => res.json());
// const roleIcons: Record<string, any> = {
//   superAdmin: Shield,
//   marketingManagement: Megaphone,
//   brandManagement: Palette,
//   marketing: Target,
//   programmers: Code2,
//   audit: FileSearch,
// };

// export default function SuperAdminActivities() {
//   const [view, setView] = useState("ROLES");
//   const [selectedRole, setSelectedRole] = useState(null);
//   const [selectedUser, setSelectedUser] = useState(null);

//   return (
//     <div className="max-w-5xl mx-auto p-8">
//       {/* Breadcrumbs */}
//       {view !== "ROLES" && (
//         <button
//           onClick={() => setView(view === "ACTIVITIES" ? "USERS" : "ROLES")}
//           className="mb-6 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
//         >
//           <ChevronLeft size={16} /> Volver
//         </button>
//       )}

//       <AnimatePresence mode="wait">
//         {view === "ROLES" && (
//           <RoleView
//             key="roles"
//             onSelect={(role) => {
//               setSelectedRole(role);
//               setView("USERS");
//             }}
//           />
//         )}
//         {view === "USERS" && (
//           <UserView
//             key="users"
//             role={selectedRole}
//             onSelect={(user) => {
//               setSelectedUser(user);
//               setView("ACTIVITIES");
//             }}
//           />
//         )}
//         {view === "ACTIVITIES" && (
//           <ActivityDetailView key="activities" user={selectedUser} />
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // --- SUB-COMPONENTES (Los puedes separar en archivos distintos) ---

// function RoleView({ onSelect }) {
//   const { data: roles } = useSWR("/api/superadmin/roles", fetcher);

//   return (
//     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//       {roles?.map((role: any) => {
//         const Icon = roleIcons[role.name] || Shield;
//         return (
//           <div
//             key={role.id}
//             onClick={() => onSelect(role)}
//             /* 'group' permite activar el efecto en los hijos, 'relative' es obligatorio para el absolute del hijo */
//             className="group relative flex flex-col p-8 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 cursor-pointer overflow-hidden"
//           >
//             {/* Icono */}
//             <div className="mb-6 inline-flex p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 w-fit">
//               <Icon size={22} strokeWidth={2.5} />
//             </div>

//             {/* Contenido */}
//             <div className="mt-auto">
//               <h2 className="text-lg font-black text-slate-800 tracking-tight">
//                 {role.display_name}
//               </h2>
//               <p className="text-xs text-slate-400 font-medium mt-1">
//                 Gestionar acceso y usuarios
//               </p>
//             </div>

//             {/* EL EFECTO DE LÍNEA QUE PEDISTE */}
//             <div className="absolute bottom-0 left-0 h-1 w-0 bg-blue-600 transition-all duration-500 group-hover:w-full" />

//             {/* Indicador de flecha opcional */}
//             <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-blue-600">
//               <ChevronRight size={20} />
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }

// function UserView({ role, onSelect }) {
//   const { data } = useSWR(`/api/superadmin/users?roleId=${role.id}`, fetcher);
//   const users = Array.isArray(data?.users)
//     ? data.users.filter((u: any) => u.panelRoleName === role.name)
//     : [];

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       className="max-w-2xl mx-auto space-y-4"
//     >
//       <div className="mb-8">
//         <h2 className="text-3xl font-black text-slate-800">
//           Usuarios: {role.display_name}
//         </h2>
//         <p className="text-slate-400 text-sm mt-1">
//           Selecciona un usuario para gestionar sus actividades.
//         </p>
//       </div>

//       {users.map((user: any) => (
//         <div
//           key={user.id}
//           onClick={() => onSelect(user)}
//           className="group flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
//         >
//           <div className="flex items-center gap-4">
//             <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500">
//               {user.name.charAt(0)}
//             </div>
//             <div>
//               <p className="font-bold text-slate-800">{user.name}</p>
//               <p className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
//                 {user.email}
//               </p>
//             </div>
//           </div>
//           <div className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 font-bold text-xs">
//             Seleccionar →
//           </div>
//         </div>
//       ))}
//     </motion.div>
//   );
// }

// function ActivityDetailView({ user }) {
//   const { data: activities, mutate } = useSWR(
//     user ? `/api/superadmin/activities?email=${user.email}` : null,
//     fetcher,
//   );

//   const handleDrop = async (e: React.DragEvent, newStatus: string) => {
//     const id = e.dataTransfer.getData("activityId");
//     mutate(
//       activities.map((a: any) =>
//         a.id == id ? { ...a, status: newStatus } : a,
//       ),
//       false,
//     );

//     await fetch("/api/superadmin/activities", {
//       method: "PATCH",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ id, status: newStatus }),
//     });
//     mutate();
//   };

//   const sections = [
//     { id: "pending", label: "Pendientes", color: "text-amber-500" },
//     { id: "in-progress", label: "En Curso", color: "text-blue-500" },
//     { id: "culminated", label: "Culminadas", color: "text-emerald-500" },
//   ];

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       className="space-y-8"
//     >
//       {/* Encabezado del Usuario */}
//       <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
//         <div>
//           <h2 className="text-2xl font-black text-slate-800">{user.name}</h2>
//           <p className="text-sm text-slate-400 font-medium">{user.email}</p>
//         </div>
//         <button className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg">
//           + Nueva Actividad
//         </button>
//       </div>

//       {/* Tablero Kanban Premium */}
//       <div className="grid grid-cols-3 gap-6">
//         {sections.map((s) => (
//           <div
//             key={s.id}
//             className="bg-slate-50/50 p-5 rounded-3xl border border-slate-100 min-h-[600px] flex flex-col"
//             onDragOver={(e) => e.preventDefault()}
//             onDrop={(e) => handleDrop(e, s.id)}
//           >
//             {/* Título de columna centrado */}
//             <h3
//               className={`text-center font-black uppercase text-[11px] tracking-[0.2em] mb-6 ${s.color}`}
//             >
//               {s.label}
//             </h3>

//             <div className="flex-1 space-y-3">
//               {activities
//                 ?.filter((a: any) => a.status === s.id)
//                 .map((act: any) => (
//                   <motion.div
//                     layoutId={act.id}
//                     key={act.id}
//                     draggable
//                     onDragStart={(e) =>
//                       e.dataTransfer.setData("activityId", act.id)
//                     }
//                     className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100 hover:border-blue-200 cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
//                   >
//                     <p className="text-sm font-bold text-slate-700">
//                       {act.title}
//                     </p>
//                     <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">
//                       {act.type}
//                     </p>
//                   </motion.div>
//                 ))}
//             </div>
//           </div>
//         ))}
//       </div>
//     </motion.div>
//   );
// }
// app/[locale]/superadmin/actividad/page.tsx
import SuperAdminActivityView from "@/components/actividad/superadmin/ActivityView";

export default function Page() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-black mb-6">
        Panel de Actividades - SuperAdmin
      </h1>
      <SuperAdminActivityView />
    </div>
  );
}
