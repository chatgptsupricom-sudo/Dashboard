import { query } from "@/lib/db";

/**
 * "Equipos que entraron al taller y todavía no salieron" (issue #37).
 *
 * Está acá y no repetido en cada consumidor porque lo usan el cron que manda
 * las alertas y el endpoint que el técnico abre para ver el detalle: si cada
 * uno arma su propio WHERE, la alerta dice 5 y la pantalla muestra 4 y nadie
 * se entera de por qué. Es la misma razón por la que existe `filtros.ts`.
 *
 * "Pendiente" = ingreso sin ningún despacho vinculado. No hace falta marcar
 * nada ni limpiar nada: en cuanto se registra el despacho el ingreso deja de
 * aparecer solo, que es el auto-resolve que pedía el issue.
 */

/** Días en el taller a partir de los cuales un ingreso genera alerta. */
export function diasUmbral(): number {
  const crudo = parseInt(process.env.SEGURIDAD_ALERTA_THRESHOLD_DAYS || "", 10);
  // Se interpola en el SQL (MySQL no acepta placeholder dentro de INTERVAL en
  // todos los drivers), así que no puede ser cualquier cosa: entero y acotado.
  if (!Number.isFinite(crudo) || crudo < 1 || crudo > 365) return 7;
  return crudo;
}

export interface IngresoPendiente {
  id: number;
  fecha_entrega: string;
  dias_en_taller: number;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  factura_numero: string | null;
  descripcion_falla: string | null;
  rma_case_id: number | null;
  case_number: string | null;
}

/**
 * Ingresos sin despacho con al menos `dias` en el taller, del más viejo al más
 * nuevo. El techo de 200 es para que un arranque con la base sucia no arme un
 * payload de socket de varios MB; el conteo real va aparte.
 */
export async function ingresosPendientes(
  dias: number,
  limite = 200,
): Promise<IngresoPendiente[]> {
  const d = Math.trunc(dias);
  const l = Math.min(Math.max(Math.trunc(limite), 1), 1000);

  const { rows } = await query(
    `SELECT i.id,
            i.fecha_entrega,
            DATEDIFF(CURDATE(), i.fecha_entrega) AS dias_en_taller,
            i.cliente_nombre,
            i.hardware,
            i.serial,
            i.factura_numero,
            i.descripcion_falla,
            i.rma_case_id,
            c.case_number
       FROM seguridad_ingresos i
       LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
       LEFT JOIN rma_cases c ON c.id = i.rma_case_id
      WHERE d.id IS NULL
        AND i.fecha_entrega < CURDATE() - INTERVAL ${d} DAY
      ORDER BY i.fecha_entrega ASC
      LIMIT ${l}`,
  );

  return rows.map((r: any) => ({
    ...r,
    dias_en_taller: Number(r.dias_en_taller || 0),
  }));
}
