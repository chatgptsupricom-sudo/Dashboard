-- Tabla para guardar valores semanales de KPIs (historial)
CREATE TABLE IF NOT EXISTS kpi_weekly_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kpi_key VARCHAR(100) NOT NULL,
  company_id INT NOT NULL,
  mes VARCHAR(7) NOT NULL,
  semana_index INT NOT NULL,
  semana_label VARCHAR(50),
  valor DECIMAL(15,2) DEFAULT 0,
  meta DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_kpi_week (kpi_key, company_id, mes, semana_index)
);
