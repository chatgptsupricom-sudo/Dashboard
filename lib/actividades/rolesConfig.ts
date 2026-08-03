// lib/rolesConfig.ts

export const ROLE_HIERARCHY: Record<string, { canView: string[] | "all" }> = {
  superAdmin: {
    canView: "all",
  },
  audit: {
    canView: "all",
  },
  gerenteOperaciones: {
    canView: [
      "gerenteVentas",
      "vendedor",
      "brandManagement",
      "audit",
      "marketing",
      "adminleads",
    ],
  },
  gerenteVentas: {
    canView: ["gerenteVentas", "vendedor", "adminleads"],
  },
  // Los roles operativos base: por defecto solo ven su propia información
  marketing: { canView: ["marketing"] },
  brandManagement: { canView: ["brandManagement"] },
  adminleads: { canView: ["adminleads"] },
  vendedor: { canView: ["vendedor"] },
};

/**
 * Helper para validar permisos
 */
export const canViewRole = (
  viewerRole: string,
  targetRole: string,
): boolean => {
  const config = ROLE_HIERARCHY[viewerRole];
  if (!config) return false;
  if (config.canView === "all") return true;

  // Normalización para comparar sin importar espacios o mayúsculas
  const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, "");

  return config.canView.some((r) => normalize(r) === normalize(targetRole));
};

/**
 * Regla de negocio: Si el usuario tiene cids es limitado,
 * si es null tiene acceso global.
 */
export const canViewCids = (
  userCids: string | null,
  targetCids: string | null,
): boolean => {
  if (userCids === null) return true; // Acceso total
  return userCids === targetCids; // Acceso restringido a su empresa
};
