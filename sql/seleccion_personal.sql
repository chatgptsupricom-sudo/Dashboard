-- Matriz de rastreo de selección de personal (RRHH, /recursos_humanos/seleccion).
-- Referencia: las tablas se crean solas desde lib/seleccion/datos.ts. Si hace
-- falta crearlas a mano en el phpMyAdmin de EasyPanel, correr esto tal cual
-- (va con la base delante y sin information_schema). Verificar con SHOW TABLES.

CREATE TABLE IF NOT EXISTS supricom_panel.seleccion_requisiciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  fecha_recepcion DATE NOT NULL,
  unidad_solicitante VARCHAR(120) NOT NULL DEFAULT '',
  cargo VARCHAR(160) NOT NULL DEFAULT '',
  sede INT NOT NULL DEFAULT 9,
  vacantes INT NOT NULL DEFAULT 1,
  meta_dias INT NOT NULL DEFAULT 30,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
  notas TEXT NULL,
  created_by VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_codigo (codigo),
  KEY idx_fecha (fecha_recepcion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.seleccion_candidatos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requisicion_id INT NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  telefono VARCHAR(40) NOT NULL DEFAULT '',
  correo VARCHAR(160) NOT NULL DEFAULT '',
  fuente VARCHAR(60) NOT NULL DEFAULT '',
  sondeo VARCHAR(20) NULL,
  entrevista_rrhh_fecha DATE NULL,
  entrevista_rrhh VARCHAR(20) NULL,
  evaluacion VARCHAR(20) NULL,
  evaluacion_puntaje VARCHAR(120) NOT NULL DEFAULT '',
  entrevista_tecnica_fecha DATE NULL,
  entrevista_tecnica VARCHAR(20) NULL,
  entrevista_tecnica_concepto TEXT NULL,
  referencias VARCHAR(20) NULL,
  referencias_nota TEXT NULL,
  terna VARCHAR(5) NULL,
  oferta VARCHAR(20) NULL,
  examenes VARCHAR(20) NULL,
  estatus VARCHAR(20) NOT NULL DEFAULT 'en_proceso',
  fecha_ingreso DATE NULL,
  notas TEXT NULL,
  updated_by VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_requisicion (requisicion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.seleccion_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidato_id INT NOT NULL,
  campo VARCHAR(40) NOT NULL,
  antes TEXT NULL,
  despues TEXT NULL,
  usuario VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_candidato (candidato_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES FROM supricom_panel LIKE 'seleccion_%';
