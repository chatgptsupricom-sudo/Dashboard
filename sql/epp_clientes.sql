-- Cuentas estrategicas (EPP) del Reporte de Ventas Trimestral por marca.
-- Reemplaza la hoja "EPP" del Excel manual: Meta Anual por cliente; la meta
-- del trimestre (= anual / 4), el real y el % de cumplimiento se calculan en
-- vivo desde Odoo. Editable desde la vista /reportes-comerciales.
-- La crea `lib/reportes-comerciales/tablas.ts` en la primera peticion.
CREATE TABLE IF NOT EXISTS epp_clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,               -- 7 = Panama
  anio INT NOT NULL,                     -- las cuentas se revisan cada anio
  marca VARCHAR(60) NOT NULL DEFAULT 'EZVIZ',
  cliente_nombre VARCHAR(255) NOT NULL,
  odoo_partner_id INT NULL,              -- opcional: cruce exacto con res.partner
  meta_anual DECIMAL(15,2) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_epp (company_id, anio, marca, cliente_nombre)
);
