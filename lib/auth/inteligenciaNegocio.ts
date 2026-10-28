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
 * Marketing y Electrodomésticos (lib/auth/marketingElectro.ts) también hace
 * análisis: cuenta como BI en todo esto (`ROLES_BI`), menos en Leads, que no
 * tiene en el menú, y en sus Actividades, que sí escribe (requireSession).
 *
 * Sin dependencias de servidor: lo importan también el sidebar y las
 * pantallas.
 */
import { ROL_MARKETING_ELECTRO } from "@/lib/auth/marketingElectro";

export const ROL_BI = "inteligencia de negocio";
export const ROLES_BI = [ROL_BI, ROL_MARKETING_ELECTRO];

const normalizar = (rol: unknown) => String(rol ?? "").toLowerCase().trim();

export function esRolBI(rol: unknown): boolean {
  return ROLES_BI.includes(normalizar(rol));
}

/** SuperAdmin y BI eligen sede; los demás roles quedan en la de su token. */
export function veTodasLasSedes(rol: unknown): boolean {
  return normalizar(rol) === "superadmin" || esRolBI(rol);
}

const METODOS_LECTURA = new Set(["GET", "HEAD"]);

/** BI intentando escribir (POST/PUT/PATCH/DELETE). */
export function esEscrituraBI(rol: unknown, metodo: string): boolean {
  return esRolBI(rol) && !METODOS_LECTURA.has(metodo.toUpperCase());
}

export const MENSAJE_SOLO_LECTURA_BI = "Inteligencia de Negocio es de solo lectura";
