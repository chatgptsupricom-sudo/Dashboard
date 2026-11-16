-- Recepción de mercancía: firma de Almacén con clave personal al abrir y al
-- cerrar cada contenedor, con «Otro» (si aplica) y una nota. Egreso de
-- mercancía: firma con clave en cada verificación del armado.
--
-- El panel agrega estas columnas solo:
--   seguridad_catalogo_almacenistas.clave_hash  (lib/seguridad/clavePersonal.ts,
--     asegurarColumnaClaveAlmacen)
--   recepcion_packing_contenedores.*            (lib/recepcion/firmaContenedor.ts,
--     asegurarColumnasFirmaContenedor)
--   seguridad_mercancia.armado_*                (lib/seguridad/firmaAlmacen.ts,
--     asegurarColumnasFirmaArmado)
-- Este script es la referencia por si hay que hacerlo a mano en el phpMyAdmin
-- de EasyPanel (sin information_schema).
--
-- Las verificaciones buscan solo las columnas nuevas, por nombre: esas tablas
-- ya tienen otras que empiezan igual (llegada_at, llegada_por,
-- armado_inicio_at, armado_verificado_por…), así que un LIKE 'llegada_%'
-- devolvería filas aunque no se hubiera corrido nada.
--
-- Cada ALTER agrega varias columnas en un solo paso: si una ya existe, falla
-- entero (#1060 Duplicate column). Si la verificación de antes trae algunas
-- filas pero no todas, quitar del ALTER las que ya están.

-- ── Clave personal de Almacén ───────────────────────────────────────────────
-- Antes: 0 filas = falta. 1 fila = ya está, no correr el ALTER.
SHOW COLUMNS FROM supricom_panel.seguridad_catalogo_almacenistas
  WHERE Field IN ('clave_hash');

ALTER TABLE supricom_panel.seguridad_catalogo_almacenistas
  ADD COLUMN clave_hash VARCHAR(100) DEFAULT NULL;

-- Después: 1 fila.
SHOW COLUMNS FROM supricom_panel.seguridad_catalogo_almacenistas
  WHERE Field IN ('clave_hash');

-- ── Firma al abrir y cerrar cada contenedor ─────────────────────────────────
-- Antes: 0 filas = faltan todas. 7 filas = ya están, no correr el ALTER.
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores
  WHERE Field IN ('llegada_almacenista', 'llegada_otro', 'llegada_otro_ok', 'llegada_nota',
                  'cierre_almacenista', 'cierre_otro', 'cierre_otro_ok');

ALTER TABLE supricom_panel.recepcion_packing_contenedores
  ADD COLUMN llegada_almacenista VARCHAR(200) DEFAULT NULL,
  ADD COLUMN llegada_otro VARCHAR(200) DEFAULT NULL,
  ADD COLUMN llegada_otro_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN llegada_nota TEXT DEFAULT NULL,
  ADD COLUMN cierre_almacenista VARCHAR(200) DEFAULT NULL,
  ADD COLUMN cierre_otro VARCHAR(200) DEFAULT NULL,
  ADD COLUMN cierre_otro_ok TINYINT(1) DEFAULT NULL;

-- Después: 7 filas.
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores
  WHERE Field IN ('llegada_almacenista', 'llegada_otro', 'llegada_otro_ok', 'llegada_nota',
                  'cierre_almacenista', 'cierre_otro', 'cierre_otro_ok');

-- ── Egreso: firma en cada verificación del armado ───────────────────────────
-- Quien contó por última vez queda en armado_contado_por; cuando pasa, también
-- en armado_verificado_por (esa columna ya existía).
-- Antes: 0 filas = faltan todas. 6 filas = ya están, no correr el ALTER.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia
  WHERE Field IN ('armado_contado_por', 'armado_contado_at', 'armado_con_clave',
                  'armado_otro', 'armado_otro_ok', 'armado_nota');

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN armado_contado_por VARCHAR(200) DEFAULT NULL,
  ADD COLUMN armado_contado_at DATETIME DEFAULT NULL,
  ADD COLUMN armado_con_clave TINYINT(1) DEFAULT NULL,
  ADD COLUMN armado_otro VARCHAR(200) DEFAULT NULL,
  ADD COLUMN armado_otro_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN armado_nota TEXT DEFAULT NULL;

-- Después: 6 filas.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia
  WHERE Field IN ('armado_contado_por', 'armado_contado_at', 'armado_con_clave',
                  'armado_otro', 'armado_otro_ok', 'armado_nota');
