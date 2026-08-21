ALTER TABLE service_costs
  ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' AFTER monthly_cost;
