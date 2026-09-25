-- ============================================================
-- EGRESO: VERIFICACION DE SEGURIDAD EN C4 CON PISTOLA (issue #301)
--
-- Seguridad pistolea en C4 lo que sale. Los seriales verificados quedan en
-- seguridad_mercancia_seriales (verificado_at / verificado_por, de #299) y
-- las cantidades en seguridad_mercancia_items.cantidad_verificada. Lo nuevo:
--
--   seguridad_mercancia.ronda_verificacion   1 la primera vez; suma 1 cada
--                                            vez que Seguridad no despacha y
--                                            el egreso vuelve a Almacen.
--   seguridad_mercancia.verificado_en        local donde se verifico (hoy
--                                            siempre 'C4').
--   seguridad_mercancia_novedades            las novedades de cada ronda, con
--                                            la misma forma que `Novedad` en
--                                            lib/seguridad/egresoFlujo.ts:
--       tipo     falta | sobra | no_salio | serial_falta | serial_sobra |
--                serial_otra_orden | producto_ajeno
--       origen   'escaneo' = se registro al pistolear (serial_sobra,
--                serial_otra_orden, producto_ajeno); 'cierre' = todas las
--                de la ronda, guardadas al cerrar la verificacion
--       item_id  renglon del egreso; NULL = producto que no esta en la orden
--       producto nombre del renglon, o el codigo leido si no esta en la orden
--       serial   el serial, en las de seriales
--       otra_orden  en serial_otra_orden: la orden a la que pertenece
--       detalle  en no_salio: el motivo
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): las tablas llevan el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- Requiere sql/egreso_seriales.sql (#299) ya corrido. Va despues de
-- sql/egreso_calificaciones.sql (#302).
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'ronda_verificacion';
--   SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'verificado_en';
-- Si alguna devuelve una fila, ese ALTER ya se corrio: sacalo y corre el resto
-- (el CREATE TABLE se puede repetir, es IF NOT EXISTS).
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN ronda_verificacion INT NOT NULL DEFAULT 1;

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN verificado_en VARCHAR(50) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS supricom_panel.seguridad_mercancia_novedades (
  id INT NOT NULL AUTO_INCREMENT,
  mercancia_id INT NOT NULL,
  ronda INT NOT NULL DEFAULT 1,
  origen VARCHAR(10) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  item_id INT DEFAULT NULL,
  producto VARCHAR(300) NOT NULL DEFAULT '',
  serial VARCHAR(100) DEFAULT NULL,
  esperado INT NOT NULL DEFAULT 0,
  contado INT DEFAULT NULL,
  otra_orden VARCHAR(100) DEFAULT NULL,
  detalle VARCHAR(300) DEFAULT NULL,
  registrado_por VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_novedad_mercancia (mercancia_id, ronda),
  KEY idx_novedad_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprobacion: tienen que aparecer las dos columnas y la tabla.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'ronda_verificacion';
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'verificado_en';
SHOW TABLES FROM supricom_panel LIKE 'seguridad_mercancia_novedades';
