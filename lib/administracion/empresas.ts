/**
 * Sedes del Indice de Salud Administrativa.
 *
 * Los tres endpoints del area (salud-financiera, gastos y el seguimiento de
 * alertas) tienen que resolver el filtro de sede igual, porque la pagina
 * cruza sus resultados en un solo indice: si uno interpretara "todas" de otra
 * forma, el puntaje y las alertas no cuadrarian entre si.
 */
export const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

export const TODAS_LAS_SEDES = [9, 10, 7];

/** `empresa` vacia o desconocida = todas las sedes. */
export function companyIdsDeEmpresa(empresa: string | null): number[] {
  const clave = (empresa || "").toLowerCase().trim();
  return COMPANY_MAP[clave] ? [COMPANY_MAP[clave]] : [...TODAS_LAS_SEDES];
}

/** Nombre canonico de la sede a partir de su company_id de Odoo. */
export function empresaDeCompanyId(companyId: number): string {
  const entrada = Object.entries(COMPANY_MAP).find(([, id]) => id === companyId);
  return entrada ? entrada[0] : "";
}
