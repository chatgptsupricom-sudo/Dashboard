import { ROL_BI, esRolBI } from "@/lib/auth/inteligenciaNegocio";
import { ROL_GERENTE_MARCA } from "@/lib/gerente-marca/tipos";

/**
 * Quién ve la Rotación de inventario (lib/rotacion-inventario) y qué hace.
 * Sin dependencias de servidor: lo importan el middleware y las pantallas.
 *
 * - SuperAdmin y Compras: las tres sedes; reinician planes, editan los
 *   contactos de las marcas y manejan las solicitudes.
 * - Gerente de Marca: Valencia y Caracas, solo los productos de sus marcas
 *   (las de Configuración de marcas); maneja las solicitudes de sus marcas.
 * - Gerencia de Ventas y Gerente de Operaciones: su sede (`cids`), solo leen.
 * - Inteligencia de Negocio y Marketing y Electrodomésticos: las tres sedes,
 *   solo leen (requireRoles les corta lo que escribe).
 */
export const ROL_COMPRAS = "compras";
export const ROLES_SEDE_PROPIA = ["gerencia de ventas", "gerente de operaciones"];
export const ROLES_ROTACION = [ROL_COMPRAS, ROL_GERENTE_MARCA, ...ROLES_SEDE_PROPIA, ROL_BI];
/** Los que mueven las solicitudes (el Gerente de Marca, solo las de sus marcas). */
export const ROLES_SOLICITUDES = [ROL_COMPRAS, ROL_GERENTE_MARCA];
/** Sedes del Gerente de Marca (las mismas de su sección). */
export const SEDES_GERENTE_ROTACION = [9, 10];

const normalizar = (rol: unknown) => String(rol ?? "").toLowerCase().trim();

export function puedeVerRotacion(rol: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || ROLES_ROTACION.includes(r) || esRolBI(r);
}

/** Reiniciar planes y editar contactos de marcas. */
export function editaRotacion(rol: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || r === ROL_COMPRAS;
}

export function gestionaSolicitudes(rol: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || ROLES_SOLICITUDES.includes(r);
}

export const esGerenteMarca = (rol: unknown) => normalizar(rol) === ROL_GERENTE_MARCA;
export const veSoloSuSede = (rol: unknown) => ROLES_SEDE_PROPIA.includes(normalizar(rol));
