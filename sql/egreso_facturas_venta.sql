-- ============================================================
-- EGRESO: FACTURA DE VENTA DE LA ORDEN (issue #298)
--
-- Almacen solo recibe ordenes facturadas. Al registrar el egreso el panel
-- trae de Odoo las facturas de cliente vigentes de la orden de venta y las
-- guarda aca, sin que Almacen las escriba:
--
--   facturas_venta_json   lista JSON de numeros de factura (casi siempre
--                         una; puede haber mas si se facturo en partes)
--   factura_venta_fecha   fecha de la primera factura (invoice_date de Odoo;
--                         Odoo no guarda la hora de publicacion)
--
-- Van aparte de `facturas_json` / `factura_numero` porque en el egreso esas
-- ya guardan otra cosa: las ordenes de despacho que salen en el camion.
--
-- Hasta que se corra esto, el egreso se registra igual pero sin la factura
-- (la API avisa en el log "falta correr sql/egreso_facturas_venta.sql").
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'facturas_venta_json';
-- Si devuelve una fila, ya se corrio: no lo vuelvas a correr.
-- (MySQL no tiene ADD COLUMN IF NOT EXISTS: el ALTER fallaria sin cambiar nada.)
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN facturas_venta_json TEXT DEFAULT NULL,
  ADD COLUMN factura_venta_fecha DATE DEFAULT NULL;

-- Comprobacion: cada una tiene que devolver una fila.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'facturas_venta_json';
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'factura_venta_fecha';
