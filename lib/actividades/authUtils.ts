import { ROLE_HIERARCHY } from "@/lib/actividades/rolesConfig";

export const canViewUser = (
  viewerRole: string,
  targetRole: string,
): boolean => {
  const config = ROLE_HIERARCHY[viewerRole];
  if (!config) return false;
  if (config.canView === "all") return true;

  // Verifica si el rol objectiu està a la llista de rols permesos
  return config.canView.includes(targetRole);
};
