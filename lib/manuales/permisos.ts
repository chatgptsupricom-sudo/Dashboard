// Quién entra a Manuales. Archivo aparte de datos.ts (que usa MySQL) para que
// también lo usen las pantallas.

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();

/** El rol Procesos escribe los manuales: ve todos (borradores incluidos) y edita. */
export const esProcesos = (r: unknown) => normRol(r) === "procesos";

/**
 * Rol con el que se compara `manuales.roles` al leer. El vendedor llega en el
 * token como "seller" o "vendedor" (middleware acepta los dos): se guarda y se
 * compara como "seller", que es el `name` de la tabla roles.
 */
export const rolLector = (r: unknown) => {
  const n = normRol(r);
  return n === "vendedor" ? "seller" : n;
};

/** Dos clases de documento en la misma tabla: el procedimiento y el recorrido por las pantallas del rol. */
export const TIPOS_MANUAL = ["manual", "tutorial"] as const;
export type TipoManual = (typeof TIPOS_MANUAL)[number];
export const tipoManual = (v: unknown): TipoManual => (v === "tutorial" ? "tutorial" : "manual");

/** Un rol que no es Procesos lee solo lo publicado y marcado para su rol. */
export const puedeLeerManual = (m: { publicado: boolean; roles: string[] }, rol: unknown) =>
  esProcesos(rol) || (m.publicado && m.roles.includes(rolLector(rol)));

/** Enlace de un paso a una pantalla del panel: ruta interna sin idioma ("/vendedores/leads"). */
export const enlaceValido = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\/(?!\/)[\w\-/.?=&%]*$/.test(s) ? s.slice(0, 200) : "";
};
