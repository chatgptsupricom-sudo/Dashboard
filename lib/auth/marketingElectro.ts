/**
 * Rol Marketing y Electrodomésticos (`/marketing_electrodomesticos`).
 *
 * Gerente de la línea de electrodomésticos que además apoya a Marketing en el
 * desarrollo de marcas y hace análisis. Ve, sin cambiar nada:
 *
 * - Lo mismo que Inteligencia de Negocio menos Leads: cuenta como BI
 *   (`ROLES_BI` de lib/auth/inteligenciaNegocio.ts), así que entra a toda API
 *   que liste `ROL_BI`, elige sede y no ve intercompañía. Sus páginas son
 *   re-exports de las de /inteligencia_negocio.
 * - Inventario y Ventas por marca con **todas** las marcas
 *   (`marcasDeLaSesion` de lib/gerente-marca/asignaciones.ts).
 * - Mayor y menor rotación y Tendencia de ventas de Compras (/compras/...).
 * - Actividades (las suyas; ahí sí escribe, va por requireSession).
 *
 * Solo lectura: `requireRoles` le responde 403 a todo lo que no sea GET/HEAD.
 *
 * Sin dependencias de servidor: lo importan también el sidebar y las
 * pantallas.
 */
export const ROL_MARKETING_ELECTRO = "marketing y electrodomesticos";

export function esRolMarketingElectro(rol: unknown): boolean {
  return String(rol ?? "").toLowerCase().trim() === ROL_MARKETING_ELECTRO;
}

/** Marketing y Electrodomésticos intentando escribir (POST/PUT/PATCH/DELETE). */
export function esEscrituraMarketingElectro(rol: unknown, metodo: string): boolean {
  return esRolMarketingElectro(rol) && !["GET", "HEAD"].includes(metodo.toUpperCase());
}
