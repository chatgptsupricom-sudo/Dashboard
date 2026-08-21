CREATE TABLE IF NOT EXISTS campaign_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_name VARCHAR(255) NOT NULL,
  impressions INT DEFAULT NULL,
  clicks INT DEFAULT NULL,
  leads_from_ads INT DEFAULT NULL,
  calificados INT DEFAULT NULL,
  no_calificados INT DEFAULT NULL,
  ventas_cerradas INT DEFAULT NULL,
  recaudo_usd DECIMAL(10,2) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_campaign (campaign_name)
);
