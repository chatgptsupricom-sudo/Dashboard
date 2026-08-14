// // // // "use client";

// // // // import KanbanBoard from "@/components/actividad/kanban/KanbanBoard";
// // // // import AssignActivityModal from "@/components/actividad/standard/AssignActivityModal";
// // // // import EditActivityModal from "@/components/actividad/standard/EditActivityModal";
// // // // import NewActivityModal from "@/components/actividad/standard/NewActivityModal";
// // // // import ContextSelector from "@/components/actividad/superadmin/ContextSelector";
// // // // import { Button } from "@/components/ui/button";
// // // // import { useAuthStore } from "@/lib/stores/auth.store";
// // // // import { useRouter, useSearchParams } from "next/navigation";
// // // // import { useEffect, useMemo, useState } from "react";
// // // // import { io } from "socket.io-client";
// // // // import useSWR from "swr";

// // // // const PRIVILEGED_ROLES = [
// // // //   "superadmin",
// // // //   "gerente de operaciones",
// // // //   "gerencia de ventas",
// // // // ];

// // // // const fetcher = (url: string) => fetch(url).then((res) => res.json());

// // // // export default function ActivityView() {
// // // //   const user = useAuthStore((state) => state.user);
// // // //   const isLoading = useAuthStore((state) => state.isLoading);
// // // //   const searchParams = useSearchParams();
// // // //   const router = useRouter();

// // // //   const isPrivileged = useMemo(() => {
// // // //     if (!user?.role) return false;
// // // //     const normalizedRole = user.role.toLowerCase().trim();
// // // //     return PRIVILEGED_ROLES.includes(normalizedRole);
// // // //   }, [user]);

// // // //   const userId = searchParams.get("userId");

// // // //   // Redirección inicial
// // // //   useEffect(() => {
// // // //     if (!isLoading && user?.id && !userId) {
// // // //       router.replace(`/es/gestion/actividades?userId=${user.id}`);
// // // //     }
// // // //   }, [user, userId, router, isLoading]);

// // // //   // Cargamos usuarios (privilegiados)
// // // //   const { data: allUsers } = useSWR(
// // // //     isPrivileged ? "/api/superadmin/users-full" : null,
// // // //     fetcher,
// // // //   );

// // // //   // Cargamos actividades y declaramos 'mutate' para uso en Socket
// // // //   const { data: activities, mutate } = useSWR(
// // // //     userId ? `/api/activities?userId=${userId}` : null,
// // // //     fetcher,
// // // //     {
// // // //       dedupingInterval: 0, // No espera para volver a pedir datos
// // // //       revalidateOnFocus: true, // Refresca al volver a la pestaña
// // // //       revalidateIfStale: true,
// // // //     },
// // // //   );

// // // //   // Lógica de Socket.io para tiempo real
// // // //   useEffect(() => {
// // // //     const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL);

// // // //     socket.on("activity-updated", (data) => {
// // // //       console.log("Cambio detectado, actualizando SWR...", data);
// // // //       // El segundo parámetro { revalidate: true } fuerza la petición al servidor sí o sí
// // // //       mutate(undefined, { revalidate: true });
// // // //     });

// // // //     return () => {
// // // //       socket.disconnect();
// // // //     };
// // // //   }, [mutate]);

// // // //   const [isAddModalOpen, setIsAddModalOpen] = useState(false);
// // // //   const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
// // // //   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
// // // //   const [editingActivity, setEditingActivity] = useState<any>(null);

// // // //   if (isLoading || !user) return <div>Cargando actividades...</div>;

// // // //   const handleFilterChange = (newFilters: any) => {
// // // //     router.push(`/es/gestion/actividades?userId=${newFilters.userId}`);
// // // //   };

// // // //   const getAuthHeaders = () => {
// // // //     const token = document.cookie
// // // //       .split("; ")
// // // //       .find((row) => row.startsWith("token="))
// // // //       ?.split("=")[1];
// // // //     return {
// // // //       "Content-Type": "application/json",
// // // //       Authorization: token ? `Bearer ${token}` : "",
// // // //     };
// // // //   };

// // // //   return (
// // // //     <div className="space-y-6">
// // // //       {/* Encabezado Personalizado */}
// // // //       <div className="mb-8">
// // // //         <h1 className="text-3xl font-bold text-slate-900">
// // // //           Panel de actividades
// // // //         </h1>
// // // //         <p className="text-slate-500 mt-1">
// // // //           Bienvenido,{" "}
// // // //           <span className="font-semibold text-slate-700">{user?.name}</span> a
// // // //           tu panel de actividades, aquí podrás ver tu planificación y gestionar
// // // //           tus actividades.
// // // //         </p>
// // // //       </div>

