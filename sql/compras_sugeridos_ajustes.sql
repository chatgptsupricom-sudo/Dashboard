-- ============================================================
-- SUGERIDOS DE COMPRA: ETA Y COMPRA MANUAL DEL COMPRADOR
--
-- En la hoja de analisis del comprador hay dos columnas que carga a mano:
-- el ETA (dias hasta que llega la compra) y la "Compra manual/puntual", que
-- reemplaza a la recomendada (un 0 bloquea la compra de ese producto). Se
-- guardan por sucursal y producto de Odoo.
--
--   eta_dias       NULL = no cargado, el calculo usa 15.
--   compra_manual  NULL = sin compra manual; 0 = bloqueo manual. Una compra
--                  manual > 0 se borra sola al crear una orden de compra de
--                  esa sucursal que incluya el producto; el 0 queda hasta
--                  que el comprador lo quite.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): la tabla lleva el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
-- Se puede correr mas de una vez (IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.compras_sugeridos_ajustes (
  cids INT NOT NULL,
  product_odoo_id INT NOT NULL,
  codigo VARCHAR(100) DEFAULT NULL,
  eta_dias INT DEFAULT NULL,
  compra_manual INT DEFAULT NULL,
  actualizado_por VARCHAR(200) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cids, product_odoo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprobacion: tiene que aparecer la tabla y sus 7 columnas.
SHOW TABLES FROM supricom_panel LIKE 'compras_sugeridos_ajustes';
SHOW COLUMNS FROM supricom_panel.compras_sugeridos_ajustes;
