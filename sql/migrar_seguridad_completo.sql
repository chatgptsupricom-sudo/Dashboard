-- ============================================================
-- Modulo Seguridad: todas las migraciones en un solo archivo.
--
-- Se puede correr VARIAS VECES sin romper nada: cada tabla usa
-- CREATE TABLE IF NOT EXISTS y cada columna se agrega solo si no existe.
--
-- Por que no basta con concatenar los archivos sueltos: `ALTER TABLE ... ADD
-- COLUMN` falla con "Duplicate column name" cuando la columna ya esta, y eso
-- corta el resto del script. En un despliegue donde nadie recuerda que se
-- corrio antes, un script que se puede repetir vale mas que uno que hay que
-- ejecutar en el orden justo.
--
-- No se usa `ADD COLUMN IF NOT EXISTS`: MariaDB lo soporta pero MySQL no,
-- antes de 8.0.29. La consulta a information_schema funciona en los dos.
--
-- No se usan procedimientos almacenados a proposito: harian falta DELIMITER,
-- que es una directiva del cliente y no la entienden todas las consolas.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tablas del modulo (issues #30 a #33)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seguridad_ingresos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rma_case_id INT DEFAULT NULL,
  fecha_entrega DATE NOT NULL,
  factura_numero VARCHAR(100) DEFAULT NULL,
  cliente_nombre VARCHAR(200) NOT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  descripcion_falla TEXT DEFAULT NULL,
  accesorios_integros TINYINT(1) NOT NULL,
  sin_manipulacion TINYINT(1) NOT NULL,
  dentro_de_fecha TINYINT(1) NOT NULL,
  falla_cubierta_garantia TINYINT(1) NOT NULL,
  recibido_por VARCHAR(200) NOT NULL,
  foto_estado_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha_entrega),
  INDEX idx_cliente (cliente_nombre),
  INDEX idx_rma_case (rma_case_id),
  INDEX idx_recibido (recibido_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_despachos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ingreso_id INT DEFAULT NULL,
  rma_case_id INT DEFAULT NULL,
  fecha_despacho DATE NOT NULL,
  almacenista_nombre VARCHAR(200) NOT NULL,
  facturas_json TEXT DEFAULT NULL,
  cliente_retira VARCHAR(200) DEFAULT NULL,
  accesorios_integros TINYINT(1) NOT NULL,
  observaciones TEXT DEFAULT NULL,
  firma_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha_despacho),
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_ingreso (ingreso_id),
  INDEX idx_rma_case (rma_case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_calificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  almacenista_nombre VARCHAR(200) NOT NULL,
  calificacion TINYINT NOT NULL,
  relacionado_a ENUM('ingreso','despacho') NOT NULL,
  relacionado_id INT NOT NULL,
  comentario VARCHAR(500) DEFAULT NULL,
  calificado_por VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_relacionado (relacionado_a, relacionado_id),
  INDEX idx_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------
-- 2. Las 4 firmas del acta y la configuracion del modulo
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seguridad_firmas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acta_tipo ENUM('ingreso','despacho') NOT NULL,
  acta_id INT NOT NULL,
  rol ENUM('tecnico','almacen','seguridad','cliente') NOT NULL,
  firmante_nombre VARCHAR(200) NOT NULL,
  firma_data LONGBLOB NOT NULL,
  firma_mime VARCHAR(50) DEFAULT 'image/png',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acta_rol (acta_tipo, acta_id, rol),
  INDEX idx_acta (acta_tipo, acta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_config (
  clave VARCHAR(64) PRIMARY KEY,
  valor VARCHAR(500) NOT NULL,
  actualizado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ON DUPLICATE KEY UPDATE valor = valor: si ya esta configurado, se respeta el
-- nombre que hayan puesto. Repetir el script no pisa el tecnico actual.
INSERT INTO seguridad_config (clave, valor) VALUES
  ('tecnico_nombre', 'Ing. Manuel García'),
  ('tecnico_cargo', 'Técnico de OSC')
ON DUPLICATE KEY UPDATE valor = valor;


-- ------------------------------------------------------------
-- 3. Columnas agregadas despues, cada una solo si falta
-- ------------------------------------------------------------

-- seguridad_ingresos.idempotency_key  (cola offline del mostrador, #39)
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_ingresos'
      AND COLUMN_NAME = 'idempotency_key') > 0,
  'SELECT "idempotency_key ya existe" AS aviso',
  'ALTER TABLE seguridad_ingresos ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_ingresos'
      AND INDEX_NAME = 'uq_idempotency_key') > 0,
  'SELECT "uq_idempotency_key ya existe" AS aviso',
  'ALTER TABLE seguridad_ingresos ADD UNIQUE INDEX uq_idempotency_key (idempotency_key)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- seguridad_ingresos.nd_numero  (numero del encabezado de la planilla)
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_ingresos'
      AND COLUMN_NAME = 'nd_numero') > 0,
  'SELECT "ingresos.nd_numero ya existe" AS aviso',
  'ALTER TABLE seguridad_ingresos ADD COLUMN nd_numero VARCHAR(50) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- seguridad_despachos.nd_numero
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'nd_numero') > 0,
  'SELECT "despachos.nd_numero ya existe" AS aviso',
  'ALTER TABLE seguridad_despachos ADD COLUMN nd_numero VARCHAR(50) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- seguridad_despachos.firma_data / firma_mime
-- La firma unica del cliente, anterior a las 4 firmas. El endpoint las crea
-- solo si faltan, pero se dejan aca para que la base quede completa de una vez.
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'firma_data') > 0,
  'SELECT "firma_data ya existe" AS aviso',
  'ALTER TABLE seguridad_despachos ADD COLUMN firma_data LONGBLOB NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'firma_mime') > 0,
  'SELECT "firma_mime ya existe" AS aviso',
  'ALTER TABLE seguridad_despachos ADD COLUMN firma_mime VARCHAR(50) DEFAULT ''image/png'' NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- rma_cases.despachado_at  (issue #32)
-- Solo si la tabla rma_cases existe: en una base sin el modulo RMA no hay nada
-- que alterar, y el script no deberia caerse por eso.
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rma_cases') = 0
  OR (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rma_cases'
      AND COLUMN_NAME = 'despachado_at') > 0,
  'SELECT "rma_cases.despachado_at ya existe o no hay tabla" AS aviso',
  'ALTER TABLE rma_cases ADD COLUMN despachado_at DATE DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rma_cases') = 0
  OR (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rma_cases'
      AND INDEX_NAME = 'idx_despachado') > 0,
  'SELECT "idx_despachado ya existe o no hay tabla" AS aviso',
  'ALTER TABLE rma_cases ADD INDEX idx_despachado (despachado_at)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ------------------------------------------------------------
-- 4. Comprobacion final
-- ------------------------------------------------------------

SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('seguridad_ingresos','seguridad_despachos',
                         'seguridad_calificaciones','seguridad_firmas',
                         'seguridad_config')) AS tablas_de_5,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (TABLE_NAME, COLUMN_NAME) IN (
        ('seguridad_ingresos','idempotency_key'),
        ('seguridad_ingresos','nd_numero'),
        ('seguridad_despachos','nd_numero'),
        ('seguridad_despachos','firma_data'),
        ('seguridad_despachos','firma_mime'),
        ('rma_cases','despachado_at'))) AS columnas_de_6;
