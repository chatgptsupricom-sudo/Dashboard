-- ============================================================
-- RMA: ESTADOS CON PLAZOS (por llegar → en diagnóstico → en reparación)
--
--   por_llegar      el cliente abrió el ticket y el equipo todavía no llegó.
--                   Sale de ahí cuando Seguridad registra el ingreso.
--   en_diagnostico  RMA tiene el equipo: 48 horas hábiles para diagnosticar.
--   en_reparacion   después del diagnóstico.
--
-- El equipo tiene que salir antes del 7.º día hábil desde el ingreso. Los
-- plazos y las alertas se calculan en lib/rma/plazos.ts: no hay columnas
-- nuevas, solo los valores del ENUM. "recibido" se queda para el historial.
--
-- Escrito para el phpMyAdmin de EasyPanel:
--   * NO usa information_schema (#1044 Acceso negado).
--   * Cada tabla lleva la base delante (supricom_panel.tabla).
--
-- ANTES DE CORRERLO:
--   1. Si la base no se llama `supricom_panel`, reemplaza ese nombre en todo
--      el archivo.
--   2. Los MODIFY (paso 1) se pueden repetir sin problema.
--   3. Si `SHOW TABLES FROM supricom_panel LIKE 'rma_case_items'` no devuelve
--      nada, salta todo lo que diga rma_case_items.
--
-- IMPORTANTE: correr al menos el paso 1 ANTES de mergear a master el código
-- que lo usa. Sin él, el panel sigue funcionando como hasta ahora (los casos
-- nacen "recibido"), pero no se pueden elegir los estados nuevos.
-- ============================================================

-- 1. Estados nuevos en el caso y en cada producto del envío.
ALTER TABLE supricom_panel.rma_cases
  MODIFY status ENUM('recibido','reparado','nota_credito','no_procesado','reingresado','nc_revision',
                     'por_llegar','en_diagnostico','en_reparacion')
    NOT NULL DEFAULT 'recibido';

ALTER TABLE supricom_panel.rma_case_items
  MODIFY status ENUM('recibido','reparado','nota_credito','no_procesado','reingresado','nc_revision',
                     'por_llegar','en_diagnostico','en_reparacion')
    NOT NULL DEFAULT 'recibido';

-- 2. Casos abiertos que hoy están "recibido" (opcional, pero recomendado: si
--    no se corre, el panel igual los trata como por llegar / en diagnóstico,
--    solo que siguen diciendo "Recibido").
--
--    a) Tickets del portal de los últimos 30 días sin ingreso de Seguridad:
--       el equipo no llegó → por llegar. Los más viejos se dejan como están
--       (el cliente no llevó el equipo).
UPDATE supricom_panel.rma_cases c
   SET c.status = 'por_llegar'
 WHERE c.status = 'recibido'
   AND c.origen = 'portal'
   AND c.despachado_at IS NULL
   AND c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
   AND NOT EXISTS (SELECT 1 FROM supricom_panel.seguridad_ingresos i WHERE i.rma_case_id = c.id);

UPDATE supricom_panel.rma_case_items ci
  JOIN supricom_panel.rma_cases c ON c.id = ci.case_id
   SET ci.status = 'por_llegar'
 WHERE ci.status = 'recibido'
   AND c.status = 'por_llegar';

--    b) El resto de lo "recibido" que sigue en el taller ya llegó → en
--       diagnóstico. Los tickets del portal sin ingreso de más de 30 días
--       se quedan "recibido".
UPDATE supricom_panel.rma_case_items ci
  JOIN supricom_panel.rma_cases c ON c.id = ci.case_id
   SET ci.status = 'en_diagnostico'
 WHERE ci.status = 'recibido'
   AND ci.despachado_at IS NULL
   AND c.status = 'recibido'
   AND (c.origen <> 'portal' OR c.origen IS NULL
        OR EXISTS (SELECT 1 FROM supricom_panel.seguridad_ingresos i WHERE i.rma_case_id = c.id));

UPDATE supricom_panel.rma_cases c
   SET c.status = 'en_diagnostico'
 WHERE c.status = 'recibido'
   AND c.despachado_at IS NULL
   AND (c.origen <> 'portal' OR c.origen IS NULL
        OR EXISTS (SELECT 1 FROM supricom_panel.seguridad_ingresos i WHERE i.rma_case_id = c.id));

-- Comprobación: las dos primeras muestran 'en_diagnostico' en Type; la
-- última cuenta los casos por estado (ya no debería haber "recibido" en el
-- taller, salvo tickets viejos que nunca llegaron).
SHOW COLUMNS FROM supricom_panel.rma_cases LIKE 'status';
SHOW COLUMNS FROM supricom_panel.rma_case_items LIKE 'status';
SELECT status, COUNT(*) AS casos
  FROM supricom_panel.rma_cases
 WHERE despachado_at IS NULL
 GROUP BY status;
