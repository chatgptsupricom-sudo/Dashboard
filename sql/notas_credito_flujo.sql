-- ============================================================
-- NOTAS DE CREDITO CON APROBACION EN CADENA (lib/notas-credito/)
--
-- NO HACE FALTA CORRERLO: el panel crea estas tablas solo la primera vez
-- que alguien entra a /notas-credito o RMA solicita una nota de credito
-- (lib/notas-credito/datos.ts, ensureTablas). Queda como referencia, o para
-- crearlas a mano si el usuario de la base no tuviera permiso de CREATE.
--
--   nc_solicitudes  una fila por nota de credito (de RMA o directa) con cada
--                   decision y el enlace a la NC de Odoo (odoo_move_id).
--   nc_eventos      historial de cada una.
--   nc_aprobadores  responsables por sede y paso (preaprueba / aprueba /
--                   procesa), por correo. Sin filas para una sede se usan los
--                   iniciales del codigo (Valencia: Rangel, Gabriel, Victor).
--
-- Requiere lo de antes: sql/rma_nota_credito_aprobacion.sql (estado
-- 'nc_revision' y columnas de decision en rma_notas_credito).
--
-- Escrito para el phpMyAdmin de EasyPanel: sin information_schema y con la
-- base delante de cada tabla.
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.nc_solicitudes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  origen VARCHAR(10) NOT NULL,                 -- rma | directa
  rma_nota_id INT NULL,                        -- rma_notas_credito.id
  case_id INT NULL,
  item_id INT NULL,
  case_number VARCHAR(50) NULL,
  producto VARCHAR(500) NULL,
  serial VARCHAR(200) NULL,
  estado VARCHAR(20) NOT NULL,                 -- por_preaprobar | por_aprobar | aprobada | procesada | rechazada
  estado_rma_previo VARCHAR(30) NULL,          -- a donde vuelve el equipo si se rechaza
  factura_id INT NULL,
  factura_nombre VARCHAR(100) NULL,
  partner_id INT NULL,
  cliente VARCHAR(255) NULL,
  moneda VARCHAR(10) NULL,
  monto DECIMAL(14,2) NULL,                    -- con impuestos
  total_factura DECIMAL(14,2) NULL,
  odoo_product_id INT NULL,
  motivo TEXT NOT NULL,
  creado_por VARCHAR(190) NULL,
  creado_email VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  preaprobado_por VARCHAR(190) NULL,
  preaprobado_at DATETIME NULL,
  aprobado_por VARCHAR(190) NULL,
  aprobado_at DATETIME NULL,
  rechazado_por VARCHAR(190) NULL,
  rechazado_at DATETIME NULL,
  rechazado_paso VARCHAR(20) NULL,
  motivo_rechazo TEXT NULL,
  odoo_move_id INT NULL,
  odoo_move_nombre VARCHAR(100) NULL,
  odoo_estado VARCHAR(20) NULL,
  odoo_total DECIMAL(14,2) NULL,
  odoo_bloqueo DATETIME NULL,
  procesado_por VARCHAR(190) NULL,
  procesado_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nc_rma_nota (rma_nota_id),
  KEY idx_nc_estado (company_id, estado),
  KEY idx_nc_factura (factura_id),
  KEY idx_nc_move (odoo_move_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.nc_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  solicitud_id INT NOT NULL,
  accion VARCHAR(40) NOT NULL,
  por VARCHAR(190) NULL,
  email VARCHAR(190) NULL,
  nota TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_nc_eventos (solicitud_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supricom_panel.nc_aprobadores (
  company_id INT NOT NULL,
  paso VARCHAR(20) NOT NULL,                   -- preaprueba | aprueba | procesa
  email VARCHAR(190) NOT NULL,
  updated_by VARCHAR(190) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, paso, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES FROM supricom_panel LIKE 'nc_%';
