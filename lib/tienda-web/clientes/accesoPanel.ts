/**
 * Quién ve «Perfiles de clientes» en el panel (lib/tienda-web/clientes/perfilesPanel.ts). Aparte y sin base de
 * datos porque también lo usa middleware.ts.
 * - Vendedor: los clientes que tiene asignados en Odoo.
 * - Gerencia de Ventas y Gerente de Operaciones: los de su sede.
 * - SuperAdmin: todos.
 */
export const ROLES_VENDEDOR = ["vendedor", "seller"];
export const ROLES_PERFILES_CLIENTES = [...ROLES_VENDEDOR, "gerencia de ventas", "gerente de operaciones"];

const normalizar = (rol: unknown) => String(rol ?? "").toLowerCase().trim();

export const puedeVerPerfilesClientes = (rol: unknown) => normalizar(rol) === "superadmin" || ROLES_PERFILES_CLIENTES.includes(normalizar(rol));
export const esVendedorPanel = (rol: unknown) => ROLES_VENDEDOR.includes(normalizar(rol));
