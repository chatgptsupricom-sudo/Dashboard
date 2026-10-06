-- Mantenimiento de unidades de Almacén (camiones y montacargas).
--
-- NO hace falta correr esto: las dos tablas se crean solas la primera vez que
-- se abre la sección (lib/mantenimiento/datos.ts). Queda como referencia del
-- esquema, y para crearlas a mano si el usuario de la base no puede crear
-- tablas. Va con `supricom_panel.` delante y sin information_schema, para el
-- phpMyAdmin de EasyPanel.
--
-- Verificar después:  SHOW TABLES FROM supricom_panel LIKE 'mantenimiento_%';
--
-- Las cinco columnas del final de mantenimiento_equipos (regreso_at … ) se
-- agregaron después: el panel las añade solo a una tabla que ya exista. Si hay
-- que hacerlo a mano, primero SHOW COLUMNS FROM supricom_panel.mantenimiento_equipos;
-- y un ALTER TABLE ... ADD COLUMN por cada una que falte.

CREATE TABLE IF NOT EXISTS supricom_panel.mantenimiento_equipos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cids INT NULL,                                   -- sede: 9 Valencia, 10 Caracas, 7 Panamá
  tipo ENUM('camion','montacargas') NOT NULL DEFAULT 'camion',
  codigo VARCHAR(50) NOT NULL,                     -- placa del camión o código del montacargas
  descripcion VARCHAR(200) NULL,
  medidor INT NULL,                                -- km (camión) u horas de uso (montacargas)
  proximo_servicio DATE NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(200) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  regreso_at DATETIME NULL,                        -- cuándo se marcó que volvió de la última ruta
  intervalo_dias INT NULL,                         -- plan preventivo: cada cuántos días
  intervalo_medidor INT NULL,                      -- plan preventivo: cada cuántos km u horas
  ultimo_servicio_at DATE NULL,                    -- último preventivo cerrado
  ultimo_servicio_medidor INT NULL,
  KEY idx_mant_equipos_cids (cids, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.mantenimiento_ordenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  equipo_id INT NOT NULL,
  cids INT NULL,
  tipo ENUM('preventivo','correctivo') NOT NULL,
  prioridad ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
  titulo VARCHAR(200) NOT NULL,
  detalle TEXT NULL,
  estado ENUM('reportado','en_taller','listo','cerrado') NOT NULL DEFAULT 'reportado',
  medidor INT NULL,                                -- km u horas al reportar
  tareas_json TEXT NULL,                           -- [{ texto, hecha, por, at }]
  responsable VARCHAR(200) NULL,                   -- taller o mecánico
  costo DECIMAL(12,2) NULL,                        -- USD
  notas_cierre TEXT NULL,
  reportado_por VARCHAR(200) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  iniciado_por VARCHAR(200) NULL,
  iniciado_at DATETIME NULL,
  terminado_por VARCHAR(200) NULL,
  terminado_at DATETIME NULL,
  cerrado_por VARCHAR(200) NULL,
  cerrado_at DATETIME NULL,
  KEY idx_mant_ordenes_equipo (equipo_id, estado),
  KEY idx_mant_ordenes_cids (cids, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
