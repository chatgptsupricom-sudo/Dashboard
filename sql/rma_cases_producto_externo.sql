-- ============================================================
-- SERVICIO TECNICO PARA EQUIPOS NO COMPRADOS EN SUPRICOM
--
-- El portal (/servicio-tecnico/<sucursal>/externo) acepta reportes de
-- equipos que el cliente NO compro en Supricom: sin factura, sin garantia, con
-- servicio presupuestado. El caso va en rma_cases con origen = 'portal' y:
--
--   producto_externo  1 = equipo externo (0 = comprado en Supricom).
--   client_document   documento que escribio el cliente (V12345678,
--                     J317376900, 8-123-456 sin guiones...). Es el segundo
--                     dato con el que consulta su ticket, porque no tiene
--                     factura.
--   contacto_email    correo que escribio el cliente. Los correos de
--                     "reparado"/"enviado" lo usan cuando no hay cliente en
--                     Odoo. No es client_email: ese lo limpia el reset de
--                     entrega (app/api/rma/[id]).
--
-- POST /api/servicio-tecnico/externo las crea sola si faltan (igual que el
-- resto de columnas del portal), asi que esta migracion es para dejarlas
-- puestas antes del primer reporte.
--
-- Escrito para el phpMyAdmin de EasyPanel:
--   * NO usa information_schema (#1044 Acceso negado).
--   * Cada tabla lleva la base delante (supricom_panel.tabla).
--
-- ANTES DE CORRERLO:
--   1. Si la base no se llama `supricom_panel`, reemplaza ese nombre en todo
--      el archivo.
--   2. Mira que no este aplicado ya (MySQL no tiene ADD COLUMN IF NOT EXISTS,
--      y si una columna ya existe el ALTER entero falla sin cambiar nada):
--        SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'producto_externo';
--        SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'client_document';
--        SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'contacto_email';
--      Si alguna devuelve una fila, quita esa linea del ALTER.
--
-- Los casos que ya existen quedan con producto_externo = 0 (comprados en
-- Supricom), que es lo que son.
-- ============================================================

ALTER TABLE supricom_panel.rma_cases
  ADD COLUMN producto_externo TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN client_document VARCHAR(30) DEFAULT NULL,
  ADD COLUMN contacto_email VARCHAR(200) DEFAULT NULL;

-- Comprobacion: las tres devuelven una fila.
SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'producto_externo';
SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'client_document';
SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'contacto_email';
