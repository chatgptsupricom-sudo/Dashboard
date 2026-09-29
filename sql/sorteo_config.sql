-- ============================================================
-- CONFIGURACIÓN DEL SORTEO DE CLIENTES (landing sorteo.supricom.com.ve)
--
-- El sorteo activo: sede (company_id 9 = Valencia, 10 = Caracas, 7 = Panamá),
-- mes de las compras que dan tickets, monto por ticket y título de la landing.
-- Una sola fila (id = 1). Se edita en SuperAdmin › Ventas › Sorteo de clientes
-- (lib/sorteo/configuracion.ts). Los ganadores ya están separados por sede y
-- mes en sorteo_ganadores, así que cambiar de sorteo no mezcla premios.
--
-- Se puede correr VARIAS VECES sin romper nada: CREATE TABLE IF NOT EXISTS e
-- INSERT IGNORE (no pisa una configuración ya guardada).
--
-- Escrito para el phpMyAdmin de EasyPanel: la tabla lleva el nombre de la
-- base delante y no se usa information_schema.
-- ============================================================

-- 1. Verificación previa: no debería salir nada (la tabla todavía no existe).
SHOW TABLES FROM supricom_panel LIKE 'sorteo_config';

-- 2. Tabla.
CREATE TABLE IF NOT EXISTS supricom_panel.sorteo_config (
  id TINYINT NOT NULL PRIMARY KEY,           -- siempre 1
  company_id INT NOT NULL,
  mes CHAR(7) NOT NULL,                      -- 'YYYY-MM'
  monto_por_ticket DECIMAL(14,2) NOT NULL DEFAULT 5000,
  titulo VARCHAR(100) DEFAULT NULL,          -- NULL = "Gran Sorteo <Mes> de <Año>"
  actualizado_por VARCHAR(200) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. El sorteo que está corriendo hoy (Caracas, septiembre 2026, $5.000).
INSERT IGNORE INTO supricom_panel.sorteo_config (id, company_id, mes, monto_por_ticket, titulo)
VALUES (1, 10, '2026-09', 5000, NULL);

-- 4. Verificación posterior: 7 columnas y 1 fila (10, 2026-09, 5000.00).
SHOW COLUMNS FROM supricom_panel.sorteo_config;
SELECT * FROM supricom_panel.sorteo_config;
