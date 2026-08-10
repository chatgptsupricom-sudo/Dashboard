-- Schema for RMA (Return Merchandise Authorization) / Technical Service module
-- Execute in MySQL database

CREATE TABLE IF NOT EXISTS rma_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_number VARCHAR(20) NOT NULL UNIQUE,
  product_code VARCHAR(100) DEFAULT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  brand VARCHAR(100) DEFAULT NULL,
  model           VARCHAR(500) DEFAULT NULL,
  invoice_number VARCHAR(100) DEFAULT NULL,
  client_name VARCHAR(200) NOT NULL,
  serial_quantity VARCHAR(200) DEFAULT NULL,
  reported_fault TEXT NOT NULL,
  status ENUM('recibido','reparado','nota_credito','no_procesado','reingresado') NOT NULL DEFAULT 'recibido',
  diagnosis TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  company_id INT NOT NULL DEFAULT 9,
  created_by VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_company (company_id),
  INDEX idx_created (created_at),
  INDEX idx_case_number (case_number)
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

CREATE TABLE IF NOT EXISTS rma_exit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT DEFAULT NULL,
  product_description VARCHAR(500) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  exit_date DATE NOT NULL,
  authorized_by VARCHAR(200) NOT NULL,
  notes TEXT DEFAULT NULL,
  company_id INT NOT NULL DEFAULT 9,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exit_date (exit_date),
  FOREIGN KEY (case_id) REFERENCES rma_cases(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rma_notas_credito (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  detail TEXT DEFAULT NULL,
  observations TEXT DEFAULT NULL,
  images JSON DEFAULT NULL,
  created_by VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_nc_case (case_id),
  FOREIGN KEY (case_id) REFERENCES rma_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
