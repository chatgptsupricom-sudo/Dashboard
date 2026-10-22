/**
 * Rol Inteligencia de Negocio (BI).
 *
 * Mira los tableros del panel —Dashboard, Actividades, Stoplight,
 * Inventario, Agente IA, los desplegables Leads / Ventas / Marketing y, de
 * Cuentas por Cobrar, Contado/Crédito, Incobrables, Tiempo de Cobro y
 * Sobregiro— con la data de las tres sedes (Panamá 7, Valencia 9, Caracas
 * 10), y no cambia nada:
 *
 * - Sede: donde el SuperAdmin elige la sede con `?company_id=` / `?empresa=`,
 *   BI también (`veTodasLasSedes`). El resto de los roles queda en su `cids`.
 * - Solo lectura: `requireRoles` (lib/auth/roles.ts) le responde 403 a todo
 *   lo que no sea GET/HEAD, aunque la ruta lo tenga en su lista. Las rutas
 *   que no pasan por `requireRoles` y lo dejan entrar lo frenan con
 *   `esEscrituraBI`.
 *
 * Sin dependencias de servidor: lo importan también el sidebar y las
 * pantallas.
 */
export const ROL_BI = "inteligencia de negocio";
export const ROLES_BI = [ROL_BI];

const normalizar = (rol: unknown) => String(rol ?? "").toLowerCase().trim();

export function esRolBI(rol: unknown): boolean {
  return normalizar(rol) === ROL_BI;
}

/** SuperAdmin y BI eligen sede; los demás roles quedan en la de su token. */
export function veTodasLasSedes(rol: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || r === ROL_BI;
}

const METODOS_LECTURA = new Set(["GET", "HEAD"]);

/** BI intentando escribir (POST/PUT/PATCH/DELETE). */
export function esEscrituraBI(rol: unknown, metodo: string): boolean {
  return esRolBI(rol) && !METODOS_LECTURA.has(metodo.toUpperCase());
}

export const MENSAJE_SOLO_LECTURA_BI = "Inteligencia de Negocio es de solo lectura";

/**
 * El Catálogo de los vendedores (`/api/vendedores/catalogo` y su export) es
 * de una sola sede y BI no tiene `cids`: ve el de Valencia.
 */
export const SEDE_CATALOGO_BI = 9;