// // // //       <div className="flex items-center justify-between">
// // // //         {isPrivileged && (
// // // //           <ContextSelector
// // // //             selectedUserId={userId || ""}
// // // //             onFilterChange={handleFilterChange}
// // // //           />
// // // //         )}

// // // //         <div className="flex gap-2">
// // // //           <Button
// // // //             onClick={() => setIsAddModalOpen(true)}
// // // //             className="bg-slate-900 text-white"
// // // //           >
// // // //             + Nueva Actividad
// // // //           </Button>

// // // //           {isPrivileged && (
// // // //             <Button
// // // //               onClick={() => setIsAssignModalOpen(true)}
// // // //               className="bg-blue-600 text-white"
// // // //             >
// // // //               Asignar
// // // //             </Button>
// // // //           )}
// // // //         </div>
// // // //       </div>

// // // //       <KanbanBoard
// // // //         activities={Array.isArray(activities) ? activities : []}
// // // //         userRole={user.role}
// // // //         onStatusChange={async (id: string, status: string) => {
// // // //           // 1. Actualización optimista: Actualiza el estado local inmediatamente
// // // //           const previousData = activities;
// // // //           mutate(
// // // //             activities.map((a: any) => (a.id === id ? { ...a, status } : a)),
// // // //             false, // false para no revalidar inmediatamente
// // // //           );

// // // //           // 2. Ejecuta el fetch real
// // // //           await fetch("/api/activities", {
// // // //             method: "PATCH",
// // // //             headers: getAuthHeaders(),
// // // //             body: JSON.stringify({ id, status }),
// // // //           });

// // // //           // 3. Revalida con el servidor
// // // //           mutate();
// // // //         }}
// // // //         onEdit={(act) => {
// // // //           setEditingActivity(act);
// // // //           setIsEditModalOpen(true);
// // // //         }} // Asegúrate de que esta línea exista y sea una función
// // // //         onUpdateObservation={async (id: string, observacion: string) => {
// // // //           await fetch("/api/activities", {
// // // //             method: "PATCH",
// // // //             headers: { "Content-Type": "application/json" },
// // // //             body: JSON.stringify({ id, observacion }),
// // // //           });
// // // //           mutate();
// // // //         }}
// // // //       />

// // // //       {/* Modales */}
// // // //       <NewActivityModal
// // // //         isOpen={isAddModalOpen}
// // // //         onClose={() => setIsAddModalOpen(false)}
// // // //         onSave={async (data: any) => {
// // // //           await fetch("/api/activities/newactivity", {
// // // //             method: "POST",
// // // //             headers: { "Content-Type": "application/json" },
// // // //             body: JSON.stringify({ ...data, user_email: user.email }),
// // // //           });
// // // //           mutate();
// // // //           setIsAddModalOpen(false);
// // // //         }}
// // // //       />

// // // //       {isPrivileged && (
// // // //         <AssignActivityModal
// // // //           isOpen={isAssignModalOpen}
// // // //           onClose={() => setIsAssignModalOpen(false)}
// // // //           users={allUsers}
// // // //           onSave={async (data: any) => {
// // // //             await fetch("/api/activities/assign", {
// // // //               method: "POST",
// // // //               headers: { "Content-Type": "application/json" },
// // // //               body: JSON.stringify({ ...data, assigned_by: user.name }),
// // // //             });
// // // //             mutate();
// // // //             setIsAssignModalOpen(false);
// // // //           }}
// // // //         />
// // // //       )}

// // // //       {isEditModalOpen && (
// // // //         <EditActivityModal
// // // //           isOpen={isEditModalOpen}
// // // //           activity={editingActivity}
// // // //           onClose={() => setIsEditModalOpen(false)}
// // // //           onSave={async (data: any) => {
// // // //             await fetch("/api/activities", {
// // // //               method: "PATCH",
// // // //               headers: { "Content-Type": "application/json" },
// // // //               body: JSON.stringify({ id: editingActivity.id, ...data }),
// // // //             });
// // // //             mutate();
// // // //             setIsEditModalOpen(false);
// // // //           }}
// // // //         />
// // // //       )}
// // // //     </div>
// // // //   );
// // // // }
// // // "use client";

// // // import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Asegúrate de tener este componente
// // // import { ActivityService } from "@/lib/actividades/apiService"; // Ruta de tu servicio de API
// // // import { useEffect, useState } from "react";
// // // import KanbanBoard from "../kanban/KanbanBoard";

