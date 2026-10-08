-- Método de retiro por cliente (lib/ventas/metodoRetiro.ts) y autorización
-- del transporte externo (lib/ventas/autorizacionTransporte.ts).
--
-- El panel lo crea solo al primer uso (asegurarTablaMetodoRetiro y la tabla de
-- autorizaciones). Este script queda de referencia, para correrlo a mano en el
-- phpMyAdmin de EasyPanel si hiciera falta: sin information_schema y con la
-- base delante. Antes de los ALTER, ver que no estén:
--   SHOW COLUMNS FROM supricom_panel.ventas_metodo_retiro LIKE 'grupo';
--   SHOW COLUMNS FROM supricom_panel.ventas_metodo_retiro LIKE 'autorizacion_id';

-- Pedidos del mismo cliente guardados juntos: salen en el mismo viaje y la
-- ruta gratis se decide con la suma de los que siguen por la misma ruta.
ALTER TABLE supricom_panel.ventas_metodo_retiro
  ADD COLUMN grupo VARCHAR(40) DEFAULT NULL,
  ADD COLUMN autorizacion_id INT DEFAULT NULL,
  ADD INDEX idx_vmr_grupo (grupo);

-- Foto de la autorización del cliente para que la mercancía salga en un
-- transporte externo (obligatoria para ese método). Una foto sirve para todos
-- los pedidos guardados juntos.
CREATE TABLE IF NOT EXISTS supricom_panel.ventas_metodo_retiro_autorizaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) DEFAULT NULL,
  mime VARCHAR(50) NOT NULL,
  size INT NOT NULL,
  data LONGBLOB NOT NULL,
  subido_por VARCHAR(200) DEFAULT NULL,
  subido_email VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vmra_email (subido_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW COLUMNS FROM supricom_panel.ventas_metodo_retiro LIKE 'grupo';
SHOW COLUMNS FROM supricom_panel.ventas_metodo_retiro LIKE 'autorizacion_id';
SHOW TABLES FROM supricom_panel LIKE 'ventas_metodo_retiro_autorizaciones';
