-- ============================================================
-- METAS DE VENTA POR MARCA (Stoplight de Ventas -> Cobertura de marcas)
--
-- La crea sola la app en el primer uso (lib/stoplight/metasMarca.ts,
-- CREATE TABLE IF NOT EXISTS). Este script es por si se prefiere crearla a
-- mano en el phpMyAdmin de EasyPanel: lleva la base delante y no usa
-- information_schema (ver CLAUDE.md, Gotchas).
--
-- Si la base no se llama `supricom_panel`, reemplaza ese nombre.
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.kpi_metas_marca (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,            -- sede (9 Valencia, 10 Caracas, 7 Panama)
  mes VARCHAR(7) NOT NULL,            -- YYYY-MM
  marca_id INT NOT NULL,              -- spiff.brand de Odoo
  marca VARCHAR(255) NOT NULL,
  meta DECIMAL(14,2) NOT NULL DEFAULT 0,  -- venta esperada del mes, sin IVA
  updated_by VARCHAR(255) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_meta_marca (company_id, mes, marca_id)
);

SHOW TABLES FROM supricom_panel LIKE 'kpi_metas_marca';
