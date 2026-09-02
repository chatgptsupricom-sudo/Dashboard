-- Cierres guardados del Reporte de Ventas Trimestral (Panama, por marca).
-- Permite comparar trimestre vs trimestre sin depender de Odoo para historicos.
-- Un cierre por (company_id, marca, trimestre); se re-guarda con ON DUPLICATE KEY.
-- La crea `lib/reportes-comerciales/tablas.ts` en la primera peticion.
CREATE TABLE IF NOT EXISTS reporte_trimestral_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,               -- 7 = Panama
  marca VARCHAR(60) NOT NULL DEFAULT 'EZVIZ',
  trimestre VARCHAR(7) NOT NULL,         -- '2026-Q3'
  total_venta DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_unidades INT NOT NULL DEFAULT 0,
  num_facturas INT NOT NULL DEFAULT 0,
  num_clientes INT NOT NULL DEFAULT 0,
  payload_json LONGTEXT NOT NULL,        -- rankings completos + EPP calculado
  generado_por VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_snap (company_id, marca, trimestre)
);
