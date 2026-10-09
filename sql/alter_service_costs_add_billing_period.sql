-- Suscripciones mensuales o anuales (AdminLeads > Servicios).
-- El panel agrega la columna solo al abrir la pestaña; este script es para
-- correrla a mano en el phpMyAdmin si el usuario de la app no puede hacer ALTER.
-- Antes: SHOW COLUMNS FROM supricom_panel.service_costs;  (no debe estar billing_period)
ALTER TABLE supricom_panel.service_costs
  ADD COLUMN billing_period ENUM('monthly','annual') NOT NULL DEFAULT 'monthly' AFTER monthly_cost;
-- Después: SHOW COLUMNS FROM supricom_panel.service_costs;