// // // export default function ActivityView() {
// // //   const [activeTab, setActiveTab] = useState<"mis-actividades" | "asignadas">(
// // //     "mis-actividades",
// // //   );
// // //   const [activities, setActivities] = useState([]);
// // //   const [loading, setLoading] = useState(true);

// // //   useEffect(() => {
// // //     async function loadActivities() {
// // //       setLoading(true);
// // //       try {
// // //         if (activeTab === "mis-actividades") {
// // //           // Tu petición actual para las actividades del usuario
// // //           const data = await ActivityService.getOwnActivities();
// // //           setActivities(data);
// // //         } else {
// // //           // Nueva petición para todas las asignadas por el usuario (GET a /api/activities/assign)
// // //           const data = await ActivityService.getAssignedByMeActivities();
// // //           setActivities(data);
// // //         }
// // //       } catch (error) {
// // //         console.error("Error cargando actividades:", error);
// // //       } finally {
// // //         setLoading(false);
// // //       }
// // //     }

// // //     loadActivities();
// // //   }, [activeTab]);

// // //   return (
// // //     <div className="space-y-6 p-6">
// // //       <div className="flex items-center justify-between">
// // //         <h1 className="text-2xl font-bold">Actividades</h1>

// // //         {/* Toggle de Mis Actividades / Asignadas por Mi */}
// // //         <Tabs
// // //           value={activeTab}
// // //           onValueChange={(value) => setActiveTab(value as any)}
// // //           className="w-[400px]"
// // //         >
// // //           <TabsList className="grid w-full grid-cols-2">
// // //             <TabsTrigger value="mis-actividades">Mis Actividades</TabsTrigger>
// // //             <TabsTrigger value="asignadas">Asignadas por Mí</TabsTrigger>
// // //           </TabsList>
// // //         </Tabs>
// // //       </div>

// // //       {loading ? (
// // //         <div className="flex justify-center p-8">Cargando actividades...</div>
// // //       ) : (
// // //         /* Se envía la lista filtrada al tablero Kanban existente */
// // //         <KanbanBoard tasks={activities} />
// // //       )}
// // //     </div>
// // //   );
// // // }
// // "use client";

// // import KanbanBoard from "@/components/actividad/kanban/KanbanBoard";
// // import AssignActivityModal from "@/components/actividad/standard/AssignActivityModal";
// // import EditActivityModal from "@/components/actividad/standard/EditActivityModal";
// // import NewActivityModal from "@/components/actividad/standard/NewActivityModal";
// // import ContextSelector from "@/components/actividad/superadmin/ContextSelector";
// // import { Button } from "@/components/ui/button";
// // import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
// // import { useAuthStore } from "@/lib/stores/auth.store";
// // import { useRouter, useSearchParams } from "next/navigation";
// // import { useEffect, useMemo, useState } from "react";
// // import { io } from "socket.io-client";
// // import useSWR from "swr";

// // const PRIVILEGED_ROLES = [
// //   "superadmin",
// //   "gerente de operaciones",
// //   "gerencia de ventas",
// // ];

// // const fetcher = (url: string) => fetch(url).then((res) => res.json());

// // export default function ActivityView() {
// //   const user = useAuthStore((state) => state.user);
// //   const isLoading = useAuthStore((state) => state.isLoading);
// //   const searchParams = useSearchParams();
// //   const router = useRouter();

// //   // Estado para el control del Toggle (Mis Actividades / Asignadas por Mí)
// //   const [activeTab, setActiveTab] = useState<"mis-actividades" | "asignadas">(
// //     "mis-actividades",
// //   );

// //   const isPrivileged = useMemo(() => {
// //     if (!user?.role) return false;
// //     const normalizedRole = user.role.toLowerCase().trim();
// //     return PRIVILEGED_ROLES.includes(normalizedRole);
// //   }, [user]);

// //   const userId = searchParams.get("userId");

// //   // Redirección inicial si no hay un userId establecido en la URL
// //   useEffect(() => {
// //     if (!isLoading && user?.id && !userId) {
// //       router.replace(`/es/gestion/actividades?userId=${user.id}`);
// //     }
// //   }, [user, userId, router, isLoading]);

// //   // Cargamos usuarios completos para roles privilegiados (Asignaciones)
// //   const { data: allUsers } = useSWR(
// //     isPrivileged ? "/api/superadmin/users-full" : null,
// //     fetcher,
// //   );

// //   // Determinamos la URL dinámica de SWR dependiendo del Tab Activo
// //   const swrKey = useMemo(() => {
// //     if (!userId || !user) return null;

