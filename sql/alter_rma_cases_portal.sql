-- Issue #22 [Portal RMA 5/9] Persistencia del ticket publico
-- Columnas nuevas en rma_cases para distinguir tickets del portal publico y
-- guardar los ids reales de Odoo (necesarios para que el tecnico navegue a la
-- factura original sin parsear texto).
--
-- El ALTER es idempotente: cada ADD COLUMN se intenta por separado y si ya
-- existe la columna, MySQL lanza Duplicate column y lo ignoramos.
-- Patron copiado de sql/alter_*.sql del repo.

ALTER TABLE rma_cases ADD COLUMN origen ENUM('interno','portal') DEFAULT 'interno';
ALTER TABLE rma_cases ADD COLUMN tracking_token VARCHAR(64) DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN odoo_partner_id INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN odoo_product_id INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN serial VARCHAR(100) DEFAULT NULL;

ALTER TABLE rma_cases ADD INDEX idx_origen (origen);
ALTER TABLE rma_cases ADD UNIQUE INDEX uk_tracking_token (tracking_token);