-- Orden de venta de Odoo en las salidas de material POP.
-- Ejecutar una sola vez. Va con el prefijo de la base porque el phpMyAdmin de
-- EasyPanel no acepta sentencias sin ella.
--
-- Una salida a cliente cargada a mano ahora puede llevar el número de la orden
-- (por ejemplo S-05457) y sale impreso en la nota de entrega, igual que en las
-- solicitudes de los vendedores.
--
-- MySQL no tiene ADD COLUMN IF NOT EXISTS: verificar antes con el SHOW COLUMNS
-- de abajo y, si la columna ya aparece, saltear el ALTER.

SHOW COLUMNS FROM supricom_panel.pop_movements LIKE 'odoo_order_name';

ALTER TABLE supricom_panel.pop_movements
  ADD COLUMN odoo_order_name VARCHAR(50) NULL AFTER destination;

SHOW COLUMNS FROM supricom_panel.pop_movements LIKE 'odoo_order_name';
