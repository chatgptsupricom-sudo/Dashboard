-- ============================================================
-- MODULO SEGURIDAD — MIGRACION UNICA
--
-- Un solo archivo con todo el modulo: RMA (recepcion y despacho de equipos) y
-- Mercancia (carga y descarga de camiones).
--
-- Se puede correr VARIAS VECES sin romper nada, y sobre una base vacia o sobre
-- una a medio migrar. Cada tabla usa CREATE TABLE IF NOT EXISTS y cada columna
-- se agrega solo si falta.
--
-- SUSTITUYE a los archivos sueltos que habia antes (seguridad.sql,
-- add_firmas_acta_seguridad.sql, add_idempotency_key_seguridad_ingresos.sql,
-- add_despachado_at_rma_cases.sql, add_mercancia_seguridad.sql,
-- add_factura_mercancia.sql y rename_contraparte_mercancia.sql). Eran siete
-- que habia que ejecutar en el orden justo, y equivocarse dejaba la base a
-- medias sin avisar.
--
-- No usa `ADD COLUMN IF NOT EXISTS`: MariaDB lo soporta pero MySQL no, antes
-- de 8.0.29. La consulta a information_schema funciona en los dos. Tampoco usa
-- procedimientos almacenados, que necesitarian DELIMITER — una directiva del
-- cliente que no todas las consolas entienden.
--
-- FALTA APARTE: un usuario con rol `seguridad` en users_config
-- (ver sql/insert_role_seguridad.sql).
-- ============================================================


-- ============================================================
-- 1. RMA — recepcion y despacho de equipos
-- ============================================================

CREATE TABLE IF NOT EXISTS seguridad_ingresos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rma_case_id INT DEFAULT NULL,
  fecha_entrega DATE NOT NULL,
  nd_numero VARCHAR(50) DEFAULT NULL,
  factura_numero VARCHAR(100) DEFAULT NULL,
  cliente_nombre VARCHAR(200) NOT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  descripcion_falla TEXT DEFAULT NULL,
  -- Los checks de la planilla van NOT NULL y sin valor por defecto: con
  -- DEFAULT 1 se podia registrar un ingreso sin revisar nada y quedaba
  -- declarado que el equipo llego completo.
  accesorios_integros TINYINT(1) NOT NULL,
  sin_manipulacion TINYINT(1) NOT NULL,
  -- dentro_de_fecha / falla_cubierta_garantia: ya no se piden en el formulario
  -- (#48). La garantia viene congelada en el ticket de RMA. Se dejan NULL-ables
  -- para el historico; ver sql/alter_seguridad_ingresos_quitar_checks_garantia.sql
  dentro_de_fecha TINYINT(1) NULL DEFAULT NULL,
  falla_cubierta_garantia TINYINT(1) NULL DEFAULT NULL,
  recibido_por VARCHAR(200) NOT NULL,
  foto_estado_url VARCHAR(500) DEFAULT NULL,
  idempotency_key VARCHAR(64) DEFAULT NULL,
  -- Sucursal de quien registra (9=Valencia, 10=Caracas, 7=Panama), del mismo
  -- `cids` que ya viaja en el JWT desde el login. NULL en filas viejas: no se
  -- inventa una sucursal para datos historicos que no la tenian, asi que
  -- quedan visibles solo para superadmin en vez de asignarselas a la sucursal
  -- equivocada.
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_idempotency_key (idempotency_key),
  INDEX idx_fecha (fecha_entrega),
  INDEX idx_cliente (cliente_nombre),
  INDEX idx_rma_case (rma_case_id),
  INDEX idx_recibido (recibido_por),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_despachos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ingreso_id INT DEFAULT NULL,
  rma_case_id INT DEFAULT NULL,
  fecha_despacho DATE NOT NULL,
  nd_numero VARCHAR(50) DEFAULT NULL,
  almacenista_nombre VARCHAR(200) NOT NULL,
  facturas_json TEXT DEFAULT NULL,
  cliente_retira VARCHAR(200) DEFAULT NULL,
  accesorios_integros TINYINT(1) NOT NULL,
  observaciones TEXT DEFAULT NULL,
  firma_url VARCHAR(500) DEFAULT NULL,
  firma_data LONGBLOB NULL,
  firma_mime VARCHAR(50) DEFAULT 'image/png' NULL,
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha_despacho),
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_ingreso (ingreso_id),
  INDEX idx_rma_case (rma_case_id),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `cids` propio y no resuelto via `relacionado_a`+`relacionado_id`: esta tabla