// //     if (activeTab === "mis-actividades") {
// //       return `/api/activities?userId=${userId}`;
// //     } else {
// //       // Endpoint GET que filtra por creador/asignador sin discriminar estados
// //       return `/api/activities/assign?assignedBy=${encodeURIComponent(user.name)}`;
// //     }
// //   }, [userId, activeTab, user]);

// //   // Cargamos las actividades de forma reactiva según la clave dinámica de arriba
// //   const { data: activities, mutate } = useSWR(swrKey, fetcher, {
// //     dedupingInterval: 0,
// //     revalidateOnFocus: true,
// //     revalidateIfStale: true,
// //   });

// //   // Lógica de Socket.io para actualizaciones en tiempo real globales
// //   useEffect(() => {
// //     const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL);

// //     socket.on("activity-updated", (data) => {
// //       console.log("Cambio detectado, actualizando SWR...", data);
// //       mutate(undefined, { revalidate: true });
// //     });

// //     return () => {
// //       socket.disconnect();
// //     };
// //   }, [mutate]);

// //   // Estados de control para modales
// //   const [isAddModalOpen, setIsAddModalOpen] = useState(false);
// //   const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
// //   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
// //   const [editingActivity, setEditingActivity] = useState<any>(null);

// //   if (isLoading || !user)
// //     return <div className="p-6 text-center">Cargando actividades...</div>;

// //   const handleFilterChange = (newFilters: any) => {
// //     router.push(`/es/gestion/actividades?userId=${newFilters.userId}`);
// //   };

// //   const getAuthHeaders = () => {
// //     const token = document.cookie
// //       .split("; ")
// //       .find((row) => row.startsWith("token="))
// //       ?.split("=")[1];
// //     return {
// //       "Content-Type": "application/json",
// //       Authorization: token ? `Bearer ${token}` : "",
// //     };
// //   };

// //   return (
// //     <div className="space-y-6 p-6">
// //       {/* Encabezado Personalizado */}
// //       <div className="mb-8">
// //         <h1 className="text-3xl font-bold text-slate-900">
// //           Panel de actividades
// //         </h1>
// //         <p className="text-slate-500 mt-1">
// //           Bienvenido,{" "}
// //           <span className="font-semibold text-slate-700">{user?.name}</span> a
// //           tu panel de actividades, aquí podrás ver tu planificación y gestionar
// //           tus actividades.
// //         </p>
// //       </div>

// //       {/* Barra de Filtros, Toggles y Acciones de Creación */}
// //       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
// //         <div className="flex flex-1 flex-col sm:flex-row items-start sm:items-center gap-4">
// //           {/* Selector de Contexto para Administradores / Gerentes */}
// //           {isPrivileged && activeTab === "mis-actividades" && (
// //             <ContextSelector
// //               selectedUserId={userId || ""}
// //               onFilterChange={handleFilterChange}
// //             />
// //           )}

// //           {/* Toggle Dinámico */}
// //           <Tabs
// //             value={activeTab}
// //             onValueChange={(value) => setActiveTab(value as any)}
// //             className="w-full sm:w-[350px]"
// //           >
// //             <TabsList className="grid w-full grid-cols-2">
// //               <TabsTrigger value="mis-actividades">Mis Actividades</TabsTrigger>
// //               <TabsTrigger value="asignadas">Asignadas por Mí</TabsTrigger>
// //             </TabsList>
// //           </Tabs>
// //         </div>

// //         {/* Botones de acción */}
// //         <div className="flex gap-2 self-end md:self-auto">
// //           <Button
// //             onClick={() => setIsAddModalOpen(true)}
// //             className="bg-slate-900 text-white hover:bg-slate-800"
// //           >
// //             + Nueva Actividad
// //           </Button>

// //           {isPrivileged && (
// //             <Button
// //               onClick={() => setIsAssignModalOpen(true)}
// //               className="bg-blue-600 text-white hover:bg-blue-500"
// //             >
// //               Asignar
// //             </Button>
// //           )}
// //         </div>
// //       </div>

// //       {/* Renderizado de Tablero Kanban */}
// //       <KanbanBoard
// //         activities={Array.isArray(activities) ? activities : []}
// //         userRole={user.role}
// //         onStatusChange={async (id: string, status: string) => {
// //           // Actualización optimista del cliente local mediante SWR
// //           const currentActivities = activities || [];
// //           mutate(
// //             currentActivities.map((a: any) =>
// //               a.id === id ? { ...a, status } : a,
// //             ),
// //             false,
// //           );

// //           // Petición al servidor (PATCH)
// //           await fetch("/api/activities", {
// //             method: "PATCH",
// //             headers: getAuthHeaders(),
// //             body: JSON.stringify({ id, status }),
// //           });

