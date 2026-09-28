-- ============================================================
-- NOTA DE CREDITO DE RMA CON APROBACION DEL SUPER ADMIN
--
-- RMA ya no pone un caso en "Nota de Credito" directamente: la solicita
-- desde su seccion Nota de Credito (caso, producto y por que) y el Super
-- Admin la aprueba o la rechaza.
--
--   status 'nc_revision'   estado nuevo del caso / producto mientras la
--                          solicitud espera al Super Admin. Aprobada pasa a
--                          'nota_credito'; rechazada vuelve a 'recibido'.
--   rma_notas_credito:
--     estado          pendiente | aprobada | rechazada. Las notas que ya
--                     existen quedan 'aprobada' (el DEFAULT), que es lo que
--                     eran: se hacian sin aprobacion.
--     motivo          por que RMA pide la nota de credito.
--     decidido_por / decidido_at / motivo_rechazo   la decision del Super Admin.
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
--        SHOW COLUMNS FROM supricom_panel.rma_notas_credito LIKE 'estado';
--      Si devuelve una fila, no corras el paso 3.
--   3. Los dos MODIFY se pueden repetir sin problema.
--   4. Si `SHOW TABLES FROM supricom_panel LIKE 'rma_case_items'` no devuelve
--      nada, salta el ALTER de rma_case_items.
--
-- IMPORTANTE: correrlo ANTES de mergear a master el codigo que lo usa. Sin
-- esto, RMA no puede solicitar notas de credito (el panel avisa que falta la
-- migracion) y un caso no puede pasar a 'nc_revision'.
-- ============================================================

-- 1. Estado nuevo en el caso.
ALTER TABLE supricom_panel.rma_cases
  MODIFY status ENUM('recibido','reparado','nota_credito','no_procesado','reingresado','nc_revision')
    NOT NULL DEFAULT 'recibido';

-- 2. Y en cada producto del envio.
ALTER TABLE supricom_panel.rma_case_items
  MODIFY status ENUM('recibido','reparado','nota_credito','no_procesado','reingresado','nc_revision')
    NOT NULL DEFAULT 'recibido';

-- 3. Solicitud y decision.
ALTER TABLE supricom_panel.rma_notas_credito
  ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'aprobada',
  ADD COLUMN motivo TEXT DEFAULT NULL,
  ADD COLUMN decidido_por VARCHAR(200) DEFAULT NULL,
  ADD COLUMN decidido_at DATETIME DEFAULT NULL,
  ADD COLUMN motivo_rechazo TEXT DEFAULT NULL,
  ADD INDEX idx_nc_estado (estado);

-- Comprobacion: las dos primeras muestran 'nc_revision' en Type; la tercera
-- devuelve una fila.
SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'status';
SHOW COLUMNS FROM supricom_panel.rma_case_items LIKE 'status';
SHOW COLUMNS FROM supricom_panel.rma_notas_credito LIKE 'estado';
-- Nota de credito por producto (sql/rma_notas_credito_item.sql): tambien la
-- usa este flujo. Si no devuelve fila, corre ese script.
SHOW COLUMNS FROM supricom_panel.rma_notas_credito LIKE 'item_id';
