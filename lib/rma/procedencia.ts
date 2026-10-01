import { query } from "@/lib/db";

/**
 * Procedencia del equipo de un caso RMA:
 *   supricom → lo vendió Supricom (producto_externo = 0, o la columna no existe).
 *   externo  → equipo no comprado en Supricom (producto_externo = 1).
 */
export type Procedencia = "supricom" | "externo";

export function leerProcedencia(valor: string | null): Procedencia | null {
  return valor === "supricom" || valor === "externo" ? valor : null;
}

let hayColumna = false;

/**
 * Si rma_cases ya tiene producto_externo (sql/rma_cases_producto_externo.sql,
 * o el primer reporte externo del portal). Se cachea solo el "sí", igual que
 * hayTablaProductos().
 */
export async function hayColumnaExterno(): Promise<boolean> {
  if (hayColumna) return true;
  try {
    const r = await query("SHOW COLUMNS FROM rma_cases LIKE 'producto_externo'");
    hayColumna = (r.rows as any[]).length > 0;
  } catch {
    hayColumna = false;
  }
  return hayColumna;
}

/**
 * Condición SQL (con " AND " delante) para quedarse con los casos de una
 * procedencia. Sin la columna todos los casos son de Supricom.
 */
export function filtroProcedencia(
  procedencia: Procedencia | null,
  conColumna: boolean,
  alias = "",
): string {
  if (!procedencia) return "";
  const col = `${alias ? `${alias}.` : ""}producto_externo`;
  if (procedencia === "externo") return conColumna ? ` AND ${col} = 1` : " AND 1=0";
  return conColumna ? ` AND ${col} = 0` : "";
}