// //           // Revalidación forzada final
// //           mutate();
// //         }}
// //         onEdit={(act) => {
// //           setEditingActivity(act);
// //           setIsEditModalOpen(true);
// //         }}
// //         onUpdateObservation={async (id: string, observacion: string) => {
// //           await fetch("/api/activities", {
// //             method: "PATCH",
// //             headers: { "Content-Type": "application/json" },
// //             body: JSON.stringify({ id, observacion }),
// //           });
// //           mutate();
// //         }}
// //       />

// //       {/* Modal: Agregar Nueva Actividad Personal */}
// //       <NewActivityModal
// //         isOpen={isAddModalOpen}
// //         onClose={() => setIsAddModalOpen(false)}
// //         onSave={async (data: any) => {
// //           await fetch("/api/activities/newactivity", {
// //             method: "POST",
// //             headers: { "Content-Type": "application/json" },
// //             body: JSON.stringify({ ...data, user_email: user.email }),
// //           });
// //           mutate();
// //           setIsAddModalOpen(false);
// //         }}
// //       />

// //       {/* Modal: Delegar/Asignar Nueva Actividad a otros Roles */}
// //       {isPrivileged && (
// //         <AssignActivityModal
// //           isOpen={isAssignModalOpen}
// //           onClose={() => setIsAssignModalOpen(false)}
// //           users={allUsers}
// //           onSave={async (data: any) => {
// //             await fetch("/api/activities/assign", {
// //               method: "POST",
// //               headers: { "Content-Type": "application/json" },
// //               body: JSON.stringify({ ...data, assigned_by: user.name }),
// //             });
// //             mutate();
// //             setIsAssignModalOpen(false);
// //           }}
// //         />
// //       )}

// //       {/* Modal: Edición de campos generales de una Actividad */}
// //       {isEditModalOpen && (
// //         <EditActivityModal
// //           isOpen={isEditModalOpen}
// //           activity={editingActivity}
// //           onClose={() => setIsEditModalOpen(false)}
// //           onSave={async (data: any) => {
// //             await fetch("/api/activities", {
// //               method: "PATCH",
// //               headers: { "Content-Type": "application/json" },
// //               body: JSON.stringify({ id: editingActivity.id, ...data }),
// //             });
// //             mutate();
// //             setIsEditModalOpen(false);
// //           }}
// //         />
// //       )}
// //     </div>
// //   );
// // }
// "use client";

// import KanbanBoard from "@/components/actividad/kanban/KanbanBoard";
// import AssignActivityModal from "@/components/actividad/standard/AssignActivityModal";
// import EditActivityModal from "@/components/actividad/standard/EditActivityModal";
// import NewActivityModal from "@/components/actividad/standard/NewActivityModal";
// import ContextSelector from "@/components/actividad/superadmin/ContextSelector";
// import { Button } from "@/components/ui/button";
// import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { useAuthStore } from "@/lib/stores/auth.store";
// import { useRouter, useSearchParams } from "next/navigation";
// import { useEffect, useMemo, useState } from "react";
// import { io } from "socket.io-client";
// import useSWR from "swr";

// const PRIVILEGED_ROLES = [
//   "superadmin",
//   "gerente de operaciones",
//   "gerencia de ventas",
// ];

// const fetcher = (url: string) => fetch(url).then((res) => res.json());

// export default function ActivityView() {
//   const user = useAuthStore((state) => state.user);
//   const isLoading = useAuthStore((state) => state.isLoading);
//   const searchParams = useSearchParams();
//   const router = useRouter();

//   // Estado para el control del Toggle (Mis Actividades / Asignadas por Mí)
//   const [activeTab, setActiveTab] = useState<"mis-actividades" | "asignadas">(
//     "mis-actividades",
//   );

//   const isPrivileged = useMemo(() => {
//     if (!user?.role) return false;
//     const normalizedRole = user.role.toLowerCase().trim();
//     return PRIVILEGED_ROLES.includes(normalizedRole);
//   }, [user]);

//   const userId = searchParams.get("userId");

//   // Redirección inicial si no hay un userId establecido en la URL
//   useEffect(() => {
//     if (!isLoading && user?.id && !userId) {
//       router.replace(`/es/gestion/actividades?userId=${user.id}`);
//     }
//   }, [user, userId, router, isLoading]);

//   // Cargamos usuarios completos para roles privilegiados (Asignaciones)
//   const { data: allUsers } = useSWR(
//     isPrivileged ? "/api/superadmin/users-full" : null,
//     fetcher,
//   );

//   // Determinamos la URL dinámica de SWR dependiendo del Tab Activo
//   const swrKey = useMemo(() => {
//     if (!userId || !user) return null;

