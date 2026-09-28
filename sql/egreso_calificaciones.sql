-- ============================================================
-- EGRESO: CALIFICACION DEL PICKING Y DEL DESPACHO (issue #302)
--
-- Cada egreso cerrado tiene dos notas: la del picking (al almacenista que
-- armo) y la del despacho (al que despacho). Si es la misma persona, igual
-- son dos filas.
--
--   seguridad_calificaciones.aspecto   'picking' | 'despacho'.
--                                      NULL = calificacion de RMA, o de un
--                                      egreso de antes de este cambio (tenia
--                                      una sola nota): el panel la cuenta
--                                      como 'despacho'. No hace falta
--                                      actualizar las filas viejas.
--
-- Se llama `aspecto` y no `tipo` porque en esta tabla `relacionado_a =
-- 'despacho'` ya significa otra cosa (el despacho de RMA).
--
-- Hasta que se corra esto, el egreso se cierra guardando solo la nota del
-- despacho, como antes (la API avisa en el log "falta correr
-- sql/egreso_calificaciones.sql").
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.seguridad_calificaciones LIKE 'aspecto';
-- Si devuelve una fila, ya se corrio: no lo vuelvas a correr.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria sin cambiar nada.)
-- ============================================================

ALTER TABLE supricom_panel.seguridad_calificaciones
  ADD COLUMN aspecto VARCHAR(20) DEFAULT NULL,
  ADD INDEX idx_aspecto (relacionado_a, aspecto);

-- Comprobacion: tiene que devolver una fila.
SHOW COLUMNS FROM supricom_panel.seguridad_calificaciones LIKE 'aspecto';
