-- ============================================================
-- MARCA EN EL HISTORICO DE SMARTBIT
--
-- Smartbit no guarda la marca. La toma el panel de Odoo cruzando
-- codigo_articulo con default_code (POST /api/superadmin/smartbit/marcas,
-- lib/smartbit.ts). NULL = sin revisar; '' = el articulo no existe en Odoo.
--
-- Escrito para el phpMyAdmin de EasyPanel: nombre de la base delante y sin
-- information_schema. MySQL no tiene ADD COLUMN IF NOT EXISTS: revisar antes.
-- ============================================================

-- 1) Verificacion previa: no deberia aparecer una fila "marca".
SHOW COLUMNS FROM supricom_panel.ventas_smartbit LIKE 'marca';

-- 2) Columna e indice.
ALTER TABLE supricom_panel.ventas_smartbit
  ADD COLUMN marca VARCHAR(120) DEFAULT NULL AFTER linea,
  ADD KEY idx_marca (marca);

-- 3) Verificacion: ahora si aparece.
SHOW COLUMNS FROM supricom_panel.ventas_smartbit LIKE 'marca';

-- 4) Despues de correr el cruce, cuanto quedo sin marca por sede:
-- SELECT company_id, marca = '' AS sin_marca, COUNT(*) AS renglones, SUM(venta) AS venta
--   FROM supricom_panel.ventas_smartbit GROUP BY company_id, marca = '';
