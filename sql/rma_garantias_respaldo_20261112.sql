-- Respaldo de la tabla de garantías ANTES de pasarla a marca + categoría
-- (sql/rma_garantias_por_categoria.sql y sql/seed_garantias_excel.sql).
-- Correr en el phpMyAdmin de EasyPanel, base supricom_panel, PRIMERO.
--
-- Deja una copia exacta en rma_garantias_respaldo_20261112. Para volver atrás:
--   DROP TABLE supricom_panel.rma_garantias;
--   CREATE TABLE supricom_panel.rma_garantias LIKE supricom_panel.rma_garantias_respaldo_20261112;
--   INSERT INTO supricom_panel.rma_garantias SELECT * FROM supricom_panel.rma_garantias_respaldo_20261112;
-- (y el código anterior, o este mismo: lee la tabla vieja sin las columnas nuevas).

-- ── Verificación previa ─────────────────────────────────────────────────────
-- Debe existir rma_garantias y NO existir todavía el respaldo.
SHOW TABLES FROM supricom_panel LIKE 'rma_garantias%';
SELECT COUNT(*) AS filas_actuales FROM supricom_panel.rma_garantias;

-- ── Respaldo (estructura con sus índices, luego los datos) ───────────────────
CREATE TABLE supricom_panel.rma_garantias_respaldo_20261112 LIKE supricom_panel.rma_garantias;
INSERT INTO supricom_panel.rma_garantias_respaldo_20261112 SELECT * FROM supricom_panel.rma_garantias;

-- ── Verificación posterior ──────────────────────────────────────────────────
-- Los dos conteos tienen que ser iguales.
SELECT
  (SELECT COUNT(*) FROM supricom_panel.rma_garantias) AS original,
  (SELECT COUNT(*) FROM supricom_panel.rma_garantias_respaldo_20261112) AS respaldo;
