-- Banco de Imágenes - Tabla para almacenar imágenes de productos
-- Ejecutar en la base de datos MySQL del dashboard
-- Las imágenes se guardan como binario en image_data (LONGBLOB) para sobrevivir deploys.
-- Las columnas image_data/image_mime se agregan automáticamente vía ALTER TABLE
-- desde la API si la tabla ya existía sin ellas.

CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  odoo_product_id INT DEFAULT NULL,
  product_code VARCHAR(100) DEFAULT NULL,
  model VARCHAR(500) DEFAULT NULL,
  brand VARCHAR(100) DEFAULT NULL,
  category VARCHAR(200) DEFAULT NULL,
  price DECIMAL(12,2) DEFAULT 0,
  image_path VARCHAR(500) NOT NULL,
  image_data LONGBLOB NULL,
  image_mime VARCHAR(100) NULL,
  created_by VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_code (product_code),
  INDEX idx_odoo_id (odoo_product_id),
  INDEX idx_brand (brand),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
