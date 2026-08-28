-- ============================================================
-- Parche puntual: agrega solo lo que falto de la migracion grande
-- (sql/migrar_seguridad_completo.sql) en esta base especifica.
--
-- Idempotente: cada bloque revisa information_schema antes de alterar, asi
-- que se puede correr las veces que haga falta sin romper nada, incluso si
-- alguna de estas columnas ya existe.
-- ============================================================

-- --- seguridad_mercancia: cids (la que causo el error reportado) ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia ADD COLUMN cids INT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia'
      AND INDEX_NAME = 'idx_cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia ADD INDEX idx_cids (cids)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- seguridad_mercancia_items: no_salio (issue #44) ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia_items'
      AND COLUMN_NAME = 'no_salio') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia_items ADD COLUMN no_salio TINYINT(1) NOT NULL DEFAULT 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- seguridad_ingresos: cids ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_ingresos'
      AND COLUMN_NAME = 'cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_ingresos ADD COLUMN cids INT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_ingresos'
      AND INDEX_NAME = 'idx_cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_ingresos ADD INDEX idx_cids (cids)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- seguridad_despachos: cids ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_despachos ADD COLUMN cids INT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_despachos'
      AND INDEX_NAME = 'idx_cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_despachos ADD INDEX idx_cids (cids)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- seguridad_calificaciones: cids ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_calificaciones'
      AND COLUMN_NAME = 'cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_calificaciones ADD COLUMN cids INT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_calificaciones'
      AND INDEX_NAME = 'idx_cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_calificaciones ADD INDEX idx_cids (cids)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- seguridad_firmas: cids ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_firmas'
      AND COLUMN_NAME = 'cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_firmas ADD COLUMN cids INT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_firmas'
      AND INDEX_NAME = 'idx_cids') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_firmas ADD INDEX idx_cids (cids)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- Catalogos de Mercancia (almacenistas, choferes, unidades) ---

CREATE TABLE IF NOT EXISTS seguridad_catalogo_almacenistas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nombre_cids (nombre, cids),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_catalogo_choferes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nombre_cids (nombre, cids),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_catalogo_unidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placa VARCHAR(50) NOT NULL,
  descripcion VARCHAR(200) DEFAULT NULL,
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_placa_cids (placa, cids),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Comprobacion: debe decir 6 (5 columnas cids + no_salio) y 3 (las 3
-- tablas de catalogo). Si alguno sale en menos, ese bloque especifico
-- fallo y conviene revisar el mensaje de error de esa corrida.
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (TABLE_NAME, COLUMN_NAME) IN (
        ('seguridad_mercancia','cids'),
        ('seguridad_mercancia_items','no_salio'),
        ('seguridad_ingresos','cids'),
        ('seguridad_despachos','cids'),
        ('seguridad_calificaciones','cids'),
        ('seguridad_firmas','cids'))) AS columnas_de_6,
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('seguridad_catalogo_almacenistas',
                         'seguridad_catalogo_choferes',
                         'seguridad_catalogo_unidades')) AS tablas_de_3;