-- no tiene FK real a la fila que califica (puede ser ingreso, despacho o
-- mercancia, cada uno en su propia tabla), asi que duplicar el dato al
-- insertar es mas simple y mas rapido de leer que un JOIN condicional por tipo.
CREATE TABLE IF NOT EXISTS seguridad_calificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  almacenista_nombre VARCHAR(200) NOT NULL,
  calificacion TINYINT NOT NULL,
  relacionado_a ENUM('ingreso','despacho','mercancia') NOT NULL,
  relacionado_id INT NOT NULL,
  comentario VARCHAR(500) DEFAULT NULL,
  calificado_por VARCHAR(200) NOT NULL,
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_relacionado (relacionado_a, relacionado_id),
  INDEX idx_fecha (created_at),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. Firmas del acta y configuracion del modulo
-- ============================================================

-- Tabla aparte y no columnas por rol: son 4 roles x 3 tipos de acta. Ademas
-- queda registrado CUANDO firmo cada uno, que en una disputa importa tanto
-- como la firma.
CREATE TABLE IF NOT EXISTS seguridad_firmas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acta_tipo ENUM('ingreso','despacho','mercancia') NOT NULL,
  acta_id INT NOT NULL,
  rol ENUM('tecnico','almacen','seguridad','cliente') NOT NULL,
  firmante_nombre VARCHAR(200) NOT NULL,
  firma_data LONGBLOB NOT NULL,
  firma_mime VARCHAR(50) DEFAULT 'image/png',
  -- Mismo motivo que seguridad_calificaciones: sin FK real al acta, se
  -- duplica el `cids` de quien firma en vez de resolverlo por tipo.
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Un rol firma una vez por acta: volver a firmar reemplaza, no acumula.
  UNIQUE KEY uq_acta_rol (acta_tipo, acta_id, rol),
  INDEX idx_acta (acta_tipo, acta_id),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_config (
  clave VARCHAR(64) PRIMARY KEY,
  valor VARCHAR(500) NOT NULL,
  actualizado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ON DUPLICATE KEY UPDATE valor = valor: si ya esta configurado se respeta lo
-- que hayan puesto. Repetir el script no pisa el tecnico actual.
INSERT INTO seguridad_config (clave, valor) VALUES
  ('tecnico_nombre', 'Ing. Manuel García'),
  ('tecnico_cargo', 'Técnico de OSC')
ON DUPLICATE KEY UPDATE valor = valor;


-- ============================================================
-- 3. Mercancia — carga y descarga de camiones
-- ============================================================

-- `contraparte` y no `cliente_nombre`: en un EGRESO es el cliente que recibe,
-- pero en un INGRESO es el PROVEEDOR que envia.
CREATE TABLE IF NOT EXISTS seguridad_mercancia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('ingreso','egreso') NOT NULL,
  fecha DATE NOT NULL,
  -- Documento de Odoo con el que viaja la mercancia: factura de compra en un
  -- ingreso, orden de despacho en un egreso.
  odoo_picking_id INT DEFAULT NULL,
  odoo_picking_name VARCHAR(100) DEFAULT NULL,
  -- Un camion puede salir con varias facturas. `factura_numero` se queda
  -- como la principal (compatibilidad con lo que ya la lee), y `facturas_json`
  -- trae la lista completa cuando hay mas de una. Mismo patron que
  -- seguridad_despachos.facturas_json en RMA.
  factura_numero VARCHAR(100) DEFAULT NULL,
  facturas_json TEXT DEFAULT NULL,
  contraparte VARCHAR(200) DEFAULT NULL,
  -- Igual que las facturas: puede cargar mas de un almacenista el mismo
  -- camion. `almacenista_nombre` se queda como el principal/responsable
  -- (sigue siendo NOT NULL: todo registro tiene que decir quien responde), y
  -- `almacenistas_json` trae la lista completa cuando hay mas de uno.
  almacenista_nombre VARCHAR(200) NOT NULL,
  almacenistas_json TEXT DEFAULT NULL,
  chofer_nombre VARCHAR(200) DEFAULT NULL,
  placa_vehiculo VARCHAR(50) DEFAULT NULL,
  -- descuadre NO bloquea la salida: queda registrado y avisa. Parar un camion
  -- es decision de una persona, no del software.
  estado ENUM('pendiente','conforme','descuadre') NOT NULL DEFAULT 'pendiente',
  verificado_por VARCHAR(200) DEFAULT NULL,
  verificado_at TIMESTAMP NULL DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  cids INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tipo_fecha (tipo, fecha),
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_estado (estado),
  INDEX idx_picking (odoo_picking_id),
  INDEX idx_cids (cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `cantidad_verificada` empieza en NULL a proposito: "todavia no lo he
-- contado" no es lo mismo que "conte cero".
CREATE TABLE IF NOT EXISTS seguridad_mercancia_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mercancia_id INT NOT NULL,
  odoo_product_id INT DEFAULT NULL,
  producto VARCHAR(300) NOT NULL,
  codigo VARCHAR(100) DEFAULT NULL,
  cantidad_cargada DECIMAL(12,3) NOT NULL DEFAULT 0,
  cantidad_verificada DECIMAL(12,3) DEFAULT NULL,
  observacion VARCHAR(300) DEFAULT NULL,
  -- Checkbox explicito, no una inferencia de `cantidad_verificada = 0`: un
  -- renglon puede salir en cantidad parcial sin ser "no salio" (issue #44).
  -- El checkbox es la senal primaria; la cantidad es aparte.
  no_salio TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mercancia (mercancia_id),
  CONSTRAINT fk_mercancia_item FOREIGN KEY (mercancia_id)
    REFERENCES seguridad_mercancia(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3b. Catalogos de Mercancia: almacenistas, choferes, unidades
--
-- Hasta aca, "almacenista que carga"/"chofer"/"placa" en seguridad_mercancia
-- eran texto libre — cada quien lo escribia distinto (mayusculas, con o sin
-- acento) y no habia forma de elegir de una lista. Estas tres tablas son el
-- catalogo del que se elige en el formulario; seguridad_mercancia sigue
-- guardando el texto (nombre/placa), no un id, porque ya asi funcionan las
-- calificaciones (por nombre) y cambiar eso es un alcance aparte.
--
-- No se migran valores historicos que ya estaban en seguridad_mercancia como
-- texto libre: podrian tener variaciones (mayusculas, espacios, apodos) que
-- convendria revisar a mano antes de volverlas "oficiales" en el catalogo.
-- ============================================================

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
-- 4. Puesta al dia de bases que ya existian
--
-- Todo lo de arriba ya trae la forma final, asi que en una base nueva esta
-- seccion no hace nada. Es para las que se crearon antes.
-- ============================================================

-- --- seguridad_ingresos ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_ingresos'
      AND COLUMN_NAME = 'idempotency_key') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_ingresos ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_ingresos'
      AND INDEX_NAME = 'uq_idempotency_key') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_ingresos ADD UNIQUE INDEX uq_idempotency_key (idempotency_key)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_ingresos'
      AND COLUMN_NAME = 'nd_numero') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_ingresos ADD COLUMN nd_numero VARCHAR(50) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Sucursal de quien registra (aislamiento por cids, ver comentario en el
-- CREATE TABLE de arriba).
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

-- --- seguridad_despachos ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'nd_numero') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_despachos ADD COLUMN nd_numero VARCHAR(50) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'firma_data') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_despachos ADD COLUMN firma_data LONGBLOB NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_despachos'
      AND COLUMN_NAME = 'firma_mime') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_despachos ADD COLUMN firma_mime VARCHAR(50) DEFAULT ''image/png'' NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

