-- ============================================================
-- RECEPCION POR PACKING LIST: PISTOLA (SERIALES Y CODIGOS)
--
-- Almacen cuenta con la pistola de codigos de barras:
--  - los productos que en Odoo llevan numero de serie se cuentan
--    pistoleando cada serial (cada serial suma 1);
--  - los que no, se cuentan pistoleando su codigo (cada lectura suma 1).
--
--   recepcion_packing_items.lleva_serial  1 = el producto lleva serial en
--                                         Odoo; 0 = no; NULL = aun no se
--                                         consulto (se llena solo).
--   recepcion_packing_seriales            un serial por fila; no se puede
--                                         repetir dentro del mismo packing list.
--   recepcion_codigos_alias               codigos de caja que no son el codigo
--                                         del producto (ej. un UPC): Almacen
--                                         dice una vez de que producto es y
--                                         queda aprendido.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): las tablas llevan el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing_items LIKE 'lleva_serial';
-- Si devuelve una fila, el ALTER ya se corrio: sacalo y corre solo los
-- CREATE TABLE (esos se pueden repetir, son IF NOT EXISTS).
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

ALTER TABLE supricom_panel.recepcion_packing_items
  ADD COLUMN lleva_serial TINYINT(1) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_packing_seriales (
  id INT NOT NULL AUTO_INCREMENT,
  recepcion_id INT NOT NULL,
  item_id INT NOT NULL,
  serial VARCHAR(100) NOT NULL,
  escaneado_por VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recepcion_serial (recepcion_id, serial),
  KEY idx_serial_item (item_id),
  KEY idx_serial (serial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_codigos_alias (
  codigo VARCHAR(100) NOT NULL,
  producto_codigo VARCHAR(100) NOT NULL,
  creado_por VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Comprobacion: tienen que aparecer la columna y las dos tablas.
SHOW COLUMNS FROM supricom_panel.recepcion_packing_items LIKE 'lleva_serial';
SHOW TABLES FROM supricom_panel LIKE 'recepcion_packing_seriales';
SHOW TABLES FROM supricom_panel LIKE 'recepcion_codigos_alias';
