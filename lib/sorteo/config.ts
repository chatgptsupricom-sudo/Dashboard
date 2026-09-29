/** Reglas del sorteo de Caracas. Aparte de participantes.ts para poder importarlas desde el cliente sin arrastrar Odoo. */
export const SORTEO = {
  companyId: 10,
  sede: "Caracas",
  montoPorTicket: 5000,
  mesDefault: "2026-09",
  /** Landing pública del sorteo: otra aplicación (repo sorteo-landing). */
  urlPublica: process.env.NEXT_PUBLIC_SORTEO_URL || "https://sorteo.supricom.com.ve",
} as const;
