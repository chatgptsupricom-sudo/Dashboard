"use client";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import KanbanBoard from "../kanban/KanbanBoard";
import AssignActivityModal from "../standard/AssignActivityModal";
import EditActivityModal from "../standard/EditActivityModal";
import NewActivityModal from "../standard/NewActivityModal";
import ContextSelector from "./ContextSelector";

// Roles con permisos para ver el selector y asignar actividades
const PRIVILEGED_ROLES = ["superadmin", "gerente_operaciones", "gerente_venta"];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ActivityView() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Verificamos privilegios
  const isPrivileged = useMemo(
    () => user && PRIVILEGED_ROLES.includes(user.role),
    [user],
  );

  const userId = searchParams.get("userId");

  // Redirección inteligente: solo si el usuario cargó y no tiene un userId en la URL
  useEffect(() => {
    if (!isLoading && user?.id && !userId) {
      router.replace(`/es/superadmin/actividad?userId=${user.id}`);
    }
  }, [user, userId, router, isLoading]);

  // Cargamos usuarios solo si es alguien con privilegios
  const { data: allUsers } = useSWR(
    isPrivileged ? "/api/superadmin/users-full" : null,
    fetcher,
  );

  // Cargamos actividades basándonos en el userId actual
  const { data: activities, mutate } = useSWR(
    userId ? `/api/activities?userId=${userId}` : null,
    fetcher,
  );

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  if (isLoading || !user) return <div>Cargando actividades...</div>;

  const handleFilterChange = (newFilters: any) => {
    router.push(`/es/superadmin/actividad?userId=${newFilters.userId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {/* Solo los roles gerenciales o superadmin ven el filtro de jerarquía */}
        {isPrivileged && (
          <ContextSelector
            selectedUserId={userId || ""}
            onFilterChange={handleFilterChange}
          />
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-slate-900 text-white"
          >
            + Nueva Actividad
          </Button>

          {isPrivileged && (
            <Button
              onClick={() => setIsAssignModalOpen(true)}
              className="bg-blue-600 text-white"
            >
              Asignar
            </Button>
          )}
        </div>
      </div>

      <KanbanBoard
        activities={Array.isArray(activities) ? activities : []}
        userRole={user.role}
        onStatusChange={async (id: string, status: string) => {
          await fetch("/api/activities", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
          });
          mutate();
        }}
        onEdit={(act) => {
          setEditingActivity(act);
          setIsEditModalOpen(true);
        }}
      />

      {/* Modales */}
      <NewActivityModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data: any) => {
          await fetch("/api/activities/newactivity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, user_email: user.email }),
          });
          mutate();
          setIsAddModalOpen(false);
        }}
      />

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
            mutate();
            setIsAssignModalOpen(false);
          }}
        />
      )}

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
            mutate();
            setIsEditModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
