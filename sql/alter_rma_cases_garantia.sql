-- Issue #29: congelar el estado de garantía al momento del reporte.
--
-- Se guarda y NO se recalcula al abrir el caso. La garantía cambia con el
-- tiempo: un cliente que reporta un día antes del vencimiento y al que revisan
-- el caso una semana después aparecería como "fuera de garantía", lo cual es
-- injusto y además discutible. Lo que vale es el estado del día que reportó.
--
-- garantia_marca guarda la marca que se resolvió, para poder auditar después
-- qué se le dijo al cliente y por qué.
--
-- MySQL no soporta ADD COLUMN IF NOT EXISTS antes de 8.0.29; cada ALTER va
-- por separado y "Duplicate column" significa que ya estaba.

ALTER TABLE rma_cases ADD COLUMN garantia_estado VARCHAR(20) DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN garantia_meses INT DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN garantia_vence DATE DEFAULT NULL;
ALTER TABLE rma_cases ADD COLUMN garantia_marca VARCHAR(100) DEFAULT NULL;
