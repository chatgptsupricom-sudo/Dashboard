-- ============================================================
-- Conteo por contenedor de la recepcion por packing list
-- (lib/recepcion/conteo.ts)
--
-- NO hace falta correrlo: el panel crea la tabla y agrega la columna solo
-- la primera vez que abre una recepcion. Queda como referencia, y por si
-- el usuario de la base no puede crear tablas.
--
-- Varios telefonos de Almacen cuentan a la vez, cada uno en su contenedor.
-- Una fila por (renglon, contenedor): lo esperado (si el packing list lo
-- dice) y lo contado. recepcion_packing_items.cantidad_recibida es la suma.
-- contenedor_id = 0: sin contenedor (recepcion por factura, o lo contado
-- antes de esto).
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW TABLES FROM supricom_panel LIKE 'recepcion_packing_conteo';
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing_seriales LIKE 'contenedor_id';
-- Si la columna ya existe, saca el ALTER (MySQL no tiene ADD COLUMN IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_packing_conteo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recepcion_id INT NOT NULL,
  item_id INT NOT NULL,
  contenedor_id INT NOT NULL DEFAULT 0,
  cantidad_esperada DECIMAL(14,3) DEFAULT NULL,
  cantidad_recibida DECIMAL(14,3) DEFAULT NULL,
  actualizado_por VARCHAR(200) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conteo_item_contenedor (item_id, contenedor_id),
  KEY idx_conteo_recepcion (recepcion_id),
  CONSTRAINT fk_conteo_item FOREIGN KEY (item_id)
    REFERENCES supricom_panel.recepcion_packing_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- En que contenedor se pistoleo cada serial.
ALTER TABLE supricom_panel.recepcion_packing_seriales
  ADD COLUMN contenedor_id INT NOT NULL DEFAULT 0;

-- Verificacion:
SHOW TABLES FROM supricom_panel LIKE 'recepcion_packing_conteo';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_seriales LIKE 'contenedor_id';
