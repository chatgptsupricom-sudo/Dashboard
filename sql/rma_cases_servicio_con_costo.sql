-- Servicio técnico con costo desde el portal (/servicio-tecnico/<sucursal>/servicio-con-costo):
-- producto comprado en Supricom que el cliente pide reparar pagando (fuera de
-- garantía o falla que la garantía no cubre). El portal la agrega solo
-- (asegurarColumnasPortal en lib/servicio-tecnico/casos.ts); esto es para
-- correrlo a mano en el phpMyAdmin de EasyPanel.
--
-- Antes: SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'servicio_con_costo';
-- (si ya sale, no correr el ALTER)
ALTER TABLE supricom_panel.rma_cases
  ADD COLUMN servicio_con_costo TINYINT(1) NOT NULL DEFAULT 0;
-- Después: SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'servicio_con_costo';
