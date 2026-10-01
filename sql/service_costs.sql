CREATE TABLE IF NOT EXISTS service_costs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  cost_type ENUM('subscription', 'topup') NOT NULL DEFAULT 'subscription',
  monthly_cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_service (service_name)
);

CREATE TABLE IF NOT EXISTS service_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_service_date (service_name, transaction_date)
);
