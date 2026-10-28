/**
 * Rol Marketing y Electrodomésticos (`/marketing_electrodomesticos`).
 *
 * Gerente de la línea de electrodomésticos que además apoya a Marketing en el
 * desarrollo de marcas. Ve, sin cambiar nada:
 *
 * - El Dashboard del SuperAdmin (su pantalla de inicio, las tres sedes).
 * - Inventario y Ventas por marca de las marcas que el SuperAdmin le asigna
 *   por correo (las mismas pantallas y asignaciones del Gerente de Marca,
 *   lib/gerente-marca/).
 * - Mayor y menor rotación y Tendencia de ventas de Compras (/compras/...).
 * - Catálogo, Plan de Contenido, Banco de Flyers, Material POP, Metas y Stock
 *   por marca, Opiniones y Mapa de clientes.
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
