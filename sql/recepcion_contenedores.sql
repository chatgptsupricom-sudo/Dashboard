-- ============================================================
-- RECEPCION POR PACKING LIST: VARIOS CONTENEDORES
--
-- Un packing list puede venir en varios contenedores, y pueden llegar en
-- dias distintos. Cada contenedor tiene su numero y su precinto, y Almacen
-- lo recibe por separado: foto al llegar, foto del precinto y el numero que
-- lee; al terminar de descargarlo, foto de como quedo. El conteo contra el
-- packing list sigue siendo uno solo, y el packing list se cierra cuando
-- llegaron y se descargaron todos.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): cada tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing_archivos LIKE 'contenedor_id';
-- Si devuelve una fila, ya se corrio: no hace falta repetirlo.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.recepcion_packing_contenedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recepcion_id INT NOT NULL,
  numero VARCHAR(50) NOT NULL,
  precinto_esperado VARCHAR(50) DEFAULT NULL,
  -- por_llegar -> descargando -> cerrado (cada contenedor por su cuenta)
  etapa VARCHAR(20) NOT NULL DEFAULT 'por_llegar',
  llegada_at TIMESTAMP NULL DEFAULT NULL,
  llegada_por VARCHAR(200) DEFAULT NULL,
  precinto_recibido VARCHAR(50) DEFAULT NULL,
  -- NULL cuando Compras no cargo precinto esperado: no hay contra que comparar.
  precinto_coincide TINYINT(1) DEFAULT NULL,
  cerrado_at TIMESTAMP NULL DEFAULT NULL,
  cerrado_por VARCHAR(200) DEFAULT NULL,
  notas_cierre TEXT DEFAULT NULL,
  INDEX idx_rpc_recepcion (recepcion_id),
  CONSTRAINT fk_rpc_recepcion FOREIGN KEY (recepcion_id)
    REFERENCES supricom_panel.recepcion_packing(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Las fotos de llegada, precinto y cierre pasan a ser de un contenedor.
ALTER TABLE supricom_panel.recepcion_packing_archivos
  ADD COLUMN contenedor_id INT DEFAULT NULL,
  ADD INDEX idx_rpa_contenedor (contenedor_id);

-- Packing lists que ya existian (con un solo contenedor en la cabecera):
-- se les crea su contenedor con lo que ya tenian. Sin esto, quedarian sin
-- contenedores y no se podrian recibir.
INSERT INTO supricom_panel.recepcion_packing_contenedores
  (recepcion_id, numero, precinto_esperado, etapa, llegada_at, llegada_por,
   precinto_recibido, precinto_coincide, cerrado_at, cerrado_por, notas_cierre)
SELECT r.id, COALESCE(NULLIF(r.contenedor, ''), '(sin numero)'), r.precinto_esperado,
       r.etapa, r.llegada_at, r.llegada_por, r.precinto_recibido, r.precinto_coincide,
       r.cerrado_at, r.cerrado_por, r.notas_cierre
  FROM supricom_panel.recepcion_packing r
 WHERE NOT EXISTS (
   SELECT 1 FROM supricom_panel.recepcion_packing_contenedores c
    WHERE c.recepcion_id = r.id);

-- Y sus fotos de llegada/precinto/cierre se cuelgan de ese unico contenedor.
UPDATE supricom_panel.recepcion_packing_archivos a
  JOIN supricom_panel.recepcion_packing_contenedores c ON c.recepcion_id = a.recepcion_id
   SET a.contenedor_id = c.id
 WHERE a.contenedor_id IS NULL
   AND a.tipo IN ('foto_llegada', 'foto_precinto', 'foto_cierre');

-- Comprobacion: la tabla nueva y la columna nueva tienen que aparecer.
SHOW TABLES FROM supricom_panel LIKE 'recepcion_packing_contenedores';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_archivos LIKE 'contenedor_id';
