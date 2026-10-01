"use client";

import KanbanBoard from "@/components/actividad/kanban/KanbanBoard";
import AssignActivityModal from "@/components/actividad/standard/AssignActivityModal";
import ContextSelector from "@/components/actividad/superadmin/ContextSelector";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ManagerActivityView() {
  const { user } = useAuthStore();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Fetch de actividades del usuario seleccionado
  const { data: activities, mutate } = useSWR(
    selectedUserId ? `/api/activities?userId=${selectedUserId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Fetch de todos los usuarios para el modal de asignación
  const { data: allUsers } = useSWR("/api/superadmin/users-full", fetcher);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Gestión de Actividades de Equipo
      </h1>

      <div className="flex items-center gap-4 mb-6">
        {/* Selector Jerárquico */}
        <ContextSelector
          selectedUserId={selectedUserId}
          onFilterChange={(filter: { userId: string }) =>
            setSelectedUserId(filter.userId)
          }
        />

        <Button
          onClick={() => setIsAssignModalOpen(true)}
          disabled={!selectedUserId}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Asignar Actividad
        </Button>
      </div>

      {selectedUserId ? (
        <KanbanBoard
          activities={Array.isArray(activities) ? activities : []}
          userRole="manager"
          onStatusChange={async (id: string, status: string) => {
            await fetch("/api/activities", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, status }),
            });
            mutate();
          }}
          onUpdateObservation={async (id: string, observacion: string) => {
            await fetch("/api/activities", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, observacion }),
            });
            mutate();
          }}
        />
      ) : (
        <div className="p-20 text-center border-2 border-dashed rounded-2xl text-slate-500">
          Selecciona un usuario del equipo para visualizar sus actividades.
        </div>
      )}

      {/* Modal de Asignación */}
      <AssignActivityModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        users={allUsers}
        adminName={user?.name}
        onSave={async (data: any) => {
          await fetch("/api/activities/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...data,
              assigned_by: user?.name,
              admin_id: user?.uid,
            }),
          });
          mutate();
          setIsAssignModalOpen(false);
        }}
      />
    </div>
  );
}
