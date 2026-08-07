-- Schema for RMA (Return Merchandise Authorization) / Technical Service module
-- Execute in MySQL database

CREATE TABLE IF NOT EXISTS rma_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_number VARCHAR(20) NOT NULL UNIQUE,
  client_name VARCHAR(200) NOT NULL,
  client_email VARCHAR(200) DEFAULT NULL,
  client_phone VARCHAR(50) DEFAULT NULL,
  product_name VARCHAR(200) NOT NULL,
  product_serial VARCHAR(100) DEFAULT NULL,
  product_model VARCHAR(100) DEFAULT NULL,
  reported_fault TEXT NOT NULL,
  status ENUM('recibido','en_reparacion','reparado') NOT NULL DEFAULT 'recibido',
  technician_name VARCHAR(200) DEFAULT NULL,
  diagnosis TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  company_id INT NOT NULL DEFAULT 9,
  created_by VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_company (company_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rma_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  from_status VARCHAR(50) DEFAULT NULL,
  to_status VARCHAR(50) NOT NULL,
  changed_by VARCHAR(200) NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_case (case_id),
  FOREIGN KEY (case_id) REFERENCES rma_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
