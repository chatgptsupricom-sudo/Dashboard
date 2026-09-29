/** Reglas del sorteo de Caracas. Aparte de participantes.ts para poder importarlas desde el cliente sin arrastrar Odoo. */
export const SORTEO = {
  companyId: 10,
  sede: "Caracas",
  montoPorTicket: 5000,
  mesDefault: "2026-09",
} as const;
