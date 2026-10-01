-- Plan de Contenido: persistencia completa.
--
-- Las tablas se crean solas desde lib/customView/store.ts (ensureTables), este
-- archivo queda como referencia del esquema.
--
-- Modelo: `custom_views` guarda el HTML subido (la BASE, nunca se edita).
-- `custom_view_state` guarda lo que el equipo hace encima: el overlay de
-- cambios (state_json) y el HTML completo del panel tal como se ve
-- (snapshot_html). Al subir un HTML nuevo sube base_revision, el overlay se
-- reaplica sobre el archivo nuevo y el resultado se vuelve a guardar.

CREATE TABLE IF NOT EXISTS custom_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  view_name VARCHAR(100) NOT NULL UNIQUE,
  html_content LONGTEXT NOT NULL,
  filename VARCHAR(255),
  file_size INT,
  base_revision INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Para instalaciones que ya tenian la tabla sin la columna:
-- ALTER TABLE custom_views ADD COLUMN base_revision INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS custom_view_state (
  view_name VARCHAR(100) NOT NULL PRIMARY KEY,
  state_json LONGTEXT NULL,          -- overlay de cambios contra la base
  snapshot_html LONGTEXT NULL,       -- HTML completo del panel, tal como se ve
  base_revision INT NOT NULL DEFAULT 0,
  revision INT NOT NULL DEFAULT 0,   -- control de concurrencia entre usuarios
  snapshot_revision INT NOT NULL DEFAULT 0,
  updated_by VARCHAR(120) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_view_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  view_name VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL,         -- upload | state | restore
  label VARCHAR(255) NULL,
  state_json LONGTEXT NULL,
  snapshot_html LONGTEXT NULL,
  base_revision INT NOT NULL DEFAULT 0,
  revision INT NOT NULL DEFAULT 0,
  created_by VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_view_id (view_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla del sistema anterior (solo checks). Se conserva: la primera carga del
-- panel migra su contenido al overlay nuevo. Se puede borrar despues.
-- DROP TABLE custom_view_checks;
