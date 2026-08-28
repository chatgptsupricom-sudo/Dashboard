import { query } from "@/lib/db";

/**
 * Metas y umbrales parametrizables por KPI.
 *
 * La propuesta exige que "las metas y semaforos se administren en una tabla de
 * parametros, sin requerir cambios de programacion". Los defaults de abajo son
 * los del documento; lo que se guarde en `admin_kpi_metas` los sobreescribe por
 * empresa.
 *
 * Hay metas que NO tienen default porque dependen de una politica interna que
 * el sistema no conoce (meta mensual de cobranza, saldo minimo operativo). Esas
 * quedan en null y su KPI se reporta como "sin datos" en vez de inventar un
 * numero — igual que Gastos y Presupuesto cuando no hay presupuesto cargado.
 */
export const METAS_DEFAULT: Record<string, number | null> = {
  // Cuentas por cobrar
  cartera_vencida: 10,
  dso: 45,
  cumplimiento_cobranza: null, // meta de cobranza del mes: la fija Administracion
  cartera_90: 3,
  promesas_pago: 95,
  clientes_excedidos: 2,
  // Tesoreria
  cobertura_caja_30d: 1.5,
  flujo_proyectado_30d: 0,
  cobros_esperados: 95,
  exactitud_proyeccion: 95,
  disponibilidad_bancaria: null, // saldo minimo operativo: lo fija Administracion
  conciliaciones_dia: 100,
  // Cuentas por pagar
  pagos_a_tiempo: 98,
  obligaciones_vencidas: 3,
  cobertura_pagos_30d: 1.2,
  facturas_pendientes: 5,
  descuentos_aprovechados: 90,

  // Gestión Administrativa (issue #8, 20 pts sin fuente hasta que se
  // configuraron Approvals/Helpdesk/Project — ver supricom_admin_kpis).
  // "Plazo interno de procesamiento": Administración lo definió en 24h:
  // se guarda en días porque diasEntre()/pendientesVencidos comparan en esa
  // unidad, y 24h son exactamente 1 día — no hace falta una unidad aparte.
  plazo_procesamiento_dias: 1,
  legalizacion_dias: 30, // proxy: >30 dias sin legalizar es la banda que ya usa Tesorería para "vencido"
  pct_legalizacion_vencida: 20,

  // Cumplimiento y Control
  operaciones_fuera_politica: 0,
  incidencias_vencidas_pct: 10,
  auditoria_cumplimiento_pct: 90,
  reincidencias: 0,
};

export async function ensureMetasTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_kpi_metas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpi_id VARCHAR(80) NOT NULL,
      company_id INT NOT NULL,
      meta DECIMAL(15,4) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_meta (kpi_id, company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function cargarMetas(
  companyId: number,
): Promise<Record<string, number | null>> {
  const metas = { ...METAS_DEFAULT };
  try {
    await ensureMetasTable();
    const rows = await query(
      "SELECT kpi_id, meta FROM admin_kpi_metas WHERE company_id = ?",
      [companyId],
    );
    (rows.rows as any[]).forEach((r) => {
      metas[r.kpi_id] = r.meta === null ? null : Number(r.meta);
    });
  } catch {
    // Si la tabla no esta disponible se usan los defaults del documento.
  }
  return metas;
}
