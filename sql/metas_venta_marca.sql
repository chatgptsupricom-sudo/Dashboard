-- Metas por marca (SuperAdmin > Ventas > Metas por marca).
-- Tabla propia, separada de kpi_metas_marca (KPI Cobertura de marcas del Stoplight).
-- La app la crea sola en el primer uso (CREATE TABLE IF NOT EXISTS en
-- lib/metas-marca/metas.ts); este script es para crearla a mano en el
-- phpMyAdmin de EasyPanel. Verificar antes/después con:
--   SHOW TABLES FROM supricom_panel LIKE 'metas_venta_marca';
--   SHOW COLUMNS FROM supricom_panel.metas_venta_marca;

CREATE TABLE IF NOT EXISTS supricom_panel.metas_venta_marca (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  mes VARCHAR(7) NOT NULL,
  marca_clave VARCHAR(150) NOT NULL,
  marca VARCHAR(255) NOT NULL,
  meta DECIMAL(14,2) NOT NULL DEFAULT 0,
  updated_by VARCHAR(255) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_meta_venta_marca (company_id, mes, marca_clave)
);
