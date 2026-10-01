-- ============================================================
-- PLAN DE CONTENIDO — FRECUENCIA CPM
-- Base de datos para el módulo de planificación mensual
-- ============================================================

-- Planes mensuales
CREATE TABLE IF NOT EXISTS cpm_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  year INT NOT NULL,
  month INT NOT NULL,
  status ENUM('borrador','activo','cerrado') DEFAULT 'borrador',
  holidays_json TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_plan (year, month, created_by)
);

-- CPMs del plan
CREATE TABLE IF NOT EXISTS plan_cpms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('categoria','producto','marca','empresa') NOT NULL,
  stock_total INT DEFAULT 0,
  supri_count INT DEFAULT 0,
  persona_count INT DEFAULT 0,
  carrusel_count INT DEFAULT 0,
  post_count INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (plan_id) REFERENCES cpm_plans(id) ON DELETE CASCADE,
  INDEX idx_plan (plan_id)
);

-- Productos de cada CPM (desde Odoo)
CREATE TABLE IF NOT EXISTS plan_cpm_products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cpm_id INT NOT NULL,
  odoo_product_id INT,
  sku VARCHAR(100),
  product_name VARCHAR(255),
  brand VARCHAR(100),
  stock INT DEFAULT 0,
  price DECIMAL(10,2),
  included BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (cpm_id) REFERENCES plan_cpms(id) ON DELETE CASCADE,
  INDEX idx_cpm (cpm_id)
);

-- Contenido guardado
CREATE TABLE IF NOT EXISTS plan_saved_content (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  format ENUM('supri','persona','carrusel','post') NOT NULL,
  publish_date DATE NOT NULL,
  justification TEXT,
  FOREIGN KEY (plan_id) REFERENCES cpm_plans(id) ON DELETE CASCADE,
  INDEX idx_plan (plan_id)
);

-- Calendario distribuido
CREATE TABLE IF NOT EXISTS plan_calendar (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  piece_number INT NOT NULL,
  date_key DATE NOT NULL,
  cpm_id INT,
  cpm_name VARCHAR(100),
  format ENUM('supri','persona','carrusel','post') NOT NULL,
  topic TEXT,
  is_saved BOOLEAN DEFAULT FALSE,
  saved_content_id INT,
  FOREIGN KEY (plan_id) REFERENCES cpm_plans(id) ON DELETE CASCADE,
  INDEX idx_plan_date (plan_id, date_key)
);
