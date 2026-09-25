-- ============================================================
-- EGRESO: NOVEDADES DE C4 SIN DUPLICADOS (revision de #314)
--
-- Clave unica para seguridad_mercancia_novedades: la misma novedad (egreso,
-- ronda, origen, tipo, serial) no puede estar dos veces. Sin ella, si dos
-- personas pistolean en C4 el mismo serial que no esta en el picking con
-- segundos de diferencia, la novedad queda duplicada (y un producto que no
-- esta en la orden queda en dos filas en vez de una con contado 2).
--
-- Las filas sin serial (faltas y sobras de conteo al cerrar) tienen serial
-- NULL y la clave no las toca: MySQL admite varias filas con NULL.
--
-- VA DESPUES de sql/egreso_verificacion_c4.sql, que crea la tabla. Hasta que
-- se corra, el panel funciona igual que antes (la carrera queda posible).
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW INDEX FROM supricom_panel.seguridad_mercancia_novedades WHERE Key_name = 'uq_novedad';
-- Si devuelve filas, ya se corrio: no lo vuelvas a correr.
--
-- Si el ALTER falla con "Duplicate entry", ya hay novedades duplicadas.
-- Borra las repetidas (se queda la primera de cada una) y vuelve a correrlo:
--   DELETE n1 FROM supricom_panel.seguridad_mercancia_novedades n1
--     JOIN supricom_panel.seguridad_mercancia_novedades n2
--       ON n1.mercancia_id = n2.mercancia_id AND n1.ronda = n2.ronda
--      AND n1.origen = n2.origen AND n1.tipo = n2.tipo AND n1.serial = n2.serial
--      AND n1.id > n2.id;
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia_novedades
  ADD UNIQUE KEY uq_novedad (mercancia_id, ronda, origen, tipo, serial);

-- Comprobacion: tiene que devolver filas (una por columna de la clave).
SHOW INDEX FROM supricom_panel.seguridad_mercancia_novedades WHERE Key_name = 'uq_novedad';
