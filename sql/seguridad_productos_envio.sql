-- ============================================================
-- SERVICIO TECNICO: PRODUCTOS DEL ENVIO EN SEGURIDAD (issue #331, paso 4)
--
-- Un envio de servicio tecnico puede traer varios productos. Seguridad hace
-- UN ingreso por envio, con la lista de productos para marcar cuales llegaron
-- (y con que serial), y lo devuelve en uno o varios despachos: cada despacho
-- dice que productos salieron.
--
-- Requiere sql/rma_case_items.sql (paso 1) ya aplicado.
--
-- Escrito para el phpMyAdmin de EasyPanel (sin information_schema, con la
-- base delante). ANTES DE CORRERLO mira que no este aplicado:
--   SHOW TABLES FROM supricom_panel LIKE 'seguridad_ingreso_items';
--   SHOW TABLES FROM supricom_panel LIKE 'seguridad_despacho_items';
-- Si alguna devuelve una fila, esa tabla ya esta: saltate su CREATE.
-- ============================================================

-- Lo que Seguridad reviso en el mostrador, producto por producto.
CREATE TABLE IF NOT EXISTS supricom_panel.seguridad_ingreso_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ingreso_id INT NOT NULL,
  -- Producto del envio (rma_case_items.id). NULL si se borro despues.
  rma_item_id INT DEFAULT NULL,
  -- Copia de lo que se firmo: el acta no cambia si RMA corrige el producto.
  producto VARCHAR(500) NOT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  recibido TINYINT(1) NOT NULL DEFAULT 1,
  observacion VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ingreso (ingreso_id),
  INDEX idx_rma_item (rma_item_id),
  CONSTRAINT fk_ingreso_items_ingreso FOREIGN KEY (ingreso_id)
    REFERENCES supricom_panel.seguridad_ingresos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Que productos salieron en cada despacho (devolucion total o parcial).
CREATE TABLE IF NOT EXISTS supricom_panel.seguridad_despacho_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  despacho_id INT NOT NULL,
  rma_item_id INT DEFAULT NULL,
  producto VARCHAR(500) NOT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_despacho (despacho_id),
  INDEX idx_rma_item (rma_item_id),
  CONSTRAINT fk_despacho_items_despacho FOREIGN KEY (despacho_id)
    REFERENCES supricom_panel.seguridad_despachos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprobacion: cada una tiene que devolver una fila.
SHOW TABLES FROM supricom_panel LIKE 'seguridad_ingreso_items';
SHOW TABLES FROM supricom_panel LIKE 'seguridad_despacho_items';
