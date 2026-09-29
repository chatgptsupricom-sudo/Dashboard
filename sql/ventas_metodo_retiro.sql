-- ============================================================
-- METODO DE RETIRO DE LOS PEDIDOS (Ventas -> Almacen)
--
-- El cliente le dice al vendedor como recibe su pedido y el vendedor lo
-- carga en el panel (seccion "Metodo de retiro"); el Asistente de Ventas
-- puede cargarlo por cualquier vendedor. Almacen no registra el egreso de un
-- pedido sin metodo, y el tipo de entrega del egreso sale de aqui
-- (lib/ventas/metodoRetiro.ts).
--
--   metodo  sucursal (retiro en sucursal) | ruta | encomienda
--   ruta_id / ruta_nombre   la ruta de rma_rutas_despacho, si es por ruta
--   agencia                 la agencia, si es encomienda
--
-- La app crea la tabla sola la primera vez (CREATE TABLE IF NOT EXISTS);
-- este script es para crearla a mano en el phpMyAdmin de EasyPanel.
--   * NO usa information_schema (#1044 Acceso negado).
--   * La tabla lleva la base delante (supricom_panel.tabla).
-- Se puede correr mas de una vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS supricom_panel.ventas_metodo_retiro (
  id INT AUTO_INCREMENT PRIMARY KEY,
  odoo_sale_id INT NOT NULL,
  pedido VARCHAR(64) DEFAULT NULL,
  company_id INT DEFAULT NULL,
  cliente VARCHAR(255) DEFAULT NULL,
  vendedor_uid INT DEFAULT NULL,
  vendedor_nombre VARCHAR(200) DEFAULT NULL,
  metodo VARCHAR(20) NOT NULL,
  ruta_id INT DEFAULT NULL,
  ruta_nombre VARCHAR(120) DEFAULT NULL,
  agencia VARCHAR(100) DEFAULT NULL,
  nota VARCHAR(500) DEFAULT NULL,
  registrado_por VARCHAR(200) DEFAULT NULL,
  registrado_rol VARCHAR(50) DEFAULT NULL,
  ruta_gratis TINYINT(1) DEFAULT NULL,
  monto_base DECIMAL(14,2) DEFAULT NULL,
  monto_facturado DECIMAL(14,2) DEFAULT NULL,
  ruta_gratis_final TINYINT(1) DEFAULT NULL,
  alerta VARCHAR(400) DEFAULT NULL,
  recalculado_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vmr_sale (odoo_sale_id),
  INDEX idx_vmr_vendedor (vendedor_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprobacion: devuelve una fila.
SHOW TABLES FROM supricom_panel LIKE 'ventas_metodo_retiro';

-- RUTA GRATIS (si la tabla ya existia sin estas columnas). La app las agrega
-- sola; a mano, primero mira que no esten:
--   SHOW COLUMNS FROM supricom_panel.ventas_metodo_retiro LIKE 'ruta_gratis';
-- y si no devuelve nada:
--   ALTER TABLE supricom_panel.ventas_metodo_retiro
--     ADD COLUMN ruta_gratis TINYINT(1) DEFAULT NULL,
--     ADD COLUMN monto_base DECIMAL(14,2) DEFAULT NULL;
--   ruta_gratis: 1 = gratis, 0 = flete a cargo del cliente, NULL = no aplica.
--   Pedidos de Valencia: ruta Valencia gratis desde 300 $ sin IVA; el resto
--   de las rutas, desde 1000 $ sin IVA.

-- RECALCULO CON LO FACTURADO (si la tabla ya existia sin estas columnas). La
-- app las agrega sola; a mano, primero:
--   SHOW COLUMNS FROM supricom_panel.ventas_metodo_retiro LIKE 'monto_facturado';
-- y si no devuelve nada:
--   ALTER TABLE supricom_panel.ventas_metodo_retiro
--     ADD COLUMN monto_facturado DECIMAL(14,2) DEFAULT NULL,
--     ADD COLUMN ruta_gratis_final TINYINT(1) DEFAULT NULL,
--     ADD COLUMN alerta VARCHAR(400) DEFAULT NULL,
--     ADD COLUMN recalculado_at DATETIME DEFAULT NULL;
--   monto_facturado: facturas publicadas menos notas de credito, sin IVA.
--   ruta_gratis_final: la decision al registrar el egreso (1 gratis / 0 flete).
--   alerta: "ya no es gratis" o "la ruta Valencia es solo para Carabobo".
