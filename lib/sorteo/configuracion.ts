import { query } from "@/lib/db";
import { CONFIG_INICIAL, TITULO_MAX, nombreSedeSorteo, type ConfigSorteo } from "./config";

/**
 * Sorteo activo (tabla `sorteo_config`, una sola fila id = 1; ver
 * sql/sorteo_config.sql). Lo lee todo el sorteo: participantes, ganadores,
 * giros y la landing. Cambiarlo apunta la landing a otra sede/mes al instante;
 * los ganadores quedan separados por sede + mes, así que los de un sorteo no
 * se mezclan con los de otro.
 *
 * Si la tabla no existe todavía, se usa CONFIG_INICIAL (Caracas, sept-2026)
 * y `configError` lo avisa en el panel.
 */

export interface ConfigLeida extends ConfigSorteo {
  configError: string | null;
}

let cache: { vence: number; valor: Promise<ConfigLeida> } | null = null;

export function leerConfig(): Promise<ConfigLeida> {
  if (cache && cache.vence > Date.now()) return cache.valor;
  const valor = (async (): Promise<ConfigLeida> => {
    try {
      const { rows } = await query(
        `SELECT company_id, mes, monto_por_ticket, titulo, actualizado_por, updated_at FROM sorteo_config WHERE id = 1`,
      );
      const r: any = Array.isArray(rows) ? rows[0] : null;
      if (!r) return { ...CONFIG_INICIAL, configError: "Todavía no se guardó ninguna configuración: se usa la inicial" };
      const companyId = Number(r.company_id);
      return {
        companyId,
        sede: nombreSedeSorteo(companyId),
        mes: String(r.mes),
        montoPorTicket: Number(r.monto_por_ticket),
        titulo: r.titulo ? String(r.titulo) : null,
        actualizadoPor: r.actualizado_por ? String(r.actualizado_por) : null,
        actualizado: r.updated_at ? new Date(r.updated_at).toISOString() : null,
        configError: null,
      };
    } catch (e: any) {
      console.error("Error leyendo sorteo_config:", e?.message);
      return {
        ...CONFIG_INICIAL,
        configError: e?.code === "ER_NO_SUCH_TABLE" ? "Falta crear la tabla sorteo_config (sql/sorteo_config.sql)" : "No se pudo leer la configuración",
      };
    }
  })();
  // Corta: cambiar la configuración en el panel se ve enseguida en la landing.
  cache = { vence: Date.now() + 5000, valor };
  return valor;
}

export async function guardarConfig(c: Pick<ConfigSorteo, "companyId" | "mes" | "montoPorTicket" | "titulo">, quien: string) {
  const titulo = c.titulo?.trim().slice(0, TITULO_MAX) || null;
  const valores = [c.companyId, c.mes, c.montoPorTicket, titulo, quien.slice(0, 200)];
  // Parámetros repetidos en vez de VALUES(col): esa forma está deprecada en MySQL 8.0.20+.
  await query(
    `INSERT INTO sorteo_config (id, company_id, mes, monto_por_ticket, titulo, actualizado_por)
     VALUES (1, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE company_id = ?, mes = ?, monto_por_ticket = ?, titulo = ?, actualizado_por = ?`,
    [...valores, ...valores],
  );
  cache = null;
}
