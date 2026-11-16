-- Reparto de la mercancía de un packing list entre Valencia (9) y Caracas (10).
-- REFERENCIA: las tablas se crean solas (lib/recepcion/repartoSedesDatos.ts,
-- asegurarTablasReparto). Este script es por si hay que crearlas a mano en el
-- phpMyAdmin de EasyPanel (con la base delante y sin information_schema).
--
-- No tiene nada que ver con la Factura Especial de Caracas (factura_aparte):
-- esos renglones son otra compra y nunca entran al reparto.

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_reparto_sedes (
  recepcion_id INT NOT NULL PRIMARY KEY,
  activo TINYINT(1) NOT NULL DEFAULT 0,
  peso_rotacion DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  ventana_dias INT NOT NULL DEFAULT 90,
  cuota_valencia DECIMAL(15,2) DEFAULT NULL,
  cuota_caracas DECIMAL(15,2) DEFAULT NULL,
  cuota_fuente_valencia VARCHAR(30) DEFAULT NULL,
  cuota_fuente_caracas VARCHAR(30) DEFAULT NULL,
  cuota_mes VARCHAR(7) DEFAULT NULL,
  pct_cuota_caracas DECIMAL(9,6) DEFAULT NULL,
  base_cantidad VARCHAR(12) DEFAULT NULL,
  calculado_at TIMESTAMP NULL DEFAULT NULL,
  calculado_por VARCHAR(200) DEFAULT NULL,
  error TEXT DEFAULT NULL,
  version INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  updated_por VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_reparto_lineas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recepcion_id INT NOT NULL,
  clave VARCHAR(320) NOT NULL,
  codigo VARCHAR(100) DEFAULT NULL,
  producto VARCHAR(300) DEFAULT NULL,
  odoo_product_id INT DEFAULT NULL,
  cantidad DECIMAL(14,3) NOT NULL,
  cajas INT DEFAULT NULL,
  por_caja INT DEFAULT NULL,
  cantidad_valencia DECIMAL(14,3) NOT NULL,
  cantidad_caracas DECIMAL(14,3) NOT NULL,
  auto_caracas DECIMAL(14,3) NOT NULL,
  origen VARCHAR(10) NOT NULL DEFAULT 'auto',
  base VARCHAR(10) NOT NULL DEFAULT 'cuota',
  pct_cuota_caracas DECIMAL(9,6) NOT NULL,
  pct_rotacion_caracas DECIMAL(9,6) DEFAULT NULL,
  pct_objetivo_caracas DECIMAL(9,6) NOT NULL,
  ventas_valencia DECIMAL(14,3) NOT NULL DEFAULT 0,
  ventas_caracas DECIMAL(14,3) NOT NULL DEFAULT 0,
  stock_valencia DECIMAL(14,3) DEFAULT NULL,
  stock_caracas DECIMAL(14,3) DEFAULT NULL,
  costo DECIMAL(14,4) DEFAULT NULL,
  motivo_manual VARCHAR(500) DEFAULT NULL,
  manual_por VARCHAR(200) DEFAULT NULL,
  manual_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_reparto_linea (recepcion_id, clave),
  KEY idx_reparto_recepcion (recepcion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_reparto_eventos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recepcion_id INT NOT NULL,
  accion VARCHAR(30) NOT NULL,
  detalle MEDIUMTEXT,
  usuario VARCHAR(200) NOT NULL,
  email VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reparto_eventos (recepcion_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verificar:
-- SHOW TABLES FROM supricom_panel LIKE 'recepcion_reparto%';
