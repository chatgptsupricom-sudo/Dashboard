import { query } from "@/lib/db";

/**
 * Facturas que la usuaria de CxC marcó a mano como incobrables (tabla MySQL
 * `cxc_incobrables`, sql/cxc_incobrables.sql). Se tratan igual que la cartera
 * vieja (lib/cxc/carteraVieja.ts): fuera de Cartera Vencida, Recuperación,
 * DSO y CEI, y dentro de la tarjeta Incobrables.
 *
 * Si la MySQL no responde (o la tabla todavía no existe) devuelve un conjunto
 * vacío y los KPIs siguen solo con la regla automática de 2025: mejor un KPI
 * sin las marcas manuales que un dashboard caído.
 */
export async function idsIncobrablesManuales(companyIds: number[]): Promise<Set<number>> {
  if (companyIds.length === 0) return new Set();
  try {
    const { rows } = await query(
      `SELECT DISTINCT move_id FROM cxc_incobrables
        WHERE activo = 1 AND company_id IN (${companyIds.map(() => "?").join(",")})`,
      companyIds,
    );
    return new Set((rows as any[]).map((r) => Number(r.move_id)));
  } catch (e: any) {
    console.error("cxc_incobrables no disponible, se sigue sin marcas manuales:", e.message);
    return new Set();
  }
}
