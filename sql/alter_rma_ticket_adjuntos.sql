-- Adjuntos de tickets publicos del Portal RMA
-- Issue #21: [Portal RMA 4/9] Adjuntos: subida de imagenes y video del reporte
--
-- Patron de almacenamiento: LONGBLOB en MySQL (mismo enfoque que product_images en
-- app/api/adminleads/banco-imagenes/route.ts) para que sobrevivan a los deploys.
-- .gitignore confirma que uploads/ local no es versionable, el disco no es confiable.
--
-- Tipos permitidos (validados en el servidor, NO se confia en Content-Type del cliente):
--   image/jpeg, image/png, image/webp, image/heic
--   video/mp4, video/quicktime
-- Tamano maximo por archivo: 20 MB (definido en el endpoint).

CREATE TABLE IF NOT EXISTS rma_ticket_adjuntos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT DEFAULT NULL,
  tracking_token VARCHAR(64) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  data LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tracking_token (tracking_token),
  INDEX idx_ticket (ticket_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ALTERs para columnas que el issue #22 agrega a rma_cases.
-- MySQL NO soporta "ADD COLUMN IF NOT EXISTS" antes de la 8.0.29, asi que cada
-- ALTER va separado y se ignora el error si la columna ya existe (patron usado
-- por los otros ALTERs del repo, ej. app/api/adminleads/banco-imagenes/route.ts).
-- El endpoint ya llama a ensurePortalColumns() en runtime con el mismo patron.

ALTER TABLE rma_cases ADD COLUMN origen ENUM('interno','portal') DEFAULT 'interno';
ALTER TABLE rma_cases ADD COLUMN tracking_token VARCHAR(64) DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN odoo_partner_id INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN odoo_product_id INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN serial VARCHAR(100) DEFAULT NULL;

ALTER TABLE rma_cases ADD INDEX idx_origen (origen);
ALTER TABLE rma_cases ADD UNIQUE INDEX uk_tracking_token (tracking_token);

-- FK con ticket_id. La tabla rma_cases ya existe (sql/rma_cases.sql).
-- Solo agregar el FK si no existe ya.

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rma_ticket_adjuntos'
    AND CONSTRAINT_NAME = 'fk_adjuntos_ticket'
);

SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE rma_ticket_adjuntos ADD CONSTRAINT fk_adjuntos_ticket FOREIGN KEY (ticket_id) REFERENCES rma_cases(id) ON DELETE CASCADE',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;