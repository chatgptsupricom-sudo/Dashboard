-- Rotación de inventario (lib/rotacion-inventario). Referencia: las tablas
-- se crean solas la primera vez que se abre la pantalla o corre el cron
-- (asegurarTablas() en lib/rotacion-inventario/datos.ts). Si hiciera falta
-- crearlas a mano en el phpMyAdmin de EasyPanel, van con la base delante.

CREATE TABLE IF NOT EXISTS supricom_panel.rotacion_planes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  product_id INT NOT NULL,
  inicio DATE NOT NULL,
  unidades_inicio DECIMAL(14,2) NOT NULL,
  costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
  estado VARCHAR(12) NOT NULL DEFAULT 'activo',   -- activo | cumplido | vencido | reiniciado
  cerrado_el DATE NULL,
  creado_por VARCHAR(255) NULL,                   -- NULL = lo abrió el panel
  motivo VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plan (company_id, product_id, inicio),
  INDEX idx_estado (company_id, estado)
);

CREATE TABLE IF NOT EXISTS supricom_panel.rotacion_solicitudes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  marca VARCHAR(120) NOT NULL,                    -- claveMarca (nombre normalizado)
  marca_nombre VARCHAR(255) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'por_enviar',
  creada_auto TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  creado_por VARCHAR(255) NULL,
  enviada_el DATETIME NULL,
  enviada_por VARCHAR(255) NULL,
  enviada_a TEXT NULL,
  canal VARCHAR(10) NULL,                         -- n8n | manual
  respuesta_el DATE NULL,
  respuesta TEXT NULL,
  tipos_apoyo VARCHAR(255) NULL,                  -- proteccion_precio,nota_credito,fondos_promocion,devolucion
  monto_apoyo DECIMAL(14,2) NULL,
  accion_acordada TEXT NULL,
  acordada_el DATE NULL,
  notas TEXT NULL,
  cerrada_el DATE NULL,
  updated_at DATETIME NULL,
  updated_por VARCHAR(255) NULL,
  INDEX idx_marca (company_id, marca, estado)
);

CREATE TABLE IF NOT EXISTS supricom_panel.rotacion_solicitud_lineas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  solicitud_id INT NOT NULL,
  company_id INT NOT NULL,
  product_id INT NOT NULL,
  codigo VARCHAR(120) NULL,
  nombre VARCHAR(500) NULL,
  categoria VARCHAR(255) NULL,
  unidades DECIMAL(14,2) NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
  valor_costo DECIMAL(14,2) NOT NULL DEFAULT 0,
  dias_sin_venta INT NOT NULL DEFAULT 0,
  ultima_venta DATE NULL,
  fecha_rojo DATE NULL,
  origen VARCHAR(10) NOT NULL DEFAULT 'auto',     -- auto | manual
  excluida TINYINT(1) NOT NULL DEFAULT 0,
  exclusion VARCHAR(10) NULL,                     -- auto | usuario
  apoyo_unitario DECIMAL(14,4) NULL,
  precio_remate DECIMAL(14,4) NULL,
  accion VARCHAR(12) NULL,                        -- liquidar | devolver | mantener
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_linea (solicitud_id, product_id),
  INDEX idx_producto (company_id, product_id)
);

CREATE TABLE IF NOT EXISTS supricom_panel.rotacion_solicitud_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  solicitud_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usuario VARCHAR(255) NULL,
  accion VARCHAR(40) NOT NULL,
  detalle TEXT NULL,
  INDEX idx_solicitud (solicitud_id)
);

CREATE TABLE IF NOT EXISTS supricom_panel.rotacion_contactos_marca (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(120) NOT NULL,
  company_id INT NOT NULL DEFAULT 0,              -- 0 = todas las sedes
  nombre VARCHAR(255) NULL,
  correos TEXT NOT NULL,
  cc TEXT NULL,
  notas TEXT NULL,
  updated_at DATETIME NULL,
  updated_por VARCHAR(255) NULL,
  UNIQUE KEY uk_contacto (marca, company_id)
);

SHOW TABLES FROM supricom_panel LIKE 'rotacion_%';
