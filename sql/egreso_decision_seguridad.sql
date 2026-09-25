-- ============================================================
-- EGRESO: DECISION DE SEGURIDAD EN C4 (revision de #316)
--
-- Guarda que decidio Seguridad al verificar el egreso:
--
--   seguridad_mercancia.decision_seguridad   aprobar | despachar | devolver |
--                                            cancelar. NULL = egresos de
--                                            antes, o esta migracion sin
--                                            correr.
--
-- Hace falta para reconocer un CANCELADO (el pedido no sale nunca, por
-- ejemplo porque el cliente cancelo). Sin la columna se ve igual que un
-- rechazo de Seguridad (aprobado = 0, despachado = 0): sale en rojo como
-- "No aprobado", pide comentario al calificar el picking y cuenta "con
-- novedades" en el ranking del mes, aunque nadie se equivoco.
--
-- Hasta que se corra, todo funciona como antes: el cancelado se cierra
-- igual, pero no se distingue de un rechazo.
--
-- VA DESPUES de sql/egreso_verificacion_c4.sql.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'decision_seguridad';
-- Si devuelve una fila, ya se corrio: no lo vuelvas a correr.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria sin cambiar nada.)
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN decision_seguridad VARCHAR(20) DEFAULT NULL;

-- Comprobacion: tiene que devolver una fila.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'decision_seguridad';
