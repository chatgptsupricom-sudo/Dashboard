-- Numero de factura del movimiento de mercancia.
--
-- La mercancia que ENTRA llega con la factura de la orden de compra, y esa
-- factura ES el documento que se busca en Odoo, asi que ya queda en
-- `odoo_picking_name`.
--
-- La que SALE viaja con dos papeles: la orden de despacho y la factura. La
-- orden es contra lo que se cuenta, pero la factura es la que va con el chofer
-- y la que reclama el cliente si algo no llega. Sin guardarla, un descuadre no
-- se puede cruzar con el documento que el cliente tiene en la mano.
--
-- Se puede correr varias veces.

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seguridad_mercancia'
      AND COLUMN_NAME = 'factura_numero') > 0,
  'SELECT "factura_numero ya existe" AS aviso',
  'ALTER TABLE seguridad_mercancia ADD COLUMN factura_numero VARCHAR(100) DEFAULT NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
