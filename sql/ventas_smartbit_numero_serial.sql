-- ============================================================
-- NUMERO DE FACTURA Y SERIAL EN EL HISTORICO DE SMARTBIT
--
-- El export "Ventas historico" de Smartbit (un renglon por articulo, con el
-- N° de documento y el serial; scripts/smartbit-historico-a-sql.cjs) trae lo
-- que el de la API y el de "Transaccion por producto" no traian. Con esto
-- Buscar Factura de RMA (lib/rma/buscarCompras.ts) busca un serial vendido en
-- Smartbit y muestra los productos exactos de una factura.
--
-- numero = el de ventas_smartbit_facturas.numero (las devoluciones con
-- prefijo NC-). NULL en lo cargado por API o por los exports anteriores.
-- Un articulo con serial va en un renglon por unidad.
--
-- Escrito para el phpMyAdmin de EasyPanel: nombre de la base delante y sin
-- information_schema. MySQL no tiene ADD COLUMN IF NOT EXISTS: revisar antes.
-- ============================================================

-- 1) Verificacion previa: no deberian aparecer filas "numero" ni "serial".
SHOW COLUMNS FROM supricom_panel.ventas_smartbit WHERE Field IN ('numero', 'serial');

-- 2) Columnas e indices.
ALTER TABLE supricom_panel.ventas_smartbit
  ADD COLUMN numero VARCHAR(30) DEFAULT NULL AFTER fecha,
  ADD COLUMN serial VARCHAR(80) DEFAULT NULL AFTER articulo,
  ADD KEY idx_numero (company_id, numero),
  ADD KEY idx_serial (serial);

-- 3) Verificacion: ahora aparecen las dos.
SHOW COLUMNS FROM supricom_panel.ventas_smartbit WHERE Field IN ('numero', 'serial');
