-- Rol RMA (Servicio Tecnico) — destinatarios de la alerta de equipos
-- pendientes de despacho (issue #37).
--
-- POR QUE HACE FALTA: el cron /api/cron/check-ingresos-pendientes le avisa a
-- todos los usuarios con rol `rma`. Si nadie tiene ese rol, el cron corre,
-- encuentra los equipos vencidos y no tiene a quien avisarle: termina con
-- `alerts_sent: 0` en un log que nadie lee. Hoy el entorno de prueba esta
-- exactamente asi — el dry run devuelve `destinatarios: []`.
--
-- Igual que el rol Seguridad: el login autentica contra ODOO y despues busca
-- el perfil aca. La persona ya tiene que existir como usuario de Odoo con su
-- contrasena. Este script no crea cuentas ni contrasenas — solo le dice al
-- panel que rol tiene alguien que Odoo ya reconoce.
--
-- Para COMPROBAR que quedo bien, sin tocar la base:
--   curl -s -H "Authorization: Bearer $CRON_SECRET" \
--     "<host>/api/cron/check-ingresos-pendientes?dry=1" | python3 -m json.tool
-- El campo `destinatarios` tiene que dejar de estar vacio.

-- 1. Crear el rol si no existe (en la mayoria de los entornos ya existe: el
--    modulo RMA interno lleva tiempo en uso y middleware.ts compara contra
--    'rma' en minusculas).
INSERT INTO roles (name, display_name) VALUES ('rma', 'Servicio Tecnico (RMA)')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- 2. Ver quien tiene el rol hoy. Si esto no devuelve filas, la alerta de #37
--    no le llega a nadie.
SELECT uc.id, uc.email, uc.name, uc.cids
  FROM users_config uc
  JOIN roles r ON uc.role_id = r.id
 WHERE LOWER(TRIM(r.name)) = 'rma';

-- 3. Asignarselo a alguien que YA existe en users_config
--    (reemplazar el correo por el real).
-- UPDATE users_config
--    SET role_id = (SELECT id FROM roles WHERE name = 'rma')
--  WHERE email = 'tecnico@supricom.com.ve';

-- 4. O darle perfil a alguien que existe en Odoo pero todavia no en el panel.
--    `cids` es la compania: 9 = Valencia, 10 = Caracas, 7 = Panama.
-- INSERT INTO users_config (email, name, role_id, cids)
-- VALUES (
--   'tecnico@supricom.com.ve',
--   'Nombre del tecnico',
--   (SELECT id FROM roles WHERE name = 'rma'),
--   9
-- );

-- 5. Verificar el resultado (misma consulta del paso 2).
-- SELECT uc.email, uc.name, r.name AS rol, uc.cids
--   FROM users_config uc JOIN roles r ON uc.role_id = r.id
--  WHERE LOWER(TRIM(r.name)) = 'rma';
