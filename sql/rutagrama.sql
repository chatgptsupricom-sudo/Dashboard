-- Rutagrama de los nuevos ingresos (RRHH, /recursos_humanos/rutagrama).
-- Referencia: las tablas se crean solas desde lib/rutagrama/datos.ts. Si hace
-- falta crearlas a mano en el phpMyAdmin de EasyPanel, correr esto tal cual
-- (con la base delante y sin information_schema). Verificar con SHOW TABLES.

CREATE TABLE IF NOT EXISTS supricom_panel.rutagrama_registros (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token CHAR(64) NOT NULL,
  sede INT NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  nombre VARCHAR(160) NOT NULL,
  cedula VARCHAR(20) NOT NULL DEFAULT '',
  direccion VARCHAR(400) NOT NULL DEFAULT '',
  cargo VARCHAR(120) NOT NULL DEFAULT '',
  turno VARCHAR(60) NOT NULL DEFAULT '',
  dias VARCHAR(20) NOT NULL DEFAULT '',
  tiempo_min INT NULL,
  ida_json TEXT NULL,
  referencias_ida VARCHAR(400) NOT NULL DEFAULT '',
  vuelta_igual TINYINT(1) NOT NULL DEFAULT 1,
  vuelta_json TEXT NULL,
  referencias_vuelta VARCHAR(400) NOT NULL DEFAULT '',
  mapa_json MEDIUMTEXT NULL,
  firma MEDIUMTEXT NULL,
  enviado_at DATETIME NULL,
  envios INT NOT NULL DEFAULT 0,
  created_by VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rutagrama_token (token),
  KEY idx_rutagrama_sede (sede, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.rutagrama_versiones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  registro_id INT NOT NULL,
  datos_json MEDIUMTEXT NOT NULL,
  firma MEDIUMTEXT NULL,
  ip VARCHAR(64) NULL,
  enviado_at DATETIME NOT NULL,
  KEY idx_rutagrama_version (registro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.rutagrama_sedes (
  sede INT PRIMARY KEY,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  direccion VARCHAR(300) NOT NULL DEFAULT '',
  updated_by VARCHAR(190) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
