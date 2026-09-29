-- ============================================================
-- EGRESO: UNA ORDEN DE DESPACHO, UN EGRESO
--
-- Clave unica para que el mismo picking de Odoo no se registre dos veces como
-- egreso. El POST ya revisa con un SELECT, pero si dos almacenistas pulsan la
-- misma orden de la lista de pendientes al mismo tiempo, los dos pasan el
-- SELECT y salen dos egresos del mismo picking, que se arman y se despachan
-- por separado. Con la clave, el segundo recibe "Esta orden ya se registro".
--
-- Solo egresos que todavia ocupan la orden. La clave es sobre una expresion
-- y no sobre la columna, que queda en NULL (MySQL admite varias filas con
-- NULL) para:
--  - los ingresos viejos: ahi `odoo_picking_id` es el id de la factura de
--    compra;
--  - los egresos que Seguridad cerro sin despachar (cancelados): el picking
--    sigue Listo en Odoo y se tiene que poder registrar otra vez. Es la misma
--    regla que `sqlEgresoOcupaOrden` en lib/seguridad/mercancia.ts; si cambia
--    una, cambia la otra.
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
--      AND NOT (COALESCE(despachado, 1) = 0
--               AND COALESCE(etapa, '') IN ('por_calificar', 'cerrado'))
--    GROUP BY odoo_picking_id, odoo_picking_name
--   HAVING COUNT(*) > 1;
-- Si devuelve filas, NO las borres a ciegas: cada una es un egreso con
-- conteos, seriales y calificaciones. Pasale la lista a sistemas para decidir
-- cual queda.
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD UNIQUE INDEX uq_egreso_picking ((
    IF(tipo = 'egreso'
         AND NOT (COALESCE(despachado, 1) = 0
                  AND COALESCE(etapa, '') IN ('por_calificar', 'cerrado')),
       odoo_picking_id, NULL)
  ));

-- Comprobacion: tiene que devolver una fila.
SHOW INDEX FROM supricom_panel.seguridad_mercancia WHERE Key_name = 'uq_egreso_picking';
