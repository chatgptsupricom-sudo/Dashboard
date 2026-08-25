-- Issue #28 [Portal RMA 10/11] Motor de garantia
-- Tabla configurable por marca. Servicio tecnico puede cambiar un plazo sin
-- pedir un deploy.
--
-- meses = NULL significa "vida util" (caso ASTA): el producto esta cubierto
-- mientras exista, no hay fecha de vencimiento.
--
-- El default de 12 meses NO es una fila: vive como constante en lib/garantia.ts,
-- porque no es una marca.

CREATE TABLE IF NOT EXISTS rma_garantias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(100) NOT NULL UNIQUE,
  meses INT NULL,
  notas VARCHAR(255) DEFAULT NULL,
  updated_by VARCHAR(200) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_marca (marca)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Log de productos cuya marca no se pudo resolver. Para que servicio tecnico
-- pueda volver a Odoo y completar el dato x_studio_marca. Si esto no se mide,
-- el agujero nunca se cierra.

CREATE TABLE IF NOT EXISTS rma_garantias_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT DEFAULT NULL,
  producto_nombre VARCHAR(500) DEFAULT NULL,
  motivo VARCHAR(50) NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha),
  INDEX idx_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;