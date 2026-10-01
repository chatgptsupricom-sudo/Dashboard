-- Módulo Material POP
-- Tablas para inventario de material publicitario (POP)
-- Rol: adminLeads con cids = 9 (Valencia) + superAdmin

CREATE TABLE IF NOT EXISTS pop_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  cids INT DEFAULT 9,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name_cids (name, cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_uoms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  allows_decimal TINYINT(1) NOT NULL DEFAULT 0,
  cids INT DEFAULT 9,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name_cids (name, cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  data LONGBLOB NOT NULL,
  cids INT DEFAULT 9,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category_id INT NULL,
  uom_id INT NULL,
  brand VARCHAR(100) NULL,
  description TEXT NULL,
  image_id INT NULL,
  is_active TINYINT DEFAULT 1,
  cids INT DEFAULT 9,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code_cids (code, cids),
  INDEX idx_category (category_id),
  INDEX idx_cids (cids),
  INDEX idx_active (is_active),
  FOREIGN KEY (category_id) REFERENCES pop_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (uom_id) REFERENCES pop_uoms(id) ON DELETE SET NULL,
  FOREIGN KEY (image_id) REFERENCES pop_product_images(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  location ENUM('office','warehouse') NOT NULL,
  quantity DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_product_location (product_id, location),
  FOREIGN KEY (product_id) REFERENCES pop_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_movement_reasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('entry','exit','transfer','adjustment') NOT NULL,
  name VARCHAR(100) NOT NULL,
  cids INT DEFAULT 9,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type_name_cids (type, name, cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pop_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  movement_group_id CHAR(36) NULL,
  type ENUM('entry','exit','transfer','adjustment') NOT NULL,
  product_id INT NOT NULL,
  location ENUM('office','warehouse') NULL,
  source_location ENUM('office','warehouse') NULL,
  target_location ENUM('office','warehouse') NULL,
  quantity DECIMAL(12,2) NOT NULL,
  reason_type VARCHAR(50) NOT NULL,
  reason_custom VARCHAR(255) NULL,
  client_id INT NULL,
  client_name VARCHAR(255) NULL,
  client_cids INT NULL,
  destination VARCHAR(255) NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  created_by_name VARCHAR(255) NULL,
  cids INT DEFAULT 9,
  movement_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES pop_products(id) ON DELETE RESTRICT,
  INDEX idx_type (type),
  INDEX idx_product (product_id),
  INDEX idx_date (movement_date),
  INDEX idx_client (client_id),
  INDEX idx_group (movement_group_id),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed de unidades de medida comunes
INSERT IGNORE INTO pop_uoms (name, cids) VALUES
  ('Unidad', 9),
  ('Metro', 9),
  ('Rollo', 9),
  ('Paquete', 9),
  ('Caja', 9),
  ('Kg', 9)
ON DUPLICATE KEY UPDATE name = name;

-- Seed de categorías sugeridas
INSERT IGNORE INTO pop_categories (name, cids) VALUES
  ('Impresos', 9),
  ('Merchandising', 9),
  ('Mobiliario', 9),
  ('Señalización', 9),
  ('Uniformes', 9)
ON DUPLICATE KEY UPDATE name = name;

-- Seed de motivos de movimiento
INSERT IGNORE INTO pop_movement_reasons (type, name, cids) VALUES
  ('entry', 'Compra', 9),
  ('entry', 'Devolución', 9),
  ('entry', 'Traslado', 9),
  ('entry', 'Ajuste', 9),
  ('exit', 'Cliente', 9),
  ('exit', 'Uso interno', 9),
  ('exit', 'Evento', 9),
  ('exit', 'Campaña', 9),
  ('transfer', 'Traslado interno', 9),
  ('adjustment', 'Inventario físico', 9)
ON DUPLICATE KEY UPDATE name = name;
