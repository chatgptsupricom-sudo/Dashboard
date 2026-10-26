-- Asistencia por biométrico (RRHH, /recursos_humanos/asistencia).
-- Referencia: las tablas se crean solas desde lib/asistencia/datos.ts. Si hace
-- falta crearlas a mano en el phpMyAdmin de EasyPanel, correr esto tal cual
-- (con la base delante y sin information_schema). Verificar con SHOW TABLES.

CREATE TABLE IF NOT EXISTS supricom_panel.biometrico_empleados (
  sede INT NOT NULL,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(160) NOT NULL DEFAULT '',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sede, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.biometrico_cargas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sede INT NOT NULL,
  archivo VARCHAR(200) NOT NULL DEFAULT '',
  marcas INT NOT NULL DEFAULT 0,
  nuevas INT NOT NULL DEFAULT 0,
  desde DATE NULL,
  hasta DATE NULL,
  usuario VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.biometrico_marcas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sede INT NOT NULL,
  codigo VARCHAR(40) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  carga_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marca (sede, codigo, fecha, hora),
  KEY idx_sede_fecha (sede, fecha),
  KEY idx_carga (carga_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.biometrico_dias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  sede INT NOT NULL DEFAULT 0,
  tipo VARCHAR(20) NOT NULL,
  nota VARCHAR(200) NOT NULL DEFAULT '',
  created_by VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dia (fecha, sede)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES FROM supricom_panel LIKE 'biometrico_%';
