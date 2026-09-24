-- ============================================================
-- KPI DE DISEÑOS: fecha del diseño (design_date)
--
-- Antes todo se contaba por `created_at` (cuándo se subió el archivo), así que
-- un lote subido de una vez caía entero en el mismo día. `design_date` es el
-- día del diseño, que es el que cuenta para el KPI y el calendario.
--
-- La crea sola la app en el primer uso (lib/designerDesigns.ts). Este script
-- es por si se prefiere correrlo a mano en el phpMyAdmin de EasyPanel: lleva
-- la base delante y no usa information_schema (ver CLAUDE.md, Gotchas).
--
-- Si la base no se llama `supricom_panel`, reemplaza ese nombre.
-- ============================================================

-- 1. Mirá si la columna ya existe (MySQL no tiene ADD COLUMN IF NOT EXISTS):
SHOW COLUMNS FROM supricom_panel.designer_designs LIKE 'design_date';

-- 2. Si no aparece, corré estas tres:
ALTER TABLE supricom_panel.designer_designs ADD COLUMN design_date DATE NULL;
ALTER TABLE supricom_panel.designer_designs ADD INDEX idx_design_date (design_date);
-- Lo ya cargado se queda con su día de subida, que es la mejor aproximación.
UPDATE supricom_panel.designer_designs SET design_date = DATE(created_at) WHERE design_date IS NULL;

-- 3. Comprobación:
SHOW COLUMNS FROM supricom_panel.designer_designs LIKE 'design_date';
