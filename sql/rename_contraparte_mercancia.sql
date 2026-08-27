-- `cliente_nombre` pasa a llamarse `contraparte` en seguridad_mercancia.
--
-- La columna mentia sobre lo que guarda: en un EGRESO es el cliente que recibe,
-- pero en un INGRESO es el PROVEEDOR que envia. Un reporte agrupado por
-- "cliente" mezclando proveedores no lo detecta nadie hasta que alguien intenta
-- explicar el resultado.
--
-- Se renombra ahora, con la tabla practicamente vacia. Mas adelante seria migrar
-- datos ademas de cambiar codigo.
--
-- OJO: solo se toca seguridad_mercancia. En seguridad_ingresos y
-- seguridad_despachos `cliente_nombre` SI es un cliente y se queda como esta.
--
-- Se puede correr varias veces: solo renombra si la columna vieja sigue ahi.

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'cliente_nombre') > 0,
  'ALTER TABLE seguridad_mercancia CHANGE COLUMN cliente_nombre contraparte VARCHAR(200) DEFAULT NULL',
  'SELECT "ya se llama contraparte" AS aviso'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