-- --- seguridad_mercancia ---

-- Bases creadas antes del renombrado todavia tienen `cliente_nombre`.
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'cliente_nombre') > 0,
  'ALTER TABLE seguridad_mercancia CHANGE COLUMN cliente_nombre contraparte VARCHAR(200) DEFAULT NULL',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'factura_numero') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia ADD COLUMN factura_numero VARCHAR(100) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Varias facturas y varios almacenistas por egreso (issue #43).
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'facturas_json') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia ADD COLUMN facturas_json TEXT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'almacenistas_json') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia ADD COLUMN almacenistas_json TEXT DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

-- --- seguridad_mercancia_items ---

-- Checkbox "No salio" por renglon (issue #44).
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_mercancia_items'
      AND COLUMN_NAME = 'no_salio') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_mercancia_items ADD COLUMN no_salio TINYINT(1) NOT NULL DEFAULT 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- seguridad_calificaciones y seguridad_firmas: cids ---

-- Sin FK real al acta (relacionado_a/acta_tipo + id generico), asi que el
-- cids se duplica al insertar en vez de resolverse por tipo en cada lectura.
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

-- --- ENUMs que crecieron al llegar Mercancia ---

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_calificaciones'
      AND COLUMN_NAME = 'relacionado_a' AND COLUMN_TYPE LIKE '%mercancia%') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_calificaciones
     MODIFY COLUMN relacionado_a ENUM(''ingreso'',''despacho'',''mercancia'') NOT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguridad_firmas'
      AND COLUMN_NAME = 'acta_tipo' AND COLUMN_TYPE LIKE '%mercancia%') > 0,
  'SELECT 1',
  'ALTER TABLE seguridad_firmas
     MODIFY COLUMN acta_tipo ENUM(''ingreso'',''despacho'',''mercancia'') NOT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- rma_cases (del modulo RMA, no de este) ---

