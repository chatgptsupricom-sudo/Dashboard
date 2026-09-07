/**
 * Sedes que tienen Reporte de Ventas Trimestral.
 *
 * Ver CLAUDE.md: 9 = Valencia, 10 = Caracas, 7 = Panamá.
 * El reporte arrancó solo para Panamá; ahora también lo ven los gerentes de
 * ventas de Valencia y Caracas, cada uno con los datos de SU compañía.
 *
 * Módulo puro (sin imports de Node) para que lo pueda usar `acceso.ts` y, por
 * transición, el middleware.
 */

export interface SedeReporte {
  companyId: number;
  nombre: string;
  pais: "PA" | "VE";
}

export const SEDES_REPORTE: SedeReporte[] = [
  { companyId: 7, nombre: "Panamá", pais: "PA" },
  { companyId: 9, nombre: "Valencia", pais: "VE" },
  { companyId: 10, nombre: "Caracas", pais: "VE" },
];

export const COMPANY_IDS_REPORTE = SEDES_REPORTE.map((s) => s.companyId);

export function sedeReporte(companyId: number): SedeReporte | undefined {
  return SEDES_REPORTE.find((s) => s.companyId === companyId);
}

export function nombreSede(companyId: number): string {
  return sedeReporte(companyId)?.nombre || `Sede ${companyId}`;
}

/** Slug para nombres de archivo: "Panamá" -> "panama". */
export function slugSede(companyId: number): string {
  return nombreSede(companyId)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