//     if (activeTab === "mis-actividades") {
//       return `/api/activities?userId=${userId}`;
//     } else {
//       // Endpoint GET que filtra por creador/asignador sin discriminar estados
//       return `/api/activities/assign?assignedBy=${encodeURIComponent(user.name)}`;
//     }
//   }, [userId, activeTab, user]);

//   // Cargamos las actividades de forma reactiva según la clave dinámica de arriba
//   const { data: activities, mutate } = useSWR(swrKey, fetcher, {
//     dedupingInterval: 0,
//     revalidateOnFocus: true,
//     revalidateIfStale: true,
//   });

//   // Lógica de Socket.io para actualizaciones en tiempo real globales
//   useEffect(() => {
//     const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL);

//     socket.on("activity-updated", (data) => {
//       console.log("Cambio detectado, actualizando SWR...", data);
//       mutate(undefined, { revalidate: true });
//     });

//     return () => {
//       socket.disconnect();
//     };
//   }, [mutate]);

//   // Estados de control para modales
//   const [isAddModalOpen, setIsAddModalOpen] = useState(false);
//   const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
//   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
//   const [editingActivity, setEditingActivity] = useState<any>(null);

//   if (isLoading || !user)
//     return (
//       <div className="p-6 text-center text-slate-500">
//         Cargando actividades...
//       </div>
//     );

//   const handleFilterChange = (newFilters: any) => {
//     router.push(`/es/gestion/actividades?userId=${newFilters.userId}`);
//   };

//   const getAuthHeaders = () => {
//     const token = document.cookie
//       .split("; ")
//       .find((row) => row.startsWith("token="))
//       ?.split("=")[1];
//     return {
//       "Content-Type": "application/json",
//       Authorization: token ? `Bearer ${token}` : "",
//     };
//   };

//   return (
//     <div className="space-y-6 p-6">
//       {/* Encabezado Principal Completo con Toggle Integrado en la Derecha */}
//       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
//         <div className="space-y-1 max-w-3xl">
//           <h1 className="text-3xl font-bold tracking-tight text-slate-900">
//             Panel de actividades
//           </h1>
//           <p className="text-slate-500 leading-relaxed text-sm">
//             Bienvenido,{" "}
//             <span className="font-semibold text-slate-700">{user?.name}</span> a
//             tu panel de actividades, aquí podrás ver tu planificación y
//             gestionar tus actividades.
//           </p>
//         </div>

//         {/* CONTENEDOR DEL TOGGLE (Ubicado en el Header - Lado Derecho) */}
//         <div className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/40 w-full md:w-[360px] self-start md:self-center">
//           <Tabs
//             value={activeTab}
//             onValueChange={(value) => setActiveTab(value as any)}
//             className="w-full"
//           >
//             <TabsList className="grid w-full grid-cols-2 bg-transparent gap-1 p-0 h-9">
//               <TabsTrigger
//                 value="mis-actividades"
//                 className="rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm transition-all"
//               >
//                 Mis Actividades
//               </TabsTrigger>
//               <TabsTrigger
//                 value="assigned"
//                 className="rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm transition-all"
//               >
//                 Asignadas por Mí
//               </TabsTrigger>
//             </TabsList>
//           </Tabs>
//         </div>
//       </div>

//       {/* Barra Secundaria de Filtros y Acciones de Creación */}
//       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
//         <div>
//           {/* Selector de Contexto para Administradores / Gerentes (Solo visible en Mis Actividades) */}
//           {isPrivileged && activeTab === "mis-actividades" && (
//             <ContextSelector
//               selectedUserId={userId || ""}
//               onFilterChange={handleFilterChange}
//             />
//           )}
//         </div>

//         {/* Botones de acción */}
//         <div className="flex gap-2 self-end sm:self-auto">
//           <Button
//             onClick={() => setIsAddModalOpen(true)}
//             className="bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
//           >
//             + Nueva Actividad
//           </Button>

//           {isPrivileged && (
//             <Button
//               onClick={() => setIsAssignModalOpen(true)}
//               className="bg-blue-600 text-white hover:bg-blue-500 shadow-sm"
//             >
//               Asignar
//             </Button>
//           )}
//         </div>
//       </div>

//       {/* Renderizado de Tablero Kanban */}
//       <KanbanBoard
//         activities={Array.isArray(activities) ? activities : []}
//         userRole={user.role}
//         onStatusChange={async (id: string, status: string) => {
//           // Actualización optimista del cliente local mediante SWR
//           const currentActivities = activities || [];
//           mutate(
//             currentActivities.map((a: any) =>
//               a.id === id ? { ...a, status } : a,
//             ),
//             false,
//           );

