-- ============================================================
-- EGRESO: UNA ORDEN DE DESPACHO, UN EGRESO
--
-- Clave unica para que el mismo picking de Odoo no se registre dos veces como
-- egreso. El POST ya revisa con un SELECT, pero si dos almacenistas pulsan la
-- misma orden de la lista de pendientes al mismo tiempo, los dos pasan el
-- SELECT y salen dos egresos del mismo picking, que se arman y se despachan
-- por separado. Con la clave, el segundo recibe "Esta orden ya se registro".
--
-- Solo egresos: en los ingresos viejos `odoo_picking_id` es el id de la
-- factura de compra y no se toca. Por eso la clave es sobre una expresion
-- (IF(tipo = 'egreso', ...)) y no sobre la columna: los ingresos quedan en
-- NULL, y MySQL admite varias filas con NULL.
--
-- Hasta que se corra, el panel funciona igual que antes (la carrera queda
-- posible).
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO:
--
-- 1) Mira si ya esta aplicado:
--   SHOW INDEX FROM supricom_panel.seguridad_mercancia WHERE Key_name = 'uq_egreso_picking';
-- Si devuelve filas, ya se corrio: no lo vuelvas a correr.
--
-- 2) Mira si ya hay egresos repetidos (con eso el ALTER falla con
--    "Duplicate entry"):
--   SELECT odoo_picking_id, odoo_picking_name, COUNT(*) AS veces,
--          GROUP_CONCAT(id ORDER BY id) AS ids,
--          GROUP_CONCAT(COALESCE(etapa, estado) ORDER BY id) AS etapas
--     FROM supricom_panel.seguridad_mercancia
--    WHERE tipo = 'egreso' AND odoo_picking_id IS NOT NULL
--    GROUP BY odoo_picking_id, odoo_picking_name
--   HAVING COUNT(*) > 1;
-- Si devuelve filas, NO las borres a ciegas: cada una es un egreso con
-- conteos, seriales y calificaciones. Pasale la lista a sistemas para decidir
-- cual queda.
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD UNIQUE INDEX uq_egreso_picking ((IF(tipo = 'egreso', odoo_picking_id, NULL)));

-- Comprobacion: tiene que devolver una fila.
SHOW INDEX FROM supricom_panel.seguridad_mercancia WHERE Key_name = 'uq_egreso_picking';
