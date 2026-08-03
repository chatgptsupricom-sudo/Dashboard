"use client";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect, useState } from "react";
import useSWR from "swr";
import KanbanBoard from "../kanban/KanbanBoard";
import EditActivityModal from "../standard/EditActivityModal";
import NewActivityModal from "../standard/NewActivityModal";

// Fetcher optimizado
const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function UserActivityView() {
  const { user, isLoading: isAuthLoading } = useAuthStore();

  const [isMounted, setIsMounted] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  // Evita errores de hidratación de Next.js
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // La clave [url, user.id] asegura que SWR revalide cuando el usuario cambia
  const {
    data: activities,
    mutate,
    isLoading: isActivitiesLoading,
  } = useSWR(
    isMounted && !isAuthLoading && user?.id
      ? [`/api/activities?userId=${user.id}&role=${user.role}`, user.id]
      : null,
    ([url]) => fetcher(url),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  );

  if (!isMounted) return null;
  if (isAuthLoading)
    return <div className="p-20 text-center">Verificando sesión...</div>;
  if (!user)
    return <div className="p-20 text-center">Usuario no autenticado.</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Mis Actividades</h1>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-slate-900 text-white"
        >
          + Nueva Actividad
        </Button>
      </div>

      {isActivitiesLoading ? (
        <div className="flex justify-center p-20 text-slate-500">
          Cargando actividades...
        </div>
      ) : (
        <KanbanBoard
          activities={Array.isArray(activities) ? activities : []}
          userRole="user"
          onEdit={(activity: any) => {
            setEditingActivity(activity);
            setIsEditModalOpen(true);
          }}
          onStatusChange={async (id: string, status: string) => {
            await fetch("/api/activities", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, status, user_id: user?.id }),
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
      )}

      {/* Modales */}
      <NewActivityModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data: any) => {
          await fetch("/api/activities/newactivity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...data,
              user_id: user?.id,
              user_email: user?.email,
            }),
          });
          mutate();
          setIsAddModalOpen(false);
        }}
      />

      {editingActivity && (
        <EditActivityModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          activity={editingActivity}
          onSave={async (data: any) => {
            await fetch("/api/activities", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...data, id: editingActivity.id }),
            });
            mutate();
            setIsEditModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
