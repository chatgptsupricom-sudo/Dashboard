/**
 * Vendedores que el check "Excluir asistente de ventas" saca de las pantallas
 * de Cuentas por Cobrar: asistentes y cuentas internas o de prueba, distintas
 * por sede. Es el mismo criterio que la tarjeta "Ventas del Mes"
 * (app/api/superadmin/stats/route.ts).
 *
 * Vive en un solo lugar porque Contado/Crédito y Pago de Clientes tenían
 * reglas distintas: Pago de Clientes solo excluía "asistente" y dejaba pasar
 * p.ej. a "yusne" en Valencia, así que con el check marcado las dos pantallas
 * diferían justo en esos cobros.
 */
const EXCLUSIONES_POR_SEDE: Record<number, string[]> = {
  9: ["asistente", "yusne"],
  10: ["asistente", "adriana"],
  7: ["hercilio"],
};

/** true si el vendedor está excluido en esa sede (company_id de Odoo). */
export function esVendedorExcluido(nombreVendedor: string | null | undefined, companyId: number | null | undefined): boolean {
  const nombre = (nombreVendedor || "").toLowerCase();
  const reglas = (companyId != null && EXCLUSIONES_POR_SEDE[companyId]) || [];
  return reglas.some((regla) => nombre.includes(regla));
}
