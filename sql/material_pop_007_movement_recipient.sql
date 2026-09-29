-- Persona a la que se entrega el material en las salidas de material POP.
-- Ejecutar una sola vez. Con el prefijo de la base porque el phpMyAdmin de
-- EasyPanel no acepta sentencias sin ella.
--
-- La nota de entrega ahora sale para toda salida (uso interno, evento,
-- campaña y cliente), y en uso interno el dato es obligatorio: sin él no hay
-- a quién pedirle la firma de recibido. Hasta correr esto, el panel registra
-- las salidas sin ese dato y rechaza las de uso interno.
--
-- MySQL no tiene ADD COLUMN IF NOT EXISTS: verificar con el SHOW COLUMNS de
-- abajo y, si la columna ya aparece, saltear el ALTER.

SHOW COLUMNS FROM supricom_panel.pop_movements LIKE 'recipient_name';

ALTER TABLE supricom_panel.pop_movements
  ADD COLUMN recipient_name VARCHAR(255) NULL AFTER seller_name;

SHOW COLUMNS FROM supricom_panel.pop_movements LIKE 'recipient_name';
