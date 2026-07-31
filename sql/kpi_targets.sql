-- Tabla para metas de KPIs configuradas por SuperAdmin
CREATE TABLE IF NOT EXISTS kpi_targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kpi_key VARCHAR(100) NOT NULL,
  company_id INT NOT NULL,
  meta_mensual DECIMAL(15,2) NOT NULL DEFAULT 0,
  mes VARCHAR(7) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_kpi (kpi_key, company_id, mes)
);
