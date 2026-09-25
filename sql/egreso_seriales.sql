-- ============================================================
-- EGRESO: SERIALES DEL PICKING DE ODOO (issue #299)
--
-- Cada egreso guarda los seriales que tienen que salir, sacados del picking
-- de Odoo. Seguridad los pistolea en C4 (issue #301).
--
--   seguridad_mercancia_items.lleva_serial   1 = el producto lleva serial
--                                            en Odoo (tracking = 'serial');
--                                            0 = no; NULL = aun no se leyo.
--   seguridad_mercancia.seriales_leidos_at   ultima vez que se leyeron los
--                                            seriales del picking.
--   seguridad_mercancia_seriales             un serial esperado por fila, ya
--                                            normalizado (mayusculas, sin
--                                            espacios, como lo lee la
--                                            pistola). No se repite dentro
--                                            del mismo egreso. verificado_at /
--                                            verificado_por los llena
--                                            Seguridad al pistolear (#301).
--
-- Hasta que se corra esto, el egreso funciona igual que antes, sin seriales
-- (la API avisa en el log "falta correr sql/egreso_seriales.sql").
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): las tablas llevan el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.seguridad_mercancia_items LIKE 'lleva_serial';
--   SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'seriales_leidos_at';
-- Si alguna devuelve una fila, ese ALTER ya se corrio: sacalo y corre el resto
-- (el CREATE TABLE se puede repetir, es IF NOT EXISTS).
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia_items
  ADD COLUMN lleva_serial TINYINT(1) DEFAULT NULL;

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN seriales_leidos_at TIMESTAMP NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS supricom_panel.seguridad_mercancia_seriales (
  id INT NOT NULL AUTO_INCREMENT,
  mercancia_id INT NOT NULL,
  item_id INT NOT NULL,
  serial VARCHAR(100) NOT NULL,
  odoo_lot_id INT DEFAULT NULL,
  verificado_at TIMESTAMP NULL DEFAULT NULL,
  verificado_por VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mercancia_serial (mercancia_id, serial),
  KEY idx_serial_item (item_id),
  KEY idx_serial (serial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprobacion: tienen que aparecer las dos columnas y la tabla.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia_items LIKE 'lleva_serial';
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'seriales_leidos_at';
SHOW TABLES FROM supricom_panel LIKE 'seguridad_mercancia_seriales';
