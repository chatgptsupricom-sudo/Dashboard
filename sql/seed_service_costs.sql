INSERT INTO service_costs (service_name, cost_type, monthly_cost) VALUES
  ('Canva', 'subscription', 0),
  ('CapCut', 'subscription', 0),
  ('Magnifik (Freepik)', 'subscription', 0),
  ('Submagic', 'subscription', 0),
  ('Google', 'subscription', 0),
  ('Open Code', 'subscription', 0),
  ('Claude', 'subscription', 0)
ON DUPLICATE KEY UPDATE service_name = VALUES(service_name);