//           // Petición al servidor (PATCH)
//           await fetch("/api/activities", {
//             method: "PATCH",
//             headers: getAuthHeaders(),
//             body: JSON.stringify({ id, status }),
//           });

//           // Revalidación forzada final
//           mutate();
//         }}
//         onEdit={(act) => {
//           setEditingActivity(act);
//           setIsEditModalOpen(true);
//         }}
//         onUpdateObservation={async (id: string, observacion: string) => {
//           await fetch("/api/activities", {
//             method: "PATCH",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ id, observacion }),
//           });
//           mutate();
//         }}
//       />

//       {/* Modal: Agregar Nueva Actividad Personal */}
//       <NewActivityModal
//         isOpen={isAddModalOpen}
//         onClose={() => setIsAddModalOpen(false)}
//         onSave={async (data: any) => {
//           await fetch("/api/activities/newactivity", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ ...data, user_email: user.email }),
//           });
//           mutate();
//           setIsAddModalOpen(false);
//         }}
//       />

//       {/* Modal: Delegar/Asignar Nueva Actividad a otros Roles */}
//       {isPrivileged && (
//         <AssignActivityModal
//           isOpen={isAssignModalOpen}
//           onClose={() => setIsAssignModalOpen(false)}
//           users={allUsers}
//           onSave={async (data: any) => {
//             await fetch("/api/activities/assign", {
//               method: "POST",
//               headers: { "Content-Type": "application/json" },
//               body: JSON.stringify({ ...data, assigned_by: user.name }),
//             });
//             mutate();
//             setIsAssignModalOpen(false);
//           }}
//         />
//       )}

//       {/* Modal: Edición de campos generales de una Actividad */}
//       {isEditModalOpen && (
//         <EditActivityModal
//           isOpen={isEditModalOpen}
//           activity={editingActivity}
//           onClose={() => setIsEditModalOpen(false)}
//           onSave={async (data: any) => {
//             await fetch("/api/activities", {
//               method: "PATCH",
//               headers: { "Content-Type": "application/json" },
//               body: JSON.stringify({ id: editingActivity.id, ...data }),
//             });
//             mutate();
//             setIsEditModalOpen(false);
//           }}
//         />
//       )}
//     </div>
//   );
// }
"use client";

import KanbanBoard from "@/components/actividad/kanban/KanbanBoard";
import AssignActivityModal from "@/components/actividad/standard/AssignActivityModal";
import EditActivityModal from "@/components/actividad/standard/EditActivityModal";
import NewActivityModal from "@/components/actividad/standard/NewActivityModal";
import ContextSelector from "@/components/actividad/superadmin/ContextSelector";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import useSWR from "swr";

