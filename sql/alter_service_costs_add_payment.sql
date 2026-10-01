ALTER TABLE service_costs
  ADD COLUMN payment_date DATE DEFAULT NULL AFTER monthly_cost,
  ADD COLUMN is_paid TINYINT(1) DEFAULT 0 AFTER payment_date;
