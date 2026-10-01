-- Solicitudes de Material POP hechas por los vendedores.
-- Ejecutar una sola vez sobre instalaciones existentes de Material POP.
--
-- El vendedor arma una solicitud (productos, cantidades, cliente de Odoo) y el
-- adminLeads de la sede la aprueba, la rechaza o la entrega. Aprobar RESERVA el
-- material: la reserva no se guarda en ninguna columna, se calcula como la suma
-- de `approved_quantity` de las solicitudes en estado 'aprobada'. Un número
-- guardado se puede desincronizar (una cancelación a medias, un UPDATE a mano) y
-- entonces el inventario miente sin que nadie se entere; derivado no puede.
--
-- El stock real baja recién al entregar, con los movimientos de salida de
-- siempre. `movement_group_id` enlaza la solicitud con esos movimientos.
--
-- La cotización NO se guarda aquí: se guarda el nombre de la orden en Odoo
-- (`odoo_order_name`, por ejemplo S-05457) y el panel la lee en vivo.

CREATE TABLE IF NOT EXISTS pop_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NULL,
  seller_user_id INT NULL,
  seller_name VARCHAR(255) NULL,
  seller_odoo_id INT NULL,
  client_id INT NULL,
  client_name VARCHAR(255) NULL,
  -- 'inmediata': se entrega ya. 'al_comprar': se entrega cuando el cliente
  -- concrete la compra, y entonces se exige la orden de Odoo.
  delivery_condition ENUM('inmediata','al_comprar') NOT NULL DEFAULT 'inmediata',
  odoo_order_name VARCHAR(50) NULL,
  status ENUM('pendiente','aprobada','rechazada','entregada','cancelada') NOT NULL DEFAULT 'pendiente',
  notes TEXT NULL,
  review_notes VARCHAR(500) NULL,
  reviewed_by_user_id INT NULL,
  reviewed_by_name VARCHAR(255) NULL,
  reviewed_at DATETIME NULL,
  delivered_at DATETIME NULL,
  movement_group_id CHAR(36) NULL,
  cids INT DEFAULT 9,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_seller (seller_user_id),
  INDEX idx_cids (cids),
  INDEX idx_group (movement_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_request_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  -- NULL mientras esté pendiente. Al aprobar se guarda lo autorizado, que
  -- puede ser menos que lo pedido.
  approved_quantity DECIMAL(12,2) NULL,
  FOREIGN KEY (request_id) REFERENCES pop_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES pop_products(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_request_product (request_id, product_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
