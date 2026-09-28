import { query } from "@/lib/db";

/**
 * Metas de venta por marca de la sección Metas por marca del SuperAdmin.
 *
 * Tabla propia (`metas_venta_marca`), a propósito separada de
 * `kpi_metas_marca` (la del KPI Cobertura de marcas del Stoplight): cambiar
 * una meta aquí no mueve el semáforo. Una meta es por sede, mes y marca; la
 * marca va por su nombre normalizado (`claveMarca`), no por el id de Odoo,
 * para que las marcas repetidas en Odoo compartan meta.
 *
 * DDL para el phpMyAdmin de producción: sql/metas_venta_marca.sql.
 */

export interface MetaVentaMarca {
  companyId: number;
  clave: string;
  marca: string;
  meta: number;
  actualizadoPor: string | null;
  actualizado: string | null;
}

let tablaLista = false;
export async function asegurarTablaMetasVentaMarca() {
  if (tablaLista) return;
  await query(
    `CREATE TABLE IF NOT EXISTS metas_venta_marca (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      mes VARCHAR(7) NOT NULL,
      marca_clave VARCHAR(150) NOT NULL,
      marca VARCHAR(255) NOT NULL,
      meta DECIMAL(14,2) NOT NULL DEFAULT 0,
      updated_by VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_meta_venta_marca (company_id, mes, marca_clave)
    )`,
    [],
  );
  tablaLista = true;
}

export async function leerMetas(companyIds: number[], mes: string): Promise<MetaVentaMarca[]> {
  await asegurarTablaMetasVentaMarca();
  if (companyIds.length === 0) return [];
  const r = await query(
    `SELECT company_id, marca_clave, marca, meta, updated_by, updated_at
       FROM metas_venta_marca
      WHERE company_id IN (${companyIds.map(() => "?").join(",")}) AND mes = ? AND meta > 0`,
    [...companyIds, mes],
  );
  return (r.rows as any[]).map((x) => ({
    companyId: Number(x.company_id),
    clave: String(x.marca_clave),
    marca: String(x.marca),
    meta: Number(x.meta) || 0,
    actualizadoPor: x.updated_by ?? null,
    actualizado: x.updated_at ? new Date(x.updated_at).toISOString() : null,
  }));
}

/** meta 0 (o vacía) borra la meta de esa marca. */
export async function guardarMeta(companyId: number, mes: string, clave: string, marca: string, meta: number, usuario: string) {
  await asegurarTablaMetasVentaMarca();
  if (!(meta > 0)) {
    await query("DELETE FROM metas_venta_marca WHERE company_id = ? AND mes = ? AND marca_clave = ?", [companyId, mes, clave]);
    return;
  }
  await query(
    `INSERT INTO metas_venta_marca (company_id, mes, marca_clave, marca, meta, updated_by) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE marca = VALUES(marca), meta = VALUES(meta), updated_by = VALUES(updated_by)`,
    [companyId, mes, clave, marca, Math.round(meta * 100) / 100, usuario],
  );
}
