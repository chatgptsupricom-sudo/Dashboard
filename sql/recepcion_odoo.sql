-- ============================================================
-- RECEPCION: CARGA EN ODOO Y RECEPCION POR FACTURA (Caracas)
--
-- NO HACE FALTA CORRERLO: el panel agrega estas columnas solo la primera
-- vez que abre una recepcion (lib/recepcion/columnasOdoo.ts). Queda como
-- referencia, o para correrlo a mano si el usuario de la base no puede
-- hacer ALTER.
--
--   origen                 packing_list (Compras, contenedores) |
--                          factura (Almacen, mercancia vendida por otra sede)
--   factura_odoo_id        factura de cliente de la otra sede (account.move)
--   odoo_purchase_order_id OC de Odoo donde se carga lo contado al cerrar
--   odoo_estado            cargando | cargado | error | sin_oc
--   odoo_resultado         JSON: recepciones y traslados validados en Odoo
--
-- Escrito para el phpMyAdmin de EasyPanel: tablas con el nombre de la base
-- delante y sin information_schema.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.recepcion_packing LIKE 'origen';
-- Si devuelve una fila, ya esta: no lo corras (MySQL no tiene
-- ADD COLUMN IF NOT EXISTS y el ALTER fallaria).
-- ============================================================

ALTER TABLE supricom_panel.recepcion_packing
  ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'packing_list',
  ADD COLUMN factura_odoo_id INT DEFAULT NULL,
  ADD COLUMN odoo_purchase_order_id INT DEFAULT NULL,
  ADD COLUMN odoo_oc_nombre VARCHAR(50) DEFAULT NULL,
  ADD COLUMN odoo_estado VARCHAR(20) DEFAULT NULL,
  ADD COLUMN odoo_error TEXT DEFAULT NULL,
  ADD COLUMN odoo_resultado TEXT DEFAULT NULL,
  ADD COLUMN odoo_intento_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN odoo_cargado_at TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE supricom_panel.recepcion_packing_items
  ADD COLUMN odoo_product_id INT DEFAULT NULL;

-- Comprobacion: tienen que aparecer las columnas.
SHOW COLUMNS FROM supricom_panel.recepcion_packing LIKE 'odoo%';
SHOW COLUMNS FROM supricom_panel.recepcion_packing_items LIKE 'odoo_product_id';
