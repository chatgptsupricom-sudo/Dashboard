-- ============================================================
-- RECEPCION POR PACKING LIST: VARIOS PRECINTOS POR CONTENEDOR
--
-- Un contenedor puede venir con uno o mas precintos. Compras carga los que
-- dice el packing list; Almacen anota todos los que ve al llegar. Coincide
-- solo si son exactamente los mismos.
--
-- Se guardan como lista JSON en texto (mismo patron que facturas_json en
-- mercancia): no hace falta consultarlos por separado, solo compararlos. Las
-- columnas viejas `precinto_esperado` / `precinto_recibido` se siguen
-- llenando con el primero, para lo que todavia las lea.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): cada tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'precintos_esperados';
-- Si devuelve una fila, ya se corrio: no hace falta repetirlo.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

ALTER TABLE supricom_panel.recepcion_packing_contenedores
  ADD COLUMN precintos_esperados TEXT DEFAULT NULL,
  ADD COLUMN precintos_recibidos TEXT DEFAULT NULL;

-- Los contenedores que ya existen pasan su precinto unico a la lista.
UPDATE supricom_panel.recepcion_packing_contenedores
   SET precintos_esperados = JSON_ARRAY(precinto_esperado)
 WHERE precintos_esperados IS NULL AND precinto_esperado IS NOT NULL AND precinto_esperado <> '';

UPDATE supricom_panel.recepcion_packing_contenedores
   SET precintos_recibidos = JSON_ARRAY(precinto_recibido)
 WHERE precintos_recibidos IS NULL AND precinto_recibido IS NOT NULL AND precinto_recibido <> '';

-- Comprobacion: tienen que aparecer las 2 columnas.
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'precintos_%';
