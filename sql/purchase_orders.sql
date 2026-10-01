-- Flujo de órdenes de compra del Panel de Compras (issues #150–#157).
-- Ejecutar en la base MySQL.
--
-- Persistencia 100% en MySQL: la app NUNCA escribe en Odoo (ver
-- lib/audit/logger.ts). De Odoo solo se lee el catálogo de productos,
-- los proveedores y sus precios para poblar el formulario; el snapshot
-- legible (supplier_name, product_code, description) se guarda acá para
-- que la orden no dependa de que el registro siga existiendo en Odoo.
--
-- Máquina de estados (columna `status`):
--   borrador  -> creada y editable por el rol `compras`
--   enviada   -> `compras` la manda a aprobación; queda bloqueada
--   aprobada  -> `superadmin` la aprueba; queda bloqueada
--   rechazada -> `superadmin` la desaprueba con motivo; vuelve a editable
-- Solo `superadmin` puede pasar a `aprobada`/`rechazada`. Toda transición
-- se registra en `purchase_order_history`.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(20) NOT NULL UNIQUE,          -- OC-2026-000123 (correlativo por año, se genera en el API)
  company_id INT NOT NULL DEFAULT 9,                 -- 9 Valencia / 10 Caracas / 7 Panamá (lib/compras/constants.ts)
  supplier_odoo_id INT DEFAULT NULL,                 -- res.partner.id en Odoo
  supplier_name VARCHAR(200) NOT NULL,               -- snapshot legible del proveedor
  status ENUM('borrador','enviada','aprobada','rechazada') NOT NULL DEFAULT 'borrador',
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  expected_date DATE DEFAULT NULL,                   -- fecha esperada de recepción
  notes TEXT DEFAULT NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,         -- suma de líneas, calculado en el servidor
  total DECIMAL(14,2) NOT NULL DEFAULT 0,            -- total de la orden (por ahora == subtotal; deja margen para impuestos/descuentos)
  created_by VARCHAR(200) NOT NULL,                  -- payload.name del token
  created_by_id VARCHAR(64) DEFAULT NULL,            -- payload.sub del token
  submitted_at TIMESTAMP NULL DEFAULT NULL,          -- cuándo pasó a `enviada`
  approved_by VARCHAR(200) DEFAULT NULL,             -- superadmin que aprobó
  approved_at TIMESTAMP NULL DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,                -- motivo del último rechazo (obligatorio al rechazar)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_po_status (status),
  INDEX idx_po_company (company_id),
  INDEX idx_po_created_by (created_by_id),
  INDEX idx_po_created_at (created_at),
  INDEX idx_po_order_number (order_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_odoo_id INT DEFAULT NULL,                  -- product.product.id en Odoo
  product_code VARCHAR(100) DEFAULT NULL,            -- default_code (snapshot)
  description VARCHAR(500) NOT NULL,                  -- nombre del producto o texto libre (snapshot)
  quantity DECIMAL(14,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0,       -- quantity * unit_price, calculado en el servidor
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pol_order (order_id),
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  from_status VARCHAR(20) DEFAULT NULL,              -- NULL en la fila inicial de creación
  to_status VARCHAR(20) NOT NULL,
  changed_by VARCHAR(200) NOT NULL,                  -- payload.name
  changed_by_role VARCHAR(50) DEFAULT NULL,          -- payload.role
  comment TEXT DEFAULT NULL,                         -- motivo de rechazo / nota de la transición
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_poh_order (order_id),
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
