-- ============================================================
-- SORTEO DE CLIENTES (ruleta pública /es/sorteo)
--
-- Ganadores oficiales del sorteo. El servidor elige el ganador
-- (POST /api/sorteo/girar, lib/sorteo/ganadores.ts) y lo guarda acá, para que:
--   - la lista de ganadores sea la misma en todas las pantallas (la página
--     pública la consulta cada pocos segundos), y
--   - quede la traza del giro: qué ticket salió, entre cuántos tickets y
--     cuántos clientes, y quién giró.
-- Anular un premio no borra la fila: queda con anulado = 1.
--
-- Se puede correr VARIAS VECES sin romper nada (CREATE TABLE IF NOT EXISTS).
--
-- Escrito para el phpMyAdmin de EasyPanel: la tabla lleva el nombre de la
-- base delante y no se usa information_schema. Si la base no se llama
-- `supricom_panel`, reemplaza ese nombre en todo el archivo.
-- ============================================================

-- 1. Verificación previa: no debería salir nada (la tabla todavía no existe).
--    Si sale `sorteo_ganadores`, la migración ya se corrió: revisa el paso 3.
SHOW TABLES FROM supricom_panel LIKE 'sorteo_ganadores';

-- 2. Tabla de ganadores.
CREATE TABLE IF NOT EXISTS supricom_panel.sorteo_ganadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- Sede del sorteo (10 = Caracas) y mes de las compras que dieron los tickets.
  company_id INT NOT NULL,
  mes CHAR(7) NOT NULL,                      -- 'YYYY-MM'
  -- Cliente ganador (commercial_partner_id de Odoo) y sus números al momento del giro.
  partner_id INT NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  rif VARCHAR(40) DEFAULT NULL,
  compras INT NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  tickets INT NOT NULL,
  -- Traza del giro: ticket que salió (0 .. total_tickets-1) entre los clientes que quedaban.
  ticket_sorteado INT NOT NULL,
  total_tickets INT NOT NULL,
  participantes INT NOT NULL,
  sorteado_por VARCHAR(200) NOT NULL,
  anulado TINYINT(1) NOT NULL DEFAULT 0,
  anulado_por VARCHAR(200) DEFAULT NULL,
  anulado_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sorteo (company_id, mes, anulado)
);

-- 3. Verificación posterior: tiene que salir la tabla con 17 columnas
--    (id ... created_at) y 0 filas.
SHOW TABLES FROM supricom_panel LIKE 'sorteo_ganadores';
SHOW COLUMNS FROM supricom_panel.sorteo_ganadores;
SELECT COUNT(*) AS ganadores FROM supricom_panel.sorteo_ganadores;
