-- Actas de RMA de Seguridad (ingreso y despacho): «Otro» control en la
-- verificación de estado (si aplica) y, en el ingreso, la nota u observación
-- (el despacho ya tenía `observaciones`).
--
-- El panel agrega estas columnas solo (lib/seguridad/verificacionOtro.ts,
-- asegurarColumnasVerificacion) la primera vez que un acta las trae. Este
-- script es la referencia por si hay que hacerlo a mano en el phpMyAdmin de
-- EasyPanel (sin information_schema).
--
-- 1) Verificar antes: si ya aparecen, no correr el ALTER de esa tabla.
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'otro_verificacion%';
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'observacion_seguridad';
SHOW COLUMNS FROM supricom_panel.seguridad_despachos LIKE 'otro_verificacion%';

-- 2) Agregar.
ALTER TABLE supricom_panel.seguridad_ingresos
  ADD COLUMN otro_verificacion VARCHAR(200) DEFAULT NULL,
  ADD COLUMN otro_verificacion_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN observacion_seguridad TEXT DEFAULT NULL;

ALTER TABLE supricom_panel.seguridad_despachos
  ADD COLUMN otro_verificacion VARCHAR(200) DEFAULT NULL,
  ADD COLUMN otro_verificacion_ok TINYINT(1) DEFAULT NULL;

-- 3) Verificar después.
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'otro_verificacion%';
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'observacion_seguridad';
SHOW COLUMNS FROM supricom_panel.seguridad_despachos LIKE 'otro_verificacion%';

-- Despacho de mercancía (egreso): «Otro» y la nota de Seguridad al verificar
-- en el portón.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'otro_verificacion%';
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'observacion_seguridad';
ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN otro_verificacion VARCHAR(200) DEFAULT NULL,
  ADD COLUMN otro_verificacion_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN observacion_seguridad TEXT DEFAULT NULL;
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'otro_verificacion%';
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'observacion_seguridad';