const PRIVILEGED_ROLES = [
  "superadmin",
  "gerente de operaciones",
  "gerencia de ventas",
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ActivityView() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Estado para el control del Toggle (Mis Actividades / Asignadas por Mí)
  const [activeTab, setActiveTab] = useState<"mis-actividades" | "asignadas">(
    "mis-actividades",
  );

  const isPrivileged = useMemo(() => {
    if (!user?.role) return false;
    const normalizedRole = user.role.toLowerCase().trim();
    return PRIVILEGED_ROLES.includes(normalizedRole);
  }, [user]);

  const userId = searchParams.get("userId");

  // Redirección inicial si no hay un userId establecido en la URL
  useEffect(() => {
    if (!isLoading && user?.id && !userId) {
      router.replace(`/es/gestion/actividades?userId=${user.id}`);
    }
  }, [user, userId, router, isLoading]);

  // Cargamos usuarios completos para roles privilegiados (Asignaciones)
  const { data: allUsers } = useSWR(
    isPrivileged ? "/api/superadmin/users-full" : null,
    fetcher,
  );

  // Determinamos la URL dinámica de SWR dependiendo del Tab Activo
  const swrKey = useMemo(() => {
    if (!userId || !user) return null;

    if (activeTab === "mis-actividades") {
      return `/api/activities?userId=${userId}`;
    } else {
      // Endpoint GET que filtra por creador/asignador sin discriminar estados
      return `/api/activities/assign?assignedBy=${encodeURIComponent(user.name)}`;
    }
  }, [userId, activeTab, user]);

  // Cargamos las actividades de forma reactiva según la clave dinámica de arriba
  const { data: activities, mutate } = useSWR(swrKey, fetcher, {
    dedupingInterval: 0,
    revalidateOnFocus: true,
    revalidateIfStale: true,
  });

  // Lógica de Socket.io para actualizaciones en tiempo real globales
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL);

    socket.on("activity-updated", (data) => {
      console.log(
        "Cambio detectado por Socket, actualizando clave activa SWR:",
        swrKey,
      );
      if (swrKey) {
        mutate(undefined, { revalidate: true });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [mutate, swrKey]);

  // Estados de control para modales
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  if (isLoading || !user)
    return (
      <div className="p-6 text-center text-slate-500">
        Cargando actividades...
      </div>
    );

  const handleFilterChange = (newFilters: any) => {
    router.push(`/es/gestion/actividades?userId=${newFilters.userId}`);
  };

  const getAuthHeaders = () => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  return (
    <div className="space-y-6 p-6">
      {/* Encabezado Principal Completo con Toggle Integrado en la Derecha */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div className="space-y-1 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Panel de actividades
          </h1>
          <p className="text-slate-500 leading-relaxed text-sm">
            Bienvenido,{" "}
            <span className="font-semibold text-slate-700">{user?.name}</span> a
            tu panel de actividades, aquí podrás ver tu planificación y
            gestionar tus actividades.
          </p>
        </div>

        {/* CONTENEDOR DEL TOGGLE (Ubicado en el Header - Lado Derecho) */}
        <div className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/40 w-full md:w-[360px] self-start md:self-center">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as any)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-transparent gap-1 p-0 h-9">
              <TabsTrigger
                value="mis-actividades"
                className="rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm transition-all"
              >
                Mis Actividades
              </TabsTrigger>
              <TabsTrigger
                value="asignadas"
                className="rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm transition-all"
              >
                Asignadas por Mí
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Barra Secundaria de Filtros y Acciones de Creación */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {/* Selector de Contexto para Administradores / Gerentes (Solo visible en Mis Actividades) */}
          {isPrivileged && activeTab === "mis-actividades" && (
            <ContextSelector
              selectedUserId={userId || ""}
              onFilterChange={handleFilterChange}
            />
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 self-end sm:self-auto">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
          >
            + Nueva Actividad
          </Button>

          {isPrivileged && (
            <Button
              onClick={() => setIsAssignModalOpen(true)}
              className="bg-blue-600 text-white hover:bg-blue-500 shadow-sm"
            >
              Asignar
            </Button>
          )}
        </div>
      </div>

      {/* Renderizado de Tablero Kanban */}
      <KanbanBoard
        activities={Array.isArray(activities) ? activities : []}
        userRole={user.role}
        onStatusChange={async (id: string, status: string) => {
          if (!swrKey) return;

          const currentActivities = activities || [];

          // 1. Forzamos la mutación optimista apuntando explícitamente al swrKey actual
          mutate(
            swrKey,
            currentActivities.map((a: any) =>
              a.id === id ? { ...a, status } : a,
            ),
            false, // false evita revalidación inmediata antes del fetch
          );

          // 2. Petición al servidor (PATCH)
          await fetch("/api/activities", {
            method: "PATCH",
            headers: getAuthHeaders(),
            body: JSON.stringify({ id, status }),
          });

          // 3. Forzamos la actualización de la clave activa correcta
          mutate(swrKey);
        }}
        onEdit={(act) => {
          setEditingActivity(act);
          setIsEditModalOpen(true);
        }}
        onUpdateObservation={async (id: string, observacion: string) => {
          if (!swrKey) return;

          await fetch("/api/activities", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, observacion }),
          });

          // Revalidamos pasando la clave explícita para evitar pérdidas de renderizado
          mutate(swrKey);
        }}
      />

      {/* Modal: Agregar Nueva Actividad Personal */}
      <NewActivityModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data: any) => {
          await fetch("/api/activities/newactivity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, user_email: user.email }),
          });
          if (swrKey) mutate(swrKey);
          setIsAddModalOpen(false);
        }}
      />

      {/* Modal: Delegar/Asignar Nueva Actividad a otros Roles */}
      {isPrivileged && (
        <AssignActivityModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          users={allUsers}
          onSave={async (data: any) => {
            await fetch("/api/activities/assign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...data, assigned_by: user.name }),
            });
            if (swrKey) mutate(swrKey);
            setIsAssignModalOpen(false);
          }}
        />
      )}

      {/* Modal: Edición de campos generales de una Actividad */}
      {isEditModalOpen && (
        <EditActivityModal
          isOpen={isEditModalOpen}
          activity={editingActivity}
          onClose={() => setIsEditModalOpen(false)}
          onSave={async (data: any) => {
            await fetch("/api/activities", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editingActivity.id, ...data }),
            });
            if (swrKey) mutate(swrKey);
            setIsEditModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
