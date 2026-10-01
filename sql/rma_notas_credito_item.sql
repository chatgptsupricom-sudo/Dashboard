-- ============================================================
-- SERVICIO TECNICO: NOTA DE CREDITO POR PRODUCTO (issue #331, paso 3)
--
-- En un envio con varios productos cada uno puede terminar en nota de
-- credito por su cuenta, asi que la nota queda ademas asociada al producto.
-- NULL = nota del caso completo (asi quedan las que ya existen).
--
-- Requiere sql/rma_case_items.sql (paso 1) ya aplicado.
--
-- Escrito para el phpMyAdmin de EasyPanel (sin information_schema, con la
-- base delante). ANTES DE CORRERLO mira que no este aplicado:
--   SHOW COLUMNS FROM supricom_panel.rma_notas_credito LIKE 'item_id';
-- Si devuelve una fila, ya esta: no lo corras.
-- ============================================================

ALTER TABLE supricom_panel.rma_notas_credito
  ADD COLUMN item_id INT DEFAULT NULL,
  ADD INDEX idx_nc_item (item_id);

-- Comprobacion: tiene que devolver una fila.
SHOW COLUMNS FROM supricom_panel.rma_notas_credito LIKE 'item_id';
