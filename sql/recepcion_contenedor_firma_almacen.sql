-- Recepción de mercancía: firma de Almacén con clave personal al abrir y al
-- cerrar cada contenedor, con «Otro» (si aplica) y una nota.
--
-- El panel agrega estas columnas solo:
--   seguridad_catalogo_almacenistas.clave_hash  (lib/seguridad/clavePersonal.ts,
--     asegurarColumnaClaveAlmacen)
--   recepcion_packing_contenedores.*            (lib/recepcion/firmaContenedor.ts,
--     asegurarColumnasFirmaContenedor)
-- Este script es la referencia por si hay que hacerlo a mano en el phpMyAdmin
-- de EasyPanel (sin information_schema).
--
-- 1) Verificar antes: si ya aparecen, no correr el ALTER de esa tabla.
SHOW COLUMNS FROM supricom_panel.seguridad_catalogo_almacenistas LIKE 'clave_hash';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'llegada_%';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'cierre_%';

-- 2) Agregar.
ALTER TABLE supricom_panel.seguridad_catalogo_almacenistas
  ADD COLUMN clave_hash VARCHAR(100) DEFAULT NULL;

ALTER TABLE supricom_panel.recepcion_packing_contenedores
  ADD COLUMN llegada_almacenista VARCHAR(200) DEFAULT NULL,
  ADD COLUMN llegada_otro VARCHAR(200) DEFAULT NULL,
  ADD COLUMN llegada_otro_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN llegada_nota TEXT DEFAULT NULL,
  ADD COLUMN cierre_almacenista VARCHAR(200) DEFAULT NULL,
  ADD COLUMN cierre_otro VARCHAR(200) DEFAULT NULL,
  ADD COLUMN cierre_otro_ok TINYINT(1) DEFAULT NULL;

-- 3) Verificar después.
SHOW COLUMNS FROM supricom_panel.seguridad_catalogo_almacenistas LIKE 'clave_hash';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'llegada_%';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'cierre_%';

-- Egreso de mercancía: firma con clave en cada verificación del armado, pase
-- o no (lib/seguridad/firmaAlmacen.ts, asegurarColumnasFirmaArmado). Quien
-- contó por última vez queda en armado_contado_por; cuando pasa, también en
-- armado_verificado_por.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'armado_%';
ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN armado_contado_por VARCHAR(200) DEFAULT NULL,
  ADD COLUMN armado_contado_at DATETIME DEFAULT NULL,
  ADD COLUMN armado_con_clave TINYINT(1) DEFAULT NULL,
  ADD COLUMN armado_otro VARCHAR(200) DEFAULT NULL,
  ADD COLUMN armado_otro_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN armado_nota TEXT DEFAULT NULL;
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'armado_%';
