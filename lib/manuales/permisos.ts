// Quién entra a Manuales. Archivo aparte de datos.ts (que usa MySQL) para que
// también lo usen las pantallas.

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();

/** Por ahora Manuales es solo del rol Procesos (ni el SuperAdmin entra): ve todo y edita. */
export const esProcesos = (r: unknown) => normRol(r) === "procesos";