-- Solo si esa tabla existe: una base sin el modulo RMA no tiene nada que
-- alterar y el script no deberia caerse por eso.
--
-- `despachado_at` y no un valor mas en el ENUM de `status`: el estado guarda
-- el DESENLACE del caso (reparado, nota de credito) y la entrega fisica le
-- ocurre a cualquiera de ellos. Pisarlo borraria por que se cerro el caso.
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rma_cases') = 0
  OR (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rma_cases'
      AND COLUMN_NAME = 'despachado_at') > 0,
  'SELECT 1',
  'ALTER TABLE rma_cases ADD COLUMN despachado_at DATE DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rma_cases') = 0
  OR (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rma_cases'
      AND INDEX_NAME = 'idx_despachado') > 0,
  'SELECT 1',
  'ALTER TABLE rma_cases ADD INDEX idx_despachado (despachado_at)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
-- 5. Comprobacion
--
-- En una base con el modulo RMA debe decir 10 y 15.
-- Sin rma_cases, dice 10 y 14, que tambien esta bien.
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('seguridad_ingresos','seguridad_despachos',
                         'seguridad_calificaciones','seguridad_firmas',
                         'seguridad_config','seguridad_mercancia',
                         'seguridad_mercancia_items',
                         'seguridad_catalogo_almacenistas',
                         'seguridad_catalogo_choferes',
                         'seguridad_catalogo_unidades')) AS tablas_de_10,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (TABLE_NAME, COLUMN_NAME) IN (
        ('seguridad_ingresos','idempotency_key'),
        ('seguridad_ingresos','nd_numero'),
        ('seguridad_despachos','nd_numero'),
        ('seguridad_despachos','firma_data'),
        ('seguridad_mercancia','contraparte'),
        ('seguridad_mercancia','factura_numero'),
        ('seguridad_mercancia','facturas_json'),
        ('seguridad_mercancia','almacenistas_json'),
        ('seguridad_mercancia_items','no_salio'),
        -- Aislamiento por sucursal (cids), en las 5 tablas que hacia falta.
        ('seguridad_ingresos','cids'),
        ('seguridad_despachos','cids'),
        ('seguridad_calificaciones','cids'),
        ('seguridad_firmas','cids'),
        ('seguridad_mercancia','cids'),
        ('rma_cases','despachado_at'))) AS columnas_de_15;
