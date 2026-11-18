import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";

/**
 * Quién entra a la Rotación de inventario (lib/rotacion-inventario) y qué
 * hace. Sin dependencias de servidor: lo importan el middleware, el sidebar y
 * las pantallas.
 *
 * Solo (a pedido, nov-2026):
 * - SuperAdmin: las tres sedes; edita todo.
 * - Compras: **solo Oscar Martínez** (`CORREOS_COMPRAS_ROTACION`, el correo con
 *   que entra al panel); las tres sedes; reinicia planes, edita contactos de
 *   las marcas y maneja las solicitudes. Los demás usuarios de Compras no
 *   entran.
 * - Inteligencia de Negocio: las tres sedes, solo lee (requireRoles le corta
 *   lo que escribe). Marketing y Electrodomésticos, que en el resto del panel
 *   cuenta como BI, aquí no entra.
 * - Gerencia de Ventas: su sede (`cids`), solo lee.
 */
export const ROL_COMPRAS = "compras";
export const ROL_GERENCIA_VENTAS = "gerencia de ventas";
export const ROLES_ROTACION = [ROL_COMPRAS, ROL_GERENCIA_VENTAS, ROL_BI];
/** Usuarios de Compras que entran (correo de login, en minúsculas). */
export const CORREOS_COMPRAS_ROTACION = ["compras@supricom.com.ve"];

const normalizar = (v: unknown) => String(v ?? "").toLowerCase().trim();

const esComprasHabilitado = (rol: unknown, email: unknown) =>
  normalizar(rol) === ROL_COMPRAS && CORREOS_COMPRAS_ROTACION.includes(normalizar(email));

export function puedeVerRotacion(rol: unknown, email: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || r === ROL_BI || r === ROL_GERENCIA_VENTAS || esComprasHabilitado(r, email);
}

/** Reiniciar planes, editar contactos y manejar las solicitudes a las marcas. */
export function editaRotacion(rol: unknown, email: unknown): boolean {
  return normalizar(rol) === "superadmin" || esComprasHabilitado(rol, email);
}

export const veSoloSuSede = (rol: unknown) => normalizar(rol) === ROL_GERENCIA_VENTAS;
