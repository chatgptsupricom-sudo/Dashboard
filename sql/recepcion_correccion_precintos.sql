-- ============================================================
-- RECEPCION POR PACKING LIST: CORRECCION DE PRECINTOS CON REGISTRO
--
-- Si Almacen anoto mal un precinto al llegar el contenedor (ej. un error de
-- tipeo: "FX445T2691" en vez de "FX44502691"), lo puede corregir mientras el
-- packing list esta abierto (cerrado no se modifica). No se pisa lo anotado: se
-- guarda la lista de correcciones con que habia antes, que quedo, el motivo,
-- quien y cuando.
--
--   precintos_correcciones  lista JSON de { antes, despues, motivo, por, at }.
--                           NULL = nunca se corrigio.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'precintos_correcciones';
-- Si devuelve una fila, ya se corrio: no hace falta repetirlo.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria.)
-- ============================================================

ALTER TABLE supricom_panel.recepcion_packing_contenedores
  ADD COLUMN precintos_correcciones TEXT DEFAULT NULL;

-- Comprobacion: tiene que aparecer la columna.
SHOW COLUMNS FROM supricom_panel.recepcion_packing_contenedores LIKE 'precintos_correcciones';
