// Quién edita manuales. Archivo aparte de datos.ts (que usa MySQL) para que
// también lo usen las pantallas.

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();
export const esSuperadmin = (r: unknown) => normRol(r) === "superadmin";

/** Quién crea y edita manuales, además del SuperAdmin. */
export const ROLES_EDITORES = ["procesos"];
export const puedeEditar = (r: unknown) => esSuperadmin(r) || ROLES_EDITORES.includes(normRol(r));
