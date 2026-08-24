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

-- ALTER para columnas que el issue #22 agregara a rma_cases.
-- Estas columnas son las que usa el endpoint de adjuntos para ligar los archivos
-- al ticket. El ALTER es idempotente.

ALTER TABLE rma_cases
  ADD COLUMN IF NOT EXISTS origen ENUM('interno','portal') DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS tracking_token VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_partner_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_product_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS serial VARCHAR(100) DEFAULT NULL;

-- El FK con ticket_id se agrega cuando la columna exista y sea NOT NULL.
-- En esta migracion ticket_id queda NULL para poder guardar adjuntos antes
-- de que el ticket exista (permite subida en pasos previos del formulario).

ALTER TABLE rma_ticket_adjuntos
  ADD CONSTRAINT fk_adjuntos_ticket
  FOREIGN KEY (ticket_id) REFERENCES rma_cases(id) ON DELETE CASCADE;