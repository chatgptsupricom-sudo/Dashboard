-- Garantías por marca Y categoría (nov-2026), con el trámite y los centros de
-- servicio autorizados del Excel "GARANTIA SUPRICOM". Una sola tabla para RMA,
-- el portal de clientes y el Agente IA (lib/garantia.ts).
--
-- Orden: 1) sql/rma_garantias_respaldo_20261112.sql  2) este  3) sql/seed_garantias_excel.sql
--
-- categoria = '' es la fila de toda la marca (como hasta ahora). Una fila con
-- categoría aplica a los productos cuyo nombre trae alguna de sus `palabras`
-- (separadas por coma). meses NULL = vida útil; 0 = sin garantía.

-- ── Verificación previa ─────────────────────────────────────────────────────
-- 1) Ya corriste el respaldo: debe salir rma_garantias_respaldo_20261112.
SHOW TABLES FROM supricom_panel LIKE 'rma_garantias%';
-- 2) Todavía no existen las columnas nuevas (categoria, palabras, tiempo_texto,
--    con_fabricante, tramite). Si ya salen, no corras el ALTER.
SHOW COLUMNS FROM supricom_panel.rma_garantias;
-- 3) Nombre del índice único de `marca`: en la columna Key_name, la fila con
--    Column_name = marca y Non_unique = 0. Normalmente se llama `marca`; si se
--    llama distinto, cámbialo en el DROP INDEX de abajo.
SHOW INDEX FROM supricom_panel.rma_garantias;

-- ── Cambios ─────────────────────────────────────────────────────────────────
-- Una marca puede tener varias filas (una por categoría): la llave única pasa a
-- ser (marca, categoria).
ALTER TABLE supricom_panel.rma_garantias
  DROP INDEX marca,
  ADD COLUMN categoria VARCHAR(100) NOT NULL DEFAULT '' AFTER marca,
  ADD COLUMN palabras VARCHAR(500) NULL AFTER notas,
  ADD COLUMN tiempo_texto VARCHAR(100) NULL AFTER palabras,
  ADD COLUMN con_fabricante TINYINT(1) NOT NULL DEFAULT 0 AFTER tiempo_texto,
  ADD COLUMN tramite TEXT NULL AFTER con_fabricante,
  ADD UNIQUE KEY uq_marca_categoria (marca, categoria);

-- Centros de servicio autorizados (CSA) del mismo Excel.
CREATE TABLE IF NOT EXISTS supricom_panel.rma_centros_servicio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  direccion VARCHAR(500) NULL,
  contacto VARCHAR(200) NULL,
  telefono VARCHAR(200) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Verificación posterior ──────────────────────────────────────────────────
-- rma_garantias con las 5 columnas nuevas y el índice uq_marca_categoria;
-- las filas de antes quedan con categoria = ''.
SHOW COLUMNS FROM supricom_panel.rma_garantias;
SHOW INDEX FROM supricom_panel.rma_garantias;
SHOW TABLES FROM supricom_panel LIKE 'rma_centros_servicio';
SELECT COUNT(*) AS filas, SUM(categoria = '') AS de_toda_la_marca FROM supricom_panel.rma_garantias;
