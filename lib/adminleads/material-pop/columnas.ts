import { query } from "@/lib/db";

let hayRecipiente = false;

/**
 * Si ya se corrió sql/material_pop_007_movement_recipient.sql.
 *
 * Las migraciones se corren a mano después del despliegue: sin este chequeo,
 * todas las salidas fallarían con "Unknown column" en el rato entre una cosa y
 * la otra. Solo se recuerda el sí; el no se vuelve a preguntar, así el panel
 * se entera apenas se corre la migración sin reiniciar.
 */
export async function hayColumnaRecipiente(): Promise<boolean> {
  if (hayRecipiente) return true;
  try {
    const r = await query("SHOW COLUMNS FROM pop_movements LIKE 'recipient_name'");
    hayRecipiente = (r.rows as any[]).length > 0;
  } catch {
    hayRecipiente = false;
  }
  return hayRecipiente;
}
