-- ============================================================
-- HISTORICO DE VENTAS DE SMARTBIT (ERP anterior a Odoo)
--
-- Odoo factura de forma nativa desde 2026-04-01 en las 3 sedes. Lo anterior
-- en Odoo son solo las facturas abiertas migradas ("Importación Masiva"),
-- asi que el panel toma las ventas previas al corte de esta tabla, que se
-- llena con POST /api/superadmin/smartbit/importar (lib/smartbit.ts).
--
-- Un renglon = un articulo dentro de un registro de
-- POST /api/v1/MovimientoInventario/Ventas de Smartbit (vendedor + sucursal +
-- fecha + cliente). Las notas de credito vienen con venta negativa.
--
-- Se puede correr VARIAS VECES (CREATE TABLE IF NOT EXISTS).
-- Escrito para el phpMyAdmin de EasyPanel: nombre de la base delante y sin
-- information_schema.
-- ============================================================

-- Verificacion previa: no deberia salir nada (o la tabla ya existe y el
-- CREATE de abajo no hace nada).
SHOW TABLES FROM supricom_panel LIKE 'ventas_smartbit';

CREATE TABLE IF NOT EXISTS supricom_panel.ventas_smartbit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,               -- 9=Valencia, 10=Caracas, 7=Panama
  fecha DATE NOT NULL,
  id_sucursal INT DEFAULT NULL,
  sucursal VARCHAR(120) DEFAULT NULL,
  vendedor VARCHAR(150) DEFAULT NULL,
  codigo_cliente VARCHAR(60) DEFAULT NULL,
  cliente VARCHAR(255) DEFAULT NULL,
  codigo_articulo VARCHAR(80) DEFAULT NULL,
  articulo VARCHAR(255) DEFAULT NULL,
  linea VARCHAR(120) DEFAULT NULL,       -- clasificador "Linea" (ej. "TINTAS HP")
  venta DECIMAL(16,2) NOT NULL DEFAULT 0,
  unidades DECIMAL(16,4) NOT NULL DEFAULT 0,
  costo DECIMAL(16,4) DEFAULT NULL,
  importado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_company_fecha (company_id, fecha),
  KEY idx_articulo (codigo_articulo)
);

-- Verificacion posterior: tiene que salir la tabla y sus 15 columnas.
SHOW TABLES FROM supricom_panel LIKE 'ventas_smartbit';
SHOW COLUMNS FROM supricom_panel.ventas_smartbit;
