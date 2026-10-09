// Quién entra a Manuales. Archivo aparte de datos.ts (que usa MySQL) para que
// también lo usen las pantallas.

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();

/** Por ahora Manuales es solo del rol Procesos (ni el SuperAdmin entra): ve todo y edita. */
export const esProcesos = (r: unknown) => normRol(r) === "procesos";

/**
 * Rol con el que se dibuja una pantalla de Almacén o Seguridad. Procesos entra
 * ahí solo a mirar (capturas de los manuales) y la ve como el rol de `?como=`
 * (almacen si no se indica). Las APIs le siguen negando todo lo que escribe.
 */
export function rolVista(role: unknown): string {
  const rol = normRol(role);
  if (!esProcesos(rol) || typeof window === "undefined") return rol;
  return new URLSearchParams(window.location.search).get("como") === "seguridad" ? "seguridad" : "almacen";
}
