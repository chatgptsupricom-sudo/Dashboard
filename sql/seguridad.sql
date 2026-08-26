-- Issue #30 [Seguridad 1/5] Rol Seguridad - base
-- Tablas iniciales del modulo Seguridad (Almacen / Control de acceso).
-- Los detalles funcionales viven en los issues #31 (ingreso), #32 (despacho)
-- y #33 (calificacion).

CREATE TABLE IF NOT EXISTS seguridad_ingresos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rma_case_id INT DEFAULT NULL,
  fecha_entrega DATE NOT NULL,
  factura_numero VARCHAR(100) DEFAULT NULL,
  cliente_nombre VARCHAR(200) NOT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  descripcion_falla TEXT DEFAULT NULL,
  -- Los 4 checks de la planilla van SIN valor por defecto a proposito.
  -- Con DEFAULT 1, una fila insertada sin ellos quedaba declarando que el
  -- equipo llego con los accesorios completos y sin manipular, sin que nadie
  -- lo hubiera revisado. Ese registro es la prueba de la empresa cuando un
  -- cliente reclama que faltaba algo, asi que no puede responderse solo.
  -- El endpoint los exige explicitamente (400 si falta alguno).
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