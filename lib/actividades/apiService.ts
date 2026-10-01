// lib/actividades/apiService.ts

/**
 * Obtiene las actividades asignadas AL usuario (Mis Actividades)
 */
export const getMyActivities = async (userId: string | number) => {
  const res = await fetch(`/api/activities/assign?userId=${userId}`);
  if (!res.ok) throw new Error("Error al obtener mis actividades");
  return res.json();
};

/**
 * Obtiene TODAS las actividades asignadas POR el usuario (Asignadas por Mí)
 */
export const getAssignedByMeActivities = async (assignedByValue: string) => {
  const res = await fetch(
    `/api/activities/assign?assignedBy=${encodeURIComponent(assignedByValue)}`,
  );
  if (!res.ok) throw new Error("Error al obtener actividades asignadas por mí");
  return res.json();
};
