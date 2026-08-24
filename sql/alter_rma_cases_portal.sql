-- Issue #22 [Portal RMA 5/9] Persistencia del ticket publico
-- Columnas nuevas en rma_cases para distinguir tickets del portal publico y
-- guardar los ids reales de Odoo (necesarios para que el tecnico navegue a la
-- factura original sin parsear texto).
--
-- MySQL NO soporta "ADD COLUMN IF NOT EXISTS" antes de la 8.0.29. Cada ALTER
-- va separado: si la columna ya existe, MySQL lanza "Duplicate column" y se
-- ignora. Patron copiado de los ALTERs idempotentes del repo
-- (ej. app/api/adminleads/banco-imagenes/route.ts y la migracion de adjuntos).
-- El endpoint POST /api/servicio-tecnico/ticket corre ensurePortalColumns()
-- en runtime con el mismo patron, asi que la migracion manual es opcional.

ALTER TABLE rma_cases ADD COLUMN origen ENUM('interno','portal') DEFAULT 'interno';
ALTER TABLE rma_cases ADD COLUMN tracking_token VARCHAR(64) DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN odoo_partner_id INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN odoo_product_id INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN serial VARCHAR(100) DEFAULT NULL;

ALTER TABLE rma_cases ADD INDEX idx_origen (origen);
ALTER TABLE rma_cases ADD UNIQUE INDEX uk_tracking_token (tracking_token);