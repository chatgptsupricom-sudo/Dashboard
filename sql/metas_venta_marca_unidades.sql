-- Metas por marca: meta en unidades (sep-2026).
-- La app agrega estas columnas sola en el primer uso (ALTER idempotente en
-- lib/metas-marca/metas.ts). Este script es para hacerlo a mano en el
-- phpMyAdmin de EasyPanel. Verificar ANTES que no existan (MySQL no tiene
-- ADD COLUMN IF NOT EXISTS):
--   SHOW COLUMNS FROM supricom_panel.metas_venta_marca;
-- Si ya aparecen meta_unidades / stock_base / valor_stock, NO correr esto.

ALTER TABLE supricom_panel.metas_venta_marca
  ADD COLUMN meta_unidades DECIMAL(14,2) NULL AFTER meta,
  ADD COLUMN stock_base DECIMAL(14,2) NULL AFTER meta_unidades,
  ADD COLUMN valor_stock DECIMAL(14,2) NULL AFTER stock_base;

-- Después:
--   SHOW COLUMNS FROM supricom_panel.metas_venta_marca;
