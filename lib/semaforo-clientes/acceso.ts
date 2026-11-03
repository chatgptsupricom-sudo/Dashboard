import { ROL_BI, esRolBI } from "@/lib/auth/inteligenciaNegocio";

/**
 * Quién ve el Semáforo de clientes y qué parte:
 * - Vendedor: solo su cartera (clientes con él como vendedor en Odoo).
 * - Gerencia de Ventas: la cartera de toda su sede (`cids`), con el resumen por vendedor.
 * - SuperAdmin (dirección) e Inteligencia de Negocio: las tres sedes; solo el
 *   SuperAdmin cambia los umbrales.
 */
export const ROLES_VENDEDOR = ["vendedor", "seller"];
export const ROL_GERENCIA_VENTAS = "gerencia de ventas";
export const ROLES_SEMAFORO = [...ROLES_VENDEDOR, ROL_GERENCIA_VENTAS, ROL_BI];

const normalizar = (rol: unknown) => String(rol ?? "").toLowerCase().trim();

export function puedeVerSemaforo(rol: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || ROLES_SEMAFORO.includes(r) || esRolBI(r);
}

export function esVendedor(rol: unknown): boolean {
  return ROLES_VENDEDOR.includes(normalizar(rol));
}
