-- ============================================================
-- RECEPCION POR PACKING LIST: EN QUE ESTADO LLEGO LA CAJA
--
-- Antes solo se podia marcar "caja golpeada". Almacen ve tambien cajas
-- humedas y cajas abiertas, y una misma caja puede estar en mas de un
-- estado (humeda y abierta, por ejemplo), asi que se guarda la lista.
--
--   golpeado_tipos  lista JSON con "danada", "humeda" y/o "abierta".
--                   NULL = la caja llego bien.
--
-- La columna vieja `golpeado` (0/1) se sigue llenando: 1 si la caja tiene
-- algo, para lo que todavia la lea. Los renglones ya marcados pasan a
-- "danada", que es lo que significaba el 0/1.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing_items LIKE 'golpeado_tipos';
-- Si devuelve una fila, ya se corrio: no hace falta repetirlo.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

ALTER TABLE supricom_panel.recepcion_packing_items
  ADD COLUMN golpeado_tipos TEXT DEFAULT NULL;

-- Lo ya marcado como golpeado pasa a ser una caja "danada".
UPDATE supricom_panel.recepcion_packing_items
   SET golpeado_tipos = JSON_ARRAY('danada')
 WHERE golpeado = 1 AND golpeado_tipos IS NULL;

-- Comprobacion: tiene que aparecer la columna.
SHOW COLUMNS FROM supricom_panel.recepcion_packing_items LIKE 'golpeado_tipos';
