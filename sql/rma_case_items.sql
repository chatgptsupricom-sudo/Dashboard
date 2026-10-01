-- ============================================================
-- SERVICIO TECNICO: UN ENVIO CON VARIOS PRODUCTOS (issue #331, paso 1)
--
-- Hasta ahora cada caso de rma_cases era un solo producto. Desde aca un caso
-- es un ENVIO del cliente, y los productos que trae van en rma_case_items:
-- cada uno con su falla, su estado, su diagnostico y su garantia, porque RMA
-- los repara de a uno.
--
-- Los campos de producto de rma_cases (product_code, brand, model, serial,
-- status, diagnosis...) se quedan: mientras el resto del panel se adapta,
-- siguen reflejando el PRIMER producto del envio, asi que nada de lo que ya
-- existe deja de funcionar.
--
-- Escrito para el phpMyAdmin de EasyPanel:
--   * NO usa information_schema (#1044 Acceso negado).
--   * Cada tabla lleva la base delante (supricom_panel.tabla).
--
-- ANTES DE CORRERLO:
--   1. Si la base no se llama `supricom_panel`, reemplaza ese nombre en todo
--      el archivo.
--   2. Mira que no este aplicado ya (MySQL no tiene ADD COLUMN IF NOT EXISTS):
--        SHOW TABLES FROM supricom_panel LIKE 'rma_case_items';
--        SHOW COLUMNS FROM supricom_panel.rma_ticket_adjuntos LIKE 'item_id';
--        SHOW COLUMNS FROM supricom_panel.rma_history LIKE 'item_id';
--      Si alguna devuelve una fila, esa parte ya esta: saltate su sentencia.
--
-- La conversion del paso 3 se puede correr las veces que haga falta: solo
-- crea el producto de los casos que todavia no tienen ninguno.
-- ============================================================

-- 1. Productos de cada envio.
CREATE TABLE IF NOT EXISTS supricom_panel.rma_case_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  -- Orden dentro del envio (1, 2, 3...), el mismo en que el cliente los cargo.
  orden INT NOT NULL DEFAULT 1,
  product_code VARCHAR(100) DEFAULT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  brand VARCHAR(100) DEFAULT NULL,
  model VARCHAR(500) DEFAULT NULL,
  -- El serial de Odoo si existe; en los casos internos, el texto libre que
  -- se escribio en serial_quantity.
  serial VARCHAR(200) DEFAULT NULL,
  odoo_product_id INT DEFAULT NULL,
  reported_fault TEXT,
  status ENUM('recibido','reparado','nota_credito','no_procesado','reingresado') NOT NULL DEFAULT 'recibido',
  diagnosis TEXT,
  notes TEXT,
  garantia_estado VARCHAR(20) DEFAULT NULL,
  garantia_meses INT DEFAULT NULL,
  garantia_vence DATE DEFAULT NULL,
  garantia_marca VARCHAR(100) DEFAULT NULL,
  despachado_at DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  INDEX idx_serial (serial),
  INDEX idx_status (status),
  CONSTRAINT fk_items_case FOREIGN KEY (case_id)
    REFERENCES supricom_panel.rma_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Fotos e historial por producto. NULL = del envio completo (asi quedan
--    los que ya existen).
ALTER TABLE supricom_panel.rma_ticket_adjuntos
  ADD COLUMN item_id INT DEFAULT NULL,
  ADD INDEX idx_item (item_id);

ALTER TABLE supricom_panel.rma_history
  ADD COLUMN item_id INT DEFAULT NULL,
  ADD INDEX idx_item (item_id);

-- 3. Conversion: cada caso que ya existe pasa a ser un envio de un producto,
--    con los datos que tenia el caso.
INSERT INTO supricom_panel.rma_case_items (
  case_id, orden, product_code, hardware, brand, model, serial,
  odoo_product_id, reported_fault, status, diagnosis, notes,
  garantia_estado, garantia_meses, garantia_vence, garantia_marca,
  despachado_at, created_at
)
SELECT
  c.id, 1, c.product_code, c.hardware, c.brand, c.model,
  COALESCE(NULLIF(c.serial, ''), NULLIF(c.serial_quantity, '')),
  c.odoo_product_id, c.reported_fault, c.status, c.diagnosis, c.notes,
  c.garantia_estado, c.garantia_meses, c.garantia_vence, c.garantia_marca,
  c.despachado_at, c.created_at
FROM supricom_panel.rma_cases c
WHERE NOT EXISTS (
  SELECT 1 FROM supricom_panel.rma_case_items i WHERE i.case_id = c.id
);

-- Comprobacion: las tres primeras devuelven una fila; en la ultima, los dos
-- numeros tienen que ser iguales (un producto por cada caso).
SHOW TABLES FROM supricom_panel LIKE 'rma_case_items';
SHOW COLUMNS FROM supricom_panel.rma_ticket_adjuntos LIKE 'item_id';
SHOW COLUMNS FROM supricom_panel.rma_history LIKE 'item_id';
SELECT
  (SELECT COUNT(*) FROM supricom_panel.rma_cases) AS casos,
  (SELECT COUNT(DISTINCT case_id) FROM supricom_panel.rma_case_items) AS casos_con_producto;
