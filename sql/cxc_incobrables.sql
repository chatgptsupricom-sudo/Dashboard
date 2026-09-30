-- ============================================================
-- INCOBRABLES MARCADOS A MANO (Cuentas por Cobrar)
--
-- La cartera vencida antes de 2025 ya es "incobrable" de forma automática
-- (lib/cxc/carteraVieja.ts). Esta tabla guarda las facturas posteriores que
-- la usuaria de CxC decide pasar a incobrables con su criterio: quién, cuándo
-- y por qué. Una factura marcada sale de Cartera Vencida, Recuperación, DSO y
-- CEI y pasa a la tarjeta Incobrables, igual que la cartera vieja.
--
-- No se borra nada: revertir una marca solo la desactiva (activo = 0) y guarda
-- quién la revirtió y por qué. Una factura se puede volver a marcar después;
-- queda una fila nueva. SuperAdmin ve todo el registro.
--
-- Se puede correr VARIAS VECES (CREATE TABLE IF NOT EXISTS).
-- Escrito para el phpMyAdmin de EasyPanel: nombre de la base delante y sin
-- information_schema.
-- ============================================================

-- Verificación previa: no debería salir nada (o la tabla ya existe y el
-- CREATE de abajo no hace nada).
SHOW TABLES FROM supricom_panel LIKE 'cxc_incobrables';



-- Verificación posterior: tiene que salir la tabla y sus 16 columnas.
SHOW TABLES FROM supricom_panel LIKE 'cxc_incobrables';
SHOW COLUMNS FROM supricom_panel.cxc_incobrables;
