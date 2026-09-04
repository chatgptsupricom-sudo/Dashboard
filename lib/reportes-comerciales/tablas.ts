/**
 * Creacion perezosa de las tablas MySQL de Reportes Comerciales.
 *
 * El repo no tiene runner de migraciones: el patron establecido es
 * `CREATE TABLE IF NOT EXISTS` en la primera peticion (ver
 * `ensureTables()` en app/api/superadmin/stoplight/route.ts). El DDL de
 * referencia tambien vive en `sql/` para documentacion.
 */

import { query } from "@/lib/db";

let listo = false;

export async function ensureTablasReportesComerciales(): Promise<void> {
  if (listo) return;

  await query(`CREATE TABLE IF NOT EXISTS epp_clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    anio INT NOT NULL,
    marca VARCHAR(60) NOT NULL DEFAULT 'EZVIZ',
    cliente_nombre VARCHAR(255) NOT NULL,
    odoo_partner_id INT NULL,
    razones_sociales LONGTEXT NULL,
    meta_anual DECIMAL(15,2) NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_epp (company_id, anio, marca, cliente_nombre)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS reporte_trimestral_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    marca VARCHAR(60) NOT NULL DEFAULT 'EZVIZ',
    trimestre VARCHAR(7) NOT NULL,
    total_venta DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_unidades INT NOT NULL DEFAULT 0,
    num_facturas INT NOT NULL DEFAULT 0,
    num_clientes INT NOT NULL DEFAULT 0,
    payload_json LONGTEXT NOT NULL,
    archivo_nombre VARCHAR(255) NULL,
    archivo_b64 LONGTEXT NULL,
    generado_por VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_snap (company_id, marca, trimestre)
  )`);

  // Para instalaciones que ya tenían las tablas sin columnas nuevas. MySQL no
  // soporta ADD COLUMN IF NOT EXISTS, así que se ignora el error de "columna
  // duplicada" (1060).
  const alters: [string, string][] = [
    ["reporte_trimestral_snapshots", "ADD COLUMN archivo_nombre VARCHAR(255) NULL"],
    ["reporte_trimestral_snapshots", "ADD COLUMN archivo_b64 LONGTEXT NULL"],
    ["epp_clientes", "ADD COLUMN razones_sociales LONGTEXT NULL"],
  ];
  for (const [tabla, col] of alters) {
    try {
      await query(`ALTER TABLE ${tabla} ${col}`);
    } catch (e: any) {
      if (e?.errno !== 1060) throw e;
    }
  }

  listo = true;
}
