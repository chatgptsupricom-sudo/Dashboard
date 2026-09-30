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

CREATE TABLE IF NOT EXISTS supricom_panel.cxc_incobrables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,                 -- 9=Valencia, 10=Caracas, 7=Panama
  move_id INT NOT NULL,                    -- account.move de Odoo (la factura)
  move_name VARCHAR(100) NOT NULL,
  partner_id INT DEFAULT NULL,
  partner_name VARCHAR(255) DEFAULT NULL,
  -- Saldo y vencimiento de la factura al momento de marcarla (referencia).
  saldo_al_marcar DECIMAL(16,2) NOT NULL DEFAULT 0,
  vencimiento DATE DEFAULT NULL,
  justificacion TEXT NOT NULL,
  marcado_por VARCHAR(200) NOT NULL,
  marcado_por_email VARCHAR(200) DEFAULT NULL,
  marcado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 1 = vigente (fuera de los KPIs). 0 = revertida.
  activo TINYINT(1) NOT NULL DEFAULT 1,
  revertido_por VARCHAR(200) DEFAULT NULL,
  revertido_en TIMESTAMP NULL DEFAULT NULL,
  motivo_reversion TEXT DEFAULT NULL,
  KEY idx_activo_company (activo, company_id),
  KEY idx_move (move_id)
);

-- Verificación posterior: tiene que salir la tabla y sus 16 columnas.
SHOW TABLES FROM supricom_panel LIKE 'cxc_incobrables';
SHOW COLUMNS FROM supricom_panel.cxc_incobrables;
