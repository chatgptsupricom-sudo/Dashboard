-- Ingreso de Seguridad: «Otro» control en la verificación de estado (si aplica)
-- y la nota u observación de Seguridad (opcional).
--
-- El panel agrega estas columnas solo (app/api/seguridad/ingreso/route.ts,
-- asegurarColumnasVerificacion) la primera vez que un ingreso trae «Otro» o
-- una nota. Este script es la referencia por si hay que hacerlo a mano en el
-- phpMyAdmin de EasyPanel (sin information_schema).
--
-- 1) Verificar antes: si ya aparecen las tres, no correr el ALTER.
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'otro_verificacion%';
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'observacion_seguridad';

-- 2) Agregar.
ALTER TABLE supricom_panel.seguridad_ingresos
  ADD COLUMN otro_verificacion VARCHAR(200) DEFAULT NULL,
  ADD COLUMN otro_verificacion_ok TINYINT(1) DEFAULT NULL,
  ADD COLUMN observacion_seguridad TEXT DEFAULT NULL;

-- 3) Verificar después.
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'otro_verificacion%';
SHOW COLUMNS FROM supricom_panel.seguridad_ingresos LIKE 'observacion_seguridad';
