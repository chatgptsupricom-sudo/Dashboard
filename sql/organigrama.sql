-- Organigrama (lib/organigrama/datos.ts). La tabla se crea sola al abrir la
-- sección; esto es solo referencia. Para el phpMyAdmin de EasyPanel, con la
-- base delante.
CREATE TABLE IF NOT EXISTS supricom_panel.organigrama_nodos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NULL,                              -- superior (NULL = cabeza)
  orden INT NOT NULL DEFAULT 0,                    -- orden entre hermanos
  tipo VARCHAR(20) NOT NULL DEFAULT 'cargo',       -- direccion | area | cargo
  staff TINYINT(1) NOT NULL DEFAULT 0,             -- se dibuja al lado del superior
  disposicion VARCHAR(12) NOT NULL DEFAULT 'columna', -- subordinados en fila | columna
  area VARCHAR(80) NOT NULL DEFAULT '',
  cargo VARCHAR(150) NOT NULL,
  nota VARCHAR(150) NOT NULL DEFAULT '',
  personas JSON NOT NULL,                          -- ["Nombre", ...]
  proposito TEXT NULL,
  actividades JSON NOT NULL,                       -- [{id, texto, detalle}]
  updated_by VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES FROM supricom_panel LIKE 'organigrama_nodos';
