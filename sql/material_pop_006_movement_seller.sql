-- Vendedor que atiende al cliente en las salidas de material POP.
-- Ejecutar una sola vez. Con el prefijo de la base porque el phpMyAdmin de
-- EasyPanel no acepta sentencias sin ella.
--
-- En las solicitudes el vendedor es quien la creó; en una salida cargada a
-- mano no había dónde anotarlo, y la nota de entrega salía sin él.
--
-- MySQL no tiene ADD COLUMN IF NOT EXISTS: verificar con el SHOW COLUMNS de
-- abajo y, si la columna ya aparece, saltear el ALTER.

SHOW COLUMNS FROM supricom_panel.pop_movements LIKE 'seller_name';

ALTER TABLE supricom_panel.pop_movements
  ADD COLUMN seller_name VARCHAR(255) NULL AFTER odoo_order_name;

SHOW COLUMNS FROM supricom_panel.pop_movements LIKE 'seller_name';

-- Para la salida a CORPORACION DIGIPRO que ya estaba cargada, reemplazando el
-- nombre por el que corresponda:
-- UPDATE supricom_panel.pop_movements
-- SET seller_name = 'NOMBRE DEL VENDEDOR'
-- WHERE movement_group_id = 'd2e7732e-8648-4a6f-b603-fbe7089dcbae';
