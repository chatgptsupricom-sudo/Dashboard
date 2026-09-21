-- ============================================================
-- PLANIFICACION DE RUTAS Y VISITAS (formato PL-CAP-01)
--
-- Las crea sola la app en el primer uso (lib/visitas/planificacion.ts,
-- CREATE TABLE IF NOT EXISTS). Este script es por si se prefiere crearlas a
-- mano en el phpMyAdmin de EasyPanel: lleva la base delante y no usa
-- information_schema (ver CLAUDE.md, Gotchas).
--
-- Si la base no se llama `supricom_panel`, reemplaza ese nombre.
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.visit_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  user_id INT NOT NULL,                 -- usuario de Odoo del asesor (sellers.user_id)
  seller_name VARCHAR(255) NOT NULL,
  semana_inicio DATE NOT NULL,          -- lunes de la semana
  semana_numero INT NOT NULL,
  zona_ruta VARCHAR(255) NULL,
  marcas_priorizadas VARCHAR(500) NULL,
  matriz JSON NULL,                     -- matriz de ponderacion de productos
  updated_by VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plan_semana (company_id, user_id, semana_inicio)
);

CREATE TABLE IF NOT EXISTS supricom_panel.visit_plan_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  fecha DATE NOT NULL,
  bloque VARCHAR(10) NOT NULL,          -- manana | tarde
  zona VARCHAR(255) NULL,
  cliente VARCHAR(255) NOT NULL,
  tema VARCHAR(255) NULL,
  objetivo VARCHAR(500) NULL,
  foranea TINYINT(1) NOT NULL DEFAULT 1,
  estado VARCHAR(20) NOT NULL DEFAULT 'planificada',  -- planificada | realizada | no_realizada
  nota VARCHAR(500) NULL,
  weekly_visit_id INT NULL,             -- visita registrada en weekly_visits al marcarla realizada
  marcada_por VARCHAR(255) NULL,
  marcada_at TIMESTAMP NULL,
  KEY idx_plan (plan_id),
  KEY idx_fecha (fecha)
);

SHOW TABLES FROM supricom_panel LIKE 'visit_plan%';
